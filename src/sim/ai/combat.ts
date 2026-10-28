// İt dalaşı (BFM — temel savaş manevraları), toplu nesiller için.
//
// Saldırı:
//   - Uzakta: saf takip (pure pursuit) ile yaklaş.
//   - Yakında: önden takip (lead pursuit) — merminin uçuş süresine göre hedefin önüne nişan al,
//     mermi düşüşünü telafi et. Pilot becerisine göre takip hatası.
//   - Aşırı yaklaşma riski: gecikmeli takip + yüksek yo-yo (düzlem dışına tırmanıp kapanmayı azalt), gaz kes.
//   - Hedef sert dönüyor ve menzil dışındaysak: alçak yo-yo (dönüşün içine dalıp mesafeyi kapat).
//   - Kafa kafaya: kısa pencerede ateş, çarpışmamak için sağa kır (sol sola geçiş).
//   - Enerji avcısı (dal-vur-tırman): tek geçişte ateş et, dönüş savaşına girme; uzaklaş, tırman, tekrar dal.
// Savunma:
//   - Kırılma dönüşü: saldırgana doğru azami G ile dön (açıyı kapat, aşırı yaklaştır).
//   - Saldırgan nişan aldığında kaçamak manevra (jink): rastgele yönlerde ani G değişimi.
//   - Hız avantajı varsa dönmek yerine uzaklaş; enerji bittiyse dalışla hız kazan.
// Kanat adamı (koruma doktrini): liderin arkasında kalır, lidere saldırana saldırır, fırsat bulursa ateş eder.

import { Vector3 } from 'three';
import type { Aircraft } from '../aircraft/aircraft';
import { CONVERGENCE, type GunSpec } from '../aircraft/specs';
import type { Brain } from './brain';
import type { FlyCommand } from '../aircraft/pilot';
import type { World } from '../world';
import { cornerSpeed, machOf, stallSpeed, sustainedG } from '../aircraft/flightModel';
import { isCrippled } from '../aircraft/damage';
import { groundLevel } from '../terrain';
import { DEG, G, UP, angleBetween, clamp } from '../../core/math';
import { L } from '../../i18n';

const _rel = new Vector3();
const _los = new Vector3();
const _tv = new Vector3();
const _av = new Vector3();
const _aim = new Vector3();
const _aimDir = new Vector3();
const _tmp = new Vector3();
const _home = new Vector3();

/** Dalaşta araziden güvenli yükseklik. */
const COMBAT_AGL = 220;

export function combatCommand(ac: Aircraft, brain: Brain, world: World, dt: number, cmd: FlyCommand): void {
  if (brain.threat) defensive(ac, brain, brain.threat, world, dt, cmd);
  else if (brain.target) offensive(ac, brain, brain.target, dt, cmd);
}

/**
 * Rakibe göre taktik. Rakip açıkça daha iyi dönüyorsa (%12'den fazla) dönüş savaşına girilmez: dal-vur-tırman
 * (Bf 109 E'nin I-16'ya, Hellcat'in Sıfır'a karşı). Biz daha iyi dönüyorsak dönüş savaşı. Dönüşler yakınsa alçak ve
 * orta irtifada pervaneli uçak döner (109 pilotları dönüş farkı küçük rakiple döner, hızlarıyla kurtulurdu); jetler ve
 * 5,5 km üstü (ince havada herkesin dönüşü yarım dakikayı bulur; Almanya semalarında P-51 ve P-47) kendi doktrinine
 * göre, enerji doktrinliyse dal-vur.
 */
export function tacticVs(ac: Aircraft, opp: Aircraft): 'turn' | 'energy' {
  const s = ac.spec;
  const o = opp.spec;
  if (o.turnTime < s.turnTime * 0.88) return 'energy';
  if (s.turnTime < o.turnTime * 0.92) return 'turn';
  // Dönüşler yakın: jette ve 5,5 km üstünde uçağın kendi doktrini (hız ve tırmanış belirleyici), alçak ve orta
  // irtifada pervaneli dönüş savaşı
  return s.engine.kind === 'jet' || ac.pos.y > 5500 ? s.tactic : 'turn';
}

/** Başarım tablosundan bu irtifadaki değer (azami hız ya da tırmanış, m/s). */
function perfHere(ac: Aircraft, key: 'vmax' | 'climb'): number {
  const p = ac.spec.perf;
  const col = p[key];
  const h = ac.pos.y;
  if (!p.alt.length) return key === 'vmax' ? ac.spec.vMax : ac.spec.climbRate;
  if (h <= p.alt[0]) return col[0];
  for (let i = 1; i < p.alt.length; i++) {
    if (h <= p.alt[i]) {
      const f = (h - p.alt[i - 1]) / (p.alt[i] - p.alt[i - 1]);
      return col[i - 1] + (col[i] - col[i - 1]) * f;
    }
  }
  return col[col.length - 1];
}

/** Bu irtifadaki azami hız (m/s). */
function vmaxHere(ac: Aircraft): number {
  return perfHere(ac, 'vmax');
}

/**
 * Bulunulan irtifalarda daha iyi tırmanıyor mu: deniz seviyesi değeri yanıltır (P-47 alçakta Fw 190'dan kötü,
 * 7 km'de turbo kompresörüyle belirgin iyi tırmanır).
 */
function outclimbsHere(ac: Aircraft, opp: Aircraft): boolean {
  return perfHere(ac, 'climb') > perfHere(opp, 'climb') * 1.1;
}

/**
 * Enerji koruyan manevrada çekilecek G. Dönülen her derecenin indüklenmiş sürükleme bedeli n²/√(n²−1) ile artar
 * (hızdan bağımsız): 1,4 G'de en az, 3 G'de ~%60 fazla, 7 G'de ~3,5 katı. Pilot azami G yerine ~3 G ile döner
 * (yüksekte sürdürülebilir G 1,5–2'ye düşünce onunla dönmek 180° için yarım dakikayı aşıyordu); itkisi bol uçak
 * hız kaybetmeden çekebildiği kadar.
 */
function energyG(ac: Aircraft): number {
  return clamp(Math.max(sustainedG(ac) * 1.15, 3), 1.5, Math.min(ac.spec.nMax, 4.5));
}

/**
 * Önden geçişin sonunda kopuş yönü: kutunun içinden geçen avcıya tüm nişancılar ateş eder, kademeli kutuda düz aşağı
 * dalan avcı alçak filonun burnuna giriyordu. ~540 km/sa'te avcı saniyede ancak ~18° döner; bu yüzden kopuş ~380 m'de
 * başlar ve burun 35–60° saptırılır (hedefin altına bas, üstünden aş ya da yana kay). Pilot bu yönlerden, gerçek
 * dönüş hızıyla önümüzdeki dört saniyede kutudaki uçaklara en uzak kalanı seçer (eşitlikte aşağı: hız kazandırır).
 */
