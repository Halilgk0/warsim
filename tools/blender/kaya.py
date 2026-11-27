# Kanyon kaya sütunları (2026-11-27): anıt vadisi kayaları gibi 9 çeşit, Blender'da oyulur ve dokulanır.
#   blender --background --factory-startup --python tools/blender/kaya.py -- <çıktı klasörü> [çeşit adı ...]
# Her çeşit: yüksek ayrıntılı heykel (kırık blok dış hattı, katman basamakları, dikey oluklar, oyuklar, kapak kayası, tepe
# toprağı; voksel birleştirme ve gürültü) → seyreltilmiş model (~1.500–3.000 üçgen) ve uzak görünüş (~300). Heykelden modele
# normal haritası, ortam gölgesi ve konum pişirilir; boya numpy'de (De Chelly kumtaşı, alttaki şeyl bantları, çöl verniği,
# kapak kayası, tepe toprağı). Çıktılar:
#   kaya.glb            ayrıntılı modeller (k<n>), Y yukarı, birimli: x,z sütun yarıçapına, y boya bölünmüş (oyun ölçekler)
#   kaya_albedo.png     2048 atlas (3×3 karo), ortam gölgesi boyaya katılı
#   kaya_normal.png     2048 atlas, teğet uzayı (G çevrik: three.js türev teğeti)
#   pillarShapes.ts     simin yükseklik kalıbı (64×64, daire uzayında) ve uzak görünüş ağı (Düşük kalitede de bu)
#   onizleme_<ad>.png   denetim görüntüsü
# Tasarım uzayı: x ekseni yarı çapı R/axd, z ekseni R·axd (oyunda sütunun elipsi), y 0 kayanın tabanı (kaidenin tepesi).

import bpy
import bmesh
import numpy as np
import sys
import os
import math
import json
import base64
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'tools/blender/cikti/kaya')
ONLY = set(argv[1:])
os.makedirs(OUT, exist_ok=True)
TILE = 680
ATLAS = 2048
GAP = (ATLAS - 3 * TILE) // 4
HM = 64
HM_TOP = 1.2  # yükseklik kalıbının tavanı (boyun katı): kapak ve kubbe tasarım boyunu biraz aşar
scene = bpy.context.scene
for _o in list(scene.objects):
    bpy.data.objects.remove(_o, do_unlink=True)


# ---------------------------------------------------------------- gürültü (değer gürültüsü)
def hash3(ix, iy, iz):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float32) / 65535.0


def vnoise(px, py, pz):
    px, py, pz = (np.asarray(a, np.float64) for a in (px, py, pz))
    ix, iy, iz = np.floor(px).astype(np.int64), np.floor(py).astype(np.int64), np.floor(pz).astype(np.int64)
    fx, fy, fz = px - ix, py - iy, pz - iz
    sx, sy, sz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (sx if dx else 1 - sx) * (sy if dy else 1 - sy) * (sz if dz else 1 - sz)
                out = out + w * hash3(ix + dx, iy + dy, iz + dz)
    return out


def fbm(px, py, pz, oct=4, lac=2.03):
    s, a, t = 1.0, 0.5, 0.0
    for _ in range(oct):
        t = t + a * vnoise(px * s, py * s, pz * s)
        s *= lac
        a *= 0.5
    return t / (1 - 0.5 ** oct)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- çeşitler
# Gövde (body): plan görünüşünde yükseklik alanı (eklem çatlaklarıyla bölünmüş bloklar), sonra profil (daralma, boğum) ve
# voksel birleştirme. Ölçüler R (cx, cz, rx, rz) ve H'nin (y1, shoulder) payı.
#   joint: eklem aralığı (m), spall: kenar bloğunun kopma olasılığı, crack: kenardaki yarık genişliği (m),
#   taper: tepede daralma payı, necks: [(y payı, kalınlık payı, derinlik)], shoulder: (alt kat y payı, üst katın iç payı),
#   top: flat (hafif aşınmış düzlük) | round (kubbe) | cap (ince kapak), lobe: dış hattın büyük dalgası.
def body(cx=0.0, cz=0.0, rx=1.0, rz=1.0, y1=1.0, joint=48, spall=0.35, crack=2.2, taper=0.04, necks=(), shoulder=None,
         top='flat', lobe=0.1, fill=0.86, apron=0.11):
    return dict(cx=cx, cz=cz, rx=rx, rz=rz, y1=y1, joint=joint, spall=spall, crack=crack, taper=taper, necks=necks,
                shoulder=shoulder, top=top, lobe=lobe, fill=fill, apron=apron)


