# Blender'da dokulanmış uçak geometrisini yayına hazırlar: her parçanın yanına uzak görünüş için seyreltilmiş kopyası
# ("<ad>-lod"; UV korunur, aynı dokuyu okur) eklenir ve dosya Draco ile sıkıştırılır.
#   blender --background --factory-startup --python tools/blender/sikistir.py -- <giriş.glb> <çıkış.glb> [açı sınırı, derece]
# Oyun (models.ts) tam ve seyrek geometriyi aynı dosyadan alır; uçak ekranda küçülünce seyreğe geçer.
import bpy, bmesh, math, sys

args = sys.argv[sys.argv.index('--') + 1:]
SRC, DST = args[0], args[1]
RATIO = float(args[2]) if len(args) > 2 else 6.0  # düzlemsel seyreltmenin açı sınırı (derece)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
full = sum(len(o.data.polygons) for o in meshes)
for o in meshes:
    c = o.copy()
    c.data = o.data.copy()
    c.name = o.name + '-lod'
    scene.collection.objects.link(c)
    # İçe aktarılan ağ köşe normali ve UV yüzünden binlerce kopuk parça: aynı konumdaki köşeler birleşir (UV köşe başına
    # kalır, ada sınırı korunur); yoksa seyreltme komşu yüzü göremiyordu
    bm = bmesh.new()
    bm.from_mesh(c.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(c.data)
    bm.free()
    # Düzlemsel seyreltme: neredeyse aynı düzlemdeki komşu yüzler birleşir, UV adası ve dikiş sınırı hiç geçilmez (daraltma
    # tipi seyreltme UV'yi bozup dokuyu karıştırıyordu). Açı sınırı ORAN'dan (derece)
    mod = c.modifiers.new('seyrelt', 'DECIMATE')
    mod.decimate_type = 'DISSOLVE'
    mod.angle_limit = math.radians(RATIO)
    mod.delimit = {'UV'}
    tri = c.modifiers.new('ucgen', 'TRIANGULATE')
    # Köşe başına özel normaller birleştirme ve düzlemsel seyreltmede korunur (köşeler yerinden oynamaz). Sarımı normalle
    # çelişen üçgeni oyun yüklerken çevirir (models.ts matchWinding: içe sarımlı dönel gövdeler, iki yüzlü çizim)
bpy.context.view_layer.update()
lod = sum(len(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.polygons) for o in scene.objects if o.type == 'MESH' and o.name.endswith('-lod'))
bpy.ops.export_scene.gltf(
    filepath=DST, export_format='GLB', export_yup=True, export_apply=True, export_materials='NONE',
    export_texcoords=True, export_normals=True, export_vertex_color='NONE',
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
)
print('SIKISTIR', SRC, 'tam', full, 'seyrek', lod)
