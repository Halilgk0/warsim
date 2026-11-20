# Blender denemesi: MiG-15bis gövde, kanat, kuyruk, kanopi (oyundaki models.ts tanımının ölçüleriyle).
#   blender --background --factory-startup --python mig15.py -- <çıktı klasörü>
# Oyun model ekseni: +x sol kanat, +y üst, +z burun. Blender (X, Y, Z) = (x, -z, y); glTF dışa aktarımı geri çevirir.
# Nesne adı "<parça>-<ad>" (parça: body / glass / dark). Kumanda yüzeyleri ayrı nesne; özel özellikler (glTF extras):
# joint (eklem adı), pivot ve axis (oyun ekseninde), big.
# Oyunun eklediği ve burada olmayanlar: boya ve armalar, iniş takımı, hava frenleri ve yuvaları, seyir lambaları, pilot.
import bpy, bmesh, math, os, sys
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1]
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def B(p):
    """Oyun model ekseni → Blender."""
    return Vector((p[0], -p[2], p[1]))


objs = []


def finish(name, part, verts, faces, sharp=30, joint=None, closed=True, smooth=True):
    """verts oyun ekseninde; yüzler köşe sırası serbest (kapalı ağda normaller dışa düzeltilir)."""
    bm = bmesh.new()
    vs = [bm.verts.new(B(v)) for v in verts]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    if closed:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(f'{part}-{name}', me)
    scene.collection.objects.link(ob)
    if smooth:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(sharp))
    if joint:
        ob['joint'] = joint['name']
        ob['pivot'] = list(joint['pivot'])
        ob['axis'] = list(joint['axis'])
        ob['big'] = 1 if joint.get('big', True) else 0
    objs.append(ob)
    return ob


def chaikin(p, it=2):
    a = [tuple(x) for x in p]
    for _ in range(it):
        b = [a[0]]
        for i in range(len(a) - 1):
            p0, p1 = a[i], a[i + 1]
            b.append(tuple(u * 0.75 + v * 0.25 for u, v in zip(p0, p1)))
            b.append(tuple(u * 0.25 + v * 0.75 for u, v in zip(p0, p1)))
        b.append(a[-1])
        a = b
    return a


def lathe(name, part, prof, seg, sx=1.0, sy=1.0, x=0.0, y=0.0, closed=False, sharp=40, cap_front=False, cap_back=False):
    """Dönel yüzey: prof [(z, r)], z ekseni etrafında; kesit sx, sy ile elips."""
    verts, faces = [], []
    n = len(prof)
    for z, r in prof:
        for k in range(seg):
            a = 2 * math.pi * k / seg
            verts.append((x + max(r, 1e-4) * math.cos(a) * sx, y + max(r, 1e-4) * math.sin(a) * sy, z))
    for i in range(n - 1):
        for k in range(seg):
            a0, a1 = i * seg + k, i * seg + (k + 1) % seg
            b0, b1 = a0 + seg, a1 + seg
            faces.append((a0, a1, b1, b0))
    if cap_front:
        faces.append(tuple(range(seg)))
    if cap_back:
        faces.append(tuple(range((n - 1) * seg, n * seg)))
    ob = finish(name, part, verts, faces, sharp, closed=closed)
    if not closed:
        # Açık yüzey: dış yüz eksenden dışa baksın (orta halkada denetlenir)
        me = ob.data
        mid = len(me.polygons) // 2
        p = me.polygons[mid]
        c = p.center
        out = Vector((c.x - x, 0, c.z - y))
        if p.normal.dot(out) < 0:
            me.flip_normals()
    return ob


# ---------------------------------------------------------------- gövde (MIG_SKIN profili, sy 1.08)
MIG_SKIN = [(4.36, 0.405), (4.48, 0.42), (4.55, 0.45), (4.54, 0.485), (4.47, 0.51), (4.3, 0.545), (3.8, 0.6), (3.0, 0.665), (2.0, 0.72),
            (1.0, 0.74), (0.0, 0.735), (-1.0, 0.705), (-2.0, 0.65), (-3.0, 0.575), (-4.0, 0.49), (-4.7, 0.425), (-5.08, 0.39), (-5.12, 0.37)]
SY = 1.08