VARIANTS = [
    dict(name='mesa_uzun', kind='mesa', axd=2.35, R=520, H=290, seed=11, bodies=[
        body(rx=1 / 2.35, rz=2.35, joint=60, spall=0.4, lobe=0.12, fill=0.85)]),
    dict(name='mesa_kertik', kind='mesa', axd=2.05, R=520, H=300, seed=23, bodies=[
        body(cz=-0.55, rx=0.47, rz=1.4, joint=55, spall=0.4, lobe=0.12, fill=0.86),
        body(cz=1.4, rx=0.36, rz=0.6, y1=0.84, joint=40, spall=0.45, lobe=0.14, fill=0.84)]),
    dict(name='butte_kale', kind='broad', axd=1.0, R=330, H=360, seed=37, bodies=[
        body(joint=46, spall=0.45, lobe=0.14, fill=0.84)]),
    dict(name='butte_basamak', kind='broad', axd=1.12, R=330, H=360, seed=41, bodies=[
        body(rx=1 / 1.12, rz=1.12, joint=44, spall=0.35, shoulder=(0.42, 0.62), lobe=0.1, fill=0.86)]),
    dict(name='butte_eldiven', kind='broad', axd=0.92, R=330, H=360, seed=53, bodies=[
        body(cx=-0.14, rx=0.86, rz=0.86, y1=0.78, joint=44, spall=0.4, lobe=0.12, fill=0.84),
        body(cx=0.66, cz=0.08, rx=0.22, rz=0.26, y1=1.0, joint=26, spall=0.2, crack=1.6, taper=0.28, top='round', lobe=0.08,
             fill=0.86, apron=0.0)]),
    dict(name='butte_yikik', kind='broad', axd=1.05, R=330, H=360, seed=67, bodies=[
        body(cx=-0.22, cz=-0.18, rx=0.66, rz=0.62, y1=0.8, joint=38, spall=0.6, lobe=0.16, fill=0.84),
        body(cx=0.44, cz=0.36, rx=0.4, rz=0.36, y1=1.0, joint=30, spall=0.4, taper=0.14, top='round', lobe=0.12, fill=0.84, apron=0.0),
        body(cx=0.5, cz=-0.5, rx=0.3, rz=0.3, y1=0.6, joint=26, spall=0.5, taper=0.18, top='round', lobe=0.14, fill=0.84, apron=0.0)]),
    dict(name='kule_ince', kind='spire', axd=1.0, R=150, H=420, seed=79, bodies=[
        body(rx=0.62, rz=0.62, joint=30, spall=0.3, crack=1.6, taper=0.34, top='cap', lobe=0.1, fill=0.9, apron=0.14)]),
    dict(name='kule_totem', kind='spire', axd=0.95, R=150, H=420, seed=83, bodies=[
        body(rx=0.64, rz=0.64, joint=28, spall=0.25, crack=1.4, taper=0.44, necks=((0.4, 0.045, 0.14), (0.63, 0.04, 0.18),
             (0.83, 0.03, 0.2)), top='round', lobe=0.08, fill=0.9, apron=0.16)]),
    dict(name='kule_cift', kind='spire', axd=1.1, R=150, H=420, seed=97, bodies=[
        body(rx=0.8, rz=0.86, y1=0.4, joint=30, spall=0.4, crack=1.6, taper=0.08, lobe=0.12, fill=0.84, apron=0.14),
        body(cx=-0.34, cz=-0.08, rx=0.42, rz=0.46, y1=1.0, joint=24, spall=0.2, crack=1.4, taper=0.36, top='cap', lobe=0.08,
             fill=0.9, apron=0.0),
        body(cx=0.4, cz=0.14, rx=0.34, rz=0.38, y1=0.8, joint=24, spall=0.2, crack=1.4, taper=0.4, top='round', lobe=0.08,
             fill=0.9, apron=0.0)]),
]


def ellipse_r(theta, rx, rz):
    return 1 / np.sqrt((np.cos(theta) / rx) ** 2 + (np.sin(theta) / rz) ** 2)