function breakGap(ac: Aircraft, tgt: Aircraft, out: Vector3): void {
  const members = tgt.flight ? tgt.flight.members : [tgt];
  const v = Math.max(ac.speed, 100);
  const n = Math.min(ac.spec.nMax * 0.8, 5);
  const omega = (G * Math.sqrt(n * n - 1)) / v;
  // Uçağın yatay sağı ve buna dik "yukarısı"
  _r.crossVectors(ac.fwd, UP);
  if (_r.lengthSq() < 1e-4) _r.set(1, 0, 0);
  _r.normalize();
  _u.crossVectors(_r, ac.fwd).normalize();
  // Kendi tarafımız: hedefin yanında bulunduğumuz taraf (kutunun üstünden karşıya geçmeyiz)
  _p.subVectors(ac.pos, tgt.pos);
  const side = _p.dot(_r) >= 0 ? 1 : -1;
  let best = -Infinity;
  for (const [yawD, pitchD] of BREAK_DIRS) {
    const yaw = yawD * side * DEG;
    const pitch = pitchD * DEG;
    _d.copy(ac.fwd).multiplyScalar(Math.cos(yaw)).addScaledVector(_r, Math.sin(yaw)).multiplyScalar(Math.cos(pitch)).addScaledVector(_u, Math.sin(pitch)).normalize();
    const theta = Math.max(angleBetween(ac.fwd, _d), 1e-3);
    _p.copy(ac.pos);
    let minD = Infinity;
    for (let k = 1; k <= 16; k++) {
      const t = k * 0.25;
      const f = Math.min(1, (omega * t) / theta);
      _h.copy(ac.fwd).lerp(_d, f).normalize();
      _p.addScaledVector(_h, v * 0.25);
      for (const b of members) {
        if (!b.airborne) continue;
        b.velocity(_av);
        const d = Math.hypot(b.pos.x + _av.x * t - _p.x, b.pos.y + _av.y * t - _p.y, b.pos.z + _av.z * t - _p.z);
        if (d < minD) minD = d;
      }
    }
    const score = Math.min(minD, 300) + (pitchD < 0 ? 12 : 0) + (yawD >= 0 ? 6 : 0);
    if (score > best) {
      best = score;
      out.copy(_d);
    }
  }
}

/** Kopuş adayları: [sapma (kendi tarafına +), yunuslama] derece. */
const BREAK_DIRS: [number, number][] = [
  [0, -35], [0, -60], [0, 25], [35, 0], [-35, 0], [30, -30], [-30, -30], [30, 20], [-30, 20], [50, -15], [-50, -15],
];
const _r = new Vector3();
const _u = new Vector3();
const _d = new Vector3();
const _h = new Vector3();
const _p = new Vector3();

/** Savunma taretlerinin toplam atış hızı (mermi/sn): B-17 ~120, B-25 ve B-29 ~67, He 111 ~42. */
function defensiveFire(spec: Aircraft['spec']): number {
  return spec.turrets.reduce((t, x) => t + x.gun.rate, 0);
}

/** Kafa kafaya üstünlük: rakibi düşürme hızımızın (ateş gücü / onun dayanıklılığı) onunkine oranı. */
function headOnEdge(ac: Aircraft, opp: Aircraft): number {
  const fp = (x: Aircraft) => x.guns.reduce((t, g) => t + g.rate * g.damage, 0);
  return Math.max(0.05, (fp(ac) / Math.max(opp.hpMax, 1)) / Math.max(fp(opp) / Math.max(ac.hpMax, 1), 1e-3));
}

function setPhase(brain: Brain, phase: 'attack' | 'extend' | 'climb'): void {
  brain.combat.phase = phase;
  brain.combat.phaseTime = 0;
  brain.combat.zoom = false;
}

/**
 * Uzaklaşma (enerji avcısı): G bırak, tam güç; rakip arkadaysa düz, değilse yumuşak dönüşle ondan uzaklaş. Hız azami
 * hızın altındaysa (irtifa varsa) sığ dalışla hızlan; takipçiden belirgin hızlıysa hızı irtifaya çevir (dikine
 * kopuş) ve hız düşene kadar sürdür (her saniye karar değiştiren tırmanış hız kazanmayı da önlüyordu).
 */
function extendFrom(ac: Aircraft, brain: Brain, opp: Aircraft, R: number, cmd: FlyCommand): void {
  const s = ac.spec;
  const cs = brain.combat;
  _tmp.subVectors(opp.pos, ac.pos).divideScalar(Math.max(R, 1));
  const behind = ac.fwd.dot(_tmp) < -0.2;
  let hx = behind ? ac.fwd.x : ac.fwd.x - _tmp.x * 0.5;
  let hz = behind ? ac.fwd.z : ac.fwd.z - _tmp.z * 0.5;
  const l = Math.hypot(hx, hz) || 1;
  hx /= l;
  hz /= l;
  const vf = ac.speed / vmaxHere(ac);
  const agl = ac.pos.y - groundLevel(ac.pos.x, ac.pos.z);
  // Tepede kullanılabilir hız kalmalı (~azami hızın %70'i): çok yavaşlayan avcı takipçiyle aynı yavaşlıkta kalıyordu
  if (cs.zoom) cs.zoom = ac.speed > Math.max(opp.speed * 0.95, stallSpeed(ac) * 2) && vf > 0.7;
  else cs.zoom = behind && R > 900 && ac.speed > opp.speed * 1.1 && vf > 0.85;
  if (cs.zoom) {
    cmd.dir.set(hx * 0.75, 0.66, hz * 0.75);
    cmd.maxG = Math.min(3.5, s.nMax);
    brain.status = L('Enerji taktiği: hızını irtifaya çeviriyor', 'Energy tactics: trading speed for height');
  } else {
    // İrtifa enerji avcısının sermayesidir: takipçi atış menzilinin dışındayken alçalarak uzaklaşılmaz (savaşı
    // alçağa, ağır avcının zayıf, rakibin güçlü olduğu irtifaya taşıyordu); burada daha iyi tırmanıyorsa hızı
    // koruyarak tırmanır. Takipçi yaklaşıyorsa sığ dalışla hızlanır (ağır uçak dalışta daha çabuk hızlanır).
    let y = 0;
    if (R < 800 && opp.speed > ac.speed * 0.95 && agl > 1000) y = -0.2;
    else if (outclimbsHere(ac, opp) && vf > 0.8) y = vf > 0.92 ? 0.25 : 0.1;
    else if (vf < 0.8 && agl > 1500 && R < 1500) y = -0.08;
    cmd.dir.set(hx, y, hz);
    cmd.maxG = Math.min(2.5, energyG(ac));
    brain.status = L('Enerji taktiği: hızlanıp uzaklaşıyor', 'Energy tactics: extending away');
  }
}

/** Hedefe top nişanı (ön nişan + mermi düşüşü + takip hatası). Nişan hatasını döndürür. */
/** Nişanın hesaplanacağı silah: uzakta (300 m ötesi) yakına saklanan kısa cephaneli top değil, ateş eden silah. */
function aimGunAt(ac: Aircraft, R: number): GunSpec | null {
  if (R > 300) {
    for (let i = 0; i < ac.guns.length; i++) {
      const g = ac.guns[i];
      if (ac.gunAmmo[i] > 0 && !(g.caliber === 'cannon' && g.ammo / g.rate < 10)) return g;
    }
  }
  return ac.aimGun;
}

