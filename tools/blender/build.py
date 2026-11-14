"""Blender 試作（docs/26）：用腳本建「提燈小僧」（帶骨架與走路、待機動畫）與「鳥居」，匯出 .glb。
用法：python3 tools/blender/build.py <裝了 bpy 的資料夾> <輸出資料夾>
（bpy 的安裝：pip install --target <資料夾> bpy；不進版本庫。）"""
import sys
import math

sys.path.insert(0, sys.argv[1])
OUT = sys.argv[2]
sys.path.insert(0, __file__.rsplit('/', 1)[0])

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402
import audit  # noqa: E402
from lib import Builder  # noqa: E402

# 顏色（和 src/art/palette.ts 對齊）
ROBE = '#3b52a8'
ROBE_SHADE = '#27387f'
SASH = '#f08a3c'
SKIN = '#ffd8bd'
BLUSH = '#ff7f7a'
STRAW = '#f2bd5a'
STRAW_DARK = '#c98f34'
RED = '#e4503f'
DARK = '#2b2530'
WHITE = '#ffffff'
WOOD = '#8a5a34'
BAMBOO = '#9aa860'
LAMP = '#ffcf7a'
VERMILION = '#f0361f'
STONE = '#9a9488'
ROPE = '#e6d6a8'
HAIR = '#5a3b33'
HEM = '#f3f0ff'
INK = '#3a2438'


def rod(b, name, p1, p2, r1, r2, color, bone, seg=10):
    p1 = Vector(p1)
    p2 = Vector(p2)
    d = p2 - p1
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    return b.cone(name, r1, r2, d.length, tuple((p1 + p2) / 2), color, bone, rot=tuple(rot), seg=seg)


# ── 頭的幾何（D88 第四版）：五官位置用橢球公式算在表面上，不憑感覺 ──
HC_Z = 0.94
HR = 0.36
HS = (1.1, 0.98, 0.96)


def head_y(x, z):
    """頭（橢球）表面在 (x, z) 處的 y（臉朝 -Y，所以是負的）"""
    t = 1 - (x / (HR * HS[0])) ** 2 - ((z - HC_Z) / (HR * HS[2])) ** 2
    return -HS[1] * HR * math.sqrt(max(t, 0.0))


def head_tilt(x, z):
    """表面法線的傾角（繞 X、Z 軸的弧度）：貼在表面上的五官依它轉，才不會在臉頰兩側翹出來"""
    a, b, c = HR * HS[0], HR * HS[1], HR * HS[2]
    y = head_y(x, z)
    nx, nz, ny = x / a ** 2, (z - HC_Z) / c ** 2, y / b ** 2
    return -math.atan2(nz, -ny), math.atan2(nx, -ny)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def hairline(x, y):
    """髮際線高度：前面是瀏海（中間微微分開、兩側垂下、有兩個瀏海尖），側面在耳朵上方，後面一路到後頸。頭髮是一整片，所以瀏海和後腦自然連在一起"""
    f = smooth((-y + 0.02) / 0.32)
    ax = abs(x)
    front = 1.05 - 0.08 * smooth(ax / 0.30) + 0.025 * (1 - smooth(ax / 0.07)) - 0.04 * math.exp(-(((ax - 0.17) / 0.05) ** 2))
    back = 0.72
    h = back + (front - back) * f
    # 耳朵上方：髮際線平滑地抬到 0.97（用平滑權重，不是硬切換，不然耳邊會有階梯）
    # 前緣從臉側就開始（y = -0.36），不然耳朵前面會先掉下去再抬起來，形成一個缺口（轉檯圖左側那一格抓到的）
    e = smooth((ax - 0.24) / 0.1) * smooth((y + 0.36) / 0.1) * smooth((0.28 - y) / 0.1)
    return h + (max(h, 0.97) - h) * e