def body_field(b, rng, R, H, seed):
    """Gövdenin yükseklik alanı (plan ızgarası): (xs, zs, h), h ızgara hücresinde kaya tepesi (m; dışarıda y0)."""
    y0 = -0.05 * H
    yt = b['y1'] * H
    rx, rz = b['rx'] * R, b['rz'] * R
    ext = max(rx, rz) * 1.08
    n = int(min(440, max(220, ext / 1.6)))
    xs = np.linspace(-rx * 1.08, rx * 1.08, n)
    zs = np.linspace(-rz * 1.08, rz * 1.08, int(n * rz / rx) if rz > rx else n)
    if rx > rz:
        xs = np.linspace(-rx * 1.08, rx * 1.08, int(n * rx / rz))
        zs = np.linspace(-rz * 1.08, rz * 1.08, n)
    X, Z = np.meshgrid(xs, zs)
    th = np.arctan2(Z, X)
    rho = np.hypot(X, Z)
    ell = ellipse_r(th, rx, rz)
    # Dış hat: büyük lob dalgası + kırık yüz kesimleri (çokgen) + küçük oyuk
    K = int(11 + max(rx, rz) / 40)
    kang = np.sort(rng.random(K)) * 2 * math.pi
    kr = 1 - rng.random(K) ** 1.6 * 0.24
    def poly(t):
        t = np.mod(t, 2 * math.pi)
        k = np.searchsorted(kang, t) % K
        i0 = (k - 1) % K
        a0, a1 = kang[i0], kang[k]
        a1 = np.where(a1 < a0, a1 + 2 * math.pi, a1)
        tt = np.where(t < a0, t + 2 * math.pi, t)
        # Kenar düz (iki köşe arası doğrusal kiriş): kiriş üzerindeki yarıçap
        p0 = np.stack([np.cos(a0) * kr[i0], np.sin(a0) * kr[i0]], -1)
        p1 = np.stack([np.cos(a1) * kr[k], np.sin(a1) * kr[k]], -1)
        d = np.stack([np.cos(tt), np.sin(tt)], -1)
        e = p1 - p0
        den = d[..., 0] * e[..., 1] - d[..., 1] * e[..., 0]
        return (p0[..., 0] * e[..., 1] - p0[..., 1] * e[..., 0]) / np.where(np.abs(den) < 1e-9, 1e-9, den)
    lob = 1 + b['lobe'] * (fbm(np.cos(th) * 1.3 + seed, np.sin(th) * 1.3, 0.5, 3) - 0.5) * 2
    edge_r = ell * b['fill'] * poly(th) * lob
    inside = rho < edge_r
    dist_in = (edge_r - rho)  # kenardan içeri (m, yaklaşık)
    # Eklem ağı: Voronoi hücreleri (F1, F2)
    area = math.pi * rx * rz
    ns = int(max(8, area / b['joint'] ** 2))
    sx = (rng.random(ns) * 2 - 1) * rx * 1.05
    sz = (rng.random(ns) * 2 - 1) * rz * 1.05
    F1 = np.full(X.shape, 1e9)
    F2 = np.full(X.shape, 1e9)
    cid = np.zeros(X.shape, np.int32)
    cid2 = np.zeros(X.shape, np.int32)
    for i in range(ns):
        d = np.hypot(X - sx[i], Z - sz[i])
        closer = d < F1
        second = ~closer & (d < F2)
        cid2 = np.where(closer, cid, np.where(second, i, cid2))
        F2 = np.where(closer, F1, np.minimum(F2, d))
        cid = np.where(closer, i, cid)
        F1 = np.where(closer, d, F1)
    gapd = F2 - F1
    # Hücre yüksekliği: kenara değen hücreler kopabilir (biraz alçak) ya da büyük blok çökmüş (çok alçak)
    cell_edge = np.zeros(ns, bool)
    near = inside & (dist_in < b['joint'] * 0.7)
    cell_edge[np.unique(cid[near])] = True
    u = rng.random(ns)
    drop = np.where(cell_edge & (u < b['spall']), rng.uniform(0.02, 0.1, ns), 0.0)
    drop = np.where(cell_edge & (u < b['spall'] * 0.3), rng.uniform(0.25, 0.75, ns), drop)
    gone = cell_edge & (u < b['spall'] * 0.12)
    hcell = yt * (1 - drop)
    h = hcell[cid]
    inside = inside & ~gone[cid]
    # Tepe biçimi
    rn = np.clip(rho / np.maximum(edge_r, 1e-3), 0, 1)
    if b['top'] == 'round':
        h = h - 0.07 * H * rn ** 2 * min(1.0, max(rx, rz) / 70)
    elif b['top'] == 'cap':
        h = h + 0.02 * H * (1 - rn ** 2)
    else:
        h = h - 0.006 * H * rn ** 3
    h = h + (fbm(X / 35 + seed, Z / 35, 0.3, 3) - 0.5) * 7
    # Kenar aşınması: tepe kenarı 6–10 m içerden yuvarlanır
    h = h - 7 * smooth(9, 0, dist_in)
    # Yarıklar: kenardaki eklemler derin yarık (hücre çiftine göre derinlik); içerideki eklemler tepede sığ oluk
    lo_c, hi_c = np.minimum(cid, cid2).astype(np.int64), np.maximum(cid, cid2).astype(np.int64)
    pair = hash3(lo_c, hi_c, np.int64(seed) + lo_c * 0)
    crack_w = b['crack'] * (0.7 + 0.8 * fbm(X / 40, Z / 40 + seed, 1.7, 2)) * (1 + 0.8 * smooth(b['joint'] * 0.5, 0, dist_in))
    in_crack = (gapd < crack_w) & (pair < 0.28)
    pair = pair / 0.28
    depth_edge = smooth(b['joint'] * 0.9, 0, dist_in)
    cut = np.where(in_crack, (0.25 + 0.75 * pair) * depth_edge * (yt - y0) + 1.5, 0)
    h = h - cut
    h = np.where(in_crack & ~cell_edge[cid], h - 3, h)
    # İki katlı (basamak): alt kat geniş, üst kat içeride
    if b['shoulder']:
        ys_, inset = b['shoulder']
        upper = rho < edge_r * inset * (1 + (fbm(np.cos(th) * 2 + seed, np.sin(th) * 2, 4.1, 2) - 0.5) * 0.2)
        h = np.where(upper, h, np.minimum(h, ys_ * H + (fbm(X / 30, Z / 30, seed, 2) - 0.5) * 8))
    # Etek: dış hattan elipsin kenarına basamaklı moloz (kaideye geçiş)
    ap = b['apron'] * H
    u_out = np.clip((rho - edge_r) / np.maximum(ell * 0.98 - edge_r, 1.0), 0, 1)
    talus = ap * (1 - u_out) ** 1.6
    step = 4.5 + 2 * fbm(X / 50, Z / 50 + seed, 2.2, 2)
    talus = np.floor(talus / step) * step + step * smooth(0.55, 1, (talus / step) % 1)
    talus = talus * (0.85 + 0.3 * fbm(X / 18 + seed, Z / 18, 7.7, 3)) + y0
    out_h = np.where(rho < ell * 0.98, np.maximum(talus, y0), y0)
    h = np.where(inside, np.maximum(h, out_h), out_h)
    return xs + b['cx'] * R, zs + b['cz'] * R, np.maximum(h, y0), y0


