"""Blender 腳本建模的共用零件（docs/26 試作）。用 bpy 無頭執行：python3 tools/blender/build.py <bpy 路徑> <輸出資料夾>。
約定：Blender 裡 Z 朝上、角色臉朝 -Y（匯出成 glTF 之後是 Y 朝上、臉朝 +Z，和遊戲一樣）；腳底 z = 0；單位公尺。
顏色寫進頂點色（一個模型一個材質、一次繪製）；每個零件整塊綁在一根骨頭上（Q 版角色不需要彎曲的蒙皮）。"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


class Builder:
    """收集零件（各自的顏色與骨頭），最後合併成一個網格。"""

    def __init__(self):
        self.parts = []

    def _finish(self, bm, name, color, bone, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.matrix_world = Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
        for p in me.polygons:
            p.use_smooth = smooth
        attr = me.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        col = hex_color(color) if isinstance(color, str) else color
        for d in attr.data:
            d.color = col
        if bone:
            vg = ob.vertex_groups.new(name=bone)
            vg.add(range(len(me.vertices)), 1.0, 'REPLACE')
        self.parts.append(ob)
        return ob

    def sphere(self, name, r, loc, color, bone=None, scale=(1, 1, 1), rot=(0, 0, 0), seg=20, rings=12):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
        return self._finish(bm, name, color, bone, loc, rot, scale)

    def cone(self, name, r1, r2, depth, loc, color, bone=None, rot=(0, 0, 0), seg=16, scale=(1, 1, 1), smooth=True, caps=True):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth)
        return self._finish(bm, name, color, bone, loc, rot, scale, smooth)

    def box(self, name, size, loc, color, bone=None, rot=(0, 0, 0), bevel=0.0, smooth=False):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect='EDGES')
        return self._finish(bm, name, color, bone, loc, rot, (1, 1, 1), smooth)

    def torus(self, name, R, r, loc, color, bone=None, rot=(0, 0, 0), seg=24, tube=8, scale=(1, 1, 1)):
        bm = bmesh.new()
        for i in range(seg):
            a = 2 * math.pi * i / seg
            for j in range(tube):
                b = 2 * math.pi * j / tube
                bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
        bm.verts.ensure_lookup_table()
        for i in range(seg):
            for j in range(tube):
                a = i * tube + j
                b = i * tube + (j + 1) % tube
                c = ((i + 1) % seg) * tube + (j + 1) % tube
                d = ((i + 1) % seg) * tube + j
                bm.faces.new((bm.verts[a], bm.verts[d], bm.verts[c], bm.verts[b]))
        return self._finish(bm, name, color, bone, loc, rot, scale)

    def lathe(self, name, profile, loc, color, bone=None, seg=24, rot=(0, 0, 0), scale=(1, 1, 1), close_top=True, close_bottom=True):
        """profile：[(半徑, 高度)…] 由下往上；繞 Z 軸轉一圈。"""
        bm = bmesh.new()
        rings = []
        for (r, z) in profile:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)])
        for k in range(len(rings) - 1):
            for i in range(seg):
                a, b = rings[k][i], rings[k][(i + 1) % seg]
                c, d = rings[k + 1][(i + 1) % seg], rings[k + 1][i]
                bm.faces.new((a, b, c, d))
        if close_bottom:
            bm.faces.new(list(reversed(rings[0])))
        if close_top:
            bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._finish(bm, name, color, bone, loc, rot, scale)

    def join(self, name):
        bpy.ops.object.select_all(action='DESELECT')
        for o in self.parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = self.parts[0]
        bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active
        ob.name = name
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        mat = bpy.data.materials.new(name + 'Mat')
        ob.data.materials.append(mat)
        ob.data.color_attributes.active_color = ob.data.color_attributes['Color']
        self.parts = []
        return ob


def make_armature(name, bones):
    """bones：{名字: (頭的位置, 尾的位置, 父骨頭或 None)}"""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    for n, (head, tail, parent) in bones.items():
        b = arm.edit_bones.new(n)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def bind(mesh_ob, arm_ob):
    mesh_ob.parent = arm_ob
    m = mesh_ob.modifiers.new('Armature', 'ARMATURE')
    m.object = arm_ob


def make_action(arm_ob, name, frames, keys):
    """keys：{骨頭: {幀: {'rot': (x, y, z 弧度), 'loc': (x, y, z)}}}；frames：總幀數（頭尾同一個姿勢，循環）"""
    if not arm_ob.animation_data:
        arm_ob.animation_data_create()
    act = bpy.data.actions.new(name)
    arm_ob.animation_data.action = act
    for pb in arm_ob.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    for bone, per in keys.items():
        pb = arm_ob.pose.bones[bone]
        for f, v in per.items():
            if 'rot' in v:
                pb.rotation_euler = v['rot']
                pb.keyframe_insert('rotation_euler', frame=f)
            if 'loc' in v:
                pb.location = v['loc']
                pb.keyframe_insert('location', frame=f)
    tr = arm_ob.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    arm_ob.animation_data.action = None
    for pb in arm_ob.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    return act


def export_glb(path, objects, animations=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_animations=animations, export_yup=True, export_normals=True, export_tangents=False, export_materials='EXPORT')
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_animation_mode='NLA_TRACKS' if animations else 'ACTIONS')
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
