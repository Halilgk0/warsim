# Uçaksavar topunun oyundaki geometrisine (top_al.mjs çıktısı) Blender'da UV açar ve gerçekçi doku pişirir:
#   - normal haritası: kutu ve silindir kenarları yuvarlanır (Bevel düğümü; düz yüzlü oyun geometrisi ışığı kenarda yakalar),
#   - boya (albedo): oyunun köşe rengi üstüne güneşte solma, yağmur izleri, kenarlarda aşınmış boya ve altından çelik,
#     yarıklarda kir, dipte toz; çelik parçalarda parlamış kenar ve yağ lekesi, pirinç kovanlarda kararma, sandıklarda tahta
#     damarı, namlu ağzında is,
#   - ortam gölgesi (Cycles AO): yalnız parçanın kendi içinde (taban, dönen kısım, beşik+namlu ayrı pişer; oyunda birbirine
#     göre döndükleri için başkasının gölgesi yanlış yere düşerdi), taban ve dönen kısımda yer düzlemi de gölge verir.
#   blender --background --factory-startup --python tools/blender/top.py -- <top.json> <çıktı klasörü>
# Çıktı: <top>.glb (Draco; düğümler base, yaw, pitch, recoil: kendi grup ekseninde), <top>_albedo.png (sRGB),
# <top>_normal.png (teğet uzayı; three.js türev teğetine ve glTF'nin ters v'sine göre G çevrik), <top>_aos.png (R ortam gölgesi).
# Oyun ekseni (m): x, y yukarı, z namlu yönü. Blender (X, Y, Z) = (x, -z, y).
import bpy, json, math, os, sys
import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = os.path.abspath(args[0]), os.path.abspath(args[1])
os.makedirs(OUT, exist_ok=True)
data = json.load(open(SRC))
GUN = data['gun']
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# Malzeme sınıfları (köşe rengi ve yüzey türünden): 1 boya, 2 koyu çelik, 3 pirinç, 4 ahşap, 5 kanvas, 6 beton, 7 kadran
DARK = {0x3C3E41, 0x2A2B2C, 0x3A3D3F, 0x2E3133, 0x1C1D1E, 0x3C3E36}
BRASS = {0xB58A3C, 0x8A7A44}


def cls_of(hexc, surf):
    if surf == 18:
        return 4
    if surf == 23:
        return 5
    if surf == 5:
        return 6
    if surf == 0:
        return 7
    if hexc in BRASS:
        return 3
    if hexc in DARK:
        return 2
    return 1


