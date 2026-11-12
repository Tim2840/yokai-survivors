"""Blender 試作（docs/26）：用腳本建「提燈小僧」（帶骨架與走路、待機動畫）與「鳥居」，匯出 .glb。
用法：python3 tools/blender/build.py <裝了 bpy 的資料夾> <輸出資料夾>
（bpy 的安裝：pip install --target <資料夾> bpy；不進版本庫。）"""
import sys
import math

sys.path.insert(0, sys.argv[1])
OUT = sys.argv[2]
sys.path.insert(0, __file__.rsplit('/', 1)[0])

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402
from lib import Builder  # noqa: E402

# 顏色（和 src/art/palette.ts 對齊）
ROBE = '#fff1d6'
ROBE_SHADE = '#f0c48a'
SASH = '#ff7a1f'
SKIN = '#ffe0c2'
BLUSH = '#ff7f7a'
STRAW = '#ffc24d'
STRAW_DARK = '#d98a22'
RED = '#ff3b30'
DARK = '#2b2530'
WHITE = '#ffffff'
WOOD = '#8a5a34'
BAMBOO = '#9aa860'
LAMP = '#ffcf7a'
VERMILION = '#f0361f'
STONE = '#9a9488'
ROPE = '#e6d6a8'


def rod(b, name, p1, p2, r1, r2, color, bone, seg=10):
    p1 = Vector(p1)
    p2 = Vector(p2)
    d = p2 - p1
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    return b.cone(name, r1, r2, d.length, tuple((p1 + p2) / 2), color, bone, rot=tuple(rot), seg=seg)