def mig_r(z):
    for i in range(3, len(MIG_SKIN) - 1):
        z0, r0 = MIG_SKIN[i]
        z1, r1 = MIG_SKIN[i + 1]
        if z0 >= z >= z1:
            return r0 + (z - z0) / (z1 - z0) * (r1 - r0)
    return MIG_SKIN[-1][1]


lathe('govde', 'body', chaikin(MIG_SKIN, 2), 32, sy=SY, sharp=50)
# Hava girişi kanalı, kompresör yüzü ve göbek; egzoz borusu, türbin yüzü ve koni (koyu)
lathe('kanal', 'dark', chaikin([(3.9, 0.376), (4.1, 0.388), (4.36, 0.405)], 1), 32, sy=SY)
lathe('kompresor', 'dark', [(3.9, 0.377), (3.9, 0.0)], 32, sy=SY)
lathe('gobek_on', 'dark', [(4.16, 0.0), (4.1, 0.05), (3.98, 0.1), (3.9, 0.12)], 16)
lathe('egzoz', 'dark', [(-5.12, 0.37), (-5.06, 0.35), (-4.75, 0.336)], 32, sy=SY)
lathe('turbin', 'dark', [(-4.75, 0.337), (-4.75, 0.0)], 32, sy=SY)
lathe('gobek_arka', 'dark', [(-4.75, 0.13), (-4.85, 0.1), (-4.98, 0.05), (-5.05, 0.0)], 16)
# Giriş ayırıcısı: dikey levha, ön kenarı yuvarlak (burun dudağının içinden kompresöre)
spl = []
for i in range(9):
    a = math.pi * i / 8
    spl.append((0.02 * math.sin(a), 0, 4.38 - 0.02 + 0.02 * math.cos(a)))
spv, spf = [], []
for yy in (-0.4, 0.4):
    for (x, _, z) in spl + [(0.02, 0, 3.9), (-0.02, 0, 3.9)]:
        spv.append((x, yy, z))
m = len(spl) + 2
spf.append(tuple(range(m)))
spf.append(tuple(range(m, 2 * m))[::-1])
for k in range(m):
    spf.append((k, (k + 1) % m, m + (k + 1) % m, m + k))
finish('ayirici', 'body', spv, spf, 50)

# Sırt kaplaması: kanopinin arkasından dikey kuyruğa, üstü yuvarlak, gövdeye gömülü
sp_v, sp_f = [], []
zs = [1.42 - i * (1.42 + 2.5) / 14 for i in range(15)]
ring = 9
for z in zs:
    top = mig_r(z) * SY
    f = (1.42 - z) / (1.42 + 2.5)
    dh = 0.13 * math.sin(math.pi * min(1, f * 1.15)) ** 0.6 if f < 0.98 else 0.0
    w = 0.13 * (1 - 0.35 * f)
    for k in range(ring):
        a = math.pi * k / (ring - 1)
        sp_v.append((w * math.cos(a), top - 0.06 + (dh + 0.06) * math.sin(a), z))
for i in range(len(zs) - 1):
    for k in range(ring - 1):
        a0, a1 = i * ring + k, i * ring + k + 1
        sp_f.append((a0, a1, a1 + ring, a0 + ring))
