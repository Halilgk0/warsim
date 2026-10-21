// Otopilot: "şu yöne uç" komutunu gerçek bir pilot gibi yatış + G çekişine çevirir.
//
// İstenen yön için gereken yanal ivme hesaplanır, buna yerçekimi telafisi eklenir;
// ortaya çıkan kaldırma vektörü gövde üstüyle hizalanana kadar yatılır, sonra çekilir.
// Bu sayede: hafif düzeltmelerde küçük yatış, sert dönüşte 70-80° yatış + yüksek G,
// burnu aşağı sokmak gerekince (ör. pike dalışına giriş) ters dönüp çekme kendiliğinden ortaya çıkar.
// Arazi: önümüzdeki yolun en yüksek noktasına göre dalıştan çıkış ve tırmanma payı hesaplanır.

import { Vector3 } from 'three';
import type { Aircraft } from './aircraft';
import { availableG, machOf, stallSpeed } from './flightModel';
import { rollRateAt } from './aero';
import { damageEffects } from './damage';
import { sigma } from '../atmosphere';
import { groundLevel } from '../terrain';
import { G, UP, clamp } from '../../core/math';

export interface FlyCommand {
  /** İstenen uçuş yönü (normalize edilmesi gerekmez). */
  dir: Vector3;
  /** Pilotun çekmeye razı olduğu azami G. */
  maxG: number;
  /**
   * Tutunma sınırının ne kadarı kullanılır (1 = sarsıntı eşiğine kadar). Acele gerekmeyen dönüşte pilot pay bırakır:
   * eşikte çekilen her saniye vrille riskidir.
   */
  liftUse: number;
  /** Açı hatası başına istenen dönüş hızı (1/s). Yüksek = agresif. */
  turnGain: number;
  /** Doğrudan gaz (0..1). null ise hız tutma kullanılır. */
  throttle: number | null;
  /** Hedef hız (m/s). throttle null ise geçerli. */
  speed: number | null;
  diveBrake: boolean;
  /** Küçük aşağı düzeltmelerde negatif G ile itmeye izin ver. */
  allowPush: boolean;
  /** Araziden güvenli yükseklik (AGL, m). */
  minAlt: number;
  /** false: iniş gibi bilerek yere yaklaşılan durumlarda arazi koruması kapalı. */
  terrainAvoid: boolean;
  /** Bu açı hatasına kadar (rad) burnu indirmek için ters dönmek yerine itilir. */
  pushTheta: number;
  /** Büyük açıda da it (eksi G ile dalışa geçiş: yuvarlanmadan burun aşağı). */
  forcePush: boolean;
  /** İniş konfigürasyonu (flap + takım). */
  flaps: boolean;
  /** Azami yatış açısı (rad); ağır uçaklarda sınırlı. */
  maxBank: number;
  /** Acil güç (WEP) iste. */
  wep: boolean;
  afterburner: boolean;
}

export function newCommand(): FlyCommand {
  return {
    dir: new Vector3(0, 0, 1),
    maxG: 3,
    liftUse: 1,
    turnGain: 1.5,
    throttle: null,
    speed: null,
    diveBrake: false,
    allowPush: true,
    minAlt: 150,
    terrainAvoid: true,
    pushTheta: 0.45,
    forcePush: false,
    flaps: false,
    maxBank: Math.PI,
    wep: false,
    afterburner: false,
  };
}

export function resetCommand(c: FlyCommand, ac: Aircraft): void {
  c.dir.copy(ac.fwd);
  c.maxG = 3;
  c.liftUse = 1;
  c.turnGain = 1.5;
  c.throttle = null;
  c.speed = ac.spec.cruiseSpeed;
  c.diveBrake = false;
  c.allowPush = true;
  c.minAlt = 150;
  c.terrainAvoid = true;
  c.pushTheta = 0.45;
  c.forcePush = false;
  c.flaps = false;
  // Bombardıman uçakları (ve G sınırı düşük ağır uçaklar) 55°'den fazla yatmaz
  c.maxBank = ac.spec.role === 'bomber' || ac.spec.nMax <= 4 ? 55 * (Math.PI / 180) : Math.PI;
  c.wep = false;
  c.afterburner = false;
}