def field_mesh(xs, zs, h, y0):
    """Yükseklik alanından kapalı ağ: üst ızgara, kenar perdesi, düz taban (voksel birleştirme için)."""
    nz, nx = h.shape
    X, Z = np.meshgrid(xs, zs)
    top = np.stack([X.ravel(), h.ravel(), Z.ravel()], -1)
    idx = np.arange(nx * nz).reshape(nz, nx)
    quads = np.stack([idx[:-1, :-1].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel(), idx[:-1, 1:].ravel()], -1)
    # Kenar halkası (saat yönünün tersi) ve taban
    ring = np.concatenate([idx[0, :], idx[1:, -1], idx[-1, -2::-1], idx[-2:0:-1, 0]])
    base = top[ring].copy()
    base[:, 1] = y0 - 2
    off = len(top)
    verts = np.vstack([top, base, [[xs.mean(), y0 - 2, zs.mean()]]])
    m = len(ring)
    side = np.stack([ring, np.roll(ring, -1), off + np.roll(np.arange(m), -1), off + np.arange(m)], -1)
    bot = np.stack([off + np.arange(m), off + np.roll(np.arange(m), -1), np.full(m, off + m)], -1)
    return verts, np.vstack([quads, side]), bot


def profile_xy(verts, b, R, H):
    """Daralma ve boğumlar: yüksekliğe göre gövde merkezine doğru yatay ölçek."""
    y = verts[:, 1]
    f = np.clip(y / (b['y1'] * H), 0, 1)
    s = 1 - b['taper'] * f ** 1.2
    for yn, wn, dn in b['necks']:
        s = s * (1 - dn * np.exp(-((y - yn * H) / (wn * H)) ** 2))
    cx, cz = b['cx'] * R, b['cz'] * R
    out = verts.copy()
    out[:, 0] = cx + (verts[:, 0] - cx) * s
    out[:, 2] = cz + (verts[:, 2] - cz) * s
    return out


def to_blender(v):
    """Oyun (x, y yukarı, z) → Blender (x, -z, y)."""
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], -1)


def make_object(name, verts, quads, tris):
    me = bpy.data.meshes.new(name)
    vb = to_blender(verts)
    polys = [tuple(int(i) for i in q) for q in quads] + [tuple(int(i) for i in t) for t in tris]
    me.from_pydata([tuple(float(c) for c in v) for v in vb], [], polys)
    me.update(calc_edges=True)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def activate(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def mesh_np(o):
    me = o.data
    v = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('co', v)
    n = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get('normal', n)
    return v.reshape(-1, 3), n.reshape(-1, 3)


def build_high(V):
    rng = np.random.default_rng(V['seed'])
    R, H = V['R'], V['H']
    parts = []
    for i, b in enumerate(V['bodies']):
        xs, zs, h, y0 = body_field(b, rng, R, H, V['seed'] * 10 + i)
        verts, quads, tris = field_mesh(xs, zs, h, y0)
        verts = profile_xy(verts, b, R, H)
        parts.append(make_object(f"{V['name']}_g{i}", verts, quads, tris))
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    hi = bpy.context.view_layer.objects.active
    hi.name = f"{V['name']}_hi"
    # Voksel birleştirme: gövdeler tek kabuk, düzgün yoğunluk (yükseklik alanının dik duvar yüzleri yeniden örneklenir)
    m = hi.modifiers.new('rm', 'REMESH')
    m.mode = 'VOXEL'
    area = 0.0
    for b in V['bodies']:
        rx, rz = b['rx'] * V['R'], b['rz'] * V['R']
        per = math.pi * (3 * (rx + rz) - math.sqrt((3 * rx + rz) * (rx + 3 * rz)))
        area += math.pi * rx * rz * 1.4 + per * b['y1'] * V['H']
    m.voxel_size = float(max(0.9, math.sqrt(area / 380000)))
    m.use_smooth_shade = True
    activate(hi)
    bpy.ops.object.modifier_apply(modifier='rm')
    v, n = mesh_np(hi)
    x, yb, z = v[:, 0], v[:, 1], v[:, 2]  # Blender: z yukarı
    s = V['seed']
    H = V['H']
    wall = np.clip(1 - np.abs(n[:, 2]) / 0.5, 0, 1)
    hn = np.hypot(n[:, 0], n[:, 1]) + 1e-6
    # Yatay katmanlar: zayıf katmanlar içeri oyulur (sekü çizgisi), aralarında ince bantlar
    d = np.zeros(len(v), np.float32)
    rl = np.random.default_rng(s + 5)
    for k, yb_ in enumerate(rl.uniform(0.04 * H, 0.94 * H, int(3 + H / 70))):
        along = smooth(0.3, 0.7, fbm(x / 90 + k * 7.1, yb / 90, s + k, 2))
        d -= rl.uniform(1.0, 3.5) * along * np.exp(-((z + (fbm(x / 120, yb / 120, k, 2) - 0.5) * 6 - yb_) / rl.uniform(0.9, 2.4)) ** 2)
    # Kapak kayası: tepenin %4'ü saçak (dışa), altında oyuk
    zt = np.percentile(z, 99.5)
    d += 1.6 * smooth(zt - 0.05 * H, zt - 0.035 * H, z) * smooth(zt + 5, zt - 5, z)
    d -= 2.0 * np.exp(-((z - (zt - 0.06 * H)) / 2.5) ** 2)
    # Dikey oluklar (duvar boyunca, dikeyde uzun gürültü) ve oyuklar
    d += (fbm(x / 12 + s, yb / 12, z / 140, 4) - 0.5) * 3.4 + (fbm(x / 4 + s, yb / 4, z / 60, 3) - 0.5) * 1.2
    alc = fbm(x / 60 + 3 * s, yb / 60, z / 70, 3)
    d -= 7.0 * smooth(0.6, 0.85, alc) * smooth(0.02 * H, 0.2 * H, z)
    d = d * wall
    # Pürüz (her yerde)
    d += (fbm(x / 14 + s, yb / 14, z / 14, 4) - 0.5) * 2.4 + (fbm(x / 3.5, yb / 3.5 + s, z / 3.5, 3) - 0.5) * 0.9
    # Yalnız yatay itme duvarda (dikey kaymasın): normalin yatay bileşeni
    nh = np.stack([n[:, 0] / hn, n[:, 1] / hn, np.zeros_like(hn)], -1)
    dirv = np.where(wall[:, None] > 0.2, nh, n)
    v = v + dirv * d[:, None]
    hi.data.vertices.foreach_set('co', v.ravel())
    hi.data.update()
    # Hafif yumuşatma (voksel basamakları kalmasın)
    sm = hi.modifiers.new('sm', 'SMOOTH')
    sm.factor = 0.5
    sm.iterations = 2
    bpy.ops.object.modifier_apply(modifier='sm')
    # Taban levhası ve dip: kayanın tabanının 3 m altından aşağısı silinir (oyunda kaidenin içinde kalır)
    bm = bmesh.new()
    bm.from_mesh(hi.data)
    cut = -0.05 * H + 3
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(vv.co.z < cut for vv in f.verts)], context='FACES')
    bm.to_mesh(hi.data)
    bm.free()
    return hi