ob = finish('sirt', 'body', sp_v, sp_f, 60, closed=False)
if ob.data.polygons[len(ob.data.polygons) // 2].normal.z < 0:
    ob.data.flip_normals()

# Top kabarcıkları: burnun altında, sağda (−x) N-37 için büyük, solda (+x) iki NR-23 için küçük
def blister(name, x, y, z0, z1, rx, ry):
    v, fcs = [], []
    nz, na = 10, 10
    for i in range(nz + 1):
        t = i / nz
        z = z0 + (z1 - z0) * t
        s = math.sin(math.pi * t) ** 0.5
        for k in range(na):
            a = 2 * math.pi * k / na
            v.append((x + rx * s * math.cos(a), y + ry * s * math.sin(a), z))
    for i in range(nz):
        for k in range(na):
            a0, a1 = i * na + k, i * na + (k + 1) % na
            fcs.append((a0, a1, a1 + na, a0 + na))
    finish(name, 'body', v, fcs, 60)

ang_r, ang_l = math.radians(-125), math.radians(-55)
GUNS = []
for nm, ang, z0, z1, rx, ry in (('top_n37', ang_r, 3.05, 1.35, 0.11, 0.09), ('top_nr23a', ang_l, 2.85, 1.55, 0.075, 0.06), ('top_nr23b', math.radians(-75), 2.75, 1.6, 0.07, 0.055)):
    zc = (z0 + z1) / 2
    r = mig_r(zc)
    bx, by = r * math.cos(ang) * 0.93, r * SY * math.sin(ang) * 0.93
    blister(nm, bx, by, z0, z1, rx, ry)
    GUNS.append((nm, bx, by, z0))

# Top namluları (koyu): N-37D sağda uzun ve kalın, ağzında namlu freni; NR-23'ler solda kısa. Kabarcığın ön ucundan çıkar
def barrel(name, x, y, z0, z1, r, brake=0.0):
    prof = [(z0, r * 1.25), (z0 - 0.0, r * 1.25), (z0, r)]
    lathe(f'{name}_kok', 'dark', [(z0 + 0.06, r * 1.5), (z0 - 0.04, r * 1.6)], 12, x=x, y=y, closed=False)
    lathe(name, 'dark', [(z1, r * 0.75), (z1, r), (z0, r)], 12, x=x, y=y, closed=False, cap_front=True)
    if brake:
        lathe(f'{name}_fren', 'dark', [(z1 + 0.02, r * 1.0), (z1 + 0.02, brake), (z1 - 0.12, brake), (z1 - 0.12, r)], 12, x=x, y=y, closed=False)


for nm, bx, by, z0 in GUNS:
    if nm == 'top_n37':
        barrel('namlu_n37', bx, by, z0 - 0.1, z0 + 0.85, 0.032, brake=0.05)
    else:
        barrel(f'namlu_{nm[-1]}', bx, by, z0 - 0.1, z0 + 0.45, 0.022)

# ---------------------------------------------------------------- kanopi (kabarcık; oyundaki canopy(2.2, 1.6, 0.46, 0.72, 0.42, true))
CZ, CL, CH, CY, CW = 2.2, 1.6, 0.46, 0.72, 0.42
raw = [(CZ + CL * 0.5, 0), (CZ + CL * 0.35, CH * 0.75), (CZ, CH), (CZ - CL * 0.25, CH * 0.95), (CZ - CL * 0.5, 0)]
lathe('kanopi', 'glass', chaikin(raw, 3), 28, sx=CW / CH, y=CY, sharp=60)


def canopy_r(z):
    p = chaikin(raw, 3)
    for i in range(len(p) - 1):
        z0, r0 = p[i]
        z1, r1 = p[i + 1]
        if z0 >= z >= z1:
            return r0 + (z - z0) / (z1 - z0 or 1) * (r1 - r0)
    return 0.0


# Ön cam çerçevesi (zırhlı ön camın arkası) ve kayar kapağın ön ve arka çerçeveleri, sürgü rayı
for nm, zz, w in (('cerceve_on', CZ + CL * 0.33, 0.022), ('cerceve_kapak', CZ + CL * 0.22, 0.016)):
    r = canopy_r(zz) * 1.04 + 0.012
    lathe(nm, 'dark', [(zz + w, r), (zz - w, r)], 20, sx=CW / CH, y=CY, closed=False)


# ---------------------------------------------------------------- profil yüzeyler (kanat, yatay ve dikey kuyruk)
HINGE_GAP = 0.005


def yt(x):
    x = max(0.0, min(1.0, x))
    return 5 * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)


def sec_pt(s, thick, x, side):
    """Kesit (le, c, t) üzerinde veter oranı x'te; side +1 üst, -1 alt, 0 orta çizgi (menteşe: oyundaki chordPt)."""
    le, c, t = s
    h = t * 0.12 * math.sin(math.pi * x) + side * t * yt(x)
    return Vector(le) + Vector(thick) * h + Vector((0, 0, -c * x))


def airfoil_part(name, part, secs, thick, x0, x1, n=14, joint=None):
    # Veter boyunca kosinüs aralıklı noktalar; üst x0→x1, alt x1→x0 (kapalı halka)
    xs = [x0 + (x1 - x0) * (1 - math.cos(math.pi * i / (n - 1))) / 2 for i in range(n)]
    loop = [(x, 1) for x in xs] + [(x, -1) for x in reversed(xs[1:-1])]
    if x0 > 0.001:
        pass
    verts, faces = [], []
    L = len(loop)
    for s in secs:
        for x, sd in loop:
            verts.append(tuple(sec_pt(s, thick, x, sd)))
    for i in range(len(secs) - 1):
        for k in range(L):
            a0, a1 = i * L + k, i * L + (k + 1) % L
            faces.append((a0, a1, a1 + L, a0 + L))
    faces.append(tuple(range(L)))
    faces.append(tuple(range((len(secs) - 1) * L, len(secs) * L)))
    return finish(name, part, verts, faces, 32, joint=joint)