/** Belirli bir yatay yönde, verilen mesafeye kadar arazinin en yüksek noktası. */
export function ridgeAlong(x: number, z: number, hx: number, hz: number, dist: number, step = 150): number {
  let max = groundLevel(x, z);
  for (let s = step; s <= dist; s += step) max = Math.max(max, groundLevel(x + hx * s, z + hz * s));
  return max;
}

/** Yer koruması devredeyken kaçış yönü: en alçak araziye dön (dar vadide tırmanmak yerine geri dön). */
function escapeHeading(ac: Aircraft, out: Vector3): void {
  let hx = ac.fwd.x;
  let hz = ac.fwd.z;
  const l = Math.hypot(hx, hz);
  if (l < 1e-3) {
    hx = ac.upv.x;
    hz = ac.upv.z;
  }
  const l2 = Math.hypot(hx, hz) || 1;
  hx /= l2;
  hz /= l2;
  let best = Infinity;
  let bx = hx;
  let bz = hz;
  for (const ang of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9, Math.PI]) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const ax = hx * c - hz * s;
    const az = hx * s + hz * c;
    // Dönüş maliyeti: aynı yükseklikte ise mevcut yönü tercih et
    const score = ridgeAlong(ac.pos.x, ac.pos.z, ax, az, 1800, 200) + Math.abs(ang) * 40;
    if (score < best) {
      best = score;
      bx = ax;
      bz = az;
    }
  }
  out.set(bx, 0, bz);
}

/** Yatay hız yönünde, verilen mesafeye kadar arazinin en yüksek noktası. */
export function groundAhead(ac: Aircraft, dist: number): number {
  let hx = ac.fwd.x;
  let hz = ac.fwd.z;
  const l = Math.hypot(hx, hz);
  if (l < 1e-3) return groundLevel(ac.pos.x, ac.pos.z);
  hx /= l;
  hz /= l;
  let max = groundLevel(ac.pos.x, ac.pos.z);
  const n = Math.max(4, Math.ceil(dist / 150));
  for (let i = 1; i <= n; i++) {
    const s = (dist * i) / n;
    max = Math.max(max, groundLevel(ac.pos.x + hx * s, ac.pos.z + hz * s));
  }
  return max;
}

const _d = new Vector3();
const _lat = new Vector3();
const _fh = new Vector3();
const _sideH = new Vector3();
const _gPerp = new Vector3();
const _L = new Vector3();
const _desUp = new Vector3();
const _tmp = new Vector3();
const _upP = new Vector3();
const _rightP = new Vector3();

