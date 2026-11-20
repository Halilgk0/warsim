# Oyunun uçak geometrisine (geo_al.mjs çıktısı) Blender'da UV açar ve gerçekçi dokular pişirir: boya (albedo), normal
# haritası (panel, perçin, vida, kumaş kirişi ve nervür bandı), ortam gölgesi + parlaklık. Uçaklar (üçüncü argüman, modelin
# kimliği): hurricane, spitfire, bf109e, ju87b, bf110.
#   blender --background --factory-startup --python tools/blender/doku.py -- <geo.json> <çıktı klasörü>
# Çıktı: hurricane_skin.glb (aynı geometri + UV; parça adları 'solid', 'j:<eklem>'), hurricane_albedo.jpg (sRGB),
# hurricane_normal.png (teğet uzayı; three.js türev teğetine ve glTF'nin ters v'sine göre), hurricane_aos.png
# (R ortam gölgesi + dikiş kiri, G parlaklık çarpanı / 2).
# Desenler oyun ekseninde (m): x sol kanat, y yukarı, z burun. Blender (X, Y, Z) = (x, -z, y).
import bpy, bmesh, json, math, os, sys
import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = args[0], args[1]
KIND = args[2] if len(args) > 2 else 'hurricane'
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
RES = 4096
TEX = 2048
rng = np.random.default_rng(1937)

# ---------------------------------------------------------------- geometri: üçgen çorbası → birleşik ağ, oyunun normalleri
data = json.load(open(SRC))
META = data.get('meta', {}) if isinstance(data, dict) else {}
data = data['parts'] if isinstance(data, dict) else data
# Genel yolun uçakları (2026-11-20): bölgeler META'dan (oyunun çizim satırları), boya ve ayrıntı buradaki ayarlardan.
#   scheme: plain (tek renk üst), raf (Dark Earth / Dark Green dalgalı), splinter3d (yanlar dahil kıymık), splinter2d (üstten kıymık)
#   top / camo: renkler (hex); under: alt renk; demarc: gövdede üst rengin indiği normal y sınırı (alçak = -0,5)
#   cowl: bu z'nin önü motor kaportası (Dzus vidaları; cowl_color ayrı renk); wood: ahşap gövde (perçin ve çerçeve yok)
#   fabric: kumaş kaplı kumanda yüzeyleri (ail, elev, rud, flap); spec: boya parlaklığı; walk_both: iki kanat kökünde basma yeri
STYLES = {
    # I-16 tip 24 (1939–41): üst ve gövde yanları AII yeşil, altı açık mavi; ahşap (kontrplak) gövde, kumaş kumanda yüzeyleri
    'i16': dict(scheme='plain', top=0x4D5E35, under=0x93B2C4, demarc=-0.3, cowl=0.3, wood=True, fabric=('ail', 'elev', 'rud', 'flap'), spec=0.26),
    # A6M2 Model 21: her yeri ameiro (parlak gri-yeşil), motor kaportası mavi-siyah; kumaş kaplı kumanda yüzeyleri
    'a6m': dict(scheme='plain', top=0xB5B096, under=0xB5B096, demarc=-2, cowl=1.25, cowl_color=0x1E2228, fabric=('ail', 'elev', 'rud'), spec=0.42),
    # Blenheim IV (1940, Bomber Command): üst Dark Earth / Dark Green, altı Night; gövdede ayrım alçakta
    'blenheim': dict(scheme='raf', camo=(0x66523A, 0x435038), under=0x232427, demarc=-0.45, fabric=('ail', 'elev', 'rud'), walk_both=True),
    # RAF 1941 sonrası gündüz avcısı: Ocean Grey / Dark Green, Medium Sea Grey alt, Sky göbek ve gövde bandı, sarı hücum kenarı
    'typhoon': dict(scheme='raf', camo=(0x6C7276, 0x435038), under=0x9DA3A6, demarc=-0.1, cowl=0.4, fabric=('elev', 'rud'), band=0xC4C8A4, spinner=0xC4C8A4, le=0xD8A23A),
    # Mosquito FB.VI: ahşap gövde ve kanat; Ocean Grey / Dark Green, Medium Sea Grey alt
    'mosquito': dict(scheme='raf', camo=(0x6C7276, 0x435038), under=0x9DA3A6, demarc=-0.1, wood=True, wood_wing=True, fabric=('elev', 'rud'), walk_both=True),
    # Lancaster: üst Dark Earth / Dark Green, yanlar, altlar ve dikey kuyruklar Night (ayrım yüksekte)
    'lancaster': dict(scheme='raf', camo=(0x66523A, 0x435038), under=0x232427, demarc=0.45, ndemarc=0.2, fin_upper=0.0, walk_both=True),
    # Sea Fury FB.11: Extra Dark Sea Grey üst yarı, Sky yanların altı ve altlar
    'seafury': dict(scheme='plain', top=0x434B50, under=0xC4C8A4, demarc=0.05, cowl=0.5),
    # Alman bombardıman ve pike: RLM 70 / 71 kıymık, RLM 65 alt
    'ju87d': dict(scheme='splinter3d', camo=(0x3B4737, 0x505C42), under=0x9FB4C4, demarc=-0.05, cowl=0.6, cell=1.7, walk_both=True, spats=(1.46, -2.02)),
    'ju88': dict(scheme='splinter3d', camo=(0x3B4737, 0x505C42), under=0x9FB4C4, demarc=-0.5, ndemarc=-0.4, cell=2.0, walk_both=True),
    # Sovyet AMT püskürtme: Il-2 (arka gövde ahşap), Pe-2, Il-10; Yak-3 ve La-7 ahşap
    'il2': dict(scheme='soft', camo=(0x4D5932, 0x363634), under=0x93B2C4, demarc=-0.25, cowl=0.3, wood_aft=-1.2, cell=1.9, feather=0.14),
    'il2m3': dict(scheme='soft', camo=(0x4D5932, 0x363634), under=0x93B2C4, demarc=-0.25, cowl=0.3, wood_aft=-1.2, cell=1.9, feather=0.14),
    'pe2': dict(scheme='soft', camo=(0x4D5932, 0x363634), under=0x93B2C4, demarc=-0.3, cell=2.0, feather=0.14, walk_both=True),
    'il10': dict(scheme='soft', camo=(0x6F7F8A, 0x4C565D), under=0x93B2C4, demarc=-0.25, cowl=0.3, cell=1.8, feather=0.14),
    'yak3': dict(scheme='soft', camo=(0x6F7F8A, 0x4C565D), under=0x93B2C4, demarc=-0.25, cowl=0.4, wood=True, wood_wing=True, cell=1.6, feather=0.14, fabric=('elev', 'rud')),
    'la7': dict(scheme='soft', camo=(0x6F7F8A, 0x4C565D), under=0x93B2C4, demarc=-0.25, cowl=1.1, wood=True, wood_wing=True, cell=1.6, feather=0.14, fabric=('elev', 'rud')),
    # ABD ordusu: zeytin yeşili üst, nötr gri alt, püskürtme ayrım
    'p40': dict(scheme='plain', top=0x4B4C35, under=0x8E9090, demarc=-0.25, soft_demarc=True, cowl=0.25, fabric=('elev', 'rud')),
    'b25': dict(scheme='plain', top=0x4B4C35, under=0x8E9090, demarc=-0.3, soft_demarc=True, fabric=('elev', 'rud'), walk_both=True),
    # ABD çıplak metal: zeytin yeşili parlama önleyici (P-47 burnun üstü, A-26 ve B-17 kokpit önü, P-38 gövde burnu)
    'p47': dict(scheme='metal', demarc=-2, cowl=0.9, spec=0.55, antiglare=(-0.53, 2.4)),
    'p38': dict(scheme='metal', demarc=-2, spec=0.55, antiglare=(2.1, 4.5)),
    'a26': dict(scheme='metal', demarc=-2, spec=0.55, antiglare=(3.5, 5.0), walk_both=True),
    'b17': dict(scheme='metal', demarc=-2, spec=0.55, antiglare=(8.4, 9.6), fabric=('ail', 'elev', 'rud'), walk_both=True),
    'b29': dict(scheme='metal', demarc=-2, spec=0.55, fabric=('elev', 'rud'), walk_both=True),
    # ABD donanması: SBD-3 mavi-gri / açık gri; SB2C üç ton; F6F, F4U, F8F, AD-4 baştan sona parlak lacivert
    'sbd': dict(scheme='plain', top=0x5C6F83, under=0xC7C9C4, demarc=-0.15, soft_demarc=True, cowl=1.3, fabric=('elev', 'rud')),
    'sb2c': dict(scheme='plain', top=0x2D3B58, sides=0x50637C, under=0xE2E3DE, demarc=0.45, sdemarc=-0.45, cowl=1.0, fin_upper=0.0),
    'f6f': dict(scheme='plain', top=0x22304A, under=0x22304A, demarc=-2, cowl=1.0, spec=0.5),
    'f4u': dict(scheme='plain', top=0x22304A, under=0x22304A, demarc=-2, cowl=0.9, spec=0.5),
    'f8f': dict(scheme='plain', top=0x22304A, under=0x22304A, demarc=-2, cowl=1.2, spec=0.5),
    'ad4': dict(scheme='plain', top=0x22304A, under=0x22304A, demarc=-2, cowl=0.9, spec=0.5),
}
# Jetler (kanat WingOpts'tan, nacelle NX/NY profilinden; geo_al)
STYLES.update({
    # Me 262 (A-1a ve U4): üstte RLM 81 / 82 püskürtme, gövde ve nacelle yanları ile dikey kuyruk RLM 76 üstünde sık 81/82 benekleri
    'me262': dict(scheme='soft', camo=(0x5C5644, 0x4B5B3C), under=0xB7C4CC, demarc=0.35, ndemarc=0.35, sy=0.0, feather=0.06, cell=1.4,
                  fin_upper=0.0, mottle=(0x5C5644, 0x4B5B3C)),
    'he162': dict(scheme='soft', camo=(0x5C5644, 0x4B5B3C), under=0xB7C4CC, demarc=0.0, sy=0.0, feather=0.06, cell=1.2),
    'ar234': dict(scheme='soft', camo=(0x5C5644, 0x4B5B3C), under=0xB7C4CC, demarc=0.3, ndemarc=-0.1, sy=0.0, feather=0.06, cell=1.6, walk_both=True),
    # Meteor F.3: Ocean Grey / Dark Green, Medium Sea Grey alt, Sky gövde bandı, sarı hücum kenarı
    'meteor': dict(scheme='raf', camo=(0x6C7276, 0x435038), under=0x9DA3A6, demarc=-0.1, ndemarc=-0.1, band=0xC4C8A4, le=0xD8A23A, walk_both=True),
    # Vampire FB.5: Dark Green / Dark Sea Grey üst, PRU Blue alt
    'vampire': dict(scheme='raf', camo=(0x435038, 0x525C60), under=0x5A7389, demarc=0.0, ndemarc=0.0),
    # Canberra B.2: Slate Grey / Dark Green üst, Night alt ve gövde yanlarının altı
    'canberra': dict(scheme='raf', camo=(0x5C6468, 0x435038), under=0x232427, demarc=0.0, ndemarc=-0.1, cell=2.2, walk_both=True),
    # Çıplak metal: F-86F, F-84G, F-80C (ön camın önünde zeytin yeşili parlama önleyici), Il-28
    'sabre': dict(scheme='metal', demarc=-2, spec=0.55, antiglare=(4.1, 4.8)),
    'f84': dict(scheme='metal', demarc=-2, spec=0.55, antiglare=(2.98, 4.6)),
    'p80': dict(scheme='metal', demarc=-2, spec=0.55, antiglare=(2.48, 4.6)),
    'il28': dict(scheme='metal', demarc=-2, spec=0.55, walk_both=True),
})
for _k in ('me262', 'he162', 'ar234', 'meteor', 'vampire', 'canberra', 'sabre', 'f84', 'p80', 'il28'):
    STYLES[_k]['jet'] = True