def hinge_strip(name, secs, thick, xh):
    a = sec_pt(secs[0], thick, xh, 0)
    b = sec_pt(secs[0], thick, xh + HINGE_GAP, 0)
    c = sec_pt(secs[1], thick, xh, 0)
    d = sec_pt(secs[1], thick, xh + HINGE_GAP, 0)
    # İnce kutu (iki yüzlü şerit yerine kapalı ağ): kalınlık yönünde ±yarı kalınlığın %80'i
    t0 = secs[0][2] * yt(xh) * 0.8
    t1 = secs[1][2] * yt(xh) * 0.8
    T = Vector(thick)
    v = [a - T * t0, b - T * t0, d - T * t1, c - T * t1, a + T * t0, b + T * t0, d + T * t1, c + T * t1]
    finish(name, 'dark', [tuple(p) for p in v], [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], 30)


def taper_sec(w, f, s):
    span = w['tipX'] - w['x0']
    return ((s * (w['x0'] + span * f), w['y'] + span * f * math.tan(math.radians(w['dihedral'])), w['z'] - w['sweep'] * f),
            w['root'] + (w['tip'] - w['root']) * f, w['t'] * (1 - 0.55 * f))


def control_wing(tag, w, xh, parts):
    up = (0, 1, 0)
    for s in (1, -1):
        sn = 'L' if s > 0 else 'R'
        for f0, f1, name in parts:
            secs = [taper_sec(w, f0, s), taper_sec(w, f1, s)]
            if not name:
                airfoil_part(f'{tag}{sn}_{f0}', 'body', secs, up, 0, 1)
                continue
            airfoil_part(f'{tag}{sn}_{f0}_sabit', 'body', secs, up, 0, xh)
            hinge_strip(f'{tag}{sn}_{f0}_mentese', secs, up, xh)
            a = sec_pt(secs[0], up, xh + HINGE_GAP, 0)
            ax = (sec_pt(secs[1], up, xh + HINGE_GAP, 0) - a) * s
            airfoil_part(f'{name}{sn}', 'body', secs, up, xh + HINGE_GAP, 1, n=8,
                         joint={'name': f'{name}{sn}', 'pivot': tuple(a), 'axis': tuple(ax), 'big': True})


W = dict(x0=0.65, z=1.4, root=3.3, y=-0.1, tipX=5.04, tip=1.6, sweep=3.0, dihedral=-2, t=0.3)
T = dict(x0=0.05, z=-4.35, root=1.2, y=2.3, tipX=1.7, tip=0.6, sweep=1.0, dihedral=0, t=0.1)
control_wing('kanat', W, 0.75, [(-0.1, 0.46, 'flap'), (0.46, 0.48, None), (0.48, 0.96, 'aileron'), (0.96, 1, None)])
control_wing('yatay', T, 0.7, [(0, 0.96, 'elevator'), (0.96, 1, None)])

# Kanat çitleri: her kanatta iki, açıklığın ~%30 ve ~%62'sinde; hücum kenarını sarıp menteşenin önünde biter
for s in (1, -1):
    for fr in (0.30, 0.62):
        sec = taper_sec(W, fr, s)
        prof_x = [-0.015] + [0.01 + 0.71 * (1 - math.cos(math.pi * i / 13)) / 2 for i in range(14)]
        base, top = [], []
        for x in prof_x:
            if x < 0:
                p = Vector(sec[0]) + Vector((0, 0, 0.02))
                p.y -= 0.02
            else:
                p = sec_pt(sec, (0, 1, 0), x, 1)
            h = 0.14 * min(1.0, (x + 0.03) / 0.14) * min(1.0, (0.72 - x) / 0.12 + 0.25)
            base.append(p - Vector((0, 0.01, 0)))
            top.append(p + Vector((0, h, 0)))
        poly = base + list(reversed(top))
        th = 0.012
        v = [tuple(p + Vector((-th / 2, 0, 0))) for p in poly] + [tuple(p + Vector((th / 2, 0, 0))) for p in poly]
        n = len(poly)
        fcs = [tuple(range(n)), tuple(range(n, 2 * n))[::-1]]
        for k in range(n):
            fcs.append((k, (k + 1) % n, n + (k + 1) % n, n + k))
        finish(f'cit{s}_{fr}', 'body', v, fcs, 40)