def decimate(src, name, tris):
    o = src.copy()
    o.data = src.data.copy()
    o.name = name
    scene.collection.objects.link(o)
    m = o.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    have = sum(len(p.vertices) - 2 for p in o.data.polygons)
    m.ratio = min(1.0, tris / max(1, have))
    m.use_collapse_triangulate = True
    activate(o)
    bpy.ops.object.modifier_apply(modifier='dec')
    m = o.modifiers.new('tri', 'TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier='tri')
    for p in o.data.polygons:
        p.use_smooth = True
    return o


# ---------------------------------------------------------------- pişirme
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.world = scene.world or bpy.data.worlds.new('W')


def img(name, size, fill=(0, 0, 0, 0)):
    im = bpy.data.images.new(name, size, size, alpha=True, float_buffer=True)
    im.generated_color = fill
    im.colorspace_settings.name = 'Non-Color'
    return im


def set_target(o, target, build=None):
    mat = bpy.data.materials.new(f'b_{o.name}_{target.name}')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    if build:
        build(nt, out)
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = target
    nt.nodes.active = tn
    o.data.materials.clear()
    o.data.materials.append(mat)


def emit_material(o, socket):
    mat = bpy.data.materials.new(f'e_{o.name}_{socket}')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    g = nt.nodes.new('ShaderNodeNewGeometry')
    nt.links.new(g.outputs[socket], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs[0])
    o.data.materials.clear()
    o.data.materials.append(mat)


def bake(hi, lo, kind, size, extr, samples=1, **kw):
    target = img(f'{lo.name}_{kind}_{len(bpy.data.images)}', size, (0.5, 0.5, 1, 1) if kind == 'NORMAL' else (0, 0, 0, 0))
    set_target(lo, target)
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    scene.cycles.samples = samples
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = extr
    scene.render.bake.max_ray_distance = extr * 2.5
    scene.render.bake.margin = 6
    bpy.ops.object.bake(type=kind, use_selected_to_active=True, cage_extrusion=extr, max_ray_distance=extr * 2.5, margin=6, **kw)
    return np.array(target.pixels[:], np.float32).reshape(size, size, 4)


def lin(h):
    c = np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], np.float32) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + b * t