def build_chochin():
    lib.reset()
    b = Builder()
    # ── 身體：下襬外擴的僧衣、下襬滾邊、腰帶與背後的結、交領 ──
    b.lathe('robe', [(0.29, 0.2), (0.33, 0.24), (0.32, 0.32), (0.275, 0.44), (0.21, 0.57), (0.12, 0.64)], (0, 0, 0), ROBE, 'body', seg=28)
    b.torus('hem', 0.32, 0.022, (0, 0, 0.225), ROBE_SHADE, 'body', seg=28, tube=6)
    b.torus('sash', 0.287, 0.045, (0, 0, 0.39), SASH, 'body', seg=28, tube=8, scale=(1, 1, 1.25))
    for sx in (-1, 1):
        b.sphere('knot', 0.075, (sx * 0.075, 0.3, 0.4), SASH, 'body', scale=(1.1, 0.55, 0.8), seg=12, rings=8)
        b.box('tail', (0.07, 0.03, 0.2), (sx * 0.05, 0.31, 0.27), SASH, 'body', rot=(0.15, 0, sx * 0.18), bevel=0.01)
    b.sphere('knotc', 0.045, (0, 0.31, 0.4), '#c96f2a', 'body', seg=10, rings=6)
    # 交領：左右兩片白領在胸前交叉
    for sx in (-1, 1):
        rod(b, 'collar', (sx * 0.13, -0.1, 0.62), (-sx * 0.05, -0.245, 0.44), 0.028, 0.028, WHITE, 'body', seg=8)
    b.sphere('neck', 0.11, (0, 0, 0.63), SKIN, 'body', seg=12, rings=8)
    # ── 袖子（寬口）與手 ──
    for sx, bone in ((-1, 'armL'), (1, 'armR')):
        sh = Vector((sx * 0.22, 0, 0.55))
        hand = Vector((sx * 0.43, -0.03, 0.36)) if sx < 0 else Vector((0.44, -0.12, 0.6))
        rod(b, 'sleeve', sh, sh + (hand - sh) * 0.86, 0.075, 0.12, ROBE, bone, seg=14)
        b.torus('cuff', 0.105, 0.016, tuple(sh + (hand - sh) * 0.86), ROBE_SHADE, bone, rot=tuple(Vector((0, 0, 1)).rotation_difference((hand - sh).normalized()).to_euler()), seg=14, tube=6)
        b.sphere('hand', 0.07, tuple(hand), SKIN, bone, seg=12, rings=8)
    # ── 大頭：臉頰、耳朵、大眼睛（黑眼珠＋白色高光）、腮紅、小嘴 ──
    b.sphere('head', 0.36, (0, 0, 0.94), SKIN, 'head', scale=(1.05, 0.98, 0.97), seg=28, rings=18)
    for sx in (-1, 1):
        b.sphere('ear', 0.075, (sx * 0.365, 0.02, 0.9), SKIN, 'head', scale=(0.55, 0.8, 1), seg=10, rings=8)
        b.sphere('eye', 0.098, (sx * 0.135, -0.322, 0.915), DARK, 'head', scale=(0.85, 0.42, 1.22), seg=16, rings=12)
        b.sphere('iris', 0.07, (sx * 0.135, -0.345, 0.9), '#4a8cff', 'head', scale=(0.8, 0.3, 1.0), seg=12, rings=8)
        b.sphere('eyehl', 0.034, (sx * 0.118, -0.358, 0.955), WHITE, 'head', scale=(1, 0.5, 1), seg=8, rings=6)
        b.sphere('eyehl2', 0.013, (sx * 0.158, -0.352, 0.885), WHITE, 'head', scale=(1, 0.5, 1), seg=6, rings=4)
        b.sphere('blush', 0.06, (sx * 0.235, -0.268, 0.83), BLUSH, 'head', scale=(1.1, 0.3, 0.6), seg=10, rings=6)
        b.sphere('brow', 0.03, (sx * 0.14, -0.318, 1.03), '#8a6a4a', 'head', scale=(1.6, 0.4, 0.45), rot=(0, sx * 0.25, 0), seg=8, rings=6)
    b.sphere('mouth', 0.03, (0, -0.352, 0.815), '#b8503c', 'head', scale=(1.2, 0.45, 0.7), seg=10, rings=6)
    # ── 斗笠：寬帽簷、帽緣滾邊、紅帶、帽頂小結、下巴的繩子 ──
    b.lathe('hat', [(0.6, 0.0), (0.61, 0.025), (0.4, 0.13), (0.17, 0.29), (0.03, 0.36)], (0, 0, 1.11), STRAW, 'head', seg=32)
    b.torus('hatrim', 0.605, 0.02, (0, 0, 1.122), STRAW_DARK, 'head', seg=32, tube=6)
    for r, z in ((0.5, 0.075), (0.3, 0.2)):
        b.torus('hatline', r, 0.008, (0, 0, 1.11 + z), STRAW_DARK, 'head', seg=28, tube=4)
    b.torus('hatband', 0.2, 0.03, (0, 0, 1.11 + 0.265), RED, 'head', seg=20, tube=6)
    b.sphere('hatknob', 0.045, (0, 0, 1.49), RED, 'head', seg=10, rings=6)
    for sx in (-1, 1):
        rod(b, 'strap', (sx * 0.36, -0.06, 1.12), (sx * 0.1, -0.2, 0.62), 0.012, 0.012, RED, 'head', seg=6)
    # ── 腳：白襪＋木屐（兩齒） ──
    for sx, bone in ((-1, 'legL'), (1, 'legR')):
        b.sphere('tabi', 0.11, (sx * 0.14, -0.1, 0.14), WHITE, bone, scale=(1, 1.45, 0.85), seg=12, rings=8)
        b.box('geta', (0.21, 0.34, 0.04), (sx * 0.14, -0.1, 0.06), WOOD, bone, bevel=0.012)
        for dy in (-0.08, 0.07):
            b.box('tooth', (0.19, 0.05, 0.045), (sx * 0.14, -0.1 + dy, 0.022), WOOD, bone)
        rod(b, 'thong', (sx * 0.14, -0.24, 0.09), (sx * 0.14, -0.1, 0.2), 0.012, 0.012, RED, bone, seg=6)
    # ── 竹竿（有節）與掛繩 ──
    tip = Vector((0.52, -0.22, 1.32))
    base = Vector((0.4, -0.06, 0.42))
    rod(b, 'pole', base, tip, 0.024, 0.02, BAMBOO, 'armR', seg=8)
    for k in (0.3, 0.62, 0.9):
        p = base + (tip - base) * k
        b.torus('node', 0.026, 0.007, tuple(p), '#6f7d40', 'armR', rot=tuple(Vector((0, 0, 1)).rotation_difference((tip - base).normalized()).to_euler()), seg=10, tube=4)
    lam = Vector((0.52, -0.22, 1.02))
    rod(b, 'string', tip, lam + Vector((0, 0, 0.2)), 0.008, 0.008, DARK, 'lantern', seg=5)
    # 燈籠的骨架、上下蓋、流蘇（燈籠紙本體是另一個會發光的網格）
    for z in (-0.14, -0.07, 0.0, 0.07, 0.14):
        rr = 0.17 * math.sqrt(max(0.05, 1 - (z / 0.215) ** 2))
        b.torus('rib', rr * 1.02, 0.009, tuple(lam + Vector((0, 0, z))), RED, 'lantern', seg=18, tube=4)
    b.cone('captop', 0.11, 0.09, 0.05, tuple(lam + Vector((0, 0, 0.215))), DARK, 'lantern', seg=14)
    b.cone('capbot', 0.09, 0.11, 0.05, tuple(lam + Vector((0, 0, -0.215))), DARK, 'lantern', seg=14)
    rod(b, 'tassel', lam + Vector((0, 0, -0.24)), lam + Vector((0, 0, -0.36)), 0.02, 0.006, RED, 'lantern', seg=6)
    body = b.join('Monk')
    g = Builder()
    g.sphere('paper', 0.17, tuple(lam), LAMP, 'lantern', scale=(1, 1, 1.25), seg=18, rings=12)
    glow = g.join('GlowLantern')

    arm = lib.make_armature('MonkRig', {
        'root': ((0, 0, 0), (0, 0, 0.12), None),
        'body': ((0, 0, 0.14), (0, 0, 0.6), 'root'),
        'head': ((0, 0, 0.62), (0, 0, 1.1), 'body'),
        'armL': ((-0.22, 0, 0.55), (-0.22, 0, 0.75), 'body'),
        'armR': ((0.22, 0, 0.55), (0.22, 0, 0.75), 'body'),
        'legL': ((-0.14, 0, 0.26), (-0.14, 0, 0.4), 'root'),
        'legR': ((0.14, 0, 0.26), (0.14, 0, 0.4), 'root'),
        'lantern': ((0.52, -0.22, 1.32), (0.52, -0.22, 1.5), 'armR'),
    })
    lib.bind(body, arm)
    lib.bind(glow, arm)
    # 走路（16 幀循環）：兩腳前後擺、手跟著擺、身體上下彈＋左右晃、頭反向穩住、燈籠晃
    s = 0.6
    lib.make_action(arm, 'walk', 16, {
        'legL': {1: {'rot': (s, 0, 0)}, 5: {'rot': (0, 0, 0), 'loc': (0, 0.05, 0)}, 9: {'rot': (-s, 0, 0), 'loc': (0, 0, 0)}, 13: {'rot': (0, 0, 0)}, 17: {'rot': (s, 0, 0)}},
        'legR': {1: {'rot': (-s, 0, 0)}, 5: {'rot': (0, 0, 0)}, 9: {'rot': (s, 0, 0)}, 13: {'rot': (0, 0, 0), 'loc': (0, 0.05, 0)}, 17: {'rot': (-s, 0, 0), 'loc': (0, 0, 0)}},
        'armL': {1: {'rot': (-0.5, 0, 0)}, 9: {'rot': (0.5, 0, 0)}, 17: {'rot': (-0.5, 0, 0)}},
        'armR': {1: {'rot': (0.12, 0, 0)}, 9: {'rot': (-0.12, 0, 0)}, 17: {'rot': (0.12, 0, 0)}},
        'body': {1: {'loc': (0, 0, 0), 'rot': (0.06, 0, 0.06)}, 5: {'loc': (0, 0.045, 0), 'rot': (0.06, 0, 0)}, 9: {'loc': (0, 0, 0), 'rot': (0.06, 0, -0.06)}, 13: {'loc': (0, 0.045, 0), 'rot': (0.06, 0, 0)}, 17: {'loc': (0, 0, 0), 'rot': (0.06, 0, 0.06)}},
        'head': {1: {'rot': (-0.04, 0, -0.05)}, 9: {'rot': (-0.04, 0, 0.05)}, 17: {'rot': (-0.04, 0, -0.05)}},
        'lantern': {1: {'rot': (0.25, 0, 0.2)}, 9: {'rot': (-0.25, 0, -0.2)}, 17: {'rot': (0.25, 0, 0.2)}},
    })
    # 待機（48 幀循環）：呼吸、頭輕輕歪、燈籠慢慢晃
    lib.make_action(arm, 'idle', 48, {
        'body': {1: {'loc': (0, 0, 0)}, 25: {'loc': (0, 0.014, 0)}, 49: {'loc': (0, 0, 0)}},
        'head': {1: {'rot': (0, 0, 0.03)}, 25: {'rot': (0.02, 0, -0.03)}, 49: {'rot': (0, 0, 0.03)}},
        'armL': {1: {'rot': (0, 0, 0)}, 25: {'rot': (0.05, 0, 0)}, 49: {'rot': (0, 0, 0)}},
        'lantern': {1: {'rot': (0.08, 0, 0.1)}, 25: {'rot': (-0.08, 0, -0.1)}, 49: {'rot': (0.08, 0, 0.1)}},
    })
    lib.export_glb(OUT + '/chochin-kozo.glb', [body, glow, arm], animations=True)
    return sum(len(o.data.polygons) for o in (body, glow))