STYLES['me262u4'] = STYLES['me262']
STYLES['fw190'] = dict(scheme='soft', camo=(0x4A5158, 0x6F7276), under=0xB7C4CC, demarc=0.45, sy=0.0, feather=0.05, cell=1.3, cowl=0.75,
                       fin_upper=0.0, mottle=(0x4A5158, 0x6F7276, 0x7A7B6C), spinner=0x3B4737)
STYLES['p51d'] = dict(scheme='metal', demarc=-2, spec=0.55, cowl=-0.3, antiglare=(-0.32, 2.4))
# Satırları kodda hesaplanan modeller (geo_al okuyamaz): models.ts'teki aynı hesap (Z: çizim pikselinden metre, yAt: dihedral)
_tan = lambda deg: math.tan(math.radians(deg))
_fwZ = lambda d: (920.9 - d) / 85.4
_p5Z = lambda d: (316.5 - d) / 74.5
META_FIX = {
    'fw190': dict(
        hull=[[_fwZ(d), w, t, b, wy] for d, w, t, b, wy in [[740, 0.5, 0.47, -0.47, 0], [760, 0.55, 0.585, -0.64, -0.03], [850, 0.57, 0.667, -0.667, 0], [955, 0.5, 0.56, -0.67, -0.05],
                                                              [1090, 0.45, 0.5, -0.6, -0.05], [1180, 0.38, 0.47, -0.5, -0.03], [1300, 0.22, 0.27, -0.35, -0.02], [1412, 0.05, 0.15, -0.24, -0.04]]],
        WR=[[x, -0.5 + (x - 0.55) * _tan(5.5), le, c, t] for x, le, c, t in [[0.55, 1.06, 2.4, 0.36], [1.5, 0.95, 2.18, 0.3], [3.0, 0.77, 1.82, 0.22], [4.5, 0.6, 1.46, 0.15],
                                                                               [5.04, 0.52, 1.22, 0.1], [5.18, 0.38, 0.85, 0.06], [5.25, 0.16, 0.3, 0.02]]],
        TR=[[x, 0.14, le, c, 0.1 * (1 - 0.4 * x / 1.82)] for x, le, c in [[0.08, -4.66, 0.87], [1.2, -4.72, 0.8], [1.6, -4.86, 0.6], [1.78, -5.02, 0.32], [1.82, -5.12, 0.12]]],
        fins=[dict(x=0, ymin=-0.24, ymax=1.31, zmax=_fwZ(1290), zmin=_fwZ(1450), t=0.11)]),
    'p51d': dict(
        hull=[[_p5Z(d), w, t, b, wy] for d, w, t, b, wy in [[140, 0.33, 0.28, -0.33, 0], [170, 0.39, 0.37, -0.58, -0.06], [200, 0.44, 0.44, -0.71, -0.1], [270, 0.47, 0.5, -0.81, -0.15],
                                                              [340, 0.49, 0.54, -0.81, -0.15], [420, 0.48, 0.52, -0.81, -0.15], [510, 0.41, 0.55, -0.8, -0.15], [585, 0.35, 0.48, -0.72, -0.13],
                                                              [630, 0.3, 0.5, -0.6, -0.08], [710, 0.2, 0.62, -0.42, 0.02], [775, 0.05, 0.4, -0.25, 0.06]]],
        WR=[[x, -0.55 + (x - 0.45) * _tan(5), le, c, t] for x, le, c, t in [[0.45, 0.34, 2.68, 0.42], [1.5, 0.26, 2.45, 0.33], [3.0, 0.12, 1.98, 0.24], [4.5, -0.02, 1.5, 0.16],
                                                                             [5.3, -0.12, 1.29, 0.11], [5.52, -0.16, 1.0, 0.08], [5.62, -0.24, 0.62, 0.045], [5.66, -0.35, 0.25, 0.015]]],
        TR=[[x, 0.28, le, c, 0.13 * (1 - 0.4 * x / 2)] for x, le, c in [[0.1, -4.81, 1.22], [1.0, -5.09, 1.05], [1.7, -5.27, 0.76], [1.93, -5.36, 0.5], [2.0, -5.6, 0.2]]],
        fins=[dict(x=0, ymin=-0.25, ymax=1.64, zmax=_p5Z(690), zmin=_p5Z(820), t=0.12)]),
}
if KIND in META_FIX:
    META = {**META, **META_FIX[KIND]}
LEGACY = ('hurricane', 'spitfire', 'bf109e', 'ju87b', 'bf110', 'he111')
# Aynı gövdeyi paylaşan sürümler: bölgeler ve yüzey ayrıntısı temel modelden (RK), boya kendi dalından (KIND)
BASE = {'spitfire5': 'spitfire', 'spitfire9': 'spitfire', 'bf109f': 'bf109e', 'bf109g': 'bf109e'}
RK = BASE.get(KIND, KIND)
ST = STYLES.get(KIND, {})
if RK not in LEGACY:
    assert ST and META.get('WR') and META.get('TR') and META.get('hull'), f'{KIND}: STYLES ayarı ya da model satırları (meta) yok'
objs = []
for part in data:
    pos = np.array(part['pos'], np.float64).reshape(-1, 3)
    nrm = np.array(part['nrm'], np.float64).reshape(-1, 3)
    key = np.round(pos / 2e-4).astype(np.int64)
    uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    tri = inv.reshape(-1, 3)
    ok = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
    tri = tri[ok]
    tn = nrm.reshape(-1, 3, 3)[ok]
    verts = [(p[0], -p[2], p[1]) for p in pos[first]]
    me = bpy.data.meshes.new(part['name'])
    me.from_pydata(verts, [], [tuple(int(i) for i in t) for t in tri])
    me.update()
    if len(me.polygons) == len(tri):
        ln = [(n[0], -n[2], n[1]) for t in tn for n in t]
        me.normals_split_custom_set(ln)
    ob = bpy.data.objects.new(part['name'], me)
    scene.collection.objects.link(ob)
    objs.append(ob)
print('PARCA', len(objs), 'UCGEN', sum(len(o.data.polygons) for o in objs))

# ---------------------------------------------------------------- UV (bütün parçalar tek dokuda)
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(52), island_margin=0.0015, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.0015, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')
for o in objs:
    for d in o.data.uv_layers.active.data:
        d.uv = (0.02 + d.uv[0] * 0.98, 0.02 + d.uv[1] * 0.98)

# ---------------------------------------------------------------- konum, normal, parça kimliği haritaları
def img(name, res, fill, flt=True):
    im = bpy.data.images.new(name, res, res, alpha=True, float_buffer=flt)
    im.generated_color = fill
    im.colorspace_settings.name = 'Non-Color'
    return im


scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.render.bake.margin = 8
def part_id(name):
    if name == 'solid':
        return 1
    for pre, i in (('j:aileron', 2), ('j:elevator', 3), ('j:rudder', 4), ('j:flap', 6)):
        if name.startswith(pre):
            return i
    return 5


def bake_emit(target, fn):
    for o in objs:
        mat = bpy.data.materials.new(f'b_{o.name}')
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(em.outputs[0], out.inputs[0])
        fn(o, nt, em)
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = target
        nt.nodes.active = tn
        o.data.materials.clear()
        o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    scene.cycles.samples = 1
    bpy.ops.object.bake(type='EMIT', margin=8)
    return np.array(target.pixels[:], np.float32).reshape(target.size[1], target.size[0], 4)


def geo_fn(socket):
    def f(o, nt, em):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        nt.links.new(g.outputs[socket], em.inputs['Color'])
    return f


def id_fn(o, nt, em):
    em.inputs['Color'].default_value = (part_id(o.name) / 10.0, 0, 0, 1)


Pp = bake_emit(img('pos', RES, (0, 0, 0, 0)), geo_fn('Position'))
Np = bake_emit(img('nrm', RES, (0, 0, 0, 0)), geo_fn('Normal'))
Ip = bake_emit(img('kimlik', RES, (0, 0, 0, 0)), id_fn)
cover = Ip[..., 3] > 0.5
pid = np.rint(Ip[..., 0] * 10).astype(np.int32) * cover
x, y, z = Pp[..., 0], Pp[..., 2], -Pp[..., 1]
nx, ny, nz = Np[..., 0], Np[..., 2], -Np[..., 1]
ax = np.abs(x)
del Ip

# ---------------------------------------------------------------- bölgeler
solid = pid == 1
ail, elev, rud, flp = pid == 2, pid == 3, pid == 4, pid == 6
spat = np.zeros_like(solid)
nac = np.zeros_like(solid)  # motor nacelleri (çift motorlu)
NAC = False  # genel yolda nacelle var mı
nrel = np.zeros(nac.shape, np.float32)  # nacelle ekseninden yükseklik / yarıçap (genel yol)
if RK == 'hurricane':
    tailplane = solid & (z < -4.5) & (ax > 0.17) & (np.abs(y - 0.08) < 0.22)
    fin = solid & (z < -4.3) & (ax < 0.17) & (y > 0.12)
    wing = solid & (ax > 0.56) & (y < -0.05) & (y > -1.05) & ~tailplane
    fus = solid & ~wing & ~tailplane & ~fin
    fabric_fus = fus & (z < -1.45)
    fabric = fabric_fus | ail | elev | rud
elif RK == 'spitfire':
    # Spitfire Mk I: eliptik kanat (6° dihedral), kanat altı radyatör ve yağ soğutucu; metal gövde ve kanat, kumaş dümenler
    yAt = -0.7 + (ax - 0.47) * math.tan(math.radians(6))
    tailplane = solid & (z < -4.6) & (ax > 0.12) & (np.abs(y - 0.14) < 0.13)
    fin = solid & (z < -4.1) & (ax < 0.12) & (y > 0.3) & ~tailplane
    wing = solid & (ax > 0.45) & (np.abs(y - yAt) < 0.38) & (z > -1.9) & (z < 1.2) & ~tailplane
    fus = solid & ~wing & ~tailplane & ~fin
    fabric = ail | elev | rud
elif RK == 'bf109e':
    # Bf 109 E: alçak kanat (6,5° dihedral), kanat altı radyatörleri, destekli yatay kuyruk; bütünüyle metal
    yAt = -0.33 + (ax - 0.44) * math.tan(math.radians(6.5))
    tailplane = solid & (z < -4.4) & (ax > 0.13) & (np.abs(y - 0.82) < 0.13)
    fin = solid & (z < -4.1) & (ax < 0.13) & (y > 0.55) & ~tailplane
    wing = solid & (ax > 0.42) & (np.abs(y - yAt) < 0.32) & (z > -1.3) & (z < 0.95) & ~tailplane
    fus = solid & ~wing & ~tailplane & ~fin
    fabric = np.zeros_like(solid)