def paint(V, P, N, AO, cover):
    """Boya (doğrusal): P konum (oyun ekseni, m), N heykelin normali, AO ortam gölgesi."""
    s = V['seed']
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    ny = N[..., 1]
    H = V['H']
    h = y / H
    rng = np.random.default_rng(s + 1)
    tint = np.array([1 + (rng.random() - 0.5) * 0.12, 1 + (rng.random() - 0.5) * 0.18, 1 + (rng.random() - 0.5) * 0.2], np.float32)
    sand = lin(0xC96A3C) * tint          # De Chelly kumtaşı: turuncu kızıl
    deep = lin(0xA84E2C) * tint          # koyu kızıl
    shale = lin(0x94503A)                # şeyl: kahverengi kızıl
    cap = lin(0xB4927A)                  # kapak kayası: gri devetüyü
    soil = lin(0xB86A40)                 # tepe toprağı
    bush = lin(0x4A4A2E)                 # çalı
    varn = lin(0x4A2C1E)                 # çöl verniği
    wall = np.clip(1 - np.abs(ny) / 0.6, 0, 1)
    upf = smooth(0.55, 0.85, ny)
    big = fbm(x / 140 + s, y / 140, z / 140, 3)
    mid = fbm(x / 30, y / 30 + s, z / 30, 3)
    fine = fbm(x / 5, y / 5, z / 5 + s, 3)
    col = mix(deep, sand, np.clip(0.55 + (big - 0.5) * 1.4, 0, 1))
    col = col * (0.9 + 0.2 * mid)[..., None] * (0.94 + 0.12 * fine)[..., None]
    # Katmanların renk bantları (çevre boyunca sürekli, hafif dalgalı)
    strata = fbm(s * 0.37, y / 6.5 + (fbm(x / 200, s, z / 200, 2) - 0.5) * 3, s * 0.21, 3)
    col *= (0.9 + 0.2 * strata)[..., None]
    # Dikey çizgiler (yağmur akıntısı): yatayda dar, dikeyde çok uzun
    streak = fbm(x / 3.2 + s, y / 220, z / 3.2, 3)
    col *= (0.86 + 0.26 * streak)[..., None]
    # Alt kısım: şeyle geçiş, sık yatay bantlar
    lower = 1 - smooth(0.1, 0.3, h)
    band = 0.5 + 0.5 * np.sin(y * (2 * math.pi / 2.6) + 4 * fbm(x / 60, y / 20, z / 60 + s, 2))
    col = mix(col, mix(shale, shale * 1.35, band) * (0.9 + 0.2 * mid)[..., None], lower * 0.75)
    # Kapak kayası bandı
    capb = smooth(0.925, 0.955, h + (fbm(x / 50, s, z / 50, 2) - 0.5) * 0.03)
    col = mix(col, cap * (0.85 + 0.3 * mid)[..., None], capb * 0.7 * wall)
    # Çöl verniği: tepeden aşağı inen koyu dil izleri (duvarda, üstte güçlü)
    vv = smooth(0.6, 0.74, fbm(x / 2.4 + s * 2, y / 320, z / 2.4, 3)) * smooth(0.25, 0.9, h)
    vv *= 0.35 + 0.65 * smooth(0.35, 0.65, fbm(x / 70, y / 90 + s, z / 70, 2))
    col = mix(col, varn, vv * 0.42 * wall)
    # Taze kopma yüzeyi: seyrek, açık turuncu
    fresh = smooth(0.76, 0.86, fbm(x / 45 + 3, y / 45, z / 45 + s, 3)) * wall
    col = mix(col, sand * 1.2, fresh * 0.3)
    # Düz yüzler: tepe toprağı, çalı benekleri; sekülerde kum
    flat = mix(soil * (0.85 + 0.3 * mid)[..., None], soil * 1.2, smooth(0.4, 0.8, fine))
    dots = smooth(0.7, 0.76, fbm(x / 2.6, s, z / 2.6, 3)) * (h > 0.5)
    flat = mix(flat, bush, dots * 0.8)
    col = mix(col, flat, upf)
    # Dip: platonun kumuna karışır
    col = mix(col, lin(0x9A6440) * (0.9 + 0.2 * fine)[..., None], smooth(0.04, -0.02, h) * 0.8)
    col *= (0.58 + 0.42 * AO)[..., None]
    col = np.where(cover[..., None], np.clip(col, 0, 1), np.clip(col, 0, 1)[cover].mean(0))
    return col


def uv_unwrap(o):
    activate(o)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.006, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def loop_uvs(o):
    uv = np.empty(len(o.data.loops) * 2, np.float32)
    o.data.uv_layers.active.data.foreach_get('uv', uv)
    return uv.reshape(-1, 2)


def lod_uvs(lod, lo):
    """Uzak görünüşün UV'si: her yüz, merkezine en yakın ayrıntılı üçgenin UV düzleminden (yüzler ayrık)."""
    bm = bmesh.new()
    bm.from_mesh(lo.data)
    bm.faces.ensure_lookup_table()
    uvl = bm.loops.layers.uv.active
    tree = BVHTree.FromBMesh(bm)
    out = []
    for f in lod.data.polygons:
        c = f.center
        loc, nrm, idx, dist = tree.find_nearest(c)
        lf = bm.faces[idx]
        a, b, cc = (l.vert.co for l in lf.loops)
        ua, ub, uc = (np.array(l[uvl].uv) for l in lf.loops)
        e1, e2 = b - a, cc - a
        nn = e1.cross(e2)
        for vi in f.vertices:
            p = lod.data.vertices[vi].co
            q = p - nn.normalized() * (p - a).dot(nn.normalized())
            # Barisentrik (düzlemde, dışarıda da)
            w = q - a
            d00, d01, d11 = e1.dot(e1), e1.dot(e2), e2.dot(e2)
            d20, d21 = w.dot(e1), w.dot(e2)
            den = d00 * d11 - d01 * d01
            vb = (d11 * d20 - d01 * d21) / den
            wb = (d00 * d21 - d01 * d20) / den
            out.append(ua + (ub - ua) * vb + (uc - ua) * wb)
    bm.free()
    return np.array(out, np.float32)


def heightmap(lo, V):
    """Daire uzayında (a, b ∈ [−1, 1]) üst yüzey: 0 boş, 1–255 yükseklik payı (kaba ızgarada hücre içinin en yükseği)."""
    bm = bmesh.new()
    bm.from_mesh(lo.data)
    tree = BVHTree.FromBMesh(bm)
    R, H, axd = V['R'], V['H'], V['axd']
    out = np.zeros((HM, HM), np.uint8)
    sub = [(-0.33, -0.33), (0.33, -0.33), (-0.33, 0.33), (0.33, 0.33), (0, 0)]
    for j in range(HM):
        for i in range(HM):
            best = -1.0
            for su, sv in sub:
                a = -1 + (i + 0.5 + su) * 2 / HM
                b = -1 + (j + 0.5 + sv) * 2 / HM
                gx, gz = a * R / axd, b * R * axd
                hit = tree.ray_cast(Vector((gx, -gz, H * 3)), Vector((0, 0, -1)))
                if hit[0] is not None and hit[0].z / H > 0.012:
                    best = max(best, hit[0].z / H)
            if best > -1:
                out[j, i] = 1 + int(round(np.clip(best, 0, HM_TOP) / HM_TOP * 254))
    bm.free()
    return out


