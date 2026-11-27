# Çöl arazisinin döşenebilir kaya yüzeyleri (2026-11-27, Kanyonlar): Blender'da yükseklik alanından kurulan heykel, kenarları
# sarar (dört yönde döşenir). İki karo:
#   duvar  64 m: kanyon duvarı ve dik yamaç (yandan izdüşüm; u yatay, v yukarı). Kalınlığı değişen yatay katmanlar, araları
#          oyulmuş zayıf katmanlar, katman başına eklemle bölünmüş bloklar (biraz önde ya da geride), birkaç katı kesen büyük
#          çatlaklar, pürüz; sekinin altından inen çöl verniği.
#   moloz  24 m: moloz yamacı, kaide, kanyon dibi (üstten izdüşüm). İri ve ufak taşlar (yarı gömülü), aralarında kum.
# Çıktı (RGBA, 1024): RG teğet uzayı normalin x,y'si (z yeniden kurulur), B ton çarpanı (0,5 = 1×), A ortam gölgesi.
# Ortam gölgesi Blender'da (Cycles) 3×3 döşenmiş heykelden pişirilir: karonun kenarı komşusunu görür, dikiş olmaz.
#   blender --background --factory-startup --python tools/blender/yamac.py -- <çıktı klasörü>

import bpy
import numpy as np
import sys
import os
import math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'tools/blender/cikti/yamac')
os.makedirs(OUT, exist_ok=True)
N = 1024
scene = bpy.context.scene
for _o in list(scene.objects):
    bpy.data.objects.remove(_o, do_unlink=True)


def hash2(ix, iy, s):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (s * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float32) / 65535.0


def pnoise(x, y, per, s=0):
    """Dönemli değer gürültüsü: x, y hücre biriminde, kafes per hücrede sarar."""
    ix, iy = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
    fx, fy = x - ix, y - iy
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = hash2(ix % per, iy % per, s)
    b = hash2((ix + 1) % per, iy % per, s)
    c = hash2(ix % per, (iy + 1) % per, s)
    d = hash2((ix + 1) % per, (iy + 1) % per, s)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def pfbm(u, v, per, oct=4, s=0):
    """u, v ∈ [0, 1) karo içi; per: ilk oktavın hücre sayısı (karo başına)."""
    t, a, f = 0.0, 0.5, 1
    for o in range(oct):
        t = t + a * pnoise(u * per * f, v * per * f, per * f, s + o * 17)
        a *= 0.5
        f *= 2
    return t / (1 - 0.5 ** oct)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


U, V = np.meshgrid((np.arange(N) + 0.5) / N, (np.arange(N) + 0.5) / N)  # V satır: 0 altta (Blender pikselleri alttan)