def build_torii():
    lib.reset()
    b = Builder()
    for sx in (-1, 1):
        b.cone('base', 0.3, 0.26, 0.22, (sx * 1.25, 0, 0.11), STONE, seg=14)
        b.cone('basering', 0.24, 0.22, 0.12, (sx * 1.25, 0, 0.28), DARK, seg=14)
        rod(b, 'pillar', (sx * 1.25, 0, 0.3), (sx * 1.17, 0, 3.0), 0.17, 0.145, VERMILION, None, seg=14)
        # 貫的楔子
        b.box('wedge', (0.1, 0.42, 0.12), (sx * 1.42, 0, 2.28), DARK, bevel=0.01)
    b.box('nuki', (3.1, 0.16, 0.2), (0, 0, 2.28), VERMILION, bevel=0.02)
    b.box('gaku', (0.34, 0.1, 0.46), (0, 0, 2.62), DARK, bevel=0.02)
    b.box('gakuin', (0.24, 0.12, 0.34), (0, -0.005, 2.62), '#e9c46a', bevel=0.01)
    # 島木與笠木：兩端往上翹（把方塊的頂點依 x 的平方抬高）
    for name, size, z, color, lift in (('shimaki', (3.5, 0.24, 0.2), 3.02, VERMILION, 0.05), ('kasagi', (4.0, 0.36, 0.16), 3.2, DARK, 0.075)):
        ob = b.box(name, size, (0, 0, z), color, bevel=0.03)
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 1.0], cuts=10)
        for v in bm.verts:
            v.co.z += lift * (v.co.x / (size[0] / 2)) ** 2 * 2.2
        bm.to_mesh(ob.data)
        bm.free()
        attr = ob.data.color_attributes.get('Color') or ob.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        col = lib.hex_color(color)
        for d in attr.data:
            d.color = col
    # 注連繩與紙垂
    for i in range(12):
        x = -1.05 + i * (2.1 / 11)
        sag = 0.12 * (1 - ((x / 1.05) ** 2))
        b.sphere('rope', 0.07, (x, -0.02, 2.05 - sag), ROPE, scale=(1.5, 1, 1), seg=8, rings=6)
    for x in (-0.6, 0, 0.6):
        sag = 0.12 * (1 - ((x / 1.05) ** 2))
        for k in range(3):
            b.box('shide', (0.1, 0.012, 0.11), (x + (0.04 if k % 2 else -0.04), -0.03, 1.93 - sag - k * 0.1), WHITE, rot=(0, 0, 0))
    ob = b.join('Torii')
    lib.export_glb(OUT + '/torii.glb', [ob], animations=False)
    return len(ob.data.polygons)


if __name__ == '__main__':
    n1 = build_chochin()
    n2 = build_torii()
    print('faces: chochin', n1, 'torii', n2)