elif RK == 'bf110':
    # Bf 110 C: alçak kanat (~4,5° dihedral), x ±2,34'te DB 601 nacelleri (kesitleri oyunun NR satırları), yatay kuyruğun
    # uçlarında iki dikey kuyruk; bütünüyle metal. Kanat satırları oyunun WR'si: [x, y, hücum kenarı z, veter, kalınlık]
    WR = np.array([[0.4, -0.428, 1.943, 3.514, 0.5], [0.5, -0.42, 1.914, 3.428, 0.48], [2.6, -0.252, 1.629, 2.572, 0.38], [5, -0.06, 1.429, 2.043, 0.25],
                   [7.5, 0.14, 1.171, 1.428, 0.13], [8.08, 0.186, 1.071, 1.257, 0.09], [8.14, 0.191, 0.886, 0.857, 0.02]])
    NR = np.array([[-1.686, 0.04, -0.3, -0.56], [-0.971, 0.25, 0.07, -0.86], [0.171, 0.42, 0.21, -1.08], [1.6, 0.47, 0.29, -1.08], [2.6, 0.44, 0.24, -0.86], [3.171, 0.3, 0.2, -0.44]])
    wy_ = np.interp(ax, WR[:, 0], WR[:, 1])
    wle = np.interp(ax, WR[:, 0], WR[:, 2])
    wch = np.interp(ax, WR[:, 0], WR[:, 3])
    wt = np.interp(ax, WR[:, 0], WR[:, 4])
    nw, ntop, nbot = (np.interp(z, NR[:, 0], NR[:, i]) for i in (1, 2, 3))
    nac = solid & (np.abs(ax - 2.34) < nw + 0.03) & (y < ntop + 0.03) & (y > nbot - 0.03) & (z > -1.72) & (z < 3.62)
    tailplane = solid & (z < -5.9) & (ax > 0.1) & (ax < 2.22) & (np.abs(y - 0.257) < 0.1)
    fin = solid & (z < -5.9) & (np.abs(ax - 2.32) < 0.13) & (y > -0.36) & ~tailplane
    wing = solid & (ax > 0.45) & (np.abs(y - wy_) < wt * 0.7 + 0.05) & (z < wle + 0.08) & (z > wle - wch - 0.1) & ~nac & ~tailplane
    fus = solid & ~wing & ~tailplane & ~fin & ~nac
    fabric = np.zeros_like(solid)
elif RK == 'he111':
    # He 111 H: geniş eliptik kanat, kanadın önünde iki Jumo 211 nacellesi (x ±2,58, halka radyatörlü), tek dikey kuyruk,
    # karında nişancı gondolu (Bola); bütünüyle metal. Satırlar oyunun WR / NR'si
    WR = np.array([[0.75, -0.1, 5.822, 5.746, 0.9], [1, -0.1, 5.822, 4.496, 0.82], [3.2, -0.1, 5.822, 4.839, 0.72], [5.4, 0.087, 5.298, 4.154, 0.55],
                   [10.3, 0.504, 4.108, 2.661, 0.25], [11, 0.563, 3.503, 1.713, 0.12], [11.3, 0.589, 2.898, 0.242, 0.02]])
    NR = np.array([[3.342, 0.04, 0, -0.25], [4.41, 0.38, 0.22, -0.45], [5.721, 0.58, 0.35, -0.62], [6.83, 0.55, 0.42, -0.66], [7.374, 0.42, 0.3, -0.52]])
    NAC_X = 2.58
    wy_ = np.interp(ax, WR[:, 0], WR[:, 1])
    wle = np.interp(ax, WR[:, 0], WR[:, 2])
    wch = np.interp(ax, WR[:, 0], WR[:, 3])
    wt = np.interp(ax, WR[:, 0], WR[:, 4])
    nw, ntop, nbot = (np.interp(z, NR[:, 0], NR[:, i]) for i in (1, 2, 3))
    nac = solid & (np.abs(ax - NAC_X) < nw + 0.03) & (y < ntop + 0.03) & (y > nbot - 0.03) & (z > 3.3) & (z < 7.95)
    tailplane = solid & (z < -5.1) & (ax > 0.12) & (ax < 3.95) & (np.abs(y - 0.101) < 0.12)
    fin = solid & (z < -4.9) & (ax < 0.2) & (y > 0.45) & ~tailplane
    wing = solid & (ax > 0.88) & (np.abs(y - wy_) < wt * 0.6 + 0.05) & (z < wle + 0.08) & (z > wle - wch - 0.1) & ~nac & ~tailplane
    bola = solid & (ax < 0.36) & (y < -0.95) & (z > -0.8) & (z < 2.15)
    fus = solid & ~wing & ~tailplane & ~fin & ~nac
    fabric = np.zeros_like(solid)
elif RK == 'ju87b':  # ters martı kanat, sabit takım tozlukları, çene radyatörü; bütünüyle metal
    WR = np.array([[0.6, -0.38, 0.222, 3.358, 0.54], [1.5, -0.6, 0.198, 3.025, 0.5], [3, -0.35, 0.074, 2.691, 0.36], [5, -0.017, -0.049, 1.951, 0.22],
                   [6.5, 0.233, -0.173, 1.148, 0.13], [6.85, 0.292, -0.272, 0.74, 0.08], [6.9, 0.3, -0.457, 0.494, 0.02]])
    spat = solid & (ax > 1.1) & (ax < 1.85) & (y < -0.72)  # tozluk ve bacak kaportası
    tailplane = solid & (z < -6.15) & (ax > 0.15) & (np.abs(y - 0.593) < 0.16)
    fin = solid & (z < -5.5) & (ax < 0.18) & (y > 0.5) & ~tailplane
    wy_ = np.interp(ax, WR[:, 0], WR[:, 1])
    wing = solid & (ax > 0.5) & (np.abs(y - wy_) < 0.4) & (z < 0.45) & (z > -3.3) & ~spat & ~tailplane
    fus = solid & ~wing & ~tailplane & ~fin & ~spat
    fabric = np.zeros_like(solid)
else:
    # Genel yol: kanat WR'den (veter düzlemi, hücum kenarı, veter, kalınlık), yatay kuyruk TR'den, nacelle NR'den, dikey
    # kuyruklar hingedFin satırlarından, gövde kesitleri hull'dan (gövdenin ortası ve yarı eni z'ye göre)
    WR, TR, HULL = np.array(META['WR'], np.float64), np.array(META['TR'], np.float64), np.array(META['hull'], np.float64)
    wy_, wle, wch, wt = (np.interp(ax, WR[:, 0], WR[:, i]) for i in (1, 2, 3, 4))
    HZ = HULL[np.argsort(HULL[:, 0])]
    hcy = np.interp(z, HZ[:, 0], (HZ[:, 2] + HZ[:, 3]) / 2)
    hwz = np.maximum(np.interp(z, HZ[:, 0], HZ[:, 1]), 0.12)
    Z0, Z1 = float(HZ[0, 0]), float(HZ[-1, 0])
    TY = np.interp(ax, TR[:, 0], TR[:, 1])  # yatay kuyruğun yüksekliği açıklığa göre (dihedralli kuyruk)
    tailplane = solid & (z < TR[:, 2].max() + 0.12) & (ax > TR[:, 0].min() + 0.02) & (ax < TR[:, 0].max() + 0.05) & (np.abs(y - TY) < TR[:, 4].max() * 0.7 + 0.05)
    fin = np.zeros_like(solid)
    for f_ in META.get('fins', []):
        fin |= solid & (z < f_['zmax'] + 0.12) & (np.abs(ax - abs(f_['x'])) < f_['t'] + 0.1) & (y > f_['ymin'] - 0.08)
    fin &= ~tailplane
    PODS = META.get('pods') or ([{'x': META['nacX'], 'dy': 0, 'dz': 0}] if META.get('nacX') is not None else [])
    NAC = bool(META.get('NR')) and len(PODS) > 0
    if NAC:
        NR = np.array(META['NR'], np.float64)
        NR = NR[np.argsort(NR[:, 0])]
        NCY = float(((NR[:, 2] + NR[:, 3]) / 2).mean())
        for p_ in PODS:
            zz, yy = z - p_['dz'], y - p_['dy']
            nw_, nt_, nb_ = (np.interp(zz, NR[:, 0], NR[:, i]) for i in (1, 2, 3))
            m_ = solid & (np.abs(ax - p_['x']) < nw_ + 0.03) & (yy < nt_ + 0.03) & (yy > nb_ - 0.03) & (zz > NR[0, 0] - 0.05) & (zz < NR[-1, 0] + 0.6)
            # Nacellede yükseklik (eksenden, yarıçapa göre): boyanın üst ve alt ayrımı bundan (jet nacellelerinin normali içe bakıyor)
            nrel = np.where(m_, (yy - (nt_ + nb_) / 2) / np.maximum((nt_ - nb_) / 2, 0.08), nrel)
            nac |= m_
    zs_ = np.linspace(WR[0, 2] - WR[0, 3], WR[0, 2], 24)
    AXW = float(np.interp(zs_, HZ[:, 0], HZ[:, 1]).max()) + 0.03
    wing = solid & (ax > AXW) & (np.abs(y - wy_) < wt * 0.6 + 0.05) & (z < wle + 0.08) & (z > wle - wch - 0.1) & ~nac & ~tailplane
    fus = solid & ~wing & ~tailplane & ~fin & ~nac
    fabric = np.zeros_like(solid)
    for p_ in ST.get('fabric', ()):
        fabric |= {'ail': ail, 'elev': elev, 'rud': rud, 'flap': flp}[p_]
metal = cover & ~fabric


# ---------------------------------------------------------------- gürültü (değer gürültüsü, 3B)
def hash3(ix, iy, iz):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF).astype(np.float32) / 65535.0


def vnoise(px, py, pz):
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


def fbm(px, py, pz, oct=4):
    s, a, t = 1.0, 0.5, 0.0
    for _ in range(oct):
        t = t + a * vnoise(px * s, py * s, pz * s)
        s *= 2.03
        a *= 0.5
    return t / (1 - 0.5 ** oct)


# ---------------------------------------------------------------- yükseklik (m): panel, perçin, vida, kumaş
H = np.zeros((RES, RES), np.float32)
cav = np.zeros((RES, RES), np.float32)  # dikiş kiri için


def seam(d, w=0.0022):
    return np.clip(1 - np.abs(d) / w, 0, 1) ** 1.5


def rivet_row(along, across, pitch, r=0.0026, offs=(-0.011, 0.011)):
    a = np.mod(along, pitch) - pitch / 2
    out = np.zeros_like(along)
    for o in offs:
        out = np.maximum(out, np.clip(1 - np.sqrt(a * a + (across - o) ** 2) / r, 0, 1))
    return out



def rib_tapes(coord, mask, step=0.12):
    p_ = np.mod(coord, step) / step
    tape = np.clip(1 - np.abs(p_ - 0.5) / 0.09, 0, 1)
    return mask * (0.0016 * tape - 0.0013 * np.sin(math.pi * p_))


def rect(u0, u1, v0, v1, uu, vv, mask, w=0.0018):
    e = np.minimum.reduce([np.abs(uu - u0), np.abs(uu - u1), np.abs(vv - v0), np.abs(vv - v1)])
    inside = (uu > u0 - w) & (uu < u1 + w) & (vv > v0 - w) & (vv < v1 + w)
    return seam(e, w) * inside * mask