# Dikey kuyruk ve istikamet dümeni (oyundaki controlFin)
F = dict(y0=0.5, z0=-2.4, h=2.4, root=2.8, tip=1.2, sweep=2.4, t=0.15)


def fin_sec(k, cm=1, back=0, tm=1):
    return ((0, F['y0'] - 0.25 + (F['h'] + 0.25) * k, F['z0'] - F['sweep'] * k - F['tip'] * back),
            (F['root'] + (F['tip'] - F['root']) * k) * cm, F['t'] * (1 - 0.5 * k) * tm)


side = (1, 0, 0)
a, b = fin_sec(0.1), fin_sec(0.93)
airfoil_part('dikey_kok', 'body', [fin_sec(0), a], side, 0, 1)
airfoil_part('dikey_sabit', 'body', [a, b], side, 0, 0.7)
hinge_strip('dikey_mentese', [a, b], side, 0.7)
h0 = sec_pt(a, side, 0.7 + HINGE_GAP, 0)
axv = sec_pt(b, side, 0.7 + HINGE_GAP, 0) - h0
airfoil_part('rudder', 'body', [a, b], side, 0.7 + HINGE_GAP, 1, n=8, joint={'name': 'rudder', 'pivot': tuple(h0), 'axis': tuple(axv), 'big': True})
airfoil_part('dikey_tepe', 'body', [b, fin_sec(0.965, 0.88, 0.05, 0.85), fin_sec(1, 0.6, 0.18, 0.6)], side, 0, 1)
# Yatay kuyruğun dikey kuyrukla birleştiği yerde mermi biçimli kaplama
bul = []
for i in range(13):
    t = i / 12
    z = -4.12 - 1.05 * t
    r = 0.11 * math.sin(math.pi * min(1, t * 1.25)) ** 0.55 if t < 0.97 else 0.004
    bul.append((z, max(r, 0.004)))
lathe('mermi', 'body', bul, 14, y=2.3, sharp=60, closed=False)

# Pitot borusu: sağ (−x) kanat ucunun hücum kenarından öne
tl = taper_sec(W, 0.97, -1)
px, py, pz = tl[0][0], tl[0][1] + 0.01, tl[0][2]
lathe('pitot_kok', 'body', [(pz + 0.02, 0.0), (pz + 0.12, 0.028), (pz - 0.25, 0.03), (pz - 0.4, 0.0)], 10, x=px, y=py, closed=False)
lathe('pitot', 'dark', [(pz + 0.75, 0.0), (pz + 0.74, 0.008), (pz + 0.1, 0.012)], 8, x=px, y=py, closed=False)

# ---------------------------------------------------------------- doku: UV, konum haritası, panel düzeni, normal ve AO
import numpy as np