export function gunSolution(ac: Aircraft, brain: Brain, tgt: Aircraft, dt: number, out: Vector3): number {
  const R = Math.max(tgt.pos.distanceTo(ac.pos), 1);
  const gun = aimGunAt(ac, R)!;
  const cs = brain.combat;
  tgt.velocity(_tv);
  const bulletSpeed = gun.muzzleVel + ac.speed;
  let tof = R / bulletSpeed;
  _aim.copy(tgt.pos).addScaledVector(_tv, tof);
  tof = _aim.distanceTo(ac.pos) / bulletSpeed;
  _aim.copy(tgt.pos).addScaledVector(_tv, tof);
  _aim.y += 0.5 * G * tof * tof;
  out.subVectors(_aim, ac.pos).normalize();
  cs.aimNoiseTime -= dt;
  if (cs.aimNoiseTime <= 0) {
    cs.aimNoiseTime = 0.4 + Math.random() * 0.6;
    const wounded = ac.damage.pilot === 1 ? 1.6 : 1;
    // Kafa kafaya: saniyede ~250 m kapanan hedefe nişan onda birkaç saniyelik, pilot çarpışma korkusuyla erken kırar
    _tmp.subVectors(ac.pos, tgt.pos).normalize();
    const facing = tgt.fwd.dot(_tmp) > 0.6 ? 1.8 : 1;
    // Kritik Mach üstünde gövde yalpalar (MiG-15 Mach 0,86'dan sonra burnunu sağa sola salar): nişan bozulur
    const buffet = 1 + 8 * Math.max(0, machOf(ac) - ac.spec.mcrit);
    const k = (wounded * facing * buffet * ac.mods.aimMul * ac.belt.aim) / ac.skill;
    // Takip titremesi (arkadan atışta küçük) + öndelik tahmini hatası (sapmalı atışta büyür): savaşta pilotların
    // çoğu öndeliği yanlış kestirdi; jiroskoplu nişangâh (aimMul) ikisini de azaltır
    const mag = 0.6 * DEG * k * Math.random();
    cs.aimNoiseGoal.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).setLength(mag);
    _tmp.subVectors(tgt.pos, ac.pos).normalize();
    const lead = angleBetween(_tmp, out);
    if (lead > 1e-3) {
      _tmp.subVectors(out, _tmp).normalize().multiplyScalar(lead * (Math.random() - 0.5) * 0.5 * k);
      cs.aimNoiseGoal.add(_tmp);
    }
  }
  cs.aimNoise.lerp(cs.aimNoiseGoal, 1 - Math.exp(-dt * 3));
  out.add(cs.aimNoise).normalize();
  return angleBetween(ac.fwd, out);
}

/** Nişan konisi içindeyse ateş. */
function tryFire(ac: Aircraft, brain: Brain, tgt: Aircraft, aimErr: number, R: number, headOn: boolean): boolean {
  const gun = ac.aimGun;
  if (!gun || !ac.armed) return false;
  if (headOn && brain.combat.headOnShoot === false) return false;
  // Ateş açma mesafesi pilota bağlı: acemi uzaktan (çoğu ıskalar), usta yakına sokulup açar (savaşta tipik 200–400 m)
  const open = Math.min(gun.range, 200 + 250 / ac.skill);
  // Kafa kafaya avcıya pencere kısa. Büyük bombardıman uçağına önden saldırıda atış ~700 m'de açılır: ~250 m/sn
  // yaklaşmada ateş penceresi zaten iki saniyeyi bulmaz
  const fireRange = headOn ? (tgt.spec.role === 'bomber' ? Math.min(gun.range, Math.max(open, 700)) : open * 0.65) : open;
  const cone = Math.max(2.5 * DEG, Math.atan2(tgt.spec.size * 1.2, R));
  if (R < fireRange && !(headOn && R < 150) && aimErr < cone) {
    brain.fireGuns = true;
    brain.aimRange = headOn ? 0 : R;
    return true;
  }
  return false;
}