def lin_hex(h):
    c = np.array([((h >> s) & 255) / 255 for s in (16, 8, 0)], np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ---------------------------------------------------------------- geometri: üçgen çorbası → birleşik ağ, oyunun normalleri
objs = []
area = 0.0
lo = np.full(3, 1e9)
hi_ = np.full(3, -1e9)
for part in data['parts']:
    pos = np.array(part['pos'], np.float64).reshape(-1, 3)
    nrm = np.array(part['nrm'], np.float64).reshape(-1, 3)
    hexs = np.array(part['col'], np.int64)
    surf = np.array(part['surf'], np.int64)
    off = np.array(part['offset'], np.float64)
    lo = np.minimum(lo, (pos + off).min(0))
    hi_ = np.maximum(hi_, (pos + off).max(0))
    key = np.round(pos / 2e-4).astype(np.int64)
    uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    tri = inv.reshape(-1, 3)
    ok = (tri[:, 0] != tri[:, 1]) & (tri[:, 1] != tri[:, 2]) & (tri[:, 0] != tri[:, 2])
    tri = tri[ok]
    keep = np.repeat(ok, 3)
    tv = pos.reshape(-1, 3, 3)[ok]
    area += float(np.linalg.norm(np.cross(tv[:, 1] - tv[:, 0], tv[:, 2] - tv[:, 0]), axis=1).sum() / 2)
    verts = [(p[0], -p[2], p[1]) for p in pos[first]]
    me = bpy.data.meshes.new(part['name'])
    me.from_pydata(verts, [], [tuple(int(i) for i in t) for t in tri])
    me.update()
    assert len(me.polygons) == len(tri), (part['name'], len(me.polygons), len(tri))
    me.normals_split_custom_set([(n[0], -n[2], n[1]) for n in nrm[keep]])
    # Köşe başına renk (doğrusal) ve malzeme sınıfı
    cols = np.array([lin_hex(int(h)) for h in hexs[keep]], np.float32)
    ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
    ca.data.foreach_set('color', np.concatenate([cols, np.ones((len(cols), 1), np.float32)], 1).ravel())
    cl = np.array([cls_of(int(h), int(s)) for h, s in zip(hexs[keep], surf[keep])], np.float32)
    at = me.attributes.new('cls', 'FLOAT', 'CORNER')
    at.data.foreach_set('value', cl)
    # Yumuşak gölgeli yüz (namlu, silindir yanı: köşe normali yüz normalinden sapar): kenar yuvarlatma ve aşınma almaz, yoksa
    # her yüzün kenarı çizgi gibi görünür
    fn = np.cross(tv[:, 1] - tv[:, 0], tv[:, 2] - tv[:, 0])
    fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    cn = nrm[keep].reshape(-1, 3, 3)
    cn = cn / (np.linalg.norm(cn, axis=2, keepdims=True) + 1e-12)
    smooth = (np.abs(np.einsum('tk,tck->tc', fn, cn)).min(1) < math.cos(math.radians(4))).astype(np.float32)
    sa = me.attributes.new('smooth', 'FLOAT', 'CORNER')
    sa.data.foreach_set('value', np.repeat(smooth, 3))
    ob = bpy.data.objects.new(part['name'], me)
    ob.location = (off[0], -off[2], off[1])
    scene.collection.objects.link(ob)
    objs.append(ob)
SIZE = float(np.max(hi_ - lo))
TEX = 1024 if area < 12 else 2048
print('PARCA', len(objs), 'UCGEN', sum(len(o.data.polygons) for o in objs), 'ALAN', round(area, 1), 'BOY', round(SIZE, 2), 'DOKU', TEX)

# ---------------------------------------------------------------- UV (bütün parçalar tek dokuda)
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.004, rotate=True)
bpy.ops.object.mode_set(mode='OBJECT')
for o in objs:
    for d in o.data.uv_layers.active.data:
        d.uv = (0.01 + d.uv[0] * 0.98, 0.01 + d.uv[1] * 0.98)

# ---------------------------------------------------------------- pişirme yardımcıları
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.render.bake.margin = 8
scene.world = scene.world or bpy.data.worlds.new('W')


def img(name, fill=(0, 0, 0, 0)):
    im = bpy.data.images.new(name, TEX, TEX, alpha=True, float_buffer=True)
    im.generated_color = fill
    im.colorspace_settings.name = 'Non-Color'
    return im


def assign(objects, target, build):
    for o in objects:
        mat = bpy.data.materials.new(f'b_{o.name}_{target.name}')
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        build(o, nt, out)
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = target
        nt.nodes.active = tn
        o.data.materials.clear()
        o.data.materials.append(mat)


def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def pixels(im):
    return np.array(im.pixels[:], np.float32).reshape(TEX, TEX, 4)


def bake_emit(name, fn):
    target = img(name)

    def build(o, nt, out):
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(em.outputs[0], out.inputs[0])
        fn(o, nt, em)
    assign(objs, target, build)
    select(objs)
    scene.cycles.samples = 1
    bpy.ops.object.bake(type='EMIT', margin=8)
    return pixels(target)


def geo_fn(socket):
    def f(o, nt, em):
        g = nt.nodes.new('ShaderNodeNewGeometry')
        nt.links.new(g.outputs[socket], em.inputs['Color'])
    return f