def duvar(seed=7):
    L = 64.0
    rng = np.random.default_rng(seed)
    y = V * L
    x = U * L
    th = rng.uniform(1.2, 7.0, 40)
    th = th[: np.searchsorted(np.cumsum(th), L) + 1]
    th = th / th.sum() * L
    tops = np.cumsum(th)
    bots = tops - th
    nl = len(th)
    weak = rng.random(nl) < 0.35
    recess = np.where(weak, rng.uniform(0.35, 1.0, nl), rng.uniform(0.0, 0.2, nl))
    tone = rng.uniform(0.88, 1.12, nl)
    # Katman sınırı belirgin dalgalı: iki ölçek
    wav = (pfbm(U, V * 0.25, 3, 3, seed) - 0.5) * 3.2 + (pfbm(U, V * 0.5, 12, 3, seed + 3) - 0.5) * 1.0
    yy = np.mod(y + wav, L)
    li = np.clip(np.searchsorted(tops, yy, side='right'), 0, nl - 1)
    t = (yy - bots[li]) / th[li]
    edge = np.minimum(t * th[li], (1 - t) * th[li])
    # Zayıf katman oyuğu yumuşak geçişle (sınırda 0,4 m'de)
    H = -recess[li] * smooth(0.0, 0.4, edge) - recess[li] * 0.3
    H -= 0.25 * smooth(0.45, 0.0, edge) * (0.6 + 0.8 * pfbm(U, V, 20, 2, seed + 4))
    # Eklemler: katmanların ~%40'ında, seyrek (6–20 m), kırık çizgi, yer yer kesik; blok farkı yumuşak
    for k in range(nl):
        m = li == k
        if not m.any() or rng.random() > 0.45:
            continue
        nb = max(2, int(round(L / rng.uniform(6, 20))))
        cuts = np.sort(rng.random(nb)) * L
        xm = x[m]
        Um, Vm = U[m], V[m]
        xk = np.mod(xm + (pfbm(Um * 2, Vm * 2, 8, 3, seed + k) - 0.5) * 2.6, L)
        bi = np.searchsorted(cuts, xk) % nb
        prot = rng.uniform(-0.18, 0.18, nb)
        sd = ((xk[:, None] - cuts[None, :]) + L / 2) % L - L / 2
        dc = np.min(np.abs(sd), axis=-1)
        depth = rng.uniform(0.08, 0.3, nb)[np.argmin(np.abs(sd), axis=-1)]
        broken = smooth(0.35, 0.55, pfbm(Um, Vm * 3, 6, 2, seed + 60 + k))
        H[m] += prot[bi] * smooth(0.0, 0.8, dc) - depth * smooth(0.22, 0.0, dc) * broken
    # Dökülme oyukları: düzensiz sığ çanaklar (kenarı keskin)
    sp = pfbm(U, V, 10, 3, seed + 70)
    H -= 0.32 * smooth(0.6, 0.68, sp) + 0.12 * smooth(0.68, 0.8, sp)
    # Büyük çatlaklar: iki tane, kesik kesik
    for c in range(2):
        cx = rng.random() * L
        zz = (pfbm(U * 0.2 + c, V, 6, 3, seed + 50 + c) - 0.5) * 4.0
        d = np.abs(((x - cx - zz) + L / 2) % L - L / 2)
        span = smooth(0.4, 0.6, pfbm(U * 0.1 + c * 0.3, V, 3, 2, seed + 90 + c))
        H -= 0.26 * smooth(0.35, 0.0, d) * span
    H += (pfbm(U, V, 16, 4, seed + 200) - 0.5) * 0.5 + (pfbm(U, V, 96, 3, seed + 300) - 0.5) * 0.12
    T = tone[li] * (0.94 + 0.12 * pfbm(U, V, 8, 3, seed + 400))
    # Çapraz katmanlanma: kalın katmanlarda eğik ince çizgiler
    xb = np.sin((x * 0.35 + yy * 1.4) * (1 + 0.2 * np.sign(np.sin(li * 2.1))) * 2.2) * (th[li] > 3.5)
    T *= 1 + 0.045 * xb
    below = (1 - t) * th[li]
    streak = smooth(0.55, 0.75, pfbm(U, V * 0.08, 48, 3, seed + 500)) * np.exp(-below / 3.5) * (recess[np.clip(li + 1, 0, nl - 1)] > 0.3)
    T *= 1 - 0.3 * streak
    T *= 1 - 0.1 * smooth(0.6, 0.68, sp)
    return H, T, L


def moloz(seed=11):
    L = 24.0
    rng = np.random.default_rng(seed)
    H = (pfbm(U, V, 6, 4, seed) - 0.5) * 0.25
    T = 0.97 + 0.06 * pfbm(U, V, 30, 3, seed + 1)
    # Köşeli taşlar: yarı gömülü, düzlemlerin kesişimi (5–7 yüz), sırayla (dönemli: karonun kenarında sarar)
    for big, count in [(1.5, 12), (0.5, 170), (0.16, 1100)]:
        cx = rng.random(count) * L
        cz = rng.random(count) * L
        rs = big * rng.uniform(0.5, 1.2, count)
        hk = rng.uniform(0.3, 0.7, count)
        tn = rng.uniform(0.72, 1.28, count)
        for i in range(count):
            r = rs[i]
            x0 = int((cx[i] - r * 1.2) / L * N)
            x1 = int((cx[i] + r * 1.2) / L * N) + 1
            y0 = int((cz[i] - r * 1.2) / L * N)
            y1 = int((cz[i] + r * 1.2) / L * N) + 1
            gx, gy = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1))
            dx = (gx + 0.5) / N * L - cx[i]
            dy = (gy + 0.5) / N * L - cz[i]
            nf = rng.integers(5, 8)
            ang = np.sort(rng.random(nf)) * 2 * math.pi + rng.random()
            slope = rng.uniform(0.8, 2.2, nf)
            dist = r * rng.uniform(0.6, 1.0, nf)
            top = r * hk[i]
            h = np.full(dx.shape, top + r * 0.15 * rng.random())
            for a, sl, dd in zip(ang, slope, dist):
                proj = dx * math.cos(a) + dy * math.sin(a)
                h = np.minimum(h, top - (proj - dd * 0.35) * sl * hk[i])
            h = np.minimum(h, top)
            sub = np.ix_(np.arange(y0, y1) % N, np.arange(x0, x1) % N)
            cur = H[sub]
            take = h > cur + 0.01
            H[sub] = np.where(take, h, cur)
            T[sub] = np.where(take, tn[i] * (0.92 + 0.16 * np.clip(h / max(top, 1e-3), 0, 1)), T[sub])
    H += (pfbm(U, V, 120, 3, seed + 9) - 0.5) * 0.03
    return H, T, L


