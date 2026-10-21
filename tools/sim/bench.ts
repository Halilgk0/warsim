// Çalıştırma: npm run sim:bench -- [eşleşme sıraları|all] [koşu] [saniye] [kol: 1|4]
//   (ör. npm run sim:bench -- all 32 900 4 — asıl ölçü; npm run sim:bench -- 0,1,2 96 600 1 — 1'e 1)
// Tarihî eşleşme karnesi. Her satır: A:B ve A'nın düşürme payı için beklenen aralık (iki tarafın düşürmeleri içinde).
// Beklentiler aynı yetenekte pilotlarla uçağın uçağa üstünlüğünü yansıtır (savaş dönemi karşılaştırma uçuşları ve
// cephe kayıtları; pilot eğitimi ve sayı üstünlüğü ayıklanmış).
// Asıl ölçü 4'e 4'tür: tarihî skorlar kalabalık çatışmalardan gelir (kol arkadaşı, gözden kaçan düşman, başkasıyla
// uğraşırken arkadan gelen saldırı). Birbirinin farkında iki eşit pilotun 1'e 1'i çoğu zaman sonuçsuz biter; o da
// gerçekçidir (dal-vur avcısı avantajsız saldırmaz, dönüş avcısı onu yakalayamaz).
import { Vector3 } from 'three';
import { World } from '../../src/sim/world';
import { dogfight } from '../../src/sim/scenarios';

// [A, B, beklenen alt, üst, not, (başlangıç irtifası alt–üst, m; yoksa 3000–5000)]
export const BENCH: [string, string, number, number, string, number?, number?][] = [
  ['spitfire1', 'bf109e', 0.4, 0.6, 'Britanya Muharebesi: denk; 109 tırmanış/dalış, Spitfire dönüş'],
  ['bf109e', 'hurricane1', 0.55, 0.75, '109 E daha hızlı ve iyi tırmanır'],
  ['hurricane1', 'bf110c', 0.65, 0.85, 'Bf 110 tek motorlu avcıya yenildi'],
  ['bf109e', 'i16', 0.6, 0.8, 'İspanya / 1941: I-16 çevik ama yavaş'],
  ['a6m2', 'hurricane1', 0.55, 0.75, 'Sıfır yavaş hızda çok çevik'],
  ['a6m2', 'p40e', 0.5, 0.65, 'Sıfır dönüşte, P-40 dalışta üstün'],
  ['bf109f', 'spitfire5', 0.45, 0.6, '1941: denk, F biraz üstün'],
  ['fw190a5', 'spitfire5', 0.6, 0.8, '"Fw 190 bunalımı" 1941-42'],
  ['bf109f', 'p40e', 0.6, 0.8, 'Kuzey Afrika'],
  ['fw190a5', 'spitfire9', 0.35, 0.55, 'Spitfire IX dengeyi kurdu (iki kademeli Merlin: 6–8 km)', 6000, 8000],
  ['yak3', 'bf109g', 0.55, 0.75, 'Alçak/orta irtifada Yak-3 üstün'],
  ['la7', 'fw190a5', 0.55, 0.75, 'La-7 alçakta hızlı'],
  ['p51d', 'bf109g', 0.55, 0.7, 'P-51D yüksekte (7 km) belirgin hızlı', 6000, 8000],
  ['f6f5', 'a6m2', 0.6, 0.8, 'Hellcat sağlam ve güçlü'],
  ['fw190a5', 'p38j', 0.55, 0.75, 'P-38 tek motorlu avcıya karşı zor'],
  ['p47d', 'fw190a5', 0.5, 0.7, 'P-47 yüksekte (turbo) ve dalışta üstün', 6500, 8500],
  ['me262', 'p51d', 0.6, 0.85, 'Jet hız üstünlüğü', 5000, 8000],
  ['mig15', 'f80c', 0.7, 0.9, 'Kore 1950: düz kanatlı jet geride kaldı'],
  ['f86f', 'mig15', 0.5, 0.65, 'Kore: alçak/orta irtifada F-86F biraz üstün'],
  ['me262', 'meteor3', 0.55, 0.75, 'Me 262 daha hızlı ve ağır silahlı'],
];

/**
 * Tarihî donanım: uçak açmak için gerekmeyen, araştırıldıkça eklenen geliştirmelerden o tipin dönemin cephesinde
 * taşıdıkları. Karnede her taraf kendi tipinin donanımıyla uçar (1944 ABD avcılarında K-14 jiroskoplu nişangâh ve
 * G elbisesi; Kore'de F-86F'te A-1CM radar nişangâhı, hidrolik kumanda ve G elbisesi, MiG-15bis'te ASP-3N ve kanatçık
 * güçlendiricisi ama G elbisesi yok).
 */
export const HIST_KIT: Record<string, string[]> = {
  p51d: ['n_gyro', 'p_gsuit'],
  p47d: ['n_gyro', 'p_gsuit'],
  f6f5: ['p_gsuit'],
  p38j: ['p_gsuit'],
  f86f: ['n_gyro', 'j_radarsight', 'j_hydraulic', 'p_gsuit', 'j_eject'],
  mig15: ['n_gyro', 'j_hydraulic', 'j_eject'],
  f80c: ['n_gyro', 'p_gsuit', 'j_eject'],
};
const kit = (id: string): string[] => ['n_reflector', ...(HIST_KIT[id] ?? [])];

export interface DuelResult { a: number; b: number; esc: number; none: number; crash: number; pilotErr: number; nan: number; firedA: number; firedB: number; hitsA: number; hitsB: number; causes: Map<string, number> }