export function fly(ac: Aircraft, cmd: FlyCommand, dt: number): void {
  const s = ac.spec;
  const f = ac.fwd;
  const u = ac.upv;
  const v = Math.max(ac.speed, 3);
  const fx = damageEffects(ac.damage);
  const nAvail = availableG(ac, v, fx.nMaxMul, cmd.flaps);
  const rollNow = rollRateAt(s, v * Math.sqrt(sigma(Math.max(ac.pos.y, 0))), ac.mods) * fx.rollMul;
  // Yorgun pilot uzun süre yüksek G çekemez
  let maxG = Math.min(cmd.maxG, s.nMax * fx.nMaxMul * (1 - 0.45 * ac.fatigue));
  if (cmd.liftUse < 1) maxG = Math.min(maxG, Math.max(1.2, nAvail * cmd.liftUse));
  let gain = cmd.turnGain;

  _d.copy(cmd.dir);
  if (_d.lengthSq() < 1e-8) _d.copy(f);
  _d.normalize();

  // --- Arazi koruması: önümüzdeki en yüksek zemine göre
  ac.groundAvoid = false;
  let pullThrough = false;
  if (cmd.terrainAvoid) {
    // Pike bombardımanı (hava freni açık) dalışında yatayda az yol gidilir: önüne bakış dalış açısıyla kısalır
    // (hedefin ötesindeki tepeler yüzünden bırakma irtifasından çok önce çekişe geçiliyordu). Dalaşta değişmez.
    const horizF = Math.sqrt(Math.max(1e-4, 1 - f.y * f.y));
    const look = clamp(v * 7 * (cmd.diveBrake && f.y < 0 ? Math.max(horizF, 0.3) : 1), 400, 3500);
    const agl = ac.pos.y - groundAhead(ac, look);
    if (f.y < 0) {
      // Tepki süresi: pilot gecikmesi + kanatları düzeltmek için gereken yuvarlanma
      const horiz = Math.sqrt(Math.max(1e-4, 1 - f.y * f.y));
      const bank = Math.acos(clamp(u.y / horiz, -1, 1));
      // Pike bombardımanında dikeye yakın dalışta yatış önemsiz: hangi yatışta çekilse burun kalkar
      const rr = Math.max(rollNow, 0.1);
      const T = 1.2 + (cmd.diveBrake && horiz < 0.5 ? 0 : bank / rr);
      // Yatış 90°'yi geçiyorken çekilemez: o sürede yol yerçekimiyle dikleşir (ağır kanatçıklı uçakta saniyelerce)
      const tInv = cmd.diveBrake ? 0 : Math.max(0, bank - Math.PI / 2) / rr;
      const gam0 = Math.asin(clamp(-f.y, 0, 1));
      const gamEnd = Math.min(Math.PI / 2, gam0 + ((G * horiz) / v) * tInv);
      const sinAvg = (Math.sin(gam0) + Math.sin(gamEnd)) / 2;
      // Bu sürede dalış hızlanmaya devam eder; çıkış yarıçapı o hızla ve o hızdaki (Mach'la azalan) G ile hesaplanır
      const vEnd = v + G * sinAvg * T * 0.7;
      const pullG = Math.max(Math.min(availableG(ac, vEnd, fx.nMaxMul, false), s.nMax) - 1, 0.5);
      const radius = (vEnd * vEnd) / (G * pullG);
      const altLoss = radius * (1 - Math.cos(gamEnd));
      const react = sinAvg * (v + vEnd) * 0.5 * T;
      let drop = altLoss + react;
      // Yan yatmış ya da sırtüstü dik dalışta iki çıkış var: düzelip çekmek ya da sırtüstüne yuvarlanıp yarım döngüyü
      // tamamlamak (çekip geçmek: yarıçap × (1 + cos γ) irtifa). Pilot daha az irtifa yiyeni seçer. Ağır kanatçıklı
      // uçak (Bf 110 yüksek hızda ~11°/sn) yan yatıkken düzelmeye çalışırken G'siz dalıp yere çakılıyordu.
      if (!cmd.diveBrake && bank > 1.2) {
        const tB = 1.0 + (Math.PI - bank) / Math.max(rollNow, 0.15);
        // Yarım döngüde kazanılacak hız şimdiki hızdaki yarıçapla kestirilir (sürüklemeyle düşülen irtifanın yarısı)
        const r0 = (v * v) / (G * Math.max(Math.min(nAvail, s.nMax) - 1, 0.5));
        const vB = Math.sqrt(v * v + G * (r0 * (1 + horiz) + -f.y * v * tB));
        const rB = (vB * vB) / (G * Math.max(Math.min(availableG(ac, vB, fx.nMaxMul, false), s.nMax) - 1, 0.5));
        const dropB = rB * (1 + horiz) + -f.y * (v + vB) * 0.5 * tB;
        if (dropB < drop) {
          drop = dropB;
          pullThrough = true;
        }
      }
      if (agl - drop < cmd.minAlt * 0.5) ac.groundAvoid = true;
    } else if (agl < cmd.minAlt * 0.35) {
      ac.groundAvoid = true;
    }
    if (ac.groundAvoid) {
      if (f.y < -0.9) {
        // Dikine dalış: uçağın tepesine doğru, yuvarlanmadan tam çekiş
        _d.copy(f).addScaledVector(u, 1.5);
      } else if (f.y < -0.25 && pullThrough) {
        // Çekip geç: sırtüstü konuma (kaldırma yere dönük) yuvarlan ve yarım döngüyü tamamla
        _d.set(0, -1, 0).addScaledVector(f, f.y);
        if (_d.lengthSq() < 1e-4) _d.copy(u);
        _d.normalize().multiplyScalar(1.5).add(f);
      } else if (f.y < -0.25) {
        // Dalıştan çıkış: önce burnu kaldır
        _d.set(f.x, 0, f.z);
        if (_d.lengthSq() < 1e-4) _d.set(u.x, 0, u.z);
        _d.normalize();
        _d.y = 0.55;
      } else {
        // Yükselen arazi: en alçak yöne dön; tırmanma açısını hıza göre sınırla (tutunma kaybına girme)
        escapeHeading(ac, _d);
        const vs = stallSpeed(ac);
        const e = clamp((v - vs * 1.2) / (vs * 0.6), 0, 1);
        _d.y = 0.05 + 0.5 * e;
      }
      _d.normalize();
      maxG = s.nMax * fx.nMaxMul;
      gain = 8;
    } else if (agl < cmd.minAlt && _d.y < 0.2) {
      _d.y = Math.max(_d.y, 0.08 + 0.35 * (1 - agl / cmd.minAlt));
      _d.normalize();
    }
  }

  // Sıkıştırılabilirlik: kritik Mach aşılınca pilot dalışı yumuşatır ve gazı keser (kumanda ağırlaşmadan)
  // (Pike bombardımanı hariç: orada pike freni ve gaz kesme zaten devrede)
  const compress = machOf(ac) > s.mcrit + 0.02 && f.y < -0.15 && !ac.groundAvoid && !cmd.diveBrake;
  if (compress && _d.y < -0.25) {
    _d.y = -0.25;
    _d.normalize();
  }
  // Dalış sınırı (Vne): pilot yapısal sınırı aşmaz (kanatçık çırpınması, kumanda kilitlenmesi). Sınıra yaklaşınca
  // dalışı yataylaştırır ve gazı keser. Sıfır'ın (630 km/sa) dalışta Hellcat'i (760) ve P-40'ı (780) izleyememesi
  // buradan gelir.
  const ias = v * Math.sqrt(sigma(Math.max(ac.pos.y, 0)));
  const overVne = !cmd.diveBrake && !ac.groundAvoid && f.y < -0.03 && ias > s.vne * 0.9;
  if (overVne) {
    const lim = ias > s.vne * 0.97 ? 0.04 : -0.12;
    if (_d.y < lim) {
      _d.y = lim;
      _d.normalize();
    }
  }

  // --- İstenen yanal ivme
  const cosT = clamp(f.dot(_d), -1, 1);
  const theta = Math.acos(cosT);
  _lat.copy(_d).addScaledVector(f, -cosT);
  if (_lat.lengthSq() < 1e-8) {
    if (cosT > 0) _lat.set(0, 0, 0);
    else {
      // Hedef tam arkada: yatay dönüş seç
      _lat.crossVectors(UP, f);
      if (_lat.lengthSq() < 1e-6) _lat.copy(u);
    }
  }
  // Arkada kalan, kabaca yatay hedefe yavaşken döngüyle (burun yukarı) değil, yatışlı yatay dönüşle dönülür:
  // burun hafif yukarıdayken yanal bileşen "yukarı" çıkıp uçağı dikine çekiyor, tepede tutunma kaybına sokuyordu
  if (theta > 1.75 && Math.abs(_d.y) < 0.35 && v < stallSpeed(ac) * 2.8) {
    _fh.set(f.x, 0, f.z);
    if (_fh.lengthSq() > 1e-4) {
      _fh.normalize();
      _sideH.crossVectors(UP, _fh);
      const sd = _sideH.x * _d.x + _sideH.z * _d.z;
      _lat.copy(_sideH).multiplyScalar(sd >= 0 ? 1 : -1);
      // Dikey düzeltme uçuş yolunun şu anki eğimine göre: tırmanıştan çıkıp dönerken burun da iner (yalnız istenen
      // eğime bakınca uçak 40° tırmanışı koruyarak dönüyor, tutunma hızına kadar yavaşlıyordu)
      _lat.y += _d.y * 0.3 - f.y * 0.8;
      _lat.addScaledVector(f, -_lat.dot(f));
    }
  }
  if (_lat.lengthSq() > 0) _lat.normalize();

  const omegaMax = (G * Math.min(maxG, nAvail)) / v;
  // Sönümleme: küçük hatada (nişan takibi) hata hızla kapanıyorsa komut önceden azalır; yalnız orantılı kontrol
  // G artış ve yuvarlanma gecikmesiyle hedefin etrafında salınıyordu (hızlı jette nişan 2°→20° gidip geliyordu)
  const dTheta = ac.pilotTheta >= 0 ? (theta - ac.pilotTheta) / Math.max(dt, 1e-3) : 0;
  ac.pilotTheta = theta;
  const damp = theta < 0.35 ? 0.6 : 0;
  const omegaDes = clamp(theta * gain + damp * dTheta, 0, omegaMax * 1.5);
  let aLat = omegaDes * v;

  // Kaldırma = istenen yanal ivme - yerçekiminin dik bileşeni
  _gPerp.set(0, -G, 0).addScaledVector(f, G * f.y);
  // Bilerek sınırlanan G'de (enerji koruyan dönüş) yanal ivme, yerçekimi telafisiyle birlikte G sınırını aşmaz:
  // istenen yön yataysa seviyeli dönülür (eskiden fazla yatıp alçalan sarmala giriyor, irtifa yakıyordu). Kaldırma
  // sınırındaki azami dönüşte değişmez: orada burun hafif aşağıda döner, gerçek pilot da öyle.
  if (maxG < nAvail * 0.97 && _lat.lengthSq() > 0) {
    const lg = _lat.dot(_gPerp);
    const nG = maxG * G;
    const disc = lg * lg - _gPerp.lengthSq() + nG * nG;
    if (disc > 0) aLat = Math.min(aLat, Math.max(0, lg + Math.sqrt(disc)));
  }
  _L.copy(_lat).multiplyScalar(aLat).sub(_gPerp);
  const Lmag = _L.length();
  let nCmd = Lmag / G;
  let rollErr = 0;

  // Pike dalışında istenen kaldırma çok küçükse (≈0,2 g altı) yönü belirsizdir; pilot onu kovalayıp
  // sürekli yuvarlanmasın (tirbuşon olup yanal düzeltme yapamıyordu)
  if (Lmag > (cmd.diveBrake ? 2 : 0.3)) {
    _desUp.copy(_L).divideScalar(Lmag);
    const align = u.dot(_desUp);
    // İtme yalnız uçak dikken: ters uçan pilot önce düzelip sonra çeker
    // Küçük nişan düzeltmesinde (≈11° altı) pilot yuvarlanmak yerine hafifçe iter (en çok −1,5 G): hızlı uçakta
    // yuvarlanma yavaştır, aşağıdaki hedefi izlerken sırtüstü dönmeye çalışırken nişan kaçıyordu
    const smallPush = cmd.allowPush && theta < 0.2 && !cmd.forcePush && nCmd >= 2;
    const push = (cmd.forcePush || smallPush || (cmd.allowPush && nCmd < 2 && theta < cmd.pushTheta)) &&
      (ac.spec.engine.floatCarb ?? 0) < 1 && align < 0 && u.y > 0.2;
    if (push) {
      _desUp.negate();
      nCmd = smallPush ? -Math.min(nCmd, 1.5) : -nCmd;
    }
    // Ağır uçak (bombardıman) sırtüstü dönmez: yatış sınırlanır, alçalma yatışlı yumuşak dönüşle yapılır.
    // Alçakta (700 m altı) hiçbir pilot sırtüstü dönüp yere doğru çekmez (split-S yok).
    let maxBank = cmd.maxBank;
    // Split-S yarım döngü ister: dalışta hız artar, dipteki yarıçap baştakinden büyüktür (hızlı jette 2 km'yi geçer).
    // Payı pilot kestirir: usta geniş pay bırakır, acemi ara sıra yanılır (seyrek pilot hatası kazası gerçekçidir).
    const loopR = (v * v) / (G * Math.max(Math.min(nAvail, maxG) - 1, 1));
    const vLoop = Math.sqrt(v * v + 2.4 * G * loopR);
    const loopEnd = (vLoop * vLoop) / (G * Math.max(Math.min(availableG(ac, vLoop, fx.nMaxMul, false), s.nMax) - 1, 1));
    const judge = clamp(0.8 + 0.25 * ac.skill, 0.92, 1.15);
    const needAlt = Math.max(700, (loopR + loopEnd) * 1.1 * judge);
    if (!cmd.diveBrake && ac.pos.y - groundLevel(ac.pos.x, ac.pos.z) < needAlt) maxBank = Math.min(maxBank, 80 * (Math.PI / 180));
    // Yavaşken yerden kaçış: dik yatış kaldırmayı yer, sığ yatışla düzel
    const slowAvoid = ac.groundAvoid && v < stallSpeed(ac) * 1.6;
    if (slowAvoid) maxBank = Math.min(maxBank, 35 * (Math.PI / 180));
    if (!push && maxBank < Math.PI && (!ac.groundAvoid || slowAvoid)) {
      _upP.set(0, 1, 0).addScaledVector(f, -f.y);
      if (_upP.lengthSq() > 1e-4) {
        _upP.normalize();
        _rightP.crossVectors(f, _upP);
        const vert = _desUp.dot(_upP);
        const lat = _desUp.dot(_rightP);
        const bank = Math.atan2(lat, vert);
        if (Math.abs(bank) > maxBank) {
          const b = Math.sign(bank) * maxBank;
          _desUp.copy(_upP).multiplyScalar(Math.cos(b)).addScaledVector(_rightP, Math.sin(b));
          // Sınırlı yatışta en az seviyeli dönüş G'si: irtifa kaybetmeden döner
          nCmd = Math.max(_L.dot(_desUp) / G, 1 / Math.cos(b));
        }
      }
    }
    rollErr = Math.atan2(f.dot(_tmp.crossVectors(u, _desUp)), u.dot(_desUp));
  } else {
    nCmd = u.dot(_L) / G;
  }

  // Yatış tamamlanmadan tam çekme: hizalandıkça G artar (yat → çek)
  nCmd *= Math.max(0, Math.cos(rollErr));
  nCmd = clamp(nCmd, -maxG * 0.5, maxG);

  let throttle = 1;
  if (cmd.throttle !== null) throttle = cmd.throttle;
  else if (cmd.speed !== null) throttle = clamp(0.55 + (cmd.speed - ac.speed) * 0.06, 0.05, 1);
  // Hızlı dalıştan çıkarken gaz kesilir (hız ve yarıçap büyümesin); yavaşken ya da yükselen araziden kaçarken tam gaz
  const fastDive = f.y < -0.2 && v > stallSpeed(ac) * 2.2;
  if (ac.groundAvoid) throttle = fastDive ? 0 : 1;
  if (compress) throttle = Math.min(throttle, 0.3);
  if (overVne) throttle = Math.min(throttle, ias > s.vne * 0.95 ? 0.2 : 0.6);

  const c = ac.controls;
  // Çok küçük düzeltmede yatış yumuşak değişir (kaldırma vektörü ileri geri savrulmasın)
  c.rollRate = clamp(rollErr * (theta < 0.06 ? 2.5 : 5), -rollNow, rollNow);
  c.nCmd = nCmd;
  c.throttle = clamp(throttle, 0, 1);
  c.diveBrake = (cmd.diveBrake && !ac.groundAvoid) || ((compress || (ac.groundAvoid && fastDive)) && s.diveBrakes);
  c.brake = false;
  c.flaps = cmd.flaps && !ac.groundAvoid;
  c.wep = cmd.wep && c.throttle > 0.95;
  c.afterburner = cmd.afterburner && c.throttle > 0.95;
}
