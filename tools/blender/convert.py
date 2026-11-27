"""候選素材轉檔（使用者 2026-11-27：自動抓免費素材來試）：FBX／OBJ／blend → glb。
用法：python3 tools/blender/convert.py <bpy 目錄> <輸入檔> <輸出 .glb> [身高公尺=1.35]
做的事：清空場景 → 匯入 → 只留網格（與骨架）→ 量包圍盒 → 等比縮放到指定身高、腳底放到 z=0、水平置中 → 匯出 glb（含動畫就一起帶）。
不改造型；轉好的檔放 candidates/（不進版本庫），試用滿意才搬進 src/assets 並寫授權紀錄。"""
import sys
sys.path.insert(0, sys.argv[1])
import bpy
from mathutils import Vector

src, out = sys.argv[2], sys.argv[3]
height = float(sys.argv[4]) if len(sys.argv) > 4 else 1.35

bpy.ops.wm.read_factory_settings(use_empty=True)
low = src.lower()
if low.endswith('.fbx'):
    bpy.ops.import_scene.fbx(filepath=src)
elif low.endswith('.obj'):
    bpy.ops.wm.obj_import(filepath=src)
elif low.endswith('.blend'):
    with bpy.data.libraries.load(src) as (data_from, data_to):
        data_to.objects = data_from.objects
    for ob in data_to.objects:
        if ob is not None:
            bpy.context.scene.collection.objects.link(ob)
elif low.endswith('.glb') or low.endswith('.gltf'):
    bpy.ops.import_scene.gltf(filepath=src)
else:
    raise SystemExit('不支援的格式：' + src)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# 有骨架的檔：沒掛在骨架下的網格多半是原檔的雜物（例：Icosphere），丟掉
arms = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
if arms:
    for o in list(meshes):
        if o.parent is None or o.parent.type != 'ARMATURE' or len(o.vertex_groups) == 0:
            meshes.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.context.scene.objects):
    if o.type not in ('MESH', 'ARMATURE'):
        bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.update()
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
        hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
h = hi.z - lo.z
k = height / h if h > 1e-6 else 1.0
roots = [o for o in bpy.context.scene.objects if o.parent is None]
for o in roots:
    o.location = (o.location - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))) * k
    o.scale = o.scale * k
bpy.context.view_layer.update()
# 把縮放、位置「烘」進資料（骨架的縮放匯出時會被重設；第一版轉出來還是 3 公尺高，試用截圖抓到的）
bpy.ops.object.select_all(action='SELECT')
for o in bpy.context.scene.objects:
    bpy.context.view_layer.objects.active = o
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.context.view_layer.update()
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
# 材質一律不透明（Quaternius 的 FBX 轉過來透明度是 0，整隻看不見；試用截圖抓到的）
for mat in bpy.data.materials:
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                # 金屬度 1 在我們的場景（沒有環境反射）會變成全黑：一律非金屬、霧面（和自己的模型一樣）
                if 'Metallic' in n.inputs:
                    n.inputs['Metallic'].default_value = 0.0
                if 'Roughness' in n.inputs:
                    n.inputs['Roughness'].default_value = 0.8
            if n.type == 'BSDF_PRINCIPLED' and 'Alpha' in n.inputs:
                n.inputs['Alpha'].default_value = 1.0
                for l in list(n.inputs['Alpha'].links):
                    mat.node_tree.links.remove(l)
    if hasattr(mat, 'blend_method'):
        mat.blend_method = 'OPAQUE'
for o in list(bpy.data.objects):  # 骨頭的顯示形狀（custom shape）也是網格，但不在場景裡也會被匯出器帶上：全部清掉
    if o.type == 'MESH' and o.name not in bpy.context.scene.objects:
        bpy.data.objects.remove(o, do_unlink=True)
for a in bpy.data.objects:
    if a.type == 'ARMATURE':
        for pb in a.pose.bones:
            pb.custom_shape = None
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True)
print(f'OK {out} 原高 {h:.3f} → {height} 公尺（×{k:.3f}），三角形 {tris}，網格 {len(meshes)}')