RES = 4096
body_objs = [o for o in objs if o.name.startswith('body-')]
bpy.ops.object.select_all(action='DESELECT')
for o in body_objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = body_objs[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')
# Sol alt köşe boş kalsın: UV'siz parçalar (oyunun kodla eklediği hava frenleri) orayı okur (nötr normal, beyaz AO)
for o in body_objs:
    for d in o.data.uv_layers.active.data:
        d.uv = (0.02 + d.uv[0] * 0.98, 0.02 + d.uv[1] * 0.98)

# Parça türü (kimlik): 1 gövde, 2 kanat, 3 yatay kuyruk, 4 dikey kuyruk, 5 öbür (çit, kabarcık, kaplama)
def kind_of(o):
    n = o.name
    if 'govde' in n or 'sirt' in n:
        return 1
    if 'kanat' in n or 'flap' in n or 'aileron' in n:
        return 2
    if 'yatay' in n or 'elevator' in n:
        return 3
    if 'dikey' in n or 'rudder' in n:
        return 4
    return 5


def img(name, res, fill, flt=True):
    im = bpy.data.images.new(name, res, res, alpha=True, float_buffer=flt)
    im.generated_color = fill
    im.colorspace_settings.name = 'Non-Color'
    return im


scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.render.bake.margin = 6
pos_img = img('pos', RES, (0, 0, 0, 0))
id_img = img('kimlik', RES, (0, 0, 0, 0))


def bake_emit(target, color_fn):
    """Her gövde parçasına salım (emission) malzemesi: rengi color_fn(nesne, düğüm ağacı) → çıkış; hedef resme pişir."""
    for o in body_objs:
        mat = bpy.data.materials.new(f'bake_{o.name}')
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(em.outputs[0], out.inputs[0])
        color_fn(o, nt, em)
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = target
        nt.nodes.active = tn
        o.data.materials.clear()
        o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    for o in body_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = body_objs[0]
    scene.cycles.samples = 1
    bpy.ops.object.bake(type='EMIT', margin=6)


def pos_fn(o, nt, em):
    g = nt.nodes.new('ShaderNodeNewGeometry')
    nt.links.new(g.outputs['Position'], em.inputs['Color'])


def id_fn(o, nt, em):
    k = kind_of(o)
    em.inputs['Color'].default_value = (k / 10.0, 0, 0, 1)


bake_emit(pos_img, pos_fn)
bake_emit(id_img, id_fn)
Pp = np.array(pos_img.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
Ip = np.array(id_img.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
cover = Ip[..., 3] > 0.5
kind = np.rint(Ip[..., 0] * 10).astype(np.int32) * cover
# Blender → oyun ekseni
gx, gy, gz = Pp[..., 0], Pp[..., 2], -Pp[..., 1]


def seam(d, w=0.0022):
    """Dikiş: merkezde 1, w yarı genişlikte sıfıra (yumuşak oluk)."""
    return np.clip(1 - np.abs(d) / w, 0, 1) ** 1.5


def rivets(along, across, pitch, r=0.0028, offs=(-0.012, 0.012)):
    """Dikişin iki yanında perçin sırası: along dikiş boyunca, across dikişe dik uzaklık (m)."""
    a = (np.mod(along, pitch) - pitch / 2)
    out = np.zeros_like(along)
    for o in offs:
        d = np.sqrt(a * a + (across - o) ** 2)
        out = np.maximum(out, np.clip(1 - d / r, 0, 1))
    return out


groove = np.zeros((RES, RES), np.float32)
riv = np.zeros((RES, RES), np.float32)

# Gövde: çerçeve dikişleri (bölüm ve kapak sınırları) ve boyuna dikişler; açı gövde ekseni etrafında
fus = kind == 1
th = np.arctan2(gy / SY, gx)
rad = np.sqrt(gx * gx + (gy / SY) ** 2)
arc = th * np.maximum(rad, 0.3)
FRAMES = [4.3, 3.55, 2.98, 2.32, 1.4, 0.72, 0.0, -0.78, -1.62, -1.9, -2.85, -3.7, -4.45]
for zf in FRAMES:
    d = gz - zf
    groove = np.maximum(groove, seam(d) * fus)
    riv = np.maximum(riv, rivets(arc, d, 0.04) * fus)
for a0 in (math.radians(v) for v in (28, 72, 112, 152, -28, -72, -112, -152)):
    da = np.angle(np.exp(1j * (th - a0))) * np.maximum(rad, 0.3)
    m = fus & (gz < 4.2) & (gz > -4.6)
    groove = np.maximum(groove, seam(da) * m)
    riv = np.maximum(riv, rivets(gz, da, 0.045) * m)
# Gövde kapakları: top bölmesi (burun altı), elektrik ve telsiz kapakları (yanlar), yakıt doldurma kapağı (sırt)
def hatch(cz0, cz1, a0, a1, mask, sides=(1, -1)):
    global groove, riv
    for s in sides:
        aa0, aa1 = (a0, a1) if s > 0 else (math.pi - a1, math.pi - a0)
        inside_a = (np.angle(np.exp(1j * (th - aa0))) > 0) & (np.angle(np.exp(1j * (th - aa1))) < 0)
        inside_z = (gz < cz0) & (gz > cz1)
        r_ = np.maximum(rad, 0.3)
        e = np.minimum.reduce([np.abs(gz - cz0), np.abs(gz - cz1), np.abs(np.angle(np.exp(1j * (th - aa0)))) * r_, np.abs(np.angle(np.exp(1j * (th - aa1)))) * r_])
        groove = np.maximum(groove, seam(e, 0.0018) * (inside_a & inside_z | (e < 0.003)) * mask * (gz < cz0 + 0.003) * (gz > cz1 - 0.003))


hatch(2.9, 1.7, math.radians(-150), math.radians(-105), fus, sides=(1,))
hatch(2.9, 1.9, math.radians(-75), math.radians(-30), fus, sides=(1,))
hatch(0.55, 0.05, math.radians(10), math.radians(40), fus)
hatch(-0.2, -0.65, math.radians(-20), math.radians(5), fus)
hatch(-1.0, -1.25, math.radians(80), math.radians(100), fus, sides=(1,))

# Kanat, yatay kuyruk: kiriş hizaları (veter oranı), nervürler (açıklık boyunca akış yönünde), perçinler
def lifting(mask, w, spars, rib_step):
    global groove, riv
    ax = np.abs(gx)
    span = w['tipX'] - w['x0']
    f = (ax - w['x0']) / span
    zle = w['z'] - w['sweep'] * f
    c = w['root'] + (w['tip'] - w['root']) * f
    xc = (zle - gz) / np.maximum(c, 0.1)
    for sp in spars:
        d = (xc - sp) * c
        groove = np.maximum(groove, seam(d) * mask)
        riv = np.maximum(riv, rivets(ax, d, 0.05) * mask)
    rr = np.mod(ax - w['x0'], rib_step) - rib_step / 2
    m2 = mask & (xc > 0.03) & (xc < 0.97)
    riv = np.maximum(riv, rivets(gz, rr, 0.045, offs=(0.0,)) * m2)
    groove = np.maximum(groove, seam(rr, 0.0012) * m2 * 0.5)


lifting(kind == 2, W, (0.14, 0.42, 0.62), 0.38)
lifting(kind == 3, T, (0.15, 0.6), 0.3)
# Dikey kuyruk: kirişler (veter oranı), yatay nervürler
fin = kind == 4
kf = (gy - (F['y0'] - 0.25)) / (F['h'] + 0.25)
zf_le = F['z0'] - F['sweep'] * kf
cf = F['root'] + (F['tip'] - F['root']) * kf
xf = (zf_le - gz) / np.maximum(cf, 0.1)
for sp in (0.15, 0.6):
    d = (xf - sp) * cf
    groove = np.maximum(groove, seam(d) * fin)
    riv = np.maximum(riv, rivets(gy, d, 0.05) * fin)
rr = np.mod(gy, 0.32) - 0.16
riv = np.maximum(riv, rivets(gz, rr, 0.045, offs=(0.0,)) * (fin & (xf > 0.03)))

height = 0.5 - 0.5 * groove - 0.12 * riv
height = np.where(cover, height, 0.5).astype(np.float32)
h_img = img('yukseklik', RES, (0.5, 0.5, 0.5, 1))
hp = np.ones((RES, RES, 4), np.float32)
hp[..., 0] = hp[..., 1] = hp[..., 2] = height
h_img.pixels.foreach_set(hp.ravel())

# Normal haritası (teğet uzayı), numpy ile: yüksekliğin (m) doku üzerindeki eğimi, metre/texel konum haritasından.
# three.js teğet eksenini UV türevlerinden kurar (perturbNormal2Arb): x ∇u, y ∇v yönünde. glTF'de v ters (1 − v), doku
# flipY = false yüklenir: y bileşeni ters işaretli yazılır.
Hm = (-0.0008 * groove - 0.00022 * riv).astype(np.float32)


def nb(a, ax, d):
    return np.roll(a, -d, axis=ax)


def step_len(ax):
    d = np.linalg.norm(nb(Pp[..., :3], ax, 1) - nb(Pp[..., :3], ax, -1), axis=-1) / 2
    ok = cover & nb(cover, ax, 1) & nb(cover, ax, -1)
    med = float(np.median(d[ok])) if ok.any() else 0.002
    return np.where(ok & (d > 1e-5) & (d < med * 4), d, med), ok


Lu, oku = step_len(1)
Lv, okv = step_len(0)
Hu = np.where(oku, (nb(Hm, 1, 1) - nb(Hm, 1, -1)) / 2, 0.0)
Hv = np.where(okv, (nb(Hm, 0, 1) - nb(Hm, 0, -1)) / 2, 0.0)
nx = -Hu / Lu
ny = Hv / Lv  # −(−Hv/Lv): glTF v ters
nz = np.ones_like(nx)
ln = np.sqrt(nx * nx + ny * ny + nz * nz)
N = np.stack([nx / ln, ny / ln, nz / ln], -1)
N = np.where(cover[..., None], N, np.array([0, 0, 1], np.float32))
# 4096 → 2048 (ortalama, yeniden birim)
N2 = N.reshape(2048, 2, 2048, 2, 3).mean(axis=(1, 3))
N2 /= np.linalg.norm(N2, axis=-1, keepdims=True)
n_img = img('normal', 2048, (0.5, 0.5, 1.0, 1.0), flt=False)
NP = np.ones((2048, 2048, 4), np.float32)
NP[..., :3] = N2 * 0.5 + 0.5
n_img.pixels.foreach_set(NP.ravel())
n_img.filepath_raw = os.path.join(OUT, 'mig15_normal.png')
n_img.file_format = 'PNG'
n_img.save()
# AO pişirme için her parçaya basit malzeme (resim düğümü aşağıda eklenir)
for o in body_objs:
    mat = bpy.data.materials.new(f'ao_{o.name}')
    mat.use_nodes = True
    o.data.materials.clear()
    o.data.materials.append(mat)

# Ortam gölgesi + dikiş kiri: AO pişir (bütün parçalar gölge düşürür), dikiş ve perçin kiriyle çarp
AOR = 2048
ao_img = img('ao', AOR, (1, 1, 1, 1))
for o in body_objs:
    mat = o.data.materials[0]
    nt = mat.node_tree
    tn = nt.nodes.new('ShaderNodeTexImage')
    tn.image = ao_img
    nt.nodes.active = tn
for o in objs:
    if not o.data.materials:
        o.data.materials.append(bpy.data.materials.new('duz'))
scene.cycles.samples = 48
scene.world = scene.world or bpy.data.worlds.new('W')
scene.world.light_settings.distance = 0.9
bpy.ops.object.bake(type='AO', margin=6)
A = np.array(ao_img.pixels[:], np.float32).reshape(AOR, AOR, 4)
k = RES // AOR
g2 = groove.reshape(AOR, k, AOR, k).max(axis=(1, 3))
r2 = riv.reshape(AOR, k, AOR, k).mean(axis=(1, 3))
c2 = cover.reshape(AOR, k, AOR, k).any(axis=(1, 3))
aov = np.clip(A[..., 0], 0, 1) * (1 - 0.45 * g2) * (1 - 0.25 * r2)
aov = np.where(c2, 0.35 + 0.65 * aov, 1.0)
A[..., 0] = A[..., 1] = A[..., 2] = aov
A[..., 3] = 1
ao_img.pixels.foreach_set(A.ravel())
ao8 = img('ao8', AOR, (1, 1, 1, 1), flt=False)
ao8.pixels.foreach_set(A.ravel())
ao8.filepath_raw = os.path.join(OUT, 'mig15_ao.jpg')
ao8.file_format = 'JPEG'
ao8.save()
for o in objs:
    o.data.materials.clear()
print('DOKU', os.path.getsize(os.path.join(OUT, 'mig15_normal.png')), os.path.getsize(os.path.join(OUT, 'mig15_ao.jpg')))

# ---------------------------------------------------------------- dışa aktar
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
print('UCGEN', tris, 'PARCA', len(objs))
glb = os.path.join(OUT, 'mig15.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=True, export_apply=True, export_materials='NONE',
                          export_texcoords=True, export_normals=True, export_extras=True, export_vertex_color='NONE')
print('GLB', glb, os.path.getsize(glb))

# Önizleme
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'OBJECT'
scene.display.shading.show_cavity = True
for o in objs:
    o.color = (0.25, 0.25, 0.27, 1) if o.name.startswith('dark') else (0.45, 0.6, 0.75, 1) if o.name.startswith('glass') else (0.75, 0.76, 0.77, 1)
scene.render.resolution_x, scene.render.resolution_y = 1600, 900
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
scene.camera = cam
for i, (pos, tgt) in enumerate([((9, -9, 4.5), (0, 0.3, 0.4)), ((-7, 9, 6), (0, -0.5, 0.6)), ((0, -2, 14), (0, -0.2, 0))]):
    cam.location = pos
    cam.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, f'mig_onizleme{i + 1}.png')
    bpy.ops.render.render(write_still=True)
print('BITTI')