def attr_fn(name, socket):
    def f(o, nt, em):
        a = nt.nodes.new('ShaderNodeAttribute')
        a.attribute_name = name
        nt.links.new(a.outputs[socket], em.inputs['Color'])
    return f


PART_ID = {'base': 1, 'yaw': 2, 'pitch': 3, 'recoil': 4}


def id_fn(o, nt, em):
    em.inputs['Color'].default_value = (PART_ID[o.name] / 10.0, 0, 0, 1)


# ---------------------------------------------------------------- konum, normal, renk, sınıf, parça haritaları
Pp = bake_emit('pos', geo_fn('Position'))
Np = bake_emit('nrm', geo_fn('Normal'))
Cp = bake_emit('renk', attr_fn('col', 'Color'))
Kp = bake_emit('sinif', attr_fn('cls', 'Fac'))
Sp = bake_emit('yumusak', attr_fn('smooth', 'Fac'))
Ip = bake_emit('parca', id_fn)
smooth = Sp[..., 0] > 0.5
del Sp
cover = Ip[..., 3] > 0.5
pid = np.rint(Ip[..., 0] * 10).astype(np.int32) * cover
cls = np.rint(Kp[..., 0]).astype(np.int32) * cover
x, y, z = Pp[..., 0], Pp[..., 2], -Pp[..., 1]
nx, ny, nz = Np[..., 0], Np[..., 2], -Np[..., 1]
C = Cp[..., :3].copy()
del Ip, Kp, Cp

# ---------------------------------------------------------------- normal haritası: kenar yuvarlatma (Bevel), teğet uzayı
BEVEL = float(np.clip(SIZE * 0.0028, 0.006, 0.022))
nrm_img = img('normal', (0.5, 0.5, 1, 1))


def bevel_build(o, nt, out):
    bs = nt.nodes.new('ShaderNodeBsdfDiffuse')
    bv = nt.nodes.new('ShaderNodeBevel')
    bv.samples = 12
    bv.inputs['Radius'].default_value = BEVEL
    nt.links.new(bv.outputs['Normal'], bs.inputs['Normal'])
    nt.links.new(bs.outputs[0], out.inputs[0])


assign(objs, nrm_img, bevel_build)
select(objs)
scene.cycles.samples = 16
scene.render.bake.normal_space = 'TANGENT'
bpy.ops.object.bake(type='NORMAL', margin=8, normal_space='TANGENT')
NT = pixels(nrm_img)[..., :3] * 2 - 1
NT = np.where((cover & ~smooth)[..., None], NT, np.array([0, 0, 1], np.float32))
# Kenar: yuvarlatılmış normalin yüzey normalinden sapması (dışbükey ve içbükey)
edge = np.clip((1 - NT[..., 2]) / 0.12, 0, 1)