function offensive(ac: Aircraft, brain: Brain, tgt: Aircraft, dt: number, cmd: FlyCommand): void {
  const s = ac.spec;
  if (!ac.guns.length) return;
  const cs = brain.combat;
  cs.phaseTime += dt;

  _rel.subVectors(tgt.pos, ac.pos);
  const R = Math.max(_rel.length(), 1);
  // Saldırı süresi yaklaşma sırasında işlemez (süre sınırı uzayan dönüş savaşından kopmak içindir; uzaktan gelen
  // hedefe yaklaşırken saldırı atış menziline girmeden kesiliyordu)
  if (cs.phase === 'attack' && R > 1500) cs.phaseTime = Math.min(cs.phaseTime, 2);
  _los.copy(_rel).divideScalar(R);
  tgt.velocity(_tv);
  ac.velocity(_av);
  const closure = _av.dot(_los) - _tv.dot(_los);
  const ata = angleBetween(ac.fwd, _los);
  // Hedefin kuyruğuna göre konumumuz: >0 arkasındayız, <0 bize doğru geliyor
  const tailAspect = tgt.fwd.dot(_los);
  const headOn = tailAspect < -0.6;
  const aimErr = gunSolution(ac, brain, tgt, dt, _aimDir);

  // Dal-vur-tırman ancak enerji üstünlüğüyle işe yarar (irtifa + hız). Eşit enerjide dönüş savaşı.
  const eAdv = ac.pos.y - tgt.pos.y + (ac.speed * ac.speed - tgt.speed * tgt.speed) / (2 * G);
  // Savunmasız hedefe (hasarlı, mermisiz, toplam enerjisi düşük ve yavaş) enerji taktiği gerekmez: doğrudan bitir.
  // Tırmanışın tepesinde yavaşlamış ama üstte olan hedef savunmasız değildir.
  const tactic = tacticVs(ac, tgt);
  // Enerji avcısı için de: dalışlara kırılarak hızını tüketmiş, aşağıda kalmış hedef artık kaçamaz
  const helpless = isCrippled(tgt) || !tgt.armed || (tactic !== 'energy' && tgt.speed < ac.speed * 0.6 && eAdv > 300) ||
    (tgt.speed < stallSpeed(tgt) * 1.5 && eAdv > 600);
  const prefersEnergy = tactic === 'energy' || s.vMax > tgt.spec.vMax * 1.15;
  const outturned = tgt.spec.turnTime < s.turnTime * 0.92;
  // Ağır savunmalı bombardıman kutusuna önden saldırı (Luftwaffe, 1943 sonrası): arkadan giren avcıyı kutunun onlarca
  // makinelisi ~15 sn'de düşürüyordu. Avcı kutunun yanından, etkili menzil dışında öne geçer ve karşıdan gelir: önden
  // daha az silah bakar, yaklaşma hızı nişancıya zaman bırakmaz, mermiler kokpite ve motorlara gelir. Koldan kopmuş
  // hasarlı bombardıman uçağı arkadan bitirilir. (Yavaşlık burada savunmasızlık değildir: bombardıman uçağı hep yavaştır)
  // (Jet önden dolanmaz: Me 262 kutuya arkadan, 250 km/sa fazla hızla dalıp geçerdi — nişancıya yine zaman kalmaz)
  const fortress = tgt.spec.role === 'bomber' && defensiveFire(tgt.spec) >= 60 && s.vMax > tgt.spec.vMax * 1.12 && s.engine.kind !== 'jet' &&
    tgt.turrets.some((t) => t.ammo > 0) && !isCrippled(tgt) && !tgt.brain.detached;
  const energyFighter = !fortress && !helpless && prefersEnergy && (eAdv > 250 || cs.phase === 'extend' || cs.phase === 'climb' || (outturned && ac.speed > tgt.speed * 1.05));
  // Enerji avcısı eşit irtifada dönüş savaşına girmez: daha iyi tırmanıyorsa önce irtifa kazanır, sonra dalar
  const outclimbs = outclimbsHere(ac, tgt);
  const goodShot = tailAspect > 0.5 && R < 1000 && ata < 25 * DEG;
  // Enerji avcısı saldırısını yapar, hedefi geçince dönüşe girmez: dikine çekip irtifaya çevirir (daha iyi
  // tırmanıyorsa) ya da hızla uzaklaşır. Eşit irtifada, uzaktayken önce irtifa kazanır.
  // Geçiş: hedefi aştık (yakında burun hedeften saptı ya da ara açılıyor). Arkasında yakın durmak geçiş değildir:
  // yakın atış mesafesi tam orasıdır (kısa cephaneli top ~300 m'de açar)
  const passedNow = (R < 350 && (closure < -5 || ata > 50 * DEG)) || (closure < -5 && R < 900 && ata > 60 * DEG);
  // Dal-vur'un ön koşulu irtifa üstünlüğüdür: hedefin belirgin üstünde değilken (ve yakın atış fırsatı yokken) saldırıya
  // girilmez, önce irtifa kazanılır (daha iyi tırmanıyorsa tırmanış, değilse hızlanıp hızı irtifaya çevirme). Aynı
  // irtifadan yatay yaklaşan enerji avcısını dönüş avcısı burnunu çevirip kafa kafaya karşılıyordu.
  const dh = ac.pos.y - tgt.pos.y;
  if (prefersEnergy && !helpless && cs.phase === 'attack' && !goodShot && cs.phaseTime > 1) {
    if (passedNow && eAdv < 400) setPhase(brain, outclimbs ? 'climb' : 'extend');
    else if (eAdv < 150 && outclimbs && R > 1800 && closure < 5) setPhase(brain, 'climb');
  }
  // Kafa kafaya geçiş kararı: çoğu avcı pilotu karşılıklı ateş yerine yana açılıp kuyruğa dönmeye çalışır
  if (headOn && R < 2600) {
    if (cs.headOnShoot === null) {
      // Avcıya karşı kafa kafaya atış kumardır: çoğu pilot kaçındı. Ateş gücü (rakibi düşürme hızı) ve sağlamlık
      // üstünlüğü olan daha istekliydi (P-47'nin sekiz 12,7 mm'si ve önündeki büyük radyal motor).
      const bold = fortress ? 1 : tgt.spec.role !== 'fighter' ? 0.85 : clamp(0.1 + 0.12 * ac.skill + 0.15 * Math.log(headOnEdge(ac, tgt)), 0.05, 0.6);
      cs.headOnShoot = Math.random() < bold;
      cs.leadSide = Math.random() < 0.5 ? -1 : 1;
    }
  } else if (!headOn) cs.headOnShoot = null;
  // Usta pilot G sınırına ve tutunma kaybının eşiğine daha çok yaklaşır
  cmd.maxG = s.nMax * clamp(0.8 + 0.15 * ac.skill, 0.85, 1);
  // Saldıran pilot sarsıntı eşiğinin hemen altında döner (kaldırmanın ~%95'i); tutunmanın kıyısına yalnız savunmada
  // (kırılma dönüşü) gidilir
  cmd.liftUse = 0.95;
  cmd.turnGain = 2.4 + 0.6 * ac.skill;
  cmd.minAlt = COMBAT_AGL;
  cmd.speed = null;
  cmd.wep = true;
  let throttle = 1;

  if (energyFighter && cs.phase === 'climb') {
    // Hızı koruyarak tırman: azami hıza yakınken tırmanış açısı, hız düştükçe yataya geç (en iyi tırmanma hızına
    // kadar yavaşlayan avcı, peşindeki dönüş avcısına kolay hedef oluyordu). Hedef arkadaysa düz git, değilse
    // yumuşakça uzaklaş: sert dönüş enerji yakar.
    const vf = ac.speed / vmaxHere(ac);
    const behind = ac.fwd.dot(_los) < -0.2;
    let hx = behind ? ac.fwd.x : ac.fwd.x - _los.x * 0.4;
    let hz = behind ? ac.fwd.z : ac.fwd.z - _los.z * 0.4;
    const l = Math.hypot(hx, hz) || 1;
    hx /= l;
    hz /= l;
    _tmp.subVectors(ac.pos, tgt.pos).normalize();
    const tgtPointing = angleBetween(tgt.fwd, _tmp) < 45 * DEG;
    const zoom = vf > 0.92;
    cmd.dir.set(hx, zoom ? 0.45 : vf > 0.82 ? 0.22 : vf > 0.72 ? 0.08 : -0.03, hz);
    cmd.maxG = Math.min(2.5, s.nMax);
    brain.status = L('Enerji taktiği: hızını koruyarak tırmanıyor', 'Energy tactics: climbing, keeping speed');
    if (dh > 800 || eAdv > 1100 || cs.phaseTime > 70) setPhase(brain, 'attack');
    else if (!zoom && R < 2000 && tgtPointing) setPhase(brain, 'extend');
  } else if (energyFighter && cs.phase === 'extend') {
    const wasZoom = cs.zoom;
    extendFrom(ac, brain, tgt, R, cmd);
    // Takipçi arkada ve burnu bize dönükken geri dönülmez (dönüş uzun sürer, takipçi köşeyi keser): hız üstünlüğüyle
    // ara açılır. Takipçi vazgeçince ya da ara yeterince açılınca saldırıya dön; dikine kopuş bitince aşağıdakine dal.
    const behind = ac.fwd.dot(_los) < -0.2;
    _tmp.subVectors(ac.pos, tgt.pos).normalize();
    const pursued = behind && angleBetween(tgt.fwd, _tmp) < 45 * DEG && R < 3500;
    const zoomDone = wasZoom && !cs.zoom && eAdv > 300;
    if ((R > 2400 && cs.phaseTime > 5 && !pursued) || cs.phaseTime > 60 || zoomDone) setPhase(brain, 'attack');
  } else {
    const tgtTurning = tgt.n > 3;
    // Önden saldırı üç adımda: (0) kutunun yanından, nişancı menzili dışında 6 km öne geç (yandaki mesafe bir dönüş
    // çapı: geri dönüş avcıyı tam bombardıman rotasına getirir); (1) dönüp karşıdan gel, ~450 m'de ateş; (2) geçişte
    // dönmeden aşağı dalarak kop (dönen avcı kutunun tüm nişancılarına yan verir), sonra yeniden öne geç
    let along = 0;
    let lat = 0;
    let bhx = 0;
    let bhz = 1;
    let side = 1;
    if (!fortress) cs.boxRun = 0;
    else {
      _tmp.set(tgt.fwd.x, 0, tgt.fwd.z);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(0, 0, 1);
      _tmp.normalize();
      bhx = _tmp.x;
      bhz = _tmp.z;
      along = (ac.pos.x - tgt.pos.x) * bhx + (ac.pos.z - tgt.pos.z) * bhz;
      lat = (ac.pos.x - tgt.pos.x) * -bhz + (ac.pos.z - tgt.pos.z) * bhx;
      side = lat >= 0 ? 1 : -1;
      // Yandaki mesafe kutunun bizim taraftaki kenarından ölçülür (hedef kutunun öbür kanadında olabilir)
      let edge = 0;
      if (tgt.flight) {
        for (const m of tgt.flight.members) {
          if (!m.airborne) continue;
          const lm = (m.pos.x - tgt.pos.x) * -bhz + (m.pos.z - tgt.pos.z) * bhx;
          if (lm * side > edge * side) edge = lm;
        }
      }
      const latE = lat - edge;
      const v = Math.max(ac.speed, 110);
      const nT = energyG(ac);
      const span = clamp((2 * v * v) / (G * Math.sqrt(nT * nT - 1)) + 400, 1600, 3200);
      const parallel = (ac.fwd.x * bhx + ac.fwd.z * bhz) / (Math.hypot(ac.fwd.x, ac.fwd.z) || 1);
      cs.boxTime += dt;
      // Geçiş biter: hedefi aştı, ~380 m'ye geldi (çarpışmamak ve kutunun içinden geçmemek için kopuş, bkz. breakGap)
      // ya da karşıdan çıktı (yandan geçen avcı kutunun tüm yan silahlarına hedef olur)
      if (cs.boxRun === 1 && (along < -150 || R < 380 || (tailAspect > -0.3 && R < 900) || cs.boxTime > 45)) {
        cs.boxRun = 2;
        cs.boxTime = 0;
        breakGap(ac, tgt, cs.boxDir);
      } else if (cs.boxRun === 2 && cs.boxTime > 8) {
        cs.boxRun = 0;
        cs.boxTime = 0;
      } else if (cs.boxRun === 0 && ((along > 4500 && latE * side > span * 0.5 && latE * side < span * 1.7 && parallel > 0.3) ||
        (along > 3000 && parallel < -0.6 && Math.abs(lat) < 1500) || (cs.boxTime > 240 && along > 1500))) {
        // (Kutunun önünden ona doğru gelen avcı doğrudan saldırır; uzun süre yanda uygun yeri tutturamayan, önde olduğu
        // yerden saldırır. Arkadaki avcı için geçiş "hedefi aştı" sayılıp hemen bitiyordu)
        cs.boxRun = 1;
        cs.boxTime = 0;
      }
      if (cs.boxRun === 0) {
        const ahead = Math.min(along + 3000, 6000);
        const off = edge + span * side;
        _aim.set(tgt.pos.x + bhx * ahead - bhz * off, tgt.pos.y + 100, tgt.pos.z + bhz * ahead + bhx * off);
      }
    }
    if (fortress && cs.boxRun === 0) {
      cmd.dir.subVectors(_aim, ac.pos).normalize();
      cmd.maxG = Math.min(cmd.maxG, energyG(ac));
      cmd.liftUse = 0.85;
      brain.status = `${L('Bombardıman kutusu: önden saldırı için öne geçiyor', 'Bomber box: moving ahead for a head-on pass')} (${tgt.callsign})`;
    } else if (fortress && cs.boxRun === 2) {
      cmd.dir.copy(cs.boxDir);
      cmd.maxG = Math.min(cmd.maxG, s.nMax * 0.8);
      brain.status = L('Bombardıman kutusu: geçişten sonra aşağı kopuyor', 'Bomber box: diving away after the pass');
    } else if (fortress && R > 1300 && ata > 30 * DEG) {
      // Karşıya dönüş: hız kaybetmeden (dönüş çapı yandaki mesafeye göre hesaplandı)
      cmd.dir.copy(_los);
      cmd.maxG = Math.min(cmd.maxG, energyG(ac));
      cmd.liftUse = 0.85;
      brain.status = `${L('Bombardıman kutusu: karşıdan saldırıya dönüyor', 'Bomber box: turning in for a head-on attack')} (${tgt.callsign})`;
    } else if (energyFighter && eAdv > 250 && R > 1500 && tailAspect < 0.35) {
      // Dal-vur için arkaya dönüş: hedefin 1,5 km arkasına, irtifayı koruyarak
      _tmp.set(tgt.fwd.x, 0, tgt.fwd.z);
      if (_tmp.lengthSq() < 1e-4) _tmp.set(0, 0, 1);
      _tmp.normalize();
      _aim.copy(tgt.pos).addScaledVector(_tmp, -1500);
      cmd.dir.set(_aim.x - ac.pos.x, 0, _aim.z - ac.pos.z).normalize();
      // İrtifa üstünlüğü yetmiyorsa giderken hızı koruyarak tırman (dalış için yükseklik)
      if (dh < 800) {
        const vf = ac.speed / vmaxHere(ac);
        cmd.dir.y = vf > 0.85 ? 0.25 : vf > 0.75 ? 0.12 : 0;
      }
      cmd.maxG = Math.min(3, s.nMax, energyG(ac));
      cmd.liftUse = 0.85;
      brain.status = L(`Dal-vur: ${tgt.callsign} arkasına dönüyor`, `Boom and zoom: turning onto ${tgt.callsign}'s tail`);
    } else if (R > 1300) {
      cmd.dir.copy(ata < 30 * DEG ? _aimDir : _los);
      // Uzaktaki hedefe dönerken acele yok: tutunma eşiğinde çekilmez (vrille riski). Üstteki hedefe tırmanış açısı
      // hız payıyla sınırlı: tutunma hızının kıyısında asılı kalan takipçi (yüksekte Fw 190) hem vrilleye giriyor
      // hem de üstteki rakibe kolay hedef oluyordu.
      cmd.liftUse = 0.85;
      const vs = stallSpeed(ac);
      cmd.dir.normalize();
      cmd.dir.y = Math.min(cmd.dir.y, clamp((ac.speed / vs - 1.45) * 0.8, 0, 0.7));
      if (energyFighter) {
        // Enerji avcısı uzaktaki hedefe dönerken hız yakmaz (azami G'li 180° dönüş ~700 m enerji yüksekliği
        // yakıyordu): ~3 G ile döner; hızlıysa tırmanarak döner, irtifada saklanan hız dalışta geri gelir
        cmd.maxG = Math.min(cmd.maxG, energyG(ac));
        if (ata > 60 * DEG && ac.speed > vmaxHere(ac) * 0.85) cmd.dir.y = Math.max(cmd.dir.y, 0.3);
      }
      brain.status = `${L('Hedefe yaklaşıyor', 'Closing on target')}: ${tgt.callsign}`;
    } else if (!energyFighter && R < 450 && closure > 35 && ata > 12 * DEG && tailAspect > 0.3) {
      // (Enerji avcısı hızlı geçişte ateş eder, geçince dikine uzaklaşır; yo-yo dönüş savaşçısının işidir)
      // Aşırı yaklaşma: hedefin arkasına (gecikmeli) nişan al ve düzlem dışına tırman
      _tmp.copy(tgt.pos).addScaledVector(_tv, -1.0);
      cmd.dir.subVectors(_tmp, ac.pos).normalize();
      cmd.dir.y += 0.4;
      // Enerji avcısı (özellikle jet: motoru yavaş toparlanır) gaz kesmez, hızını yukarı çevirir
      throttle = energyFighter ? 1 : 0.25;
      brain.status = L('Aşırı yaklaşma riski: yüksek yo-yo', 'Overshoot risk: high yo-yo');
    } else if (headOn && R < 230 && closure > 60) {
      // Çarpışmadan kaçın: sağa kır (iki taraf da sağa kırınca "sol sola" geçerler)
      _tmp.crossVectors(ac.fwd, ac.upv);
      cmd.dir.copy(ac.fwd).addScaledVector(_tmp, 0.9).addScaledVector(ac.upv, 0.25);
      brain.status = L('Kafa kafaya: çarpışmamak için kır', 'Head-on: breaking to avoid a collision');
    } else if (headOn && cs.headOnShoot === false && R > 350 && energyFighter) {
      // Enerji avcısı öne dönüşe girmez (dönüş savaşını başlatır, hız yakar): hafif yukarıdan geçer, geçişte uzaklaşır
      cmd.dir.copy(_los);
      cmd.dir.y += 0.2;
      cmd.maxG = Math.min(cmd.maxG, energyG(ac));
      brain.status = L('Kafa kafaya: yukarıdan geçiş', 'Head-on: passing above');
    } else if (headOn && cs.headOnShoot === false && R > 350) {
      // Öne dönüş: yana açıl, geçişte karşının arkasına dönebilecek yer bırak
      _tmp.crossVectors(_los, UP).normalize().multiplyScalar(cs.leadSide);
      cmd.dir.copy(_los).addScaledVector(_tmp, 0.55);
      cmd.dir.y += 0.12;
      cmd.liftUse = 0.85;
      brain.status = L('Kafa kafaya: yana açılıp öne dönüş', 'Head-on: offsetting, then turning in');
    } else if (headOn) {
      cmd.dir.copy(_aimDir);
      brain.status = L('Kafa kafaya geçiş', 'Head-on pass');
    } else if (tgtTurning && R > 650 && closure < 15 && ata < 70 * DEG && ac.pos.y > tgt.pos.y - 200) {
      // Alçak yo-yo: dönüşün içine ve biraz aşağı dalarak hız kazan, mesafeyi kapat
      cmd.dir.copy(_aimDir);
      cmd.dir.y -= 0.35;
      brain.status = L('Alçak yo-yo: dönüşün içine dal', 'Low yo-yo: diving inside the turn');
    } else if (ata > 60 * DEG) {
      cmd.dir.copy(_los);
      brain.status = L('Dönüş savaşı: burnu hedefe çevir', 'Turn fight: pulling the nose onto the target');
    } else {
      cmd.dir.copy(_aimDir);
      brain.status = L('Önden takip (lead pursuit)', 'Lead pursuit');
    }
    // Atış mesafesini koru: kanat silahları yakınsama mesafesi civarında (~200 m) en etkili; çok yakına sokulan
    // avcının kanat mermileri hedefin iki yanından geçer
    const wingGuns = ac.guns.some((g) => g.mount === 'wing' || g.mount === 'root');
    const keep = wingGuns ? CONVERGENCE * 0.8 : 150;
    // Jet ağır savunmalı bombardıman kutusuna hızını kesmeden dalar, yakından geçip uzaklaşır (Me 262: nişancının
    // izleyemeyeceği yaklaşma hızı; kuyruk nişancısının önünde yavaşlayıp oturmak ölümdü)
    const slashing = s.engine.kind === 'jet' && tgt.spec.role === 'bomber' && defensiveFire(tgt.spec) >= 60 && !isCrippled(tgt);
    if (R < 800 && !energyFighter && !(fortress && headOn)) throttle = Math.min(throttle, clamp(0.55 + (R - keep) / 600 - closure * 0.008, 0.15, 1));
    else if (energyFighter && !slashing && R < keep * 2 && tailAspect > 0.3) throttle = Math.min(throttle, clamp(0.55 + (R - keep) / 400 - closure * 0.01, 0.2, 1));
    // Enerji avcısı arkadan saldırıda yaklaşma hızını sınırlar (≈150 km/sa): çok hızlı gelen ateş edecek zaman bulamaz.
    // Jetin motoru yavaş toparlandığı için gazı daha erken ve az keser.
    else if (energyFighter && !slashing && tailAspect > 0.3 && R < 1800 && closure > 45) throttle = s.engine.kind === 'jet' ? 0.65 : 0.5;
    if (energyFighter) {
      const passed = R < 90 || (R < 200 && ata > 40 * DEG) || (closure < -5 && R < 700 && ata > 80 * DEG) || (slashing && R < 220);
      // Süre sınırı (uzayan dönüş savaşından kopmak için) arkadan yaklaşırken işlemez: 3 km'den yaklaşma ~20 sn
      // sürüyor ve saldırı tam atış menziline girmeden kesiliyordu
      const chasing = tailAspect > 0.3 && closure > 0 && ata < 45 * DEG;
      if ((passed && cs.phaseTime > 2) || (cs.phaseTime > 20 && !chasing)) setPhase(brain, 'extend');
    }
  }
  // Tırmanışın tepesinde dönüş (wingover): burun ufkun altına düşürülerek dönülür; tırmanış açısını koruyarak dönen
  // uçak tutunma hızına kadar yavaşlıyordu
  if (energyFighter && cs.phase === 'attack' && ac.fwd.y > 0.3 && ac.speed < vmaxHere(ac) * 0.75) {
    cmd.dir.y = Math.min(cmd.dir.y, -0.25);
  }
  // Enerji yönetimi: tutunma hızına yaklaşınca burun aşağı, G bırak, hız kazan
  if (ac.speed < stallSpeed(ac) * 1.25 && ac.pos.y - groundLevel(ac.pos.x, ac.pos.z) > COMBAT_AGL + 100) {
    cmd.maxG = Math.min(cmd.maxG, 1.4);
    cmd.dir.y = Math.min(cmd.dir.y, -0.2);
    throttle = 1;
    brain.status = L('Hız çok düştü: burun aşağı, hız kazanıyor', 'Too slow: nose down, regaining speed');
  }
  cmd.throttle = throttle;
  // Önden geçişte liderin yanından gelen kanat adamı bombardıman uçağını tam karşıdan değil ~50° açıyla görür: bu da
  // önden saldırıdır, ateş erken açılır (yoksa 450 m'de açıp 380 m'de kopuyor, hiç ateş edemiyordu)
  const frontal = headOn || (fortress && cs.boxRun === 1 && tailAspect < -0.3);
  if (tryFire(ac, brain, tgt, aimErr, R, frontal)) brain.status = `${L('Ateş!', 'Firing!')} ${tgt.callsign} — ${Math.round(R)} m`;
}