if RK == 'hurricane':
    # Metal gövde (burun ve kokpit): kaporta panelleri, Dzus vidaları (halka), kokpit kapakları
    th = np.arctan2(y + 0.2, x)
    arc = th * 0.5
    for zf in (2.45, 1.95, 1.6, 1.25, 0.62, 0.17, -0.14, -0.75, -1.45):
        d = z - zf
        m_ = fus & (z > -1.6)
        g = seam(d) * m_
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
        a = np.mod(arc, 0.12) - 0.06
        rr = np.sqrt(a * a + (d - 0.018) ** 2)
        ring = np.clip(1 - np.abs(rr - 0.007) / 0.0022, 0, 1) * m_ * (z > 0.1)
        H -= 0.0003 * ring
        cav = np.maximum(cav, ring * 0.6)
    for a0 in (0.45, 1.2, 1.95, 2.7, -0.45, -1.2, -1.95, -2.7):
        da = np.angle(np.exp(1j * (th - a0))) * 0.5
        m_ = fus & (z > -1.45) & (z < 2.5)
        g = seam(da) * m_
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
        H -= 0.00018 * rivet_row(z, da, 0.05) * m_

    # Kumaş arka gövde: ahşap kirişlerin üstünde gerilmiş kumaş (kirişte sırt, arada hafif çöküntü), çerçeve bantları
    s_arc = np.angle(np.exp(1j * (th - math.pi / 2))) * 0.52
    per = 0.17
    ph = np.mod(s_arc, per) / per
    ridge = np.exp(-((ph - 0.5) / 0.07) ** 2)
    H += fabric_fus * (0.0035 * ridge - 0.0012 * np.sin(math.pi * ph))
    for zf in np.arange(-1.7, -6.0, -0.48):
        H += fabric_fus * 0.0004 * np.clip(1 - np.abs(z - zf) / 0.02, 0, 1)

    # Kumaş kumanda yüzeyleri: nervür bantları (veter yönünde), aralarında çekme çöküntüsü
    pass


    H += rib_tapes(ax, ail | elev)
    H += rib_tapes(y, rud, 0.11)

    # Metal kanat: kirişler, nervür perçinleri, silah bölmesi kapakları (dış kanat üstü), kök panel çizgileri
    W = dict(x0=1.45, z=1.02, root=2.406, tipX=5.57, tip=1.2, sweep=0.395)
    span = W['tipX'] - W['x0']
    f = np.clip((ax - W['x0']) / span, 0, 1)
    zle = W['z'] - W['sweep'] * f
    ch = W['root'] + (W['tip'] - W['root']) * f
    xc = (zle - z) / np.maximum(ch, 0.3)
    xc = np.where(ax < W['x0'], (1.02 - z) / 2.4, xc)
    for sp in (0.12, 0.6):
        d = (xc - sp) * ch
        g = seam(d) * wing
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00018 * rivet_row(ax, d, 0.05) * wing
    rr_ = np.mod(ax - 0.5, 0.42) - 0.21
    H -= 0.00015 * rivet_row(z, rr_, 0.045, offs=(0.0,)) * wing * (xc > 0.03) * (xc < 0.95)
    up_w = ny > 0.3


    def rect(u0, u1, v0, v1, uu, vv, mask, w=0.0018):
        e = np.minimum.reduce([np.abs(uu - u0), np.abs(uu - u1), np.abs(vv - v0), np.abs(vv - v1)])
        inside = (uu > u0 - w) & (uu < u1 + w) & (vv > v0 - w) & (vv < v1 + w)
        return seam(e, w) * inside * mask


    for (u0, u1, v0, v1) in ((1.85, 2.62, 0.16, 0.5), (3.0, 3.4, 0.08, 0.3), (0.7, 1.35, 0.15, 0.55)):
        g = rect(u0, u1, v0 * 1.0, v1, ax, xc, wing & up_w)
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
    # Yatay ve dikey kuyruğun sabit kısmı (metal): kiriş hizası perçinleri
    for msk, coord in ((tailplane, ax), (fin, y)):
        H -= 0.00015 * rivet_row(coord, np.mod(z + 10, 0.3) - 0.15, 0.045, offs=(0.0,)) * msk


elif RK == 'spitfire':
    # Spitfire: Merlin kaportası (yangın perdesinin önü, z > 0,99) panelleri ve vidaları; gövde çerçeveleri ve kirişleri perçinli
    th = np.arctan2(y + 0.25, x)
    arc = th * 0.45
    for zf in (2.39, 1.95, 1.4, 0.99, 0.35, -0.25, -0.9, -1.45, -1.95, -2.45, -2.95, -3.45, -3.95, -4.45, -4.95, -5.45):
        d = z - zf
        g = seam(d) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(arc, d, 0.036) * fus * (z < 0.99)
        a_ = np.mod(arc, 0.1) - 0.05
        ring = np.clip(1 - np.abs(np.sqrt(a_ * a_ + (d - 0.016) ** 2) - 0.0055) / 0.0018, 0, 1) * fus * (z > 0.97)
        H -= 0.0003 * ring
        cav = np.maximum(cav, ring * 0.6)
    for a0 in (0.6, 1.3, 1.95, 2.6, -0.6, -1.3, -1.95, -2.6):
        da = np.angle(np.exp(1j * (th - a0))) * 0.45
        g = seam(da) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(z, da, 0.04) * fus * (z < 0.99)
    # Kanat: ana kiriş (~%25, D kutusu), arka kiriş (~%65), nervürler, silah ve mermi kapakları
    WRs = np.array([[0.47, 468, 1000], [0.6, 468, 944], [0.8, 468, 919], [1.5, 470, 916], [2.3, 478, 903], [3.0, 488, 885],
                    [3.7, 503, 860], [4.3, 522, 828], [4.8, 549, 787], [5.2, 581, 743], [5.45, 606, 691], [5.615, 632, 654]])
    zle = np.interp(ax, WRs[:, 0], (673 - WRs[:, 1]) / 182)
    ch = np.interp(ax, WRs[:, 0], (WRs[:, 2] - WRs[:, 1]) / 174.5)
    xc = (zle - z) / np.maximum(ch, 0.25)
    for sp in (0.25, 0.65):
        d = (xc - sp) * ch
        g = seam(d) * wing
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00018 * rivet_row(ax, d, 0.045) * wing
    rr_ = np.mod(ax - 0.47, 0.34) - 0.17
    H -= 0.00016 * rivet_row(z, rr_, 0.042, offs=(0.0,)) * wing * (xc > 0.03) * (xc < 0.95)
    for (u0, u1, v0, v1) in ((2.0, 3.15, 0.27, 0.5), (2.0, 3.15, 0.08, 0.24), (0.7, 1.2, 0.3, 0.55)):
        g = rect(u0, u1, v0, v1, ax, xc, wing & (ny > 0.3))
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
    # Kumaş dümenler ve kanatçıklar: nervür bantları
    H += rib_tapes(ax, ail | elev)
    H += rib_tapes(y, rud, 0.11)
    for msk, coord in ((tailplane, ax), (fin, y)):
        H -= 0.00016 * rivet_row(coord, np.mod(z + 10, 0.26) - 0.13, 0.04, offs=(0.0,)) * msk
elif RK == 'bf109e':
    # Bf 109 E: kaporta (yangın perdesinin önü, z > 0,92) panelleri ve vidaları; gövde çerçeveleri ve boyuna dikişler perçinli
    th = np.arctan2(y - 0.05, x)
    arc = th * 0.42
    for zf in (2.41, 2.0, 1.45, 0.92, 0.06, -0.55, -1.32, -1.75, -2.18, -2.61, -3.04, -3.47, -3.9, -4.33, -4.76, -5.15):
        d = z - zf
        g = seam(d) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(arc, d, 0.036) * fus * (z < 0.92)
        a_ = np.mod(arc, 0.1) - 0.05
        ring = np.clip(1 - np.abs(np.sqrt(a_ * a_ + (d - 0.016) ** 2) - 0.0055) / 0.0018, 0, 1) * fus * (z > 0.9)
        H -= 0.0003 * ring
        cav = np.maximum(cav, ring * 0.6)
    for a0 in (0.55, 1.25, 1.9, 2.6, -0.55, -1.25, -1.9, -2.6):
        da = np.angle(np.exp(1j * (th - a0))) * 0.42
        g = seam(da) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(z, da, 0.04) * fus * (z < 0.92)
    # Kanat: ana kiriş (~%40) ve arka kiriş (~%70), dış kanatta slat dikişi, nervürler, MG FF kapağı
    WRe = np.array([[0.44, 0.875, 2.07], [1.5, 0.79, 1.85], [2.7, 0.68, 1.62], [3.9, 0.57, 1.38], [4.45, 0.5, 1.2], [4.75, 0.4, 0.92], [4.9, 0.22, 0.45], [4.935, 0.06, 0.12]])
    zle = np.interp(ax, WRe[:, 0], WRe[:, 1])
    ch = np.interp(ax, WRe[:, 0], WRe[:, 2])
    xc = (zle - z) / np.maximum(ch, 0.3)
    for sp in (0.4, 0.7):
        d = (xc - sp) * ch
        g = seam(d) * wing
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00018 * rivet_row(ax, d, 0.045) * wing
    slat = wing & (ax > 2.3) & (ax < 4.6)
    g = seam((xc - 0.13) * ch, 0.0025) * slat
    H -= 0.0008 * g
    cav = np.maximum(cav, g)
    rr_ = np.mod(ax - 0.44, 0.36) - 0.18
    H -= 0.00016 * rivet_row(z, rr_, 0.042, offs=(0.0,)) * wing * (xc > 0.03) * (xc < 0.95)
    for (u0, u1, v0, v1) in ((2.15, 2.75, 0.15, 0.42), (0.8, 1.25, 0.45, 0.68)):
        g = rect(u0, u1, v0, v1, ax, xc, wing & (ny > 0.3))
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
    H -= 0.00016 * rivet_row(z, np.mod(ax, 0.2) - 0.1, 0.04, offs=(0.0,)) * (ail | elev | flp)
    H -= 0.00016 * rivet_row(z, np.mod(y, 0.2) - 0.1, 0.04, offs=(0.0,)) * rud
    for msk, coord in ((tailplane, ax), (fin, y)):
        H -= 0.00016 * rivet_row(coord, np.mod(z + 10, 0.26) - 0.13, 0.04, offs=(0.0,)) * msk
elif RK == 'bf110':
    # Bf 110 C gövdesi: çerçeveler (~0,45 m) ve boyuna kirişler perçinli; burunda dört MG 17'nin üst kapağı ve yan cephane kapakları
    th = np.arctan2(y + 0.08, x)
    arc = th * 0.5
    for zf in (4.17, 3.62, 3.17, 2.67, 2.0, 1.2, 0.4, -0.61, -1.11, -1.55, -2.0, -2.45, -2.9, -3.35, -3.8, -4.25, -4.7, -5.15, -5.6, -6.05, -6.5):
        d = z - zf
        g = seam(d) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(arc, d, 0.036) * fus
    for a0 in (0.6, 1.3, 1.85, 2.55, -0.6, -1.3, -1.85, -2.55):
        da = np.angle(np.exp(1j * (th - a0))) * 0.5
        g = seam(da) * fus * (z < 2.67)
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(z, da, 0.04) * fus * (z < 2.67)
    for (u0, u1, v0, v1, uu, vv, msk) in ((3.25, 4.05, -0.2, 0.2, z, x, fus & (y > 0.05)), (2.72, 3.1, -0.3, 0.12, z, y, fus & (x > 0.2)),
                                          (2.72, 3.1, -0.3, 0.12, z, y, fus & (x < -0.2))):
        g = rect(u0, u1, v0, v1, uu, vv, msk)
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
    # Nacelleler: DB 601 kaportası (yangın perdesinin önü, z > 0,35) panelleri ve Dzus vidaları; arkası perçinli
    for s_ in (1, -1):
        thn = np.arctan2(y + 0.36, x - s_ * 2.34)
        an = thn * 0.4
        m_ = nac & (s_ * x > 0)
        for zf in (3.1, 2.55, 1.85, 1.1, 0.35, -0.5, -1.2):
            d = z - zf
            g = seam(d) * m_
            H -= 0.0005 * g
            cav = np.maximum(cav, g)
            a_ = np.mod(an, 0.1) - 0.05
            ring = np.clip(1 - np.abs(np.sqrt(a_ * a_ + (d - 0.016) ** 2) - 0.0055) / 0.0018, 0, 1) * m_ * (z > 0.3)
            H -= 0.0003 * ring
            cav = np.maximum(cav, ring * 0.6)
            H -= 0.00016 * rivet_row(an, d, 0.036) * m_ * (z < 0.35)
        for a0 in (0.0, 1.05, 2.1, -1.05, -2.1, math.pi):
            da = np.angle(np.exp(1j * (thn - a0))) * 0.4
            g = seam(da) * m_ * (z > 0.35)
            H -= 0.0005 * g
            cav = np.maximum(cav, g)
    # Kanat: ana kiriş (~%28) ve arka kiriş (~%66), dış kanatta slat dikişi, nervürler; altta yakıt deposu ve radyatör kapakları
    xc = (wle - z) / np.maximum(wch, 0.3)
    for sp in (0.28, 0.66):
        d = (xc - sp) * wch
        g = seam(d) * wing
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00018 * rivet_row(ax, d, 0.045) * wing
    slat = wing & (ax > 4.75) & (ax < 7.6)
    g = seam((xc - 0.12) * wch, 0.0025) * slat
    H -= 0.0008 * g
    cav = np.maximum(cav, g)
    rr_ = np.mod(ax - 0.5, 0.36) - 0.18
    H -= 0.00016 * rivet_row(z, rr_, 0.042, offs=(0.0,)) * wing * (xc > 0.03) * (xc < 0.95)
    for (u0, u1, v0, v1) in ((0.95, 1.75, 0.18, 0.55), (3.0, 4.25, 0.12, 0.5), (5.3, 6.1, 0.2, 0.45)):
        g = rect(u0, u1, v0, v1, ax, xc, wing & (ny < -0.3))
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
    H -= 0.00016 * rivet_row(z, np.mod(ax, 0.2) - 0.1, 0.04, offs=(0.0,)) * (ail | elev | flp)
    H -= 0.00016 * rivet_row(z, np.mod(y, 0.2) - 0.1, 0.04, offs=(0.0,)) * rud
    for msk, coord in ((tailplane, ax), (fin, y)):
        H -= 0.00016 * rivet_row(coord, np.mod(z + 10, 0.26) - 0.13, 0.04, offs=(0.0,)) * msk