def hair_shell(b, name):
    """貼著頭骨的一整片頭髮外殼：一顆比頭略大的橢球，低於髮際線的頂點沿球面收到髮際線上"""
    r = HR * 1.045
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=56, v_segments=36, radius=r)
    def is_low(v):
        return HC_Z + v.co.z * HS[2] < hairline(v.co.x * HS[0], v.co.y * HS[1])

    # 整面都低於髮際線的面刪掉（不然下半球會攤開蓋在臉上）；留下的面裡低於髮際線的邊界點，沿球面貼到髮際線上
    dead = [f for f in bm.faces if all(is_low(v) for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    for v in list(bm.verts):
        if not v.link_faces:
            bm.verts.remove(v)
    for v in bm.verts:
        if is_low(v):
            H = hairline(v.co.x * HS[0], v.co.y * HS[1])
            zl = (H - HC_Z) / HS[2]
            den = math.sqrt(max(r * r - v.co.z ** 2, 1e-9))
            k = math.sqrt(max(r * r - zl * zl, 0.0)) / den
            v.co.x *= k
            v.co.y *= k
            v.co.z = zl
    return b._finish(bm, name, HAIR, 'head', (0, 0, HC_Z), (0, 0, 0), HS)


# 稽核用：哪些零件是頭、頭髮、眼睛、嘴（名稱是 Builder 零件名，不含 .001 這種流水號）
CHOCHIN_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'mouth': ['mouth']}


def build_chochin():
    lib.reset()
    b = Builder()
    # ── 身體（D88 第二版）：短胖的僧衣，下襬一條淺色滾邊、細腰帶＋背後的蝴蝶結、清楚的白色交領 ──
    b.lathe('robe', [(0.28, 0.2), (0.325, 0.24), (0.315, 0.32), (0.27, 0.44), (0.205, 0.57), (0.115, 0.64)], (0, 0, 0), ROBE, 'body', seg=28)
    b.torus('hem', 0.322, 0.024, (0, 0, 0.212), HEM, 'body', seg=28, tube=6)
    b.torus('hem2', 0.318, 0.012, (0, 0, 0.262), ROBE_SHADE, 'body', seg=28, tube=5)
    b.torus('sash', 0.286, 0.032, (0, 0, 0.4), SASH, 'body', seg=28, tube=8, scale=(1, 1, 1.15))
    for sx in (-1, 1):
        b.sphere('loop', 0.07, (sx * 0.085, 0.3, 0.42), SASH, 'body', scale=(1.2, 0.5, 0.85), rot=(0, sx * 0.3, 0), seg=12, rings=8)
        b.box('tail', (0.06, 0.025, 0.17), (sx * 0.05, 0.31, 0.3), SASH, 'body', rot=(0.15, 0, sx * 0.2), bevel=0.01)
    b.sphere('knotc', 0.04, (0, 0.305, 0.415), '#d06f2a', 'body', seg=10, rings=6)
    # 交領：左右兩片白領在胸前交叉成 V
    for sx in (-1, 1):
        rod(b, 'collar', (sx * 0.12, -0.11, 0.635), (-sx * 0.025, -0.268, 0.43), 0.04, 0.034, WHITE, 'body', seg=8)
    b.sphere('neck', 0.11, (0, 0, 0.63), SKIN, 'body', seg=12, rings=8)
    # ── 袖子（寬口）與手 ──
    for sx, bone in ((-1, 'armL'), (1, 'armR')):
        sh = Vector((sx * 0.22, 0, 0.55))
        hand = Vector((sx * 0.43, -0.03, 0.36)) if sx < 0 else Vector((0.485, -0.073, 0.6))
        rod(b, 'sleeve', sh, sh + (hand - sh) * 0.86, 0.075, 0.12, ROBE, bone, seg=14)
        b.torus('cuff', 0.105, 0.016, tuple(sh + (hand - sh) * 0.86), HEM, bone, rot=tuple(Vector((0, 0, 1)).rotation_difference((hand - sh).normalized()).to_euler()), seg=14, tube=6)
        b.sphere('hand', 0.085, tuple(hand), SKIN, bone, seg=12, rings=8)
    # ── 頭（第四版，使用者：「五官正確的位置」「瀏海跟後面頭髮分離」）──
    # 五官：眼睛在臉的上半部偏下（髮際線到下巴的 45% 處）、眼距約一個眼寬、嘴在 75% 處；位置用 head_y 算在表面上、依法線傾斜。
    # 頭髮：一整片貼著頭骨的外殼（hair_shell），髮際線是連續曲線，瀏海、鬢角、後頸同一片。
    b.sphere('head', HR, (0, 0, HC_Z), SKIN, 'head', scale=HS, seg=32, rings=20)
    hair_shell(b, 'hair')
    for sx in (-1, 1):
        b.sphere('ear', 0.075, (sx * 0.385, 0.02, 0.88), SKIN, 'head', scale=(0.55, 0.8, 1), seg=10, rings=8)
        ex, ez = sx * 0.132, 0.865
        rx, rz = head_tilt(ex, ez)
        b.sphere('eye', 0.086, (ex, head_y(ex, ez) + 0.004, ez), ('#2a1830', '#a8601e'), 'head', scale=(0.76, 0.36, 1.22), rot=(rx, 0, rz), seg=20, rings=14)
        hx, hz = ex - sx * 0.02, ez + 0.052
        b.sphere('hl', 0.032, (hx, head_y(hx, hz) - 0.02, hz), WHITE, 'head', scale=(1.0, 0.3, 1.2), rot=head_tilt(hx, hz)[0:1] + (0, head_tilt(hx, hz)[1]), seg=10, rings=8)
        bx, bz = sx * 0.255, 0.765
        b.sphere('blush', 0.056, (bx, head_y(bx, bz) + 0.004, bz), ('#ff9a92', '#ff8088'), 'head', scale=(1.1, 0.3, 0.6), rot=(head_tilt(bx, bz)[0], 0, head_tilt(bx, bz)[1]), seg=12, rings=8)
    # 嘴：一條小小的微笑弧線（兩小段），在眼睛和下巴之間偏下
    mz = 0.715
    for a, c in (((-0.04, mz + 0.012), (0.0, mz)), ((0.0, mz), (0.04, mz + 0.012))):
        rod(b, 'mouth', (a[0], head_y(a[0], a[1]) + 0.004, a[1]), (c[0], head_y(c[0], c[1]) + 0.004, c[1]), 0.014, 0.014, '#7a2030', 'head', seg=6)
    # ── 斗笠（第二版）：抬高、小一圈、前緣微微翹起，露出額頭與瀏海；去掉下巴的紅帶 ──
    HZ = 1.2
    TILT = -0.15
    b.lathe('hat', [(0.52, 0.0), (0.53, 0.02), (0.36, 0.11), (0.16, 0.25), (0.03, 0.31)], (0, 0, HZ), STRAW, 'head', seg=32, rot=(TILT, 0, 0))
    b.torus('hatrim', 0.525, 0.018, (0, 0, HZ + 0.012), STRAW_DARK, 'head', seg=32, tube=6, rot=(TILT, 0, 0))
    for r, z in ((0.445, 0.065), (0.247, 0.19)):  # 半徑 = 帽面在那個高度的半徑（稽核抓到以前第二圈浮在外面）
        b.torus('hatline', r, 0.007, (0, -z * math.sin(TILT), HZ + z), STRAW_DARK, 'head', seg=28, tube=4, rot=(TILT, 0, 0))
    b.torus('hatband', 0.17, 0.028, (0, -0.22 * math.sin(TILT), HZ + 0.22), RED, 'head', seg=20, tube=6, rot=(TILT, 0, 0))
    b.sphere('hatknob', 0.04, (0, -0.33 * math.sin(TILT), HZ + 0.325), RED, 'head', seg=10, rings=6)
    # ── 腳：白襪＋木屐（兩齒） ──
    for sx, bone in ((-1, 'legL'), (1, 'legR')):
        b.sphere('tabi', 0.11, (sx * 0.14, -0.1, 0.14), WHITE, bone, scale=(1, 1.45, 0.85), seg=12, rings=8)
        b.box('geta', (0.21, 0.34, 0.04), (sx * 0.14, -0.1, 0.06), WOOD, bone, bevel=0.012)
        for dy in (-0.08, 0.07):
            b.box('tooth', (0.19, 0.05, 0.045), (sx * 0.14, -0.1 + dy, 0.022), WOOD, bone)
        rod(b, 'thong', (sx * 0.14, -0.24, 0.09), (sx * 0.14, -0.1, 0.2), 0.012, 0.012, RED, bone, seg=6)
    # ── 竹竿（有節）與掛繩 ──
    tip = Vector((0.66, -0.1, 0.97))  # 燈籠舉在身體右側外面：提在胸口高度、身體右側外面。以前在臉的高度，右前方看過去會擋住臉（轉檯圖第 2 格抓到的）
    base = Vector((0.4, -0.06, 0.42))
    rod(b, 'pole', base, tip, 0.024, 0.02, BAMBOO, 'armR', seg=8)
    for k in (0.3, 0.62, 0.9):
        p = base + (tip - base) * k
        b.torus('node', 0.026, 0.007, tuple(p), '#6f7d40', 'armR', rot=tuple(Vector((0, 0, 1)).rotation_difference((tip - base).normalized()).to_euler()), seg=10, tube=4)
    lam = Vector((0.66, -0.1, 0.68))
    rod(b, 'string', tip, lam + Vector((0, 0, 0.2)), 0.008, 0.008, DARK, 'lantern', seg=5)
    # 燈籠的骨架、上下蓋、流蘇（燈籠紙本體是另一個會發光的網格）
    for z in (-0.14, -0.07, 0.0, 0.07, 0.14):
        rr = 0.17 * math.sqrt(max(0.05, 1 - (z / 0.215) ** 2))
        b.torus('rib', rr * 1.02, 0.009, tuple(lam + Vector((0, 0, z))), RED, 'lantern', seg=18, tube=4)
    b.cone('captop', 0.11, 0.09, 0.05, tuple(lam + Vector((0, 0, 0.215))), DARK, 'lantern', seg=14)
    b.cone('capbot', 0.09, 0.11, 0.05, tuple(lam + Vector((0, 0, -0.215))), DARK, 'lantern', seg=14)
    rod(b, 'tassel', lam + Vector((0, 0, -0.22)), lam + Vector((0, 0, -0.36)), 0.02, 0.006, RED, 'lantern', seg=6)
    # 數字稽核（docs/29）：頭髮連續、五官位置、懸空零件；不過就不匯出
    g = Builder()
    g.sphere('paper', 0.17, tuple(lam), LAMP, 'lantern', scale=(1, 1, 1.25), seg=18, rings=12)
    audit.run(b.parts + g.parts, CHOCHIN_SPEC, '提燈小僧')
    body = b.join('Monk')
    glow = g.join('GlowLantern')

    arm = lib.make_armature('MonkRig', {
        'root': ((0, 0, 0), (0, 0, 0.12), None),
        'body': ((0, 0, 0.14), (0, 0, 0.6), 'root'),
        'head': ((0, 0, 0.62), (0, 0, 1.1), 'body'),
        'armL': ((-0.22, 0, 0.55), (-0.22, 0, 0.75), 'body'),
        'armR': ((0.22, 0, 0.55), (0.22, 0, 0.75), 'body'),
        'legL': ((-0.14, 0, 0.26), (-0.14, 0, 0.4), 'root'),
        'legR': ((0.14, 0, 0.26), (0.14, 0, 0.4), 'root'),
        'lantern': ((0.66, -0.1, 0.97), (0.66, -0.1, 1.15), 'armR'),
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
