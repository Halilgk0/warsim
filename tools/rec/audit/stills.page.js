// Sayfa tarafı (kayıt kipi ?rec): kendi GameRenderer'ımızı kurar, tohumlu çekim dünyalarını ileri alır ve oyunun
// kamera düzeneğiyle (rig: hedef, uzaklık, eğim, yön) sabit görünümler çizer. Aynı sahne her seferinde aynı.
const R = await import('/src/render/gameRenderer.ts');
const T = await import('/src/sim/terrain.ts');
const S = await import('/src/ui/settings.ts');
const rec = window.__rec;
document.body.innerHTML = '';
const vp = document.createElement('div');
vp.id = 'viewport';
const labels = document.createElement('div');
labels.id = 'labels';
document.body.append(vp, labels);
// Denetim kareleri en yüksek kalitede (oyunun varsayılanı düşük)
S.settings.graphics.quality = 'high';
const r = new R.GameRenderer(vp, labels, { preserveBuffer: true });
r.rig.director = () => {};
const DEG = Math.PI / 180;
let w = null;
let scene = '';

function stepTo(t) {
  // Son 6 sn çizilerek ilerler (duman, ateş ve izler canlı birikir); öncesi yalnız simülasyon
  while (w.time < t - 6) {
    rec.step(w);
    w.events.length = 0;
  }
  r.setWorld(w);
  r.prepareMap();
  while (w.time < t) {
    rec.step(w);
    const a = w.aircraft.find((x) => x.status === 'flying');
    if (a) { r.rig.target.copy(a.pos); r.rig.distance = 2000; r.rig.pitch = 0.6; r.rig.apply(); }
    r.frame(1 / 60, 1);
  }
}
function flying(pred) {
  return w.aircraft.filter((a) => a.status === 'flying' && pred(a));
}
function centroid(list) {
  const c = list[0].pos.clone().multiplyScalar(0);
  for (const a of list) c.add(a.pos);
  return c.multiplyScalar(1 / list.length);
}
function behindYaw(a, off) {
  const f = a.fwd;
  return Math.atan2(-f.x, -f.z) + off;
}
const ground = (x, z) => ({ x, y: T.groundLevel(x, z), z });

window.__st = {
  info() {
    return { map: T.terrainMap.id, gpu: rec.gpu };
  },
  setup(name) {
    scene = name;
    if (name === 'anakara') {
      const f = rec.scan('stuka_impact');
      w = rec.build('stuka_impact');
      stepTo(f.t + 7);
    } else if (name === 'takimada') {
      const f = rec.scan('title_b17');
      w = rec.build('title_b17');
      stepTo(f.t + 2);
    } else if (name === 'yuksek') {
      w = rec.build('b17_turrets');
      stepTo(90);
    }
    return { map: T.terrainMap.id, time: w.time, n: w.aircraft.length };
  },
  /** Görünüm listesi: ad → kamera. */
  views() {
    const out = {};
    if (scene === 'anakara') {
      const fac = w.structures.find((s) => s.kind === 'factory' && s.team === 1);
      const fp = fac.pos;
      const ac = flying((a) => a.spec.id === 'ju87b')[0] ?? flying(() => true)[0];
      const fighter = flying((a) => a.spec.id === 'bf109e')[0] ?? ac;
      out.strateji = { target: ground(fp.x, fp.z), dist: 60000, pitch: 58, yaw: 20 };
      out.taktik = { target: ground(fp.x, fp.z), dist: 8000, pitch: 45, yaw: 20 };
      out.yakin_ucak = { target: r.viewPos(ac), dist: 38, pitch: 10, yawRad: behindYaw(ac, 0.75) };
      out.yakin_avci = { target: r.viewPos(fighter), dist: 30, pitch: 6, yawRad: behindYaw(fighter, 2.1) };
      out.yakin_ates = { target: ground(fp.x, fp.z), dist: 750, pitch: 18, yaw: 40 };
      out.ufuk = { target: ground(fp.x - 1500, fp.z + 1500), dist: 3500, pitch: 5, yaw: 200 };
      out.arazi_yakin = { target: ground(fp.x + 2600, fp.z - 3200), dist: 450, pitch: 32, yaw: 120 };
    } else if (scene === 'takimada') {
      const b = flying(() => true);
      const c = centroid(b);
      out.strateji = { target: ground(0, 0), dist: 110000, pitch: 58, yaw: 0 };
      out.taktik = { target: c, dist: 9000, pitch: 40, yaw: 160 };
      out.yakin_ucak = { target: r.viewPos(b[0]), dist: 70, pitch: 12, yawRad: behindYaw(b[0], 0.9) };
      out.deniz_yakin = { target: { x: c.x, y: 0, z: c.z + 1500 }, dist: 1400, pitch: 22, yaw: 150 };
      out.ufuk = { target: { x: c.x, y: 0, z: c.z }, dist: 3000, pitch: 4, yaw: 170 };
    } else if (scene === 'yuksek') {
      const b = flying((a) => a.spec.id === 'b17g');
      const p = flying((a) => a.spec.id === 'p51d');
      out.yakin_b17 = { target: r.viewPos(b[0]), dist: 110, pitch: 3, yawRad: behindYaw(b[0], 1.2) };
      out.yakin_p51 = { target: r.viewPos(p[0] ?? b[1]), dist: 32, pitch: 4, yawRad: behindYaw(p[0] ?? b[1], 0.6) };
      out.kol = { target: centroid(b), dist: 1500, pitch: 12, yawRad: behindYaw(b[0], 0.5) };
    }
    return out;
  },
  shoot(v, frames = 50) {
    const rig = r.rig;
    rig.target.set(v.target.x, v.target.y, v.target.z);
    rig.distance = v.dist;
    rig.pitch = v.pitch * DEG;
    rig.yaw = v.yawRad ?? v.yaw * DEG;
    rig.apply();
    for (let i = 0; i < frames; i++) r.frame(1 / 60, 1);
    const inf = r.renderer.info.render;
    return { calls: inf.calls, tris: inf.triangles };
  },
  /** Saf çizim süresi (iş parçacığı): aynı kamerayla n kare, ms/kare. */
  bench(n = 60) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) r.frame(1 / 60, 1);
    r.renderer.getContext().finish();
    return (performance.now() - t0) / n;
  },
  /** Katman katman üçgen ve çağrı: her katman tek başına kapatılınca düşen miktar. */
  breakdown() {
    const parts = { arazi: r.terrain.group, sus: r.scenery.group, yapilar: r.structGroup, efekt: r.effects.mesh };
    const info = () => { r.renderer.render(r.scene, r.camera); const i = r.renderer.info.render; return { calls: i.calls, tris: i.triangles }; };
    const all = info();
    const out = { toplam: all };
    for (const [k, g] of Object.entries(parts)) {
      const v = g.visible; g.visible = false;
      const x = info(); g.visible = v;
      out[k] = { calls: all.calls - x.calls, tris: all.tris - x.tris };
    }
    // Arazi düzeylerine göre görünen parça sayısı
    const lv = [0, 0, 0];
    for (const c of r.terrain.chunks) for (let l = 0; l < 3; l++) if (c.meshes[l]?.visible) lv[l]++;
    out.arazi_parca = lv;
    return out;
  },
  settings: S.settings,
  /** Dünya zamanı (s). */
  time: () => w?.time ?? 0,
  /** Tanı için: oyunun çizicisi (sahne, katmanlar). */
  r,
};
return 'hazır';