elif RK == 'he111':
    # He 111 H gövdesi: çerçeveler (~0,5 m) ve boyuna kirişler perçinli; karın gondolunun kenarı ve giriş kapağı
    th = np.arctan2(y - 0.05, x)
    arc = th * 0.85
    for zf in (6.0, 5.4, 4.8, 4.2, 3.6, 3.0, 2.4, 1.8, 1.2, 0.6, 0.0, -0.6, -1.2, -1.8, -2.4, -3.0, -3.6, -4.2, -4.8, -5.4, -6.0, -6.6, -7.2):
        d = z - zf
        g = seam(d) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(arc, d, 0.04) * fus
    for a0 in (0.45, 0.95, 1.45, 2.2, 2.7, -0.45, -0.95, -1.45, -2.2, -2.7):
        da = np.angle(np.exp(1j * (th - a0))) * 0.85
        g = seam(da) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(z, da, 0.044) * fus
    g = rect(-0.55, 1.95, -0.26, 0.26, z, x, bola) + rect(-0.2, 0.75, -0.2, 0.2, z, x, bola & (y < -1.2))
    H -= 0.0006 * np.minimum(g, 1)
    cav = np.maximum(cav, np.minimum(g, 1))
    # Nacelleler: Jumo 211 kaportası (z > 4,4) panelleri ve Dzus vidaları; arkası kanada perçinli
    for s_ in (1, -1):
        thn = np.arctan2(y + 0.12, x - s_ * NAC_X)
        an = thn * 0.5
        m_ = nac & (s_ * x > 0)
        for zf in (7.25, 6.6, 5.9, 5.15, 4.4, 3.8):
            d = z - zf
            g = seam(d) * m_
            H -= 0.0005 * g
            cav = np.maximum(cav, g)
            a_ = np.mod(an, 0.1) - 0.05
            ring = np.clip(1 - np.abs(np.sqrt(a_ * a_ + (d - 0.016) ** 2) - 0.0055) / 0.0018, 0, 1) * m_ * (z > 4.35)
            H -= 0.0003 * ring
            cav = np.maximum(cav, ring * 0.6)
            H -= 0.00016 * rivet_row(an, d, 0.036) * m_ * (z < 4.4)
        for a0 in (0.0, 1.05, 2.1, -1.05, -2.1, math.pi):
            da = np.angle(np.exp(1j * (thn - a0))) * 0.5
            g = seam(da) * m_ * (z > 4.4)
            H -= 0.0005 * g
            cav = np.maximum(cav, g)
    # Kanat: iki kiriş (~%22 ve ~%60), nervürler; depo kapakları (gövdeyle nacelle arası ve dış kanatta, iki yüzde)
    xc = (wle - z) / np.maximum(wch, 0.3)
    for sp in (0.22, 0.6):
        d = (xc - sp) * wch
        g = seam(d) * wing
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00018 * rivet_row(ax, d, 0.045) * wing
    rr_ = np.mod(ax - 0.9, 0.42) - 0.21
    H -= 0.00016 * rivet_row(z, rr_, 0.044, offs=(0.0,)) * wing * (xc > 0.03) * (xc < 0.95)
    for (u0, u1, v0, v1) in ((1.05, 2.0, 0.25, 0.55), (3.35, 4.9, 0.25, 0.55), (6.4, 7.6, 0.22, 0.5)):
        g = rect(u0, u1, v0, v1, ax, xc, wing)
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
    H -= 0.00016 * rivet_row(z, np.mod(ax, 0.2) - 0.1, 0.04, offs=(0.0,)) * (ail | elev | flp)
    H -= 0.00016 * rivet_row(z, np.mod(y, 0.2) - 0.1, 0.04, offs=(0.0,)) * rud
    for msk, coord in ((tailplane, ax), (fin, y)):
        H -= 0.00016 * rivet_row(coord, np.mod(z + 10, 0.3) - 0.15, 0.04, offs=(0.0,)) * msk
elif RK == 'ju87b':
    # Ju 87 B: gövde çerçeveleri ve boyuna kirişler (her birinde perçin sırası), Jumo 211 kaportası (paneller, vida başları)
    th = np.arctan2(y + 0.05, x)
    arc = th * 0.45
    for zf in (2.0, 1.55, 1.05, 0.4, -0.2, -0.75, -1.4, -2.05, -2.7, -3.3, -3.9, -4.5, -5.1, -5.7, -6.3, -6.9, -7.5):
        d = z - zf
        g = seam(d) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(arc, d, 0.038) * fus * (z < 0.4)
        a_ = np.mod(arc, 0.11) - 0.055
        ring = np.clip(1 - np.abs(np.sqrt(a_ * a_ + (d - 0.017) ** 2) - 0.006) / 0.002, 0, 1) * fus * (z > 0.35)
        H -= 0.0003 * ring
        cav = np.maximum(cav, ring * 0.6)
    for a0 in (0.5, 1.2, 1.94, 2.64, -0.5, -1.2, -1.94, -2.64):
        da = np.angle(np.exp(1j * (th - a0))) * 0.45
        g = seam(da) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(z, da, 0.042) * fus * (z < 0.4)
    # Kaporta kapakları (iki yanda): motor bakım kapakları
    for (z0, z1) in ((2.1, 1.1), (1.0, 0.45)):
        for s_ in (1, -1):
            g = rect(z1, z0, -0.25, 0.32, z, y, fus & (s_ * x > 0.2))
            H -= 0.0006 * g
            cav = np.maximum(cav, g)
    # Kanat: veter oranı satırlardan; kirişler, nervürler, silah kapağı
    zle = np.interp(ax, WR[:, 0], WR[:, 2])
    ch = np.interp(ax, WR[:, 0], WR[:, 3])
    xc = (zle - z) / np.maximum(ch, 0.3)
    for sp in (0.18, 0.58):
        d = (xc - sp) * ch
        g = seam(d) * wing
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00018 * rivet_row(ax, d, 0.045) * wing
    rr_ = np.mod(ax - 0.6, 0.36) - 0.18
    H -= 0.00016 * rivet_row(z, rr_, 0.042, offs=(0.0,)) * wing * (xc > 0.03) * (xc < 0.95)
    for (u0, u1, v0, v1) in ((2.25, 2.7, 0.06, 0.32), (1.0, 1.4, 0.25, 0.5), (3.6, 4.1, 0.1, 0.3)):
        g = rect(u0, u1, v0, v1, ax, xc, wing & (ny > 0.3))
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
    # Kumanda yüzeyleri (metal): nervür perçinleri
    H -= 0.00016 * rivet_row(z, np.mod(ax, 0.2) - 0.1, 0.04, offs=(0.0,)) * (ail | elev | flp)
    H -= 0.00016 * rivet_row(z, np.mod(y, 0.2) - 0.1, 0.04, offs=(0.0,)) * rud
    # Tozluk: ön-arka birleşim dikişi ve vidalar; kuyruk
    g = seam(z - 0.05) * spat
    H -= 0.0006 * g
    cav = np.maximum(cav, g)
    for msk, coord in ((tailplane, ax), (fin, y)):
        H -= 0.00016 * rivet_row(coord, np.mod(z + 10, 0.28) - 0.14, 0.04, offs=(0.0,)) * msk
else:
    # Genel yol. Gövde: çerçeveler ve boyuna kirişler (yay uzunluğu gövdenin o z'deki yarı eniyle); kaportanın (cowl) önünde
    # panel dikişleri ve Dzus vidaları, arkasında perçin; ahşap kısım (WOODZ'nin arkası: wood bütün gövde, wood_aft yalnız
    # arka gövde) perçinsiz ve çerçevesiz, kontrplak dalgası
    COWL = ST.get('cowl', -99.0)
    WOODZ = ST.get('wood_aft', COWL if ST.get('wood') else -99.0)
    th = np.arctan2(y - hcy, x)
    arc = th * hwz
    for zf in np.arange(Z1 - 0.25, Z0 + 0.3, -ST.get('frame', 0.45 if Z1 - Z0 < 11 else 0.5)):
        if zf < WOODZ:
            continue
        d = z - zf
        g = seam(d) * fus
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(arc, d, 0.036) * fus * (z < COWL) * (z > WOODZ)
        a_ = np.mod(arc, 0.1) - 0.05
        ring = np.clip(1 - np.abs(np.sqrt(a_ * a_ + (d - 0.016) ** 2) - 0.0055) / 0.0018, 0, 1) * fus * (z > COWL)
        H -= 0.0003 * ring
        cav = np.maximum(cav, ring * 0.6)
    for a0 in (0.55, 1.25, 1.9, 2.6, -0.55, -1.25, -1.9, -2.6):
        da = np.angle(np.exp(1j * (th - a0))) * hwz
        g = seam(da) * fus * (z > WOODZ)
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        H -= 0.00016 * rivet_row(z, da, 0.04) * fus * (z < COWL) * (z > WOODZ)
    H += 0.0004 * (fbm(x * 6, y * 6, z * 6, 3) - 0.5) * fus * (z < WOODZ)
    # Nacelleler: kaportanın (önden ~%45) panelleri ve Dzus vidaları; arkası perçinli
    for p_ in (PODS if NAC else []):
        zz = z - p_['dz']
        nw = np.interp(zz, NR[:, 0], NR[:, 1])
        ncowl = NR[-1, 0] - min(0.45 * (NR[-1, 0] - NR[0, 0]), 2.6)
        for s_ in (1, -1):
            thn = np.arctan2(y - NCY - p_['dy'], x - s_ * p_['x'])
            an = thn * np.maximum(nw, 0.12)
            m_ = nac & (s_ * x > 0) & (np.abs(ax - p_['x']) < 1.2)
            for zf in np.arange(NR[-1, 0] - 0.12, NR[0, 0] + 0.25, -0.6):
                d = zz - zf
                g = seam(d) * m_
                H -= 0.0005 * g
                cav = np.maximum(cav, g)
                a_ = np.mod(an, 0.1) - 0.05
                ring = np.clip(1 - np.abs(np.sqrt(a_ * a_ + (d - 0.016) ** 2) - 0.0055) / 0.0018, 0, 1) * m_ * (zz > ncowl)
                H -= 0.0003 * ring
                cav = np.maximum(cav, ring * 0.6)
                H -= 0.00016 * rivet_row(an, d, 0.036) * m_ * (zz < ncowl)
            for a0 in (0.0, 1.05, 2.1, -1.05, -2.1, math.pi):
                da = np.angle(np.exp(1j * (thn - a0))) * np.maximum(nw, 0.12)
                g = seam(da) * m_ * (zz > ncowl)
                H -= 0.0005 * g
                cav = np.maximum(cav, g)
    # Kanat: iki kiriş, nervür perçinleri; altta iki bakım kapağı (yarı açıklığın ~%16–28 ve ~%42–55'i). Ahşap kanatta
    # (wood_wing) perçin yok, kiriş birleşimi hafif, kontrplak dalgası
    xc = (wle - z) / np.maximum(wch, 0.3)
    ww = ST.get('wood_wing', False)
    for sp in ST.get('spars', (0.25, 0.62)):
        d = (xc - sp) * wch
        g = seam(d) * wing * (0.4 if ww else 1.0)
        H -= 0.0005 * g
        cav = np.maximum(cav, g)
        if not ww:
            H -= 0.00018 * rivet_row(ax, d, 0.045) * wing
    if ww:
        H += 0.0004 * (fbm(x * 5, y * 5, z * 5, 3) - 0.5) * wing
    else:
        rr_ = np.mod(ax - AXW, ST.get('rib', 0.36)) - ST.get('rib', 0.36) / 2
        H -= 0.00016 * rivet_row(z, rr_, 0.042, offs=(0.0,)) * wing * (xc > 0.03) * (xc < 0.95)
    s_span = float(WR[-1, 0])
    for (u0, u1, v0, v1) in ((0.16, 0.28, 0.2, 0.5), (0.42, 0.55, 0.18, 0.45)):
        g = rect(u0 * s_span, u1 * s_span, v0, v1, ax, xc, wing & (ny < -0.3))
        H -= 0.0006 * g
        cav = np.maximum(cav, g)
    # Kumanda yüzeyleri: kumaşta nervür bantları, metalde perçin
    H += rib_tapes(ax, (ail | elev | flp) & fabric)
    H += rib_tapes(y, rud & fabric, 0.11)
    H -= 0.00016 * rivet_row(z, np.mod(ax, 0.2) - 0.1, 0.04, offs=(0.0,)) * (ail | elev | flp) * ~fabric
    H -= 0.00016 * rivet_row(z, np.mod(y, 0.2) - 0.1, 0.04, offs=(0.0,)) * rud * ~fabric
    for msk, coord in ((tailplane, ax), (fin, y)):
        H -= 0.00016 * rivet_row(coord, np.mod(z + 10, 0.26) - 0.13, 0.04, offs=(0.0,)) * msk