function defensive(ac: Aircraft, brain: Brain, threat: Aircraft, world: World, dt: number, cmd: FlyCommand): void {
  const s = ac.spec;
  const cs = brain.combat;
  _rel.subVectors(threat.pos, ac.pos);
  const R = Math.max(_rel.length(), 1);
  _los.copy(_rel).divideScalar(R);
  cmd.maxG = s.nMax * clamp(0.82 + 0.15 * ac.skill, 0.85, 1);
  cmd.turnGain = 4;
  cmd.throttle = 1;
  cmd.speed = null;
  cmd.wep = true;
  cmd.minAlt = COMBAT_AGL;

  const vCorner = cornerSpeed(ac);
  const tactic = tacticVs(ac, threat);
  // Düz kaçış ancak ara açılabiliyorsa: takipçi atış menzilindeyken (≈600 m) hız farkı arayı onlarca saniyede açar,
  // o sürede vurulur (Bf 109'lar en çok "hız avantajıyla kopma" sırasında düşürülüyordu)
  const canOutrun = R > 600 || ac.speed > threat.speed * 1.12;
  const faster = canOutrun && ((s.vMax > threat.spec.vMax * (tactic === 'energy' ? 1.05 : 1.15) && ac.speed > threat.speed * 0.9) ||
    (ac.speed > threat.speed * 1.2 && R > 500));
  const crippled = isCrippled(ac);
  const agl = ac.pos.y - groundLevel(ac.pos.x, ac.pos.z);
  // Eksi G kaçışı: takipçinin motoru eksi G'de susar (şamandıralı karbüratör), bizimki susmaz
  const negG = (threat.spec.engine.floatCarb ?? 0) >= 1 && !(s.engine.floatCarb ?? 0) && agl > 1300 && R < 1100 && s.role === 'fighter';
  // Yakındaki takipçiden ilk kaçış eksi G dalışıdır (Bf 109'un Spitfire I, Hurricane ve I-16'ya karşı klasik kaçışı);
  // eskiden "hızlıysan kaç" kuralı önce geldiği için hiç kullanılmıyordu
  const negGFirst = negG && R < 800;
  // Tırmanarak kopma: belirgin tırmanma üstünlüğü ve yeterli hız
  threat.velocity(_tv);
  const threatClosure = _tv.dot(_los) * -1 - ac.fwd.dot(_los) * -ac.speed;
  const climbAway = tactic === 'energy' && perfHere(ac, 'climb') > perfHere(threat, 'climb') * 1.15 && R > 450 && ac.speed > s.vStall * 1.7 &&
    threatClosure < 12 && threat.pos.y < ac.pos.y + 150;
  // Dönüşte yenik enerji avcısı dönüşe girmez, tam güçle dalarak uzaklaşır (gerekirse sonra avantajla döner)
  const diveAway = tactic === 'energy' && agl > 900 && R > 350 && threat.spec.turnTime < s.turnTime * 1.02;
  // Zikzakla kaçış: dalacak irtifası kalmamış, bu irtifada belirgin hızlı uçak dönüş avcısıyla dönmez, kırılmaz (ikisi
  // de hızını eritir, daha iyi dönen takipçi eşit hızda arkasına yerleşir): tam güç ve düşük G'yle hız farkını açar,
  // nişanı bozmak için küçük yön değişimleri yapar. 109 E alçakta Hurricane'e 1'e 1'de 24'e 8 yeniliyordu. Yalnız
  // takipçi çok daha iyi dönüyorsa (dönüşleri yakınsa eski manevralar daha iyi: Fw 190 P-38'den böyle kaçamıyordu) ve
  // tek motorluda (ağır Bf 110 Hurricane'den kaçamaz, savunma çemberine girerdi)
  const runWeave = !negG && !diveAway && R < 1000 && s.engines === 1 && threat.spec.turnTime < s.turnTime * 0.9 &&
    vmaxHere(ac) > vmaxHere(threat) * 1.06 && ac.speed > threat.speed * 0.85;
  if (crippled) {
    // Hasarlı: eve doğru dalışla kaç
    const base = world.nearestAirbase(ac.team, ac.pos, (b) => b.usable);
    if (base) _home.copy(base.s.pos);
    else _home.copy(ac.pos).addScaledVector(_los, -5000);
    const hx = _home.x - ac.pos.x;
    const hz = _home.z - ac.pos.z;
    const l = Math.hypot(hx, hz) || 1;
    cmd.dir.set(hx / l - _los.x * 0.6, -0.15, hz / l - _los.z * 0.6);
    brain.status = L('Hasarlı: savaştan kopuyor', 'Damaged: disengaging');
  } else if (runWeave) {
    let hx = ac.fwd.x;
    let hz = ac.fwd.z;
    // Takipçi arkada değilse ondan uzaklaşan yöne dön
    if (ac.fwd.dot(_los) > -0.3) {
      hx -= _los.x;
      hz -= _los.z;
    }
    const l = Math.hypot(hx, hz) || 1;
    hx /= l;
    hz /= l;
    cs.jinkTime -= dt;
    if (cs.jinkTime <= 0) {
      cs.jinkTime = 1 + Math.random() * 0.8;
      cs.leadSide = -cs.leadSide;
    }
    // ±15° zikzak; yere yakın değilse hafif alçalarak hızlan
    const a = 0.27 * cs.leadSide;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    cmd.dir.set(hx * c - hz * sn, agl > 400 ? -0.06 : 0.02, hx * sn + hz * c);
    cmd.maxG = Math.min(2.5, s.nMax);
    cmd.liftUse = 0.8;
    brain.status = L('Savunma: zikzakla kaçış (hız farkını açıyor)', 'Defensive: weaving away (using its speed edge)');
    if (tactic === 'energy' && cs.phase === 'attack') setPhase(brain, 'extend');
  } else if (negGFirst) {
    cmd.dir.set(ac.fwd.x * 0.35, -0.94, ac.fwd.z * 0.35);
    cmd.allowPush = true;
    cmd.forcePush = true;
    cmd.maxG = s.nMax * 0.8;
    brain.status = L('Savunma: eksi G ile dalış (karbüratörlü takipçi izleyemez)', 'Defensive: negative-G dive (a carbureted chaser cannot follow)');
    if (tactic === 'energy' && cs.phase === 'attack') setPhase(brain, 'extend');
  } else if (faster) {
    // Takipçi şu an daha hızlıysa yatay kaçış işe yaramaz: irtifa varsa dik dalışla hızlan (ağır, az sürüklemeli
    // uçak dalışta daha çabuk hızlanır — Fw 190, P-47, Bf 109'un klasik kaçışı; pilot Vne'de dalışı yataylaştırır,
    // dalış sınırı düşük takipçi izleyemez). Değilse taarruzdaki uzaklaşmanın aynısı: hızlan, ara açılınca dikine kop.
    const steep = threat.speed > ac.speed * 0.97 && agl > 2000 && R < 700 && !cs.zoom;
    if (steep) {
      const hx = -_los.x;
      const hz = -_los.z;
      const l = Math.hypot(hx, hz) || 1;
      cmd.dir.set(hx / l, -0.55, hz / l);
      cmd.maxG = s.nMax * 0.75;
      brain.status = L('Savunma: dik dalışla kopma', 'Defensive: steep dive to break away');
    } else {
      extendFrom(ac, brain, threat, R, cmd);
      brain.status = cs.zoom ? L('Savunma: hızını irtifaya çeviriyor', 'Defensive: zoom climbing') : L('Savunma: hız avantajıyla kopma', 'Defensive: escaping on speed');
    }
    // Tehdit geçince taarruz uzaklaşmayla sürer (hemen geri dönüp takipçinin önüne girmez)
    if (tactic === 'energy' && cs.phase === 'attack') {
      const z = cs.zoom;
      setPhase(brain, 'extend');
      cs.zoom = z;
    }
  } else if (negG) {
    // Burnu itip dik dalış: takipçi ancak yarım tonozla izleyebilir, o arada mesafe açılır
    cmd.dir.set(ac.fwd.x * 0.35, -0.94, ac.fwd.z * 0.35);
    cmd.allowPush = true;
    cmd.forcePush = true;
    cmd.maxG = s.nMax * 0.8;
    brain.status = L('Savunma: eksi G ile dalış (karbüratörlü takipçi izleyemez)', 'Defensive: negative-G dive (a carbureted chaser cannot follow)');
  } else if (diveAway && !climbAway) {
    const hx = -_los.x;
    const hz = -_los.z;
    const l = Math.hypot(hx, hz) || 1;
    cmd.dir.set(hx / l, agl > 1800 ? -0.6 : -0.3, hz / l);
    cmd.maxG = s.nMax * 0.7;
    brain.status = L('Savunma: dalarak uzaklaşıyor', 'Defensive: diving away');
    if (cs.phase === 'attack') setPhase(brain, 'extend');
  } else if (climbAway) {
    // Hafif sarmal tırmanış: daha kötü tırmanan takipçi nişanı tutamaz
    _tmp.crossVectors(_los, UP).normalize();
    cmd.dir.copy(ac.fwd).addScaledVector(_tmp, 0.25);
    cmd.dir.y = ac.speed > s.vStall * 2.2 ? 0.75 : 0.45;
    cmd.maxG = s.nMax * 0.7;
    brain.status = L('Savunma: tırmanarak kopma', 'Defensive: climbing away');
  } else if (ac.speed < vCorner * 0.7 && ac.pos.y - groundLevel(ac.pos.x, ac.pos.z) > 1200) {
    cmd.dir.set(ac.fwd.x, -0.9, ac.fwd.z);
    brain.status = L('Savunma: dalışla hız kazan', 'Defensive: diving for speed');
  } else if (s.role === 'bomber') {
    // Bombardıman uçağı manevra yapmaz, nişancılar savunur
    return;
  } else {
    cmd.dir.copy(_los);
    cmd.dir.y = clamp(cmd.dir.y, -0.3, 0.25);
    brain.status = L('Savunma: kırılma dönüşü', 'Defensive: break turn');
  }

  // Saldırgan nişan aldıysa kaçamak manevra
  _tmp.copy(_los).negate();
  const threatAta = angleBetween(threat.fwd, _tmp);
  cs.jinkTime -= dt;
  if (R < 900 && threatAta < 8 * DEG && !runWeave && !(negG && R > 250) && !(climbAway && R > 600) && !(diveAway && R > 500) && !(faster && R > 400)) {
    if (cs.jinkTime <= 0) {
      cs.jinkTime = 0.6 + Math.random() * 0.9;
      cs.jinkDir.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.7, Math.random() - 0.5);
      cs.jinkDir.addScaledVector(ac.fwd, -cs.jinkDir.dot(ac.fwd));
      if (cs.jinkDir.lengthSq() < 1e-6) cs.jinkDir.copy(ac.upv);
      cs.jinkDir.normalize();
    }
    cmd.dir.copy(ac.fwd).addScaledVector(cs.jinkDir, 2);
    brain.status = L('Savunma: kaçamak manevra (jink)', 'Defensive: jinking');
  }
}