def preview(o, path, albedo_img, normal_img=None):
    """Denetim görüntüsü: dokulu model, öğleden sonra güneşi, iki açıdan."""
    mat = bpy.data.materials.new(f'p_{o.name}')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.95
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = albedo_img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if normal_img is not None:
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt2 = nt.nodes.new('ShaderNodeTexImage')
        nt2.image = normal_img
        nt.links.new(nt2.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    o.data.materials.clear()
    o.data.materials.append(mat)
    for ob in scene.objects:
        ob.hide_render = ob.type == 'MESH' and ob is not o
    if not scene.camera:
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
        scene.collection.objects.link(cam)
        scene.camera = cam
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        sun.data.energy = 4.5
        sun.rotation_euler = (math.radians(55), 0, math.radians(35))
        scene.collection.objects.link(sun)
        scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.55, 0.75, 1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    cam = scene.camera
    bb = np.array([o.matrix_world @ Vector(c) for c in o.bound_box])
    ctr = bb.mean(0)
    size = float(np.linalg.norm(bb.max(0) - bb.min(0)))
    cam.data.lens = 35
    cam.data.clip_start = 1
    cam.data.clip_end = 50000
    scene.render.resolution_x, scene.render.resolution_y = 960, 640
    scene.cycles.samples = 24
    scene.render.image_settings.file_format = 'PNG'
    for k, az in enumerate((30, 200)):
        a = math.radians(az)
        cam.location = Vector((ctr[0] + math.cos(a) * size * 1.45, ctr[1] + math.sin(a) * size * 1.45, ctr[2] + size * 0.22))
        d = Vector(ctr) - cam.location
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = path.replace('.png', f'_{k}.png')
        bpy.ops.render.render(write_still=True)
    for ob in scene.objects:
        ob.hide_render = False


# ---------------------------------------------------------------- çeşit çeşit
albedo_atlas = np.zeros((ATLAS, ATLAS, 3), np.float32)
normal_atlas = np.zeros((ATLAS, ATLAS, 3), np.float32)
normal_atlas[..., 2] = 1
meta_path = os.path.join(OUT, 'kaya.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) and ONLY else {}
atlas_npz = os.path.join(OUT, 'atlas.npz')
if ONLY and os.path.exists(atlas_npz):
    z = np.load(atlas_npz)
    albedo_atlas, normal_atlas = z['a'], z['n']
low_objs = []

for idx, V in enumerate(VARIANTS):
    if ONLY and V['name'] not in ONLY:
        continue
    print('ÇEŞİT', V['name'])
    hi = build_high(V)
    print('  heykel', len(hi.data.polygons))
    target = 1500 if V['kind'] == 'spire' else 2800
    lo = decimate(hi, f"k{idx}", target)
    lod = decimate(lo, f"k{idx}_lod", 300 if V['kind'] != 'spire' else 220)
    print('  model', len(lo.data.polygons), 'uzak', len(lod.data.polygons))
    uv_unwrap(lo)
    extr = 10.0 if V['kind'] == 'spire' else 16.0
    # Heykelden: konum (yayılım), normal (nesne ve teğet), ortam gölgesi
    emit_material(hi, 'Position')
    Pp = bake(hi, lo, 'EMIT', TILE, extr)
    emit_material(hi, 'Normal')
    Np = bake(hi, lo, 'EMIT', TILE, extr)
    NT = bake(hi, lo, 'NORMAL', TILE, extr, samples=8, normal_space='TANGENT')
    scene.world.light_settings.distance = V['R'] * 0.25
    AOp = bake(hi, lo, 'AO', TILE, extr, samples=48)
    cover = Pp[..., 3] > 0.5
    P = np.stack([Pp[..., 0], Pp[..., 2], -Pp[..., 1]], -1)
    N = np.stack([Np[..., 0], Np[..., 2], -Np[..., 1]], -1)
    AO = np.clip(AOp[..., 0], 0, 1)
    col = paint(V, P, N, AO, cover)
    nrm = NT[..., :3] * 2 - 1
    bad = (nrm[..., 2] < 0.2) | ~np.isfinite(nrm).all(-1)
    nrm[bad] = (0, 0, 1)
    nrm[..., 1] *= -1
    nrm = np.where(cover[..., None], nrm, np.array([0, 0, 1], np.float32))
    cx, cy = idx % 3, idx // 3
    x0, y0 = GAP + cx * (TILE + GAP), GAP + cy * (TILE + GAP)
    albedo_atlas[y0:y0 + TILE, x0:x0 + TILE] = col
    normal_atlas[y0:y0 + TILE, x0:x0 + TILE] = nrm
    # Önizleme (karo dokusu, karo UV'si)
    tim = bpy.data.images.new(f'pv_{idx}', TILE, TILE, alpha=True, float_buffer=True)
    px = np.ones((TILE, TILE, 4), np.float32)
    px[..., :3] = col
    tim.pixels.foreach_set(px.ravel())
    nim = bpy.data.images.new(f'pn_{idx}', TILE, TILE, alpha=True, float_buffer=True)
    nim.colorspace_settings.name = 'Non-Color'
    px2 = np.ones((TILE, TILE, 4), np.float32)
    nn = nrm.copy()
    nn[..., 1] *= -1
    px2[..., :3] = nn * 0.5 + 0.5
    nim.pixels.foreach_set(px2.ravel())
    pv = lo.copy()
    pv.data = lo.data.copy()
    scene.collection.objects.link(pv)
    preview(pv, os.path.join(OUT, f'onizleme_{V["name"]}.png'), tim, nim)
    bpy.data.objects.remove(pv, do_unlink=True)
    # UV'ler atlasa
    tile_uv = lambda uv: np.stack([(x0 + uv[:, 0] * TILE) / ATLAS, (y0 + uv[:, 1] * TILE) / ATLAS], -1)
    luv = lod_uvs(lod, lo)
    uvs = tile_uv(loop_uvs(lo))
    lo.data.uv_layers.active.data.foreach_set('uv', uvs.astype(np.float32).ravel())
    # Sim kalıbı ve uzak görünüş verisi (birimli: x,z / R, y / H; oyun ekseni)
    hm = heightmap(lo, V)
    lv, _ = mesh_np(lod)
    lv = np.stack([lv[:, 0] / V['R'], lv[:, 2] / V['H'], -lv[:, 1] / V['R']], -1)
    lidx = np.array([list(p.vertices) for p in lod.data.polygons], np.int32)
    # Yüzler ayrık: köşe başına konum ve UV
    lpos = lv[lidx.ravel()]
    luv_t = tile_uv(luv)
    meta[V['name']] = dict(
        idx=idx, kind=V['kind'], axd=V['axd'],
        hm=base64.b64encode(hm.tobytes()).decode(),
        lp=base64.b64encode(np.round(lpos * 10000).astype(np.int16).tobytes()).decode(),
        lu=base64.b64encode(np.round(luv_t * 65535).astype(np.uint16).tobytes()).decode(),
        tris=len(lo.data.polygons), lodTris=len(lod.data.polygons),
    )
    # Dışa aktarım için: birimli ölçek, malzemesiz
    lo.data.materials.clear()
    lo.scale = (1 / V['R'], 1 / V['R'], 1 / V['H'])
    bpy.data.objects.remove(hi, do_unlink=True)
    bpy.data.objects.remove(lod, do_unlink=True)
    low_objs.append(lo)
    print('  tamam')

np.savez(atlas_npz, a=albedo_atlas, n=normal_atlas)
json.dump(meta, open(meta_path, 'w'))


def save(name, arr, srgb=False):
    im = bpy.data.images.new(name, ATLAS, ATLAS, alpha=True, float_buffer=False)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    px = np.ones((ATLAS, ATLAS, 4), np.float32)
    px[..., :3] = arr
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = os.path.join(OUT, name)
    im.file_format = 'PNG'
    im.save()


srgb = np.where(albedo_atlas <= 0.0031308, albedo_atlas * 12.92, 1.055 * np.power(np.clip(albedo_atlas, 0, 1), 1 / 2.4) - 0.055)
save('kaya_albedo.png', np.clip(srgb, 0, 1), srgb=True)
save('kaya_normal.png', normal_atlas * 0.5 + 0.5)

# glb: bu koşuda kurulan modeller (hepsi kurulduysa tam dosya)
if low_objs:
    bpy.ops.object.select_all(action='DESELECT')
    for o in low_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = low_objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    glb = os.path.join(OUT, 'kaya.glb' if not ONLY else f'kaya_{"_".join(sorted(ONLY))}.glb')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', export_yup=True, use_selection=True, export_apply=True, export_materials='NONE',
        export_texcoords=True, export_normals=True, export_vertex_color='NONE',
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=14,
    )
    print('GLB', glb, os.path.getsize(glb))

# Sim verisi (TypeScript)
names = sorted(meta, key=lambda k: meta[k]['idx'])
lines = ['// Üretildi: tools/blender/kaya.py (kanyon kaya sütunlarının biçimleri). Elle düzenleme; betiği yeniden çalıştır.',
         '// hm: 64×64 daire uzayı yükseklik kalıbı (0 boş, 1–255: (v − 1) / 254 · PILLAR_HM_TOP boy payı); lp/lu: uzak görünüş ağı (yüzler ayrık, Int16 /10000',
         '// x,z yarıçap, y boy payı; UV Uint16 /65535, atlasta).',
         "export type PillarKind = 'mesa' | 'broad' | 'spire';",
         'export interface PillarShape { name: string; kind: PillarKind; axd: number; hm: string; lp: string; lu: string }',
         f'export const PILLAR_HM = {HM};',
         f'export const PILLAR_HM_TOP = {HM_TOP};',
         'export const PILLAR_SHAPES: PillarShape[] = [']
for k in names:
    m = meta[k]
    lines.append(f"  {{ name: '{k}', kind: '{m['kind']}', axd: {m['axd']}, hm: '{m['hm']}', lp: '{m['lp']}', lu: '{m['lu']}' }},")
lines.append('];')
open(os.path.join(OUT, 'pillarShapes.ts'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('BITTI')