# ---------------------------------------------------------------- normal haritası (teğet uzayı; v ters)
def nb(a, axis, d):
    return np.roll(a, -d, axis=axis)


def step_len(axis):
    d = np.linalg.norm(nb(Pp[..., :3], axis, 1) - nb(Pp[..., :3], axis, -1), axis=-1) / 2
    ok = cover & nb(cover, axis, 1) & nb(cover, axis, -1)
    med = float(np.median(d[ok]))
    return np.where(ok & (d > 1e-5) & (d < med * 4), d, med), ok


Lu, oku = step_len(1)
Lv, okv = step_len(0)
Hu = np.where(oku, (nb(H, 1, 1) - nb(H, 1, -1)) / 2, 0.0) / Lu
Hv = np.where(okv, (nb(H, 0, 1) - nb(H, 0, -1)) / 2, 0.0) / Lv
NN = np.stack([-Hu, Hv, np.ones_like(Hu)], -1)
NN /= np.linalg.norm(NN, axis=-1, keepdims=True)
NN = np.where(cover[..., None], NN, np.array([0, 0, 1], np.float32))
k = RES // TEX


def down(a):
    return a.reshape(TEX, k, TEX, k, *a.shape[2:]).mean(axis=(1, 3))


N2 = down(NN)
N2 /= np.linalg.norm(N2, axis=-1, keepdims=True)
del NN, Hu, Hv, Lu, Lv


def save(name, arr, fmt, srgb=False):
    im = bpy.data.images.new(name, TEX, TEX, alpha=True, float_buffer=False)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    px = np.ones((TEX, TEX, 4), np.float32)
    px[..., :3] = arr
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = os.path.join(OUT, name)
    im.file_format = fmt
    im.save()
    print('KAYIT', name, os.path.getsize(im.filepath_raw))


save(f'{KIND}_normal.png', N2 * 0.5 + 0.5, 'PNG')

# ---------------------------------------------------------------- boya (albedo), 2048'de
x2, y2, z2 = down(x), down(y), down(z)
nx2, ny2, nz2 = down(nx), down(ny), down(nz)
cov2 = down(cover.astype(np.float32)) > 0.25
fabric2 = down(fabric.astype(np.float32)) > 0.5
wing2 = down(wing.astype(np.float32)) > 0.5
fus2 = down(fus.astype(np.float32)) > 0.5
fin2 = down((fin | (pid == 4)).astype(np.float32)) > 0.5  # dikey kuyruk ve istikamet dümeni: iki yüzü de kamuflaj
cav2 = down(cav)
del Pp, Np