# ---------------------------------------------------------------- ortam gölgesi: parça grupları ayrı, yer düzlemiyle
bpy.ops.mesh.primitive_plane_add(size=SIZE * 6, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = 'yer'
GROUPS = [(['base'], True), (['yaw'], True), (['pitch', 'recoil'], False)]


def bake_ao(dist, samples):
    scene.world.light_settings.distance = dist
    scene.cycles.samples = samples
    res = np.ones((TEX, TEX), np.float32)
    for names, use_ground in GROUPS:
        grp = [o for o in objs if o.name in names]
        if not grp:
            continue
        for o in objs:
            o.hide_render = o not in grp
        ground.hide_render = not use_ground
        target = img(f'ao_{names[0]}_{dist}', (1, 1, 1, 1))
        assign(grp, target, lambda o, nt, out: None)
        select(grp)
        bpy.ops.object.bake(type='AO', margin=8)
        a = pixels(target)[..., 0]
        mask = np.isin(pid, [PART_ID[n] for n in names])
        res = np.where(mask, a, res)
    for o in objs:
        o.hide_render = False
    return np.clip(res, 0, 1)


AO = bake_ao(float(np.clip(SIZE * 0.11, 0.25, 0.9)), 64)
AOS = bake_ao(0.05 if SIZE > 3 else 0.03, 32)
ground.hide_render = True
print('PISIRME TAMAM')


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


def mix(a, b, t):
    t = np.asarray(t, np.float32)
    if t.ndim == 2:
        t = t[..., None]
    return a * (1 - t) + b * t


# ---------------------------------------------------------------- boya (albedo)
paint, steel, brass, wood, canvas, concrete = (cls == k for k in (1, 2, 3, 4, 5, 6))
# Dışbükey kenar (yakın gölge açık) ve yarık (yakın gölge koyu)
convex = edge * np.clip((AOS - 0.72) / 0.2, 0, 1)
cav = np.clip((0.92 - AOS) / 0.5, 0, 1)
up = np.clip((ny - 0.25) / 0.6, 0, 1)
side = 1 - np.clip((np.abs(ny) - 0.35) / 0.35, 0, 1)
n1 = fbm(x * 1.1 + 3.1, y * 1.1, z * 1.1)
n2 = fbm(x * 6 + 1.7, y * 6, z * 6, 3)
hi = fbm(x * 42, y * 42, z * 42, 3)
streak = fbm(x * 11 + 5.0, y * 0.7, z * 11, 3)
lum = (C @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]

col = C * ((0.9 + 0.2 * n1) * (0.96 + 0.08 * n2))[..., None]
# Boya: güneşte solma (üst yüzler açık ve tebeşirli), yan yüzlerde yağmur izi, kenarda aşınma (astar ve çelik), seyrek çizik
fade = 0.24 * up * paint
col = mix(col, lum * 1.3 + 0.006, fade)
col *= (1 - 0.12 * side * np.clip((streak - 0.5) / 0.28, 0, 1) * (paint | concrete))[..., None]
wear = convex * (0.45 + 0.75 * hi)
bare = paint & ((wear > 0.78) | ((hi > 0.84) & (n2 > 0.6)))
primer = paint & ~bare & (wear > 0.64)
col = np.where(primer[..., None], mix(col, lin_hex(0x5C4434), 0.45), col)
col = np.where(bare[..., None], lin_hex(0x5E6266) * (0.8 + 0.4 * n2)[..., None], col)
col *= (1 + 0.14 * convex * (paint & ~bare))[..., None]
# Koyu çelik: hafif soğuk ton, kenarları parlamış, yağ lekesi, yarıklarda pas
col = np.where(steel[..., None], col * np.array([0.96, 0.99, 1.05], np.float32), col)
col = np.where(steel[..., None], mix(col, lin_hex(0x8E9296) * (0.85 + 0.3 * hi)[..., None], 0.5 * convex * (hi > 0.42)), col)
col *= (1 - 0.2 * steel * np.clip((n2 - 0.55) / 0.25, 0, 1))[..., None]
col = np.where(steel[..., None], mix(col, lin_hex(0x5A3A26), 0.4 * cav * (hi > 0.55)), col)
# Pirinç: ton oynaması, yarıkta kararma, kenarda parlaklık
col = np.where(brass[..., None], col * (0.82 + 0.36 * n2)[..., None], col)
col = np.where(brass[..., None], mix(col, col * np.array([0.62, 0.56, 0.42], np.float32), 0.55 * cav), col)
col = np.where(brass[..., None], mix(col, lin_hex(0xE0C070), 0.4 * convex), col)
# Ahşap sandık: yatay tahtalar (yan yüz) ya da boyuna (üst yüz), damar, aralık çizgisi, grileşme
hl = np.sqrt(nx * nx + nz * nz) + 1e-6
along = np.where(np.abs(ny) < 0.6, (-nz * x + nx * z) / hl, x)
across = np.where(np.abs(ny) < 0.6, y, z)
grain = fbm(along * 0.9 + 2.0, across * 34, (x + z) * 0.2, 3)
gap = (np.mod(across, 0.12) < 0.006).astype(np.float32)
wood_c = col * (0.74 + 0.46 * grain)[..., None] * (1 - 0.45 * gap)[..., None]
wood_c = mix(wood_c, lum * 1.15, 0.3 * np.clip((n1 - 0.4) / 0.3, 0, 1))
col = np.where(wood[..., None], wood_c, col)
# Kanvas: dokuma tonu ve kıvrım gölgesi
col = np.where(canvas[..., None], col * (0.82 + 0.3 * fbm(x * 18, y * 18, z * 18, 3))[..., None], col)
# Beton: benekler
col = np.where(concrete[..., None], col * (0.85 + 0.3 * hi)[..., None], col)
# Hepsi: yarıkta kir, dipte toz, hafif ortam gölgesi
col = mix(col, lin_hex(0x3A3226) * (0.8 + 0.4 * n2)[..., None], 0.5 * cav)
dust = np.clip(1 - y / 0.45, 0, 1) ** 1.5 * (0.5 + 0.5 * n2) * (pid <= 2)
col = mix(col, lin_hex(0x7A6D55), 0.3 * dust * ~wood)
col *= (0.8 + 0.2 * AO)[..., None]
# Namlu ağzında is (ateşten kararır): ucun 0,7 m'si
tip = np.array(data['tip'], np.float64)
rec = next((p for p in data['parts'] if p['name'] == 'recoil'), None) or next(p for p in data['parts'] if p['name'] == 'pitch')
tw = tip + np.array(rec['offset'])
dtip = np.sqrt((x - tw[0]) ** 2 + (y - tw[1]) ** 2 + (z - tw[2]) ** 2)
soot = np.clip(1 - dtip / (0.35 + SIZE * 0.05), 0, 1) ** 1.5 * (pid >= 3) * (0.7 + 0.3 * n2)
col = mix(col, lin_hex(0x17150F), 0.8 * soot)
# Boş alan ortalama renkte: uzakta (küçük mip) ada kenarı siyaha karışmasın
col = np.where(cover[..., None], np.clip(col, 0, 1), np.clip(col, 0, 1)[cover].mean(0))


def save(name, arr, srgb=False):
    im = bpy.data.images.new(name, TEX, TEX, alpha=True, float_buffer=False)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    px = np.ones((TEX, TEX, 4), np.float32)
    px[..., :3] = arr
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = os.path.join(OUT, name)
    im.file_format = 'PNG'
    im.save()
    print('KAYIT', name, os.path.getsize(im.filepath_raw))


srgb = np.where(col <= 0.0031308, col * 12.92, 1.055 * np.power(np.clip(col, 0, 1), 1 / 2.4) - 0.055)
save(f'{GUN}_albedo.png', np.clip(srgb, 0, 1), srgb=True)
# three.js türev teğeti glTF'nin ters v'siyle: G çevrik
NO = NT.copy()
NO[..., 1] *= -1
save(f'{GUN}_normal.png', NO * 0.5 + 0.5)
aov = np.where(cover, 0.35 + 0.65 * AO * (0.8 + 0.2 * AOS), 1.0)
save(f'{GUN}_aos.png', np.stack([aov, aov, aov], -1))

# ---------------------------------------------------------------- dışa aktarım (Draco)
bpy.data.objects.remove(ground, do_unlink=True)
for o in objs:
    o.data.materials.clear()
    o.data.color_attributes.remove(o.data.color_attributes['col'])
    o.data.attributes.remove(o.data.attributes['cls'])
    o.data.attributes.remove(o.data.attributes['smooth'])
glb = os.path.join(OUT, f'{GUN}.glb')
bpy.ops.export_scene.gltf(
    filepath=glb, export_format='GLB', export_yup=True, export_apply=True, export_materials='NONE',
    export_texcoords=True, export_normals=True, export_vertex_color='NONE',
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=13,
)
print('GLB', glb, os.path.getsize(glb))
print('BITTI')