export function duel(a: string, b: string, runs: number, secs: number, altLo = 3000, altHi = 5000, n = 1): DuelResult {
  const res: DuelResult = { a: 0, b: 0, esc: 0, none: 0, crash: 0, pilotErr: 0, nan: 0, firedA: 0, firedB: 0, hitsA: 0, hitsB: 0, causes: new Map() };
  for (let r = 0; r < runs; r++) {
    const w = new World();
    const swap = r % 2 === 1;
    dogfight(w, [swap ? b : a, n], [swap ? a : b, n], { sep: 3000, blueAlt: 3500, redAlt: 3500, blueTech: kit(swap ? b : a), redTech: kit(swap ? a : b) });
    // Karışık başlangıç: rastgele kerteriz ve uzaklık, kollar bağımsız yön ve irtifada (kol düzeni korunur)
    const P = w.aircraft.filter((x) => x.airborne);
    const cx = P.reduce((t, x) => t + x.pos.x, 0) / P.length, cz = P.reduce((t, x) => t + x.pos.z, 0) / P.length;
    const gl = P[0].pos.y - 3500;
    const brg = Math.random() * Math.PI * 2, sep = (n > 1 ? 3000 : 2500) + Math.random() * (n > 1 ? 3000 : 2500);
    for (const team of [0, 1]) {
      const fl = P.filter((x) => x.team === team);
      const L = fl[0];
      const old = new Vector3(L.fwd.x, 0, L.fwd.z).normalize();
      const rel = fl.map((x) => x.pos.clone().sub(L.pos));
      const hdg = Math.random() * 360;
      const sg = team === 0 ? 1 : -1;
      const ctr = new Vector3(cx + (Math.cos(brg) * sep / 2) * sg, gl + altLo + Math.random() * (altHi - altLo), cz + (Math.sin(brg) * sep / 2) * sg);
      L.setAttitude(hdg);
      const nw = new Vector3(L.fwd.x, 0, L.fwd.z).normalize();
      const ang = Math.atan2(old.x * nw.z - old.z * nw.x, old.x * nw.x + old.z * nw.z);
      fl.forEach((x, k) => {
        x.pos.copy(ctr).add(rel[k].clone().applyAxisAngle(new Vector3(0, -1, 0), ang));
        x.prevPos.copy(x.pos);
        x.setAttitude(hdg);
      });
    }
    const isA = (team: number) => (team === 0) === !swap;
    const spawn = w.spawnGunRound.bind(w);
    w.spawnGunRound = (...args: Parameters<typeof w.spawnGunRound>) => { if (isA(args[0].team)) res.firedA++; else res.firedB++; spawn(...args); };
    const hitAc = w.hitAircraft.bind(w);
    w.hitAircraft = (...args: Parameters<typeof w.hitAircraft>) => { if (args[4]) { if (isA(args[4].team)) res.hitsA++; else res.hitsB++; } hitAc(...args); };
    const detached = new Set<string>();
    for (let i = 0; i < secs * 60; i++) {
      w.step(1 / 60);
      for (const x of w.aircraft) {
        if (!Number.isFinite(x.pos.x)) res.nan++;
        if (x.brain.detached && /hasar|motor|yakıt/.test(x.brain.detachReason)) detached.add(x.callsign);
      }
      if (i % 600 === 0 && w.aircraft.every((x) => x.status !== 'flying' || x.brain.detached)) break;
    }
    const killed = new Set<string>();
    let any = false;
    for (const l of w.logs) {
      if (l.cat === 'kill') {
        any = true;
        const m = l.text.match(/, (\S+) \(/);
        if (m) killed.add(m[1]);
        if (isA(l.team)) res.a++; else res.b++;
        const cause = l.text.split(' — ')[1] ?? '?';
        res.causes.set(cause, (res.causes.get(cause) ?? 0) + 1);
      }
      // Yalnız kendi kazası (savaş hasarıyla yere düşen uçak düşürme kaydıdır); seyrek pilot hatası ayrı sayılır
      if (l.cat !== 'kill' && /çakıldı|iniş kazası|denize düştü/.test(l.text)) {
        if (/pilot hatası/.test(l.text)) res.pilotErr++;
        else res.crash++;
      }
    }
    for (const c of detached) if (!killed.has(c)) { res.esc++; any = true; }
    if (!any) res.none++;
  }
  return res;
}

// Başka araçlar BENCH listesini içe aktarabilir: karne yalnız bu dosya (bench*.mjs) çalıştırılınca koşar
const main = /bench[^/\\]*\.mjs$/.test(process.argv[1] ?? '');
const sel = process.argv[2];
const runs = Number(process.argv[3] ?? 20);
const secs = Number(process.argv[4] ?? 600);
const nv = Number(process.argv[5] ?? 1);
const list = !main ? [] : sel && sel !== 'all' ? BENCH.filter((_, i) => sel.split(',').map(Number).includes(i)) : BENCH;
for (const [a, b, lo, hi, note, h0, h1] of list) {
  const r = duel(a, b, runs, secs, h0, h1, nv);
  const share = r.a + r.b ? r.a / (r.a + r.b) : NaN;
  const ok = share >= lo - 0.05 && share <= hi + 0.05 ? '✓' : share < lo ? '▼' : '▲';
  console.log(`${ok} ${a.padEnd(10)} – ${b.padEnd(10)} ${nv}'e ${nv} ${String(r.a).padStart(2)}:${String(r.b).padEnd(2)} pay %${Number.isNaN(share) ? '--' : Math.round(share * 100)} (beklenen %${Math.round(lo * 100)}–${Math.round(hi * 100)}) kaçış ${r.esc} sonuçsuz ${r.none} kaza ${r.crash} pilot hatası ${r.pilotErr} nan ${r.nan} | ateş ${r.firedA}/${r.firedB} isabet ${r.hitsA}/${r.hitsB} | ${note}`);
}