def lin(h):
    c = np.array([((h >> s) & 255) / 255 for s in (16, 8, 0)], np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


ALU = lin(0x9EA2A4)
spat2 = down(spat.astype(np.float32)) > 0.5
nac2 = down(nac.astype(np.float32)) > 0.5
if RK in ('hurricane', 'spitfire'):
    EARTH, GREEN, SKY = lin(0x66523A), lin(0x435038), lin(0xC4C8A4)
    UNDER = SKY
    if KIND in ('spitfire5', 'spitfire9'):
        # 1941 sonrası gündüz avcısı: Ocean Grey / Dark Green, Medium Sea Grey alt (Sky bant ve göbek aşağıda)
        EARTH, GREEN, UNDER = lin(0x6C7276), lin(0x435038), lin(0x9DA3A6)
    # Kamuflaj: uçağın üstünde kayan 3B hücreler (her biri toprak ya da yeşil), sınırlar hafif kıvrık, 2–4 cm püskürtme geçişi
    seeds = np.stack([rng.uniform(-6, 6, 90), rng.uniform(-1.6, 2.2, 90), rng.uniform(-7, 4, 90)], -1)
    cls = (rng.random(90) < 0.5).astype(np.float32)
    wx = x2 + 0.22 * (fbm(x2 * 0.7, y2 * 0.7, z2 * 0.7) - 0.5)
    wz = z2 + 0.22 * (fbm(x2 * 0.7 + 9, y2 * 0.7, z2 * 0.7) - 0.5)
    wy = y2 * 0.35  # üstten bakılınca desen; yanlarda yükseklik az katılır
    sy_, feather = 0.35, 0.06
    upper = np.where(fus2 | fin2, np.clip((ny2 + 0.72) / 0.18, 0, 1), np.clip((ny2 + 0.1) / 0.25, 0, 1))
    upper = np.where(fin2, 1.0, upper)
    if RK == 'spitfire':
        # Kanat ve yatay kuyruk: üst/alt yüz veter düzlemine göre (kök parçasında oyunun normali ters bakıyor)
        tp2 = down(tailplane.astype(np.float32)) > 0.5
        yw = -0.7 + (np.abs(x2) - 0.47) * math.tan(math.radians(6))
        upper = np.where(wing2, np.clip((y2 - yw + 0.005) / 0.012, 0, 1), upper)
        upper = np.where(tp2, np.clip((y2 - 0.14 + 0.004) / 0.008, 0, 1), upper)
    C0, C1 = EARTH, GREEN
    WALK = (0.5, 1.5, -0.6, 0.8) if KIND == 'hurricane' else (0.47, 1.3, -0.5, 0.6)
    OIL = (-0.2, -0.35) if KIND == 'hurricane' else (0.9, -0.5)
elif KIND == 'bf109e':
    # Bf 109 E (1940 yazı): kanat, yatay kuyruk ve gövde sırtında RLM 71 / 02 kıymık (keskin); gövde yanları ve dikey kuyruk
    # RLM 65, üstünde sahada püskürtülmüş 02 ve 71 benekleri (aşağı doğru seyrelir); altlar RLM 65; burun RLM 04 sarı
    C0, C1, UNDER = lin(0x505C42), lin(0x7A7B6C), lin(0x9FB4C4)
    seeds = np.stack([rng.uniform(-5.2, 5.2, 70), np.zeros(70), rng.uniform(-6, 3, 70)], -1)
    cls = (rng.random(70) < 0.5).astype(np.float32)
    wx, wy, wz = x2, y2 * 0, z2
    sy_, feather = 0.0, 0.006
    spine = np.clip((ny2 - 0.55) / 0.12, 0, 1) * (y2 > 0.15)
    upper = np.where(fus2, spine, np.clip((ny2 + 0.05) / 0.08, 0, 1))
    upper = np.where(fin2, 0.0, upper)
    WALK = (0.45, 1.2, -0.7, 0.6)
    OIL = (1.2, -0.3)
elif KIND in ('bf109f', 'bf109g'):
    # Bf 109 F/G (1941–43): kanat, yatay kuyruk ve gövde sırtında RLM 74 / 75 kıymık (püskürtme: yumuşak kenar); gövde
    # yanları ve dikey kuyruk RLM 76, üstünde 74, 75 ve 02 benekleri (aşağı doğru seyrelir); altlar RLM 76
    C0, C1, UNDER = lin(0x4A5158), lin(0x6F7276), lin(0xB7C4CC)
    seeds = np.stack([rng.uniform(-5.2, 5.2, 70), np.zeros(70), rng.uniform(-6, 3.4, 70)], -1)
    cls = (rng.random(70) < 0.5).astype(np.float32)
    wx = x2 + 0.12 * (fbm(x2 * 0.8, y2 * 0.8, z2 * 0.8) - 0.5)
    wz = z2 + 0.12 * (fbm(x2 * 0.8 + 9, y2 * 0.8, z2 * 0.8) - 0.5)
    wy = y2 * 0
    sy_, feather = 0.0, 0.05
    spine = np.clip((ny2 - 0.55) / 0.12, 0, 1) * (y2 > 0.15)
    upper = np.where(fus2, spine, np.clip((ny2 + 0.05) / 0.08, 0, 1))
    upper = np.where(fin2, 0.0, upper)
    WALK = (0.45, 1.2, -0.7, 0.6)
    OIL = (1.5, -0.3)
elif KIND == 'bf110':
    # Bf 110 C (1940 yazı): kanat, yatay kuyruk, gövdenin ve nacellerin sırtı RLM 71 / 02 kıymık (keskin); gövde ve nacelle
    # yanları ile dikey kuyruklar RLM 65, üstünde sahada püskürtülmüş 02 ve 71 benekleri; altlar RLM 65; pervane göbeği RLM 70
    C0, C1, UNDER = lin(0x505C42), lin(0x7A7B6C), lin(0x9FB4C4)
    seeds = np.stack([rng.uniform(-8.3, 8.3, 110), np.zeros(110), rng.uniform(-7.5, 4.6, 110)], -1)
    cls = (rng.random(110) < 0.5).astype(np.float32)
    wx, wy, wz = x2, y2 * 0, z2
    sy_, feather = 0.0, 0.006
    # Üst ve alt: kanatta ve yatay kuyrukta veter düzlemine göre (normal kökte ters bakabilir), gövdede sırt, nacellede tepe
    wg2 = down((wing | ail | flp).astype(np.float32)) > 0.5
    tp2 = down((tailplane | elev).astype(np.float32)) > 0.5
    wyd = np.interp(np.abs(x2), WR[:, 0], WR[:, 1])
    # Gövdede desen kapak eşiği hizasına iner (dar, yüksek gövde: sırt geniş); nacellenin üst yarısı kanatla birlikte desenli
    spine = np.clip((ny2 - 0.22) / 0.1, 0, 1) * (y2 > 0.12)
    upper = np.where(fus2, spine, np.clip((ny2 + 0.05) / 0.08, 0, 1))
    upper = np.where(nac2, np.clip((ny2 - 0.02) / 0.12, 0, 1), upper)
    upper = np.where(wg2, np.clip((y2 - wyd + 0.005) / 0.012, 0, 1), upper)
    upper = np.where(tp2, np.clip((y2 - 0.257 + 0.004) / 0.008, 0, 1), upper)
    upper = np.where(fin2, 0.0, upper)
    WALK = (0.5, 1.5, -0.9, 1.4)
    OIL = (1.0, -0.55)
elif KIND == 'he111':
    # He 111 H (1940): üst yüzler, gövde ve nacelle yanları, dikey kuyruk RLM 70 / 71 kıymık (maskeyle, keskin düz kenar);
    # altlar ve karın gondolu RLM 65, gövdede ayrım alçakta (alt eğrinin başında); pervane göbekleri RLM 70
    C0, C1, UNDER = lin(0x3B4737), lin(0x505C42), lin(0x9FB4C4)
    seeds = np.stack([rng.uniform(-11.6, 11.6, 200), rng.uniform(-1.3, 3.1, 200), rng.uniform(-8.3, 8.1, 200)], -1)
    cls = (rng.random(200) < 0.5).astype(np.float32)
    wx, wy, wz = x2, y2, z2
    sy_, feather = 1.0, 0.008
    wg2 = down((wing | ail | flp).astype(np.float32)) > 0.5
    tp2 = down((tailplane | elev).astype(np.float32)) > 0.5
    bola2 = down(bola.astype(np.float32)) > 0.5
    wyd = np.interp(np.abs(x2), WR[:, 0], WR[:, 1])
    upper = np.where(fus2, np.clip((ny2 + 0.5) / 0.1, 0, 1), np.clip((ny2 + 0.05) / 0.08, 0, 1))
    upper = np.where(nac2, np.clip((ny2 + 0.4) / 0.1, 0, 1), upper)
    upper = np.where(wg2, np.clip((y2 - wyd + 0.005) / 0.012, 0, 1), upper)
    upper = np.where(tp2, np.clip((y2 - 0.101 + 0.004) / 0.008, 0, 1), upper)
    upper = np.where(fin2, 1.0, upper)
    upper = np.where(bola2, 0.0, upper)
    WALK = (0.9, 2.1, 1.6, 4.6)
    OIL = (5.2, -0.3)
elif KIND == 'ju87b':
    # Ju 87 B (1939–40): RLM 70 Schwarzgrün / 71 Dunkelgrün kıymık deseni (maskeyle boyanmış, keskin düz kenar), altı ve
    # gövde yanının alt yarısı RLM 65 Hellblau, ayrım çizgisi gövdede yüksek ve düz. Pervane göbeği RLM 70
    C0, C1, UNDER = lin(0x3B4737), lin(0x505C42), lin(0x9FB4C4)
    seeds = np.stack([rng.uniform(-7.3, 7.3, 120), rng.uniform(-1.3, 2.4, 120), rng.uniform(-8.4, 3.2, 120)], -1)
    cls = (rng.random(120) < 0.5).astype(np.float32)
    wx, wy, wz = x2, y2, z2
    sy_, feather = 1.0, 0.008
    # Gövdede ayrım: yanların üst yarısı desenli (kesitin ortasının biraz üstü), kanat ve kuyrukta üst yüz
    fus_up = np.clip((y2 - (-0.02 + 0.03 * (z2 < -4))) / 0.012, 0, 1)
    upper = np.where(fus2, fus_up, np.clip((ny2 + 0.05) / 0.08, 0, 1))
    upper = np.where(fin2, 1.0, upper)
    # Tozluk: oyun bu parçanın normalini aşağı eğer (underPaint); renk yüksekliğe göre (yanlar üst renk, alt kenar RLM 65)
    upper = np.where(spat2, np.clip((y2 + 1.86) / 0.06, 0, 1), upper)
    WALK = (0.55, 1.1, -1.1, -0.2)
    OIL = (0.6, -0.4)
else:
    # Genel yol: kamuflaj hücreleri uçağın boyutundan; üst ve alt kanatta ve yatay kuyrukta veter düzlemine göre, gövdede ve
    # nacellede normalin y'sine göre (demarc), dikey kuyruk fin_upper
    sch = ST['scheme']
    UNDER = lin(ST.get('under', ST.get('top', 0xADB3B8)))
    span_ = float(WR[-1, 0]) + 0.3
    n_ = int(np.clip(2 * span_ * (Z1 - Z0) / ST.get('cell', 1.8) ** 2, 60, 260))
    seeds = np.stack([rng.uniform(-span_, span_, n_), rng.uniform(float(HZ[:, 3].min()) - 0.3, float(HZ[:, 2].max()) + 1.5, n_), rng.uniform(Z0 - 0.3, Z1 + 0.6, n_)], -1)
    cls = (rng.random(n_) < 0.5).astype(np.float32)
    if sch == 'raf':
        C0, C1 = (lin(c) for c in ST['camo'])
        wx = x2 + 0.22 * (fbm(x2 * 0.7, y2 * 0.7, z2 * 0.7) - 0.5)
        wz = z2 + 0.22 * (fbm(x2 * 0.7 + 9, y2 * 0.7, z2 * 0.7) - 0.5)
        wy = y2 * 0.35
        sy_, feather = 0.35, 0.06
    elif sch in ('splinter3d', 'splinter2d'):
        C0, C1 = (lin(c) for c in ST['camo'])
        wx, wy, wz = x2, y2 * (1.0 if sch == 'splinter3d' else 0.0), z2
        sy_, feather = (1.0 if sch == 'splinter3d' else 0.0), 0.008
    elif sch == 'soft':
        # Püskürtme (geç Luftwaffe 74/75, 81/82; Sovyet AMT): kıvrık sınırlı hücreler, geniş geçiş
        C0, C1 = (lin(c) for c in ST['camo'])
        wx = x2 + 0.35 * (fbm(x2 * 0.6, y2 * 0.6, z2 * 0.6) - 0.5)
        wz = z2 + 0.35 * (fbm(x2 * 0.6 + 9, y2 * 0.6, z2 * 0.6) - 0.5)
        wy = y2
        sy_, feather = ST.get('sy', 1.0), ST.get('feather', 0.12)
    else:  # plain: tek renk üst; metal: çıplak alüminyum
        C0 = C1 = lin(ST['top'] if sch == 'plain' else 0xADB3B8)
        wx, wy, wz = x2, y2, z2
        sy_, feather = 1.0, 0.01
    wg2 = down((wing | ail | flp).astype(np.float32)) > 0.5
    tp2 = down((tailplane | elev).astype(np.float32)) > 0.5
    wyd = np.interp(np.abs(x2), WR[:, 0], WR[:, 1])
    dm, dmw = ST.get('demarc', -0.4), 0.1
    if ST.get('soft_demarc'):
        # Püskürtme ayrım çizgisi (ABD zeytin yeşili / nötr gri): kıvrık ve yumuşak
        dm, dmw = dm + 0.14 * (fbm(x2 * 1.4, y2 * 1.4, z2 * 1.4, 3) - 0.5), 0.2
    ndm = dm + (ST['ndemarc'] - ST.get('demarc', -0.4)) if 'ndemarc' in ST else dm
    upper = np.where(fus2, np.clip((ny2 - dm) / dmw, 0, 1), np.clip((ny2 + 0.05) / 0.08, 0, 1))
    # Nacelle: eksene göre yükseklikle (ndemarc yarıçapın kesri; dairesel kesitte normalin y'siyle aynı ölçü)
    upper = np.where(nac2, np.clip((down(nrel) - ndm) / 0.12, 0, 1), upper)
    upper = np.where(wg2, np.clip((y2 - wyd + 0.005) / 0.012, 0, 1), upper)
    upper = np.where(tp2, np.clip((y2 - np.interp(np.abs(x2), TR[:, 0], TR[:, 1]) + 0.004) / 0.008, 0, 1), upper)
    upper = np.where(fin2, ST.get('fin_upper', 1.0), upper)
    if ST.get('spats'):
        # Sabit takım tozluğu (x, alt kenarın y'si): yanlar üst renk, yalnız alt kenar alt renk (normale göre değil)
        sx_, sy0 = ST['spats']
        sp2 = down((solid & (np.abs(ax - sx_) < 0.4) & (y < -0.7) & (z > -1.1) & (z < 0.75)).astype(np.float32)) > 0.5
        upper = np.where(sp2, np.clip((y2 - sy0) / 0.06, 0, 1), upper)
    WALK = (AXW, AXW + 1.0, WR[0, 2] - WR[0, 3] * 0.75, WR[0, 2] - 0.15)
    OIL = (float(NR[:, 0].mean()), NCY) if NAC else (min(ST.get('cowl', Z1), Z1) - 0.5, float(HZ[:, 3].mean()) * 0.5)
    if ST.get('jet'):
        OIL = (-999.0, -999.0)  # jette motor yağı izi yok (egzoz isi gölgelendiriciden)
camo = np.zeros((TEX, TEX), np.float32)
for r0 in range(0, TEX, 256):
    sl = slice(r0, r0 + 256)
    d = (wx[sl, :, None] - seeds[:, 0]) ** 2 + (wy[sl, :, None] * sy_ - seeds[:, 1] * sy_) ** 2 + (wz[sl, :, None] - seeds[:, 2]) ** 2
    o = np.argsort(d, axis=-1)[..., :2]
    d1 = np.sqrt(np.take_along_axis(d, o[..., :1], -1)[..., 0])
    d2 = np.sqrt(np.take_along_axis(d, o[..., 1:2], -1)[..., 0])
    c1, c2 = cls[o[..., 0]], cls[o[..., 1]]
    edge = np.clip((d2 - d1) / feather, 0, 1)
    camo[sl] = np.where(c1 == c2, c1, c1 * (0.5 + 0.5 * edge) + c2 * (0.5 - 0.5 * edge))
col = C0 * (1 - camo[..., None]) + C1 * camo[..., None]
col = col * upper[..., None] + UNDER * (1 - upper[..., None])
if KIND == 'ju87b':
    col = np.where(((z2 > 2.33) & fus2)[..., None], C0 * 0.95, col)
if KIND == 'bf109e':
    # Yan benekleri: yumuşak kenarlı 15–35 cm lekeler; gövde yanında yukarıdan aşağı seyrelir, kuyrukta seyrek
    dens = np.where(fin2, 0.4, np.clip((y2 - 0.0) / 0.4, 0, 1) ** 1.5) * (fus2 | fin2) * (1 - spine)
    m1 = np.clip((fbm(x2 * 5.0, y2 * 5.0, z2 * 5.0, 3) - (0.7 - 0.16 * dens)) / 0.09, 0, 1) * (dens > 0.02) * 0.85
    m2 = np.clip((fbm(x2 * 5.0 + 13, y2 * 5.0, z2 * 5.0, 3) - (0.72 - 0.14 * dens)) / 0.09, 0, 1) * (dens > 0.02) * 0.8
    col = col * (1 - m1[..., None]) + lin(0x7A7B6C) * m1[..., None]
    col = col * (1 - m2[..., None]) + lin(0x505C42) * m2[..., None]
    nose = fus2 & (z2 > 1.8) & (z2 < 2.42)
    col = np.where(nose[..., None], lin(0xD9B13A), col)
    col = np.where((fus2 & (z2 >= 2.42))[..., None], lin(0x3B4737), col)
if KIND == 'bf110':
    # Yan benekleri: gövde ve nacelle yanında yukarıdan aşağı seyrelir, dikey kuyruklarda seyrek
    side = (fus2 | nac2) * (1 - upper)
    dens = np.where(fin2, 0.4, np.clip((y2 + 0.1) / 0.45, 0, 1) ** 1.5 * side)
    m1 = np.clip((fbm(x2 * 5.0, y2 * 5.0, z2 * 5.0, 3) - (0.7 - 0.16 * dens)) / 0.09, 0, 1) * (dens > 0.02) * 0.85
    m2 = np.clip((fbm(x2 * 5.0 + 13, y2 * 5.0, z2 * 5.0, 3) - (0.72 - 0.14 * dens)) / 0.09, 0, 1) * (dens > 0.02) * 0.8
    col = col * (1 - m1[..., None]) + lin(0x7A7B6C) * m1[..., None]
    col = col * (1 - m2[..., None]) + lin(0x505C42) * m2[..., None]
    col = np.where((nac2 & (z2 > 3.17))[..., None], lin(0x3B4737), col)
if KIND == 'he111':
    col = np.where((nac2 & (z2 > 7.37))[..., None], lin(0x3B4737), col)
if KIND in ('bf109f', 'bf109g'):
    # Yan benekleri 74, 75 ve 02; göbek RLM 70 (F ve G'de burun 0,30 / 0,38 m uzun)
    dens = np.where(fin2, 0.4, np.clip((y2 - 0.0) / 0.4, 0, 1) ** 1.5) * (fus2 | fin2) * (1 - spine)
    for i_, mc in enumerate((0x4A5158, 0x6F7276, 0x7A7B6C)):
        mm = np.clip((fbm(x2 * 5.0 + 13 * i_, y2 * 5.0, z2 * 5.0, 3) - (0.7 + 0.02 * i_ - 0.16 * dens)) / 0.09, 0, 1) * (dens > 0.02) * 0.8
        col = col * (1 - mm[..., None]) + lin(mc) * mm[..., None]
    col = np.where((fus2 & (z2 >= 2.42 + (0.38 if KIND == 'bf109g' else 0.3)))[..., None], lin(0x3B4737), col)
if KIND in ('spitfire5', 'spitfire9'):
    # Sky göbek ve gövde bandı (yatay kuyruğun önünde), dış kanatta sarı hücum kenarı
    zmax2 = float(z2[cov2].max())
    col = np.where((fus2 & (z2 > zmax2 - 0.6))[..., None], lin(0xC4C8A4), col)
    col = np.where((fus2 & (np.abs(z2 + 4.0) < 0.23))[..., None], lin(0xC4C8A4), col)
    col = np.where((wing2 & (np.abs(x2) > 2.0) & (np.abs(x2) < 4.0) & (nz2 > 0.45))[..., None], lin(0xD8A23A), col)
if RK not in LEGACY:
    if ST.get('sides') is not None:
        # Üç ton (ABD donanması 1943): üst renk sırtta, yanlar ve dikey kuyruk ara renk, altlar beyaz
        sidem = (fus2 | nac2) * (1 - upper) * np.clip((ny2 - ST.get('sdemarc', -0.45)) / 0.15, 0, 1)
        sidem = np.where(fin2, 1.0, sidem)
        col = col * (1 - sidem[..., None]) + lin(ST['sides']) * sidem[..., None]
    if ST.get('mottle'):
        # Yan benekleri (geç Luftwaffe avcıları): gövde yanında yukarıdan aşağı seyrelir, dikey kuyrukta seyrek
        side = (fus2 | nac2) * (1 - upper)
        hy = np.where(nac2, down(nrel), ny2)  # nacellede normal içe bakabilir: eksenden yükseklik
        dens = np.where(fin2, 0.45, np.clip((hy + 0.15) / 0.55, 0, 1) ** 1.5 * side)
        for i_, mc in enumerate(ST['mottle']):
            mm = np.clip((fbm(x2 * 5.0 + 13 * i_, y2 * 5.0, z2 * 5.0, 3) - (0.7 + 0.02 * i_ - 0.16 * dens)) / 0.09, 0, 1) * (dens > 0.02) * 0.8
            col = col * (1 - mm[..., None]) + lin(mc) * mm[..., None]
    if sch == 'metal':
        # Çıplak alüminyum: levhaların tonu farklı (haddeleme), bazısı sarımsı ya da mavimsi
        cx_, cy_, cz_ = np.floor(x2 / 0.85).astype(np.int64), np.floor((y2 + 3) / 0.55).astype(np.int64), np.floor((z2 + 30) / 0.6).astype(np.int64)
        pv, pw = hash3(cx_, cy_, cz_), hash3(cx_ + 7, cy_ + 3, cz_ + 11)
        col = col * (1 + 0.1 * (pv - 0.5))[..., None] * (1 + 0.05 * (pw - 0.5)[..., None] * np.array([1, 0, -1], np.float32))
    if ST.get('antiglare'):
        # Parlama önleyici (zeytin yeşili): burnun üstü, ön camın önünde
        a0, a1 = ST['antiglare'][:2]
        col = np.where((fus2 & (z2 > a0) & (z2 < a1) & (ny2 > 0.35))[..., None], lin(ST['antiglare'][2] if len(ST['antiglare']) > 2 else 0x4B4C35), col)
    if ST.get('band'):
        # RAF gövde bandı (18 inç, Sky), yatay kuyruğun önünde
        bz = float(TR[:, 2].max()) + 0.45
        col = np.where((fus2 & (np.abs(z2 - bz) < 0.23))[..., None], lin(ST['band']), col)
    if ST.get('le'):
        # Dış kanatta sarı hücum kenarı şeridi (RAF 1941 sonrası)
        sp_ = float(WR[-1, 0])
        xc2 = (np.interp(np.abs(x2), WR[:, 0], WR[:, 2]) - z2) / np.maximum(np.interp(np.abs(x2), WR[:, 0], WR[:, 3]), 0.3)
        col = np.where((wg2 & (np.abs(x2) > 0.42 * sp_) & (np.abs(x2) < 0.86 * sp_) & (xc2 < 0.07))[..., None], lin(ST['le']), col)
    if ST.get('spinner') is not None:
        # Pervane göbeği: gövdenin en önünden ileri (tek motorlu) ya da nacellenin önü
        sm = fus2 & (z2 > Z1 + 0.02)
        if NAC:
            sm = sm | (nac2 & (z2 > NR[-1, 0] + min(p_['dz'] for p_ in PODS) + 0.02))
        col = np.where(sm[..., None], lin(ST['spinner']), col)
    if ST.get('cowl_color') is not None:
        # Ayrı renkli motor kaportası (göbek hariç: gövdenin en ön kesitine kadar)
        col = np.where((fus2 & (z2 > ST['cowl']) & (z2 < Z1 + 0.02))[..., None], lin(ST['cowl_color']), col)
# Solma (üst yüzler), levha tonu, kir izleri (akış yönünde), yağ (burun altı), kumaş
n1 = fbm(x2 * 1.3, y2 * 1.3, z2 * 1.3)
col *= (1 + 0.07 * upper * (n1 - 0.4))[..., None]
col = col * (1 - 0.08 * upper[..., None]) + 0.08 * upper[..., None] * col.mean(-1, keepdims=True) * 1.15
cellv = hash3(np.floor(x2 / 0.55).astype(np.int64), np.floor((y2 + 3) / 0.45).astype(np.int64), np.floor((z2 + 10) / 0.62).astype(np.int64))
col *= (1 + 0.035 * (cellv - 0.5) * ~fabric2)[..., None]
streak = fbm(x2 * 4.0, y2 * 4.0, z2 * 0.35, 3)
dirt = np.clip((streak - 0.52) / 0.3, 0, 1) * (0.5 + 0.5 * (1 - upper))
col *= (1 - 0.16 * dirt)[..., None]
oilm = nac2 if (KIND in ('bf110', 'he111') or NAC) else fus2  # yağ izi motorun altından: tek motorluda gövde, çift motorluda nacelle
oil = np.clip((fbm(x2 * 3, y2 * 3, z2 * 0.5 + 4, 3) - 0.45) / 0.3, 0, 1) * (z2 < OIL[0] + 3) * (z2 > OIL[0] - 3.5) * (y2 < OIL[1]) * oilm
col = col * (1 - 0.35 * oil[..., None]) + 0.35 * oil[..., None] * lin(0x2A2418)
col = np.where(fabric2[..., None], col * np.array([1.02, 1.0, 0.97], np.float32) * (0.98 + 0.04 * n1[..., None]), col)
# Boya dökülmesi: sol kanat kökünde basma yeri, hücum kenarları, kaporta dikişleri; altından alüminyum
hi = fbm(x2 * 38, y2 * 38, z2 * 38, 3)
walk = wing2 & (np.abs(x2) > WALK[0]) & (np.abs(x2) < WALK[1]) & (z2 > WALK[2]) & (z2 < WALK[3]) & (ny2 > 0.4) & ((x2 > 0) | (KIND in ('ju87b', 'he111')) | ST.get('walk_both', False))
lead = np.clip((nz2 - 0.85) / 0.12, 0, 1) * (wing2 | fin2) * (fbm(x2 * 2, y2 * 2, z2 * 2, 2) > 0.55)
chip_m = np.maximum.reduce([walk * 0.5, lead * 0.3, (cav2 > 0.3) * (z2 > -1.4) * (fus2 | nac2) * 0.3])
chip = (hi > 0.8 - 0.12 * chip_m) * (chip_m > 0) * ~fabric2
col = np.where(chip[..., None], ALU * 0.62, col)
# Tozlukların altı çamurlu (yalnız Ju 87)
if KIND == 'ju87b':
    mud = spat2 * np.clip((-1.5 - y2) / 0.35, 0, 1) * (0.5 + 0.5 * fbm(x2 * 9, y2 * 9, z2 * 9, 3))
    col = col * (1 - 0.45 * mud[..., None]) + 0.45 * mud[..., None] * lin(0x4A3F30)
col = np.where(cov2[..., None], col, UNDER)
srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(np.clip(col, 0, 1), 1 / 2.4) - 0.055)
save(f'{KIND}_albedo.jpg', np.clip(srgb, 0, 1), 'JPEG', srgb=True)
spec = np.where(fabric2, 0.12, ST.get('spec', 0.3)) * (1 - 0.5 * dirt) + chip * 0.7 + oil * 0.25
del camo, n1, streak, hi