def normals(H, L):
    px = L / N
    dx = (np.roll(H, -1, 1) - np.roll(H, 1, 1)) / (2 * px)
    dy = (np.roll(H, -1, 0) - np.roll(H, 1, 0)) / (2 * px)
    n = np.stack([-dx, -dy, np.ones_like(H)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def bake_ao(H, L, name):
    """3×3 döşenmiş heykel (orta karo tam, komşular yarım çözünürlük) üstünden ortam gölgesi; düz düzleme pişirilir."""
    def grid(step, ox, oy):
        hs = H[::step, ::step]
        n = hs.shape[0]
        xs = (np.arange(n) * step + 0.5) / N * L + ox
        ys = (np.arange(n) * step + 0.5) / N * L + oy
        X, Y = np.meshgrid(xs, ys)
        verts = np.stack([X.ravel(), Y.ravel(), hs.ravel()], -1)
        idx = np.arange(n * n).reshape(n, n)
        faces = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], -1)
        return verts, faces
    parts = []
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            v, f = grid(2 if (ox or oy) else 1, ox * L, oy * L)
            me = bpy.data.meshes.new(f'{name}_{ox}_{oy}')
            me.from_pydata([tuple(map(float, p)) for p in v], [], [tuple(map(int, q)) for q in f])
            o = bpy.data.objects.new(me.name, me)
            scene.collection.objects.link(o)
            parts.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    hi = bpy.context.view_layer.objects.active
    # Düz hedef düzlem (UV karoyu tam kaplar)
    me = bpy.data.meshes.new(f'{name}_lo')
    top = float(H.max()) + 0.5
    me.from_pydata([(0, 0, top), (L, 0, top), (L, L, top), (0, L, top)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for li, (a, b) in zip(range(4), [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (a, b)
    lo = bpy.data.objects.new(me.name, me)
    scene.collection.objects.link(lo)
    im = bpy.data.images.new(f'{name}_ao', N, N, alpha=True, float_buffer=True)
    im.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new(f'{name}_m')
    mat.use_nodes = True
    tn = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tn.image = im
    mat.node_tree.nodes.active = tn
    lo.data.materials.append(mat)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.world = scene.world or bpy.data.worlds.new('W')
    scene.world.light_settings.distance = L * 0.06
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    ext = top - float(H.min()) + 1
    bpy.ops.object.bake(type='AO', use_selected_to_active=True, cage_extrusion=0.01, max_ray_distance=ext * 1.5, margin=0)
    a = np.array(im.pixels[:], np.float32).reshape(N, N, 4)[..., 0]
    # Pişirme düz düzlemden aşağı ışın atar; ışın yönü yukarıdan aşağı olduğundan isabet yüzeydedir
    return np.clip(a, 0, 1)


def save(name, rgba):
    im = bpy.data.images.new(name, N, N, alpha=True, float_buffer=False)
    im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    im.filepath_raw = os.path.join(OUT, name)
    im.file_format = 'PNG'
    im.save()
    print('KAYIT', name)


for name, fn in (('yamac_duvar', duvar), ('yamac_moloz', moloz)):
    H, T, L = fn()
    n = normals(H, L)
    ao = bake_ao(H, L, name)
    # Oyuklarda biraz daha koyu ton (yağmur suyunun bıraktığı kir)
    cav = smooth(0.85, 0.5, ao)
    T = T * (1 - 0.15 * cav)
    rgba = np.stack([n[..., 0] * 0.5 + 0.5, n[..., 1] * 0.5 + 0.5, np.clip(T * 0.5, 0, 1), ao], -1)
    save(f'{name}.png', rgba)
    # Önizleme: yandan ışıkla gölgelenmiş ton
    sun = np.array([0.55, 0.35, 0.76])
    lit = np.clip((n @ sun) * 0.8 + 0.25, 0, 1.2) * T * (0.4 + 0.6 * ao)
    pv = np.stack([lit * 0.78, lit * 0.42, lit * 0.27, np.ones_like(lit)], -1)
    im = bpy.data.images.new(name + '_pv', N, N, alpha=True)
    im.pixels.foreach_set(np.clip(pv, 0, 1).astype(np.float32).ravel())
    im.filepath_raw = os.path.join(OUT, name + '_onizleme.png')
    im.file_format = 'PNG'
    im.save()
    for o in list(scene.objects):
        bpy.data.objects.remove(o, do_unlink=True)
print('BITTI')