/**
 * Kanat adamı koruma doktrini: lidere saldıran varsa ona saldır; yoksa liderin arkasında
 * savaş açılımında kal ve liderin hedefine fırsat atışı yap.
 */
export function coverCommand(ac: Aircraft, brain: Brain, lead: Aircraft, world: World, dt: number, cmd: FlyCommand): void {
  // Lideri tehdit eden düşman
  let attacker: Aircraft | null = null;
  let bestD = 2500;
  for (const e of world.aircraft) {
    if (e.team === ac.team || !e.airborne || e.brain.target !== lead) continue;
    const d = e.pos.distanceTo(lead.pos);
    if (d < bestD) {
      bestD = d;
      attacker = e;
    }
  }
  if (attacker && ac.armed) {
    brain.target = attacker;
    offensive(ac, brain, attacker, dt, cmd);
    if (!brain.fireGuns) brain.status = `${L('Lideri koruyor', 'Covering the leader')}: ${attacker.callsign}`;
    return;
  }
  // Bombardıman kutusuna önden saldırıda çift (ve dörtlü) yan yana girer: lider karşıya dönünce kanat adamı da kendi
  // geçişini yapar, kopuştan sonra yeniden liderin yanına döner
  const cs = brain.combat;
  const lb = lead.brain.combat.boxRun;
  if (lb !== cs.boxLead) {
    cs.boxLead = lb;
    // Kanat adamı ancak kendisi de kutunun önündeyse katılır (gerideyse geçişi anında bitiyordu)
    const lt1 = lead.brain.target;
    const ahead = lt1 ? (ac.pos.x - lt1.pos.x) * lt1.fwd.x + (ac.pos.z - lt1.pos.z) * lt1.fwd.z : 0;
    if (lb === 1 && cs.boxRun === 0 && ahead > 1500) {
      cs.boxRun = 1;
      cs.boxTime = 0;
    }
  }
  const lt0 = lead.brain.target;
  if (cs.boxRun > 0 && lt0 && lt0.airborne && ac.armed) {
    brain.target = lt0;
    offensive(ac, brain, lt0, dt, cmd);
    if (cs.boxRun > 0) return;
  }
  // Savaş açılımı: liderin arka-yan-üstü
  _tmp.set(lead.fwd.x, 0, lead.fwd.z);
  if (_tmp.lengthSq() < 1e-4) _tmp.set(0, 0, -1);
  _tmp.normalize();
  const side = ac.slot % 4 === 1 ? -1 : 1;
  _aim.copy(lead.pos).addScaledVector(_tmp, -260).add(_av.set(-_tmp.z * side * 180, 80, _tmp.x * side * 180));
  _aim.addScaledVector(_tmp, 320);
  cmd.dir.subVectors(_aim, ac.pos);
  cmd.speed = null;
  cmd.throttle = clamp(0.75 + (_aim.distanceTo(ac.pos) - 300) / 800, 0.3, 1);
  cmd.maxG = ac.spec.nMax * 0.85;
  cmd.turnGain = 2.5;
  cmd.minAlt = COMBAT_AGL;
  brain.status = `${L('Lideri koruyor', 'Covering the leader')} (${lead.callsign})`;
  const lt = lead.brain.target;
  if (lt && lt.airborne && ac.armed) {
    const R = lt.pos.distanceTo(ac.pos);
    const err = gunSolution(ac, brain, lt, dt, _aimDir);
    if (tryFire(ac, brain, lt, err, R, lt.fwd.dot(_los.subVectors(lt.pos, ac.pos).normalize()) < -0.6)) {
      brain.status = `${L('Fırsat atışı', 'Snap shot')}: ${lt.callsign}`;
    }
  }
}