# ---------------------------------------------------------------- ortam gölgesi (Cycles AO) + dikiş kiri; parlaklık G'de
ao_img = img('ao', TEX, (1, 1, 1, 1))
for o in objs:
    mat = bpy.data.materials.new(f'ao_{o.name}')
    mat.use_nodes = True
    tn = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tn.image = ao_img
    mat.node_tree.nodes.active = tn
    o.data.materials.clear()
    o.data.materials.append(mat)
scene.cycles.samples = 48
scene.world = scene.world or bpy.data.worlds.new('W')
scene.world.light_settings.distance = 0.8
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.bake(type='AO', margin=8)
A = np.array(ao_img.pixels[:], np.float32).reshape(TEX, TEX, 4)[..., 0]
aov = np.clip(A, 0, 1) * (1 - 0.4 * cav2)
# Hareketli yüzeyler menteşede komşusunun içine girer: pişirmede sahte karanlık (alt sınır)
jm2 = down((pid >= 2).astype(np.float32)) > 0.5
aov = np.where(jm2, np.maximum(aov, 0.82), aov)
aov = np.where(cov2, 0.35 + 0.65 * aov, 1.0)
spec = np.where(cov2, spec, 0.5)
save(f'{KIND}_aos.png', np.stack([aov, np.clip(spec, 0, 1), np.zeros_like(aov)], -1), 'PNG')
for o in objs:
    o.data.materials.clear()

glb = os.path.join(OUT, f'{KIND}_skin.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_yup=True, export_apply=True, export_materials='NONE',
                          export_texcoords=True, export_normals=True, export_vertex_color='NONE')
print('GLB', glb, os.path.getsize(glb))
print('BITTI')
