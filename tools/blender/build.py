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
import atlas  # noqa: E402
import paint_atlas  # noqa: E402
from lib import Builder  # noqa: E402
from atlas import CHOCHIN as CA, rect_uv  # noqa: E402

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
GOLD = '#f2c14e'
FLAME = '#ff9a3c'
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


def use_head(cz, r, sc):
    """切換「目前的頭」（head_y、head_tilt、hair_shell 都讀這組）：玩家角色的頭與敵人的頭大小不同"""
    global HC_Z, HR, HS
    HC_Z, HR, HS = cz, r, sc


def hair_shell(b, name, line=None, color=None, seg=(56, 36), grow=1.045):
    """貼著頭骨的一整片頭髮外殼：一顆比頭略大的橢球，低於髮際線的頂點沿球面收到髮際線上"""
    line = line or hairline
    r = HR * grow  # 低面數時頭的稜角會刺穿頭髮，要放大一點（稽核會抓）
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=r)
    def is_low(v):
        return HC_Z + v.co.z * HS[2] < line(v.co.x * HS[0], v.co.y * HS[1])

    # 整面都低於髮際線的面刪掉（不然下半球會攤開蓋在臉上）；留下的面裡低於髮際線的邊界點，沿球面貼到髮際線上
    dead = [f for f in bm.faces if all(is_low(v) for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    for v in list(bm.verts):
        if not v.link_faces:
            bm.verts.remove(v)
    for v in bm.verts:
        if is_low(v):
            H = line(v.co.x * HS[0], v.co.y * HS[1])
            zl = (H - HC_Z) / HS[2]
            den = math.sqrt(max(r * r - v.co.z ** 2, 1e-9))
            k = math.sqrt(max(r * r - zl * zl, 0.0)) / den
            v.co.x *= k
            v.co.y *= k
            v.co.z = zl
    return b._finish(bm, name, color or HAIR, 'head', (0, 0, HC_Z), (0, 0, 0), HS)


def decal(b, name, cx, cz, w, h, rect, bone='head', lift=0.0015, n=(6, 6)):
    """畫出來的五官（docs/37）：從頭的表面切下一小片（貼著曲面、往外浮 lift 公尺），貼上貼圖集裡 rect 那一格。
    做成有厚度的薄殼（背面在頭皮裡面 6 公釐）：和頭相交，稽核的「五官貼在臉上」「懸空零件」照樣量得到；
    零件的外框 = 貼圖那一格的範圍，所以稽核量到的眼寬、眼距、嘴的高度就是畫出來的位置。"""
    bm = bmesh.new()
    nx, nz = n

    def surf(x, z, off):
        y = head_y(x, z)
        a, bb, c = HR * HS[0], HR * HS[1], HR * HS[2]
        nv = Vector((x / a ** 2, y / bb ** 2, (z - HC_Z) / c ** 2)).normalized()
        return Vector((x, y, z)) + nv * off

    grids = []
    for off in (lift, -0.006):
        g = []
        for j in range(nz + 1):
            row = []
            for i in range(nx + 1):
                x = cx - w / 2 + w * i / nx
                z = cz - h / 2 + h * j / nz
                row.append(bm.verts.new(surf(x, z, off)))
            g.append(row)
        grids.append(g)
    front, back = grids
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((front[j][i], front[j + 1][i], front[j + 1][i + 1], front[j][i + 1]))
            bm.faces.new((back[j][i], back[j][i + 1], back[j + 1][i + 1], back[j + 1][i]))
    edge = [front[0][i] for i in range(nx + 1)] + [front[j][nx] for j in range(1, nz + 1)] + [front[nz][i] for i in range(nx - 1, -1, -1)] + [front[j][0] for j in range(nz - 1, 0, -1)]
    edgeb = [back[0][i] for i in range(nx + 1)] + [back[j][nx] for j in range(1, nz + 1)] + [back[nz][i] for i in range(nx - 1, -1, -1)] + [back[j][0] for j in range(nz - 1, 0, -1)]
    for k in range(len(edge)):
        a, c = edge[k], edge[(k + 1) % len(edge)]
        bm.faces.new((a, c, edgeb[(k + 1) % len(edge)], edgeb[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    b.uv(('fn', lambda co: rect_uv(rect, (co.x - (cx - w / 2)) / w, 1 - (co.z - (cz - h / 2)) / h)))
    ob = b._finish(bm, name, WHITE, bone)
    # 法線照抄頭的（頭的法線是在粗網格上內插的，和真正的橢球法線有一點差）：不抄的話，卡通著色的明暗在貼片上和旁邊的臉不一樣，
    # 深色皮膚（河童、赤鬼）會看到一個方框（第二批轉檯圖抓到的）
    head = next((p for p in b.parts if p.name.split('.')[0] == 'head'), None)
    if head is not None:
        m = ob.modifiers.new('nrm', 'DATA_TRANSFER')
        m.object = head
        m.use_loop_data = True
        m.data_types_loops = {'CUSTOM_NORMAL'}
        m.loop_mapping = 'POLYINTERP_NEAREST'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=m.name)
    return ob


# 稽核用：哪些零件是頭、頭髮、眼睛、嘴（名稱是 Builder 零件名，不含 .001 這種流水號）
# 畫出來的眼睛：中心、貼片大小（貼片 = 貼圖那一格，畫的眼睛約佔 84% 寬、80% 高）
EYE_X, EYE_Z, EYE_W, EYE_H = 0.14, 0.862, 0.145, 0.235
# 頭髮的頂點色比 HAIR 亮一點：貼圖（髮束線條＋天使環）平均約 0.83，乘上去之後整體亮度和以前差不多
HAIR_TEX = '#6a463c'
CHOCHIN_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'mouth': ['mouth'], 'loose_ok': ['halo', 'haloflame', 'minilamp', 'minicap']}


def build_chochin(form=0):
    """form 0 = 一般；1 = 化身一「燈籠僧」（金邊、斗笠垂穗、燈籠變大＋火冠）；2 = 化身二「百燈法師」（再加火焰光背、身邊兩盞小燈籠）。D94、docs/33。"""
    lib.reset()
    paint_atlas.paint(OUT.rsplit('/', 1)[0] + '/textures')  # 貼圖集（docs/37）：每次建模都重畫，版面和 UV 一定對得上
    b = Builder(atlas_white=rect_uv(CA['white'], 0.5, 0.5))
    cyl = lambda key: ('cyl', lambda s_, t_: rect_uv(CA[key], s_, t_))  # noqa: E731
    trim = GOLD if form else HEM
    # ── 身體（D88 第二版）：短胖的僧衣，下襬一條淺色滾邊、細腰帶＋背後的蝴蝶結、清楚的白色交領 ──
    b.uv(cyl('robe')).lathe('robe', [(0.28, 0.2), (0.325, 0.24), (0.315, 0.32), (0.27, 0.44), (0.205, 0.57), (0.115, 0.64)], (0, 0, 0), ROBE, 'body', seg=28)
    b.torus('hem', 0.322, 0.024, (0, 0, 0.212), trim, 'body', seg=28, tube=6)
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
        b.uv(cyl('robe'))
        rod(b, 'sleeve', sh, sh + (hand - sh) * 0.86, 0.075, 0.12, ROBE, bone, seg=14)
        b.torus('cuff', 0.105, 0.016, tuple(sh + (hand - sh) * 0.86), trim, bone, rot=tuple(Vector((0, 0, 1)).rotation_difference((hand - sh).normalized()).to_euler()), seg=14, tube=6)
        b.sphere('hand', 0.085, tuple(hand), SKIN, bone, seg=12, rings=8)
    # ── 頭（第四版，使用者：「五官正確的位置」「瀏海跟後面頭髮分離」）──
    # 五官：眼睛在臉的上半部偏下（髮際線到下巴的 45% 處）、眼距約一個眼寬、嘴在 75% 處；位置用 head_y 算在表面上、依法線傾斜。
    # 頭髮：一整片貼著頭骨的外殼（hair_shell），髮際線是連續曲線，瀏海、鬢角、後頸同一片。
    b.sphere('head', HR, (0, 0, HC_Z), SKIN, 'head', scale=HS, seg=32, rings=22)
    b.uv(cyl('hair'))
    hair_shell(b, 'hair', color=HAIR_TEX)
    for sx in (-1, 1):
        b.sphere('ear', 0.075, (sx * 0.385, 0.02, 0.88), SKIN, 'head', scale=(0.55, 0.8, 1), seg=10, rings=8)
    # 第五版（docs/37 第一批）：臉是「畫出來的」——眼睛（虹彩漸層、瞳孔、兩個高光、上眼皮與睫毛）、嘴、腮紅都是貼圖，貼在貼著臉的薄片上。
    # 位置仍用 head_y 算在表面上；稽核量的是貼片的範圍（= 畫的範圍）。
    for sx in (-1, 1):
        decal(b, 'eye', sx * EYE_X, EYE_Z, EYE_W, EYE_H, CA['eyeR' if sx > 0 else 'eyeL'], lift=0.002)
        decal(b, 'blush', sx * 0.268, 0.74, 0.12, 0.08, CA['blush'], lift=0.001)
    decal(b, 'mouth', 0.0, 0.706, 0.09, 0.058, CA['mouth'], n=(5, 4))
    # ── 斗笠（第二版）：抬高、小一圈、前緣微微翹起，露出額頭與瀏海；去掉下巴的紅帶 ──
    HZ = 1.2
    TILT = -0.15
    b.uv(cyl('straw')).lathe('hat', [(0.52, 0.0), (0.53, 0.02), (0.36, 0.11), (0.16, 0.25), (0.03, 0.31)], (0, 0, HZ), STRAW, 'head', seg=32, rot=(TILT, 0, 0))
    b.torus('hatrim', 0.525, 0.018, (0, 0, HZ + 0.012), STRAW_DARK, 'head', seg=32, tube=6, rot=(TILT, 0, 0))
    for r, z in ((0.445, 0.065), (0.247, 0.19)):  # 半徑 = 帽面在那個高度的半徑（稽核抓到以前第二圈浮在外面）
        b.torus('hatline', r, 0.007, (0, -z * math.sin(TILT), HZ + z), STRAW_DARK, 'head', seg=28, tube=4, rot=(TILT, 0, 0))
    b.torus('hatband', 0.17, 0.028, (0, -0.22 * math.sin(TILT), HZ + 0.22), RED, 'head', seg=20, tube=6, rot=(TILT, 0, 0))
    b.sphere('hatknob', 0.04, (0, -0.33 * math.sin(TILT), HZ + 0.325), RED, 'head', seg=10, rings=6)
    if form:
        # 化身：斗笠兩側垂下紅穗（從帽緣往下）
        for sx in (-1, 1):
            top = Vector((sx * 0.5, 0, HZ + 0.01))
            rod(b, 'hattassel', top, top + Vector((sx * 0.03, 0, -0.26)), 0.016, 0.01, RED, 'head', seg=6)
            b.sphere('hattasselball', 0.035, tuple(top + Vector((sx * 0.03, 0, -0.27))), GOLD, 'head', seg=10, rings=6)
    # ── 腳：白襪＋木屐（兩齒） ──
    for sx, bone in ((-1, 'legL'), (1, 'legR')):
        b.sphere('tabi', 0.11, (sx * 0.14, -0.1, 0.14), WHITE, bone, scale=(1, 1.45, 0.85), seg=12, rings=8)
        b.uv(('fn', lambda co: rect_uv(CA['wood'], co.x / 0.21 + 0.5, co.y / 0.34 + 0.5)))
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
    ls = 1.1 if form else 1.0  # 化身：燈籠大一號（1.25 時右側看過去整張臉被擋住，轉檯圖第 3 格）
    rod(b, 'string', tip, lam + Vector((0, 0, 0.2)), 0.008, 0.008, DARK, 'lantern', seg=5)
    # 燈籠的骨架、上下蓋、流蘇（燈籠紙本體是另一個會發光的網格）
    for z in (-0.14, -0.07, 0.0, 0.07, 0.14):
        rr = 0.17 * ls * math.sqrt(max(0.05, 1 - (z / 0.215) ** 2))
        b.torus('rib', rr * 1.02, 0.009, tuple(lam + Vector((0, 0, z * ls))), GOLD if form else RED, 'lantern', seg=18, tube=4)
    b.cone('captop', 0.11 * ls, 0.09 * ls, 0.05, tuple(lam + Vector((0, 0, 0.215 * ls))), DARK, 'lantern', seg=14)
    b.cone('capbot', 0.09 * ls, 0.11 * ls, 0.05, tuple(lam + Vector((0, 0, -0.215 * ls))), DARK, 'lantern', seg=14)
    rod(b, 'tassel', lam + Vector((0, 0, -0.22 * ls)), lam + Vector((0, 0, -0.36 * ls)), 0.02, 0.006, RED, 'lantern', seg=6)
    # 燈籠紙（docs/37）：身體的一部分（貼圖的真實顏色＋發光貼圖），不再是獨立的發光網格——少一次 draw call，紙上看得到竹骨的影子與家紋
    b.uv(cyl('paper')).sphere('paper', 0.17 * ls, tuple(lam), WHITE, 'lantern', scale=(1, 1, 1.25), seg=20, rings=14)
    # 數字稽核（docs/29）：頭髮連續、五官位置、懸空零件；不過就不匯出
    g = Builder()
    if form:
        # 火冠：燈籠頂上三片火舌（發光）
        for k, a in enumerate((-0.5, 0, 0.5)):
            p = lam + Vector((math.sin(a) * 0.07, 0, 0.215 * ls + 0.06))
            # 圓頭的火舌（拉長的球，不用尖錐：風格規則不留銳利的邊；轉檯圖第 3 格看起來像鑽頭）
            g.sphere('flamecrown', 0.05 if k != 1 else 0.06, tuple(p + Vector((0, 0, 0.06))), FLAME, 'lantern', scale=(0.75, 0.75, 1.9), rot=(0, a * 0.6, 0), seg=12, rings=8)
    if form >= 2:
        # 火焰光背：背後一圈立著的火環（發光，不接觸身體）＋身邊兩盞浮著的小燈籠
        g.torus('halo', 0.46, 0.035, (0, 0.34, 0.95), FLAME, 'body', rot=(math.pi / 2, 0, 0), seg=32, tube=8)
        for k in range(10):
            a = k / 10 * math.pi * 2
            g.sphere('haloflame', 0.045, (math.cos(a) * 0.51, 0.34, 0.95 + math.sin(a) * 0.51), FLAME, 'body', scale=(0.7, 0.7, 1.7), rot=(0, -a + math.pi / 2, 0), seg=10, rings=6)
        for sx in (-1, 1):
            c = Vector((sx * 0.72, 0.18, 0.5))  # 腰的兩側（1.15 時塞在帽緣底下；0.82 時側面看擋在臉頰前面，轉檯圖第 3、5 格）
            g.sphere('minilamp', 0.085, tuple(c), LAMP, 'body', scale=(1, 1, 1.25), seg=12, rings=8)
            b.cone('minicap', 0.05, 0.04, 0.025, tuple(c + Vector((0, 0, 0.11))), DARK, 'body', seg=10)
    audit.run(b.parts + g.parts, CHOCHIN_SPEC, '提燈小僧' + ('' if not form else f'（化身{form}）'))
    body = b.join('Monk')
    glow = g.join('GlowLantern') if g.parts else None

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
    if glow:
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
    objs = [body] + ([glow] if glow else [])
    lib.export_glb(OUT + '/chochin-kozo' + ('' if not form else f'-f{form}') + '.glb', objs + [arm], animations=True)
    return sum(len(o.data.polygons) for o in objs)


# ── 河童（D88 重新設計，照 docs/28 的臉部規則與 docs/29 的驗收）──
K_SKIN = '#66a67c'
K_SKIN_D = '#3f9a58'
K_BELLY = '#e6f3c6'
K_SHELL = '#6b4f2c'
K_SHELL_L = '#9c7a40'
K_HAIR = '#1f6b4a'
K_HAIR_TEX = '#237652'  # 髮束貼圖（平均約 0.88）乘上去之後和舊的 K_HAIR 差不多亮
K_SHELL_TEX = '#76582f'  # 龜殼貼圖（甲片的暗溝）乘上去之後整體和舊的 K_SHELL 差不多
K_BEAK = '#ffc23d'
K_DISH = '#f4f8f2'
K_WATER = '#7fd6e8'
K_CRYSTAL = '#aef0ff'
K_CAPE = '#4fb8d6'
K_LOTUS = '#ff9ec4'
KAPPA_SPEC = {'head': ['head'], 'hair': ['hair', 'dish'], 'eyes': ['eye'], 'mouth': ['beak'], 'loose_ok': ['disc', 'ring']}


def kappa_hairline(x, y):
    """河童的頭髮：頭頂盤子周圍一圈短短的妹妹頭，前面到額頭、後面略長；邊緣有淺淺的波浪（一撮一撮的感覺）"""
    f = smooth((-y + 0.02) / 0.32)
    wave = 0.018 * math.cos(9 * math.atan2(x, -y))
    return 0.96 + (1.07 - 0.96) * f + wave


def build_kappa(form=0):
    """form 1 = 化身一（龜殼水晶稜、盤子發光、雙層水盤）；2 = 化身二「河伯」（再加蓮花冠、身邊水環）。D94、docs/33。"""
    lib.reset()
    paint_atlas.paint(OUT.rsplit('/', 1)[0] + '/textures', 'kappa')  # 貼圖集（docs/37 第二批）
    b = Builder(atlas_white=rect_uv(CA['white'], 0.5, 0.5))
    cyl = lambda key: ('cyl', lambda s_, t_: rect_uv(CA[key], s_, t_))  # noqa: E731
    # 身體：圓滾滾、淺色肚子、背後龜殼（一圈淺色殼緣＋三片甲紋）
    b.sphere('torso', 0.31, (0, 0, 0.4), K_SKIN, 'body', scale=(1.05, 0.95, 1.02), seg=28, rings=18)
    b.sphere('belly', 0.25, (0, -0.115, 0.38), K_BELLY, 'body', scale=(0.92, 0.8, 1.0), seg=20, rings=14)
    b.uv(cyl('robe')).sphere('shell', 0.3, (0, 0.13, 0.44), K_SHELL_TEX, 'body', scale=(1.06, 0.85, 1.06), seg=24, rings=16)
    b.torus('shellrim', 0.29, 0.03, (0, 0.12, 0.44), K_SHELL_L, 'body', rot=(math.pi / 2, 0, 0), seg=28, tube=8, scale=(1.06, 1.06, 1))
    for (px, pz) in ((0, 0.52), (-0.13, 0.36), (0.13, 0.36)):
        b.sphere('scute', 0.085, (px, 0.365, pz), K_SHELL_L, 'body', scale=(1, 0.35, 1), seg=10, rings=6)
    b.sphere('neck', 0.13, (0, 0, 0.64), K_SKIN, 'body', seg=12, rings=8)
    if form:
        # 化身：龜殼長出水晶稜（沿著殼的上緣一排）
        for k, a in enumerate((-0.9, -0.45, 0.0, 0.45, 0.9)):
            x, z = math.sin(a) * 0.2, 0.44 + math.cos(a) * 0.17
            # 放在龜殼表面上（殼是橢球：中心 (0, 0.13, 0.44)、半軸 0.318／0.255／0.318）；稽核抓到外側兩顆浮在空中
            ys = 0.13 + 0.255 * math.sqrt(max(0.0, 1 - (x / 0.318) ** 2 - ((z - 0.44) / 0.318) ** 2))
            b.cone('crystal', 0.045, 0.0, 0.13 if k != 2 else 0.17, (x, ys + 0.03, z), K_CRYSTAL, 'body', seg=6, rot=(-math.pi / 2 + 0.3, 0, -a * 0.9))
    # （化身二原本有「身後水流披風」：轉檯圖背面看是一顆藍色大球蓋住整個龜殼，拿掉；化身二靠蓮花冠與水環區分）
    # 手：左手垂著、右手往外舉（水盤浮在手上方）
    for sx, bone in ((-1, 'armL'), (1, 'armR')):
        sh = Vector((sx * 0.27, 0, 0.52))
        hand = Vector((sx * 0.42, -0.04, 0.34)) if sx < 0 else Vector((0.44, -0.1, 0.44))
        rod(b, 'arm', sh, hand, 0.075, 0.06, K_SKIN, bone, seg=12)
        b.sphere('hand', 0.08, tuple(hand), K_SKIN, bone, seg=12, rings=8)
    # 腳：短腿＋黃色的蹼
    for sx, bone in ((-1, 'legL'), (1, 'legR')):
        rod(b, 'leg', (sx * 0.14, 0, 0.22), (sx * 0.14, -0.02, 0.08), 0.085, 0.075, K_SKIN, bone, seg=12)
        b.sphere('foot', 0.12, (sx * 0.14, -0.08, 0.06), K_BEAK, bone, scale=(1.0, 1.45, 0.5), seg=14, rings=8)
    # 頭：同一套臉的規則（眼睛放低、一個大高光、沒有多餘的線）；嘴是黃色的扁嘴
    b.sphere('head', HR, (0, 0, HC_Z), K_SKIN, 'head', scale=HS, seg=32, rings=20)
    b.uv(cyl('hair'))
    hair_shell(b, 'hair', kappa_hairline, K_HAIR_TEX)
    # 第二版（docs/37 第二批）：眼睛與腮紅是畫出來的（同提燈小僧的做法；嘴仍是立體的黃色扁嘴）
    for sx in (-1, 1):
        decal(b, 'eye', sx * 0.14, 0.9, EYE_W, EYE_H, CA['eyeR' if sx > 0 else 'eyeL'], lift=0.002)
        decal(b, 'blush', sx * 0.27, 0.765, 0.12, 0.08, CA['blush'], lift=0.001)
    bz = 0.725
    b.sphere('beak', 0.1, (0, head_y(0, bz) + 0.035, bz), (K_BEAK, '#f0a020'), 'head', scale=(1.25, 0.9, 0.45), seg=18, rings=12)
    # 頭頂的盤子（白色淺盤）：邊緣壓在頭髮上，裡面的水是另一個會發光的網格
    DZ = HC_Z + HR * HS[2] * 0.9
    b.lathe('dish', [(0.0, -0.05), (0.2, -0.05), (0.235, 0.0), (0.24, 0.035), (0.2, 0.045), (0.17, 0.02), (0.0, 0.01)], (0, 0, DZ), K_DISH, 'head', seg=28)
    if form >= 2:
        # 蓮花冠：盤子外圈一圈粉色花瓣
        for k in range(8):
            a = k / 8 * math.pi * 2
            b.sphere('lotus', 0.07, (math.cos(a) * 0.25, math.sin(a) * 0.25, DZ + 0.06), K_LOTUS, 'head', scale=(0.55, 0.3, 1.0), rot=(0.35 * math.sin(a), -0.35 * math.cos(a), a), seg=10, rings=6)
    g = Builder()
    g.sphere('water', 0.17 * (1.15 if form else 1), (0, 0, DZ + 0.03), K_WATER, 'head', scale=(1, 1, 0.16), seg=18, rings=8)
    # 水盤：浮在右手上方（腰的高度，不擋臉）、一直轉的發光圓盤（故意不接觸身體）
    g.sphere('disc', 0.17, (0.52, -0.14, 0.62), K_WATER, 'disc', scale=(1, 1, 0.2), seg=22, rings=10)
    if form:
        # 雙層水盤：外圈一個發光的環
        g.torus('disc', 0.23, 0.02, (0.52, -0.14, 0.62), K_WATER, 'disc', seg=24, tube=6)
    if form >= 2:
        # 身邊一圈水環（腰的高度，不接觸身體）
        g.torus('ring', 0.62, 0.03, (0, 0, 0.42), K_WATER, 'body', seg=40, tube=8)
    audit.run(b.parts + g.parts, KAPPA_SPEC, '河童' + ('' if not form else f'（化身{form}）'))
    body = b.join('Kappa')
    glow = g.join('GlowWater')
    arm = lib.make_armature('KappaRig', {
        'root': ((0, 0, 0), (0, 0, 0.12), None),
        'body': ((0, 0, 0.14), (0, 0, 0.6), 'root'),
        'head': ((0, 0, 0.62), (0, 0, 1.1), 'body'),
        'armL': ((-0.27, 0, 0.52), (-0.27, 0, 0.72), 'body'),
        'armR': ((0.27, 0, 0.52), (0.27, 0, 0.72), 'body'),
        'legL': ((-0.14, 0, 0.24), (-0.14, 0, 0.38), 'root'),
        'legR': ((0.14, 0, 0.24), (0.14, 0, 0.38), 'root'),
        'disc': ((0.52, -0.14, 0.62), (0.52, -0.14, 0.78), 'root'),
    })
    lib.bind(body, arm)
    lib.bind(glow, arm)
    s = 0.6
    T = math.pi * 2
    lib.make_action(arm, 'walk', 16, {
        'legL': {1: {'rot': (s, 0, 0)}, 5: {'rot': (0, 0, 0), 'loc': (0, 0.05, 0)}, 9: {'rot': (-s, 0, 0), 'loc': (0, 0, 0)}, 13: {'rot': (0, 0, 0)}, 17: {'rot': (s, 0, 0)}},
        'legR': {1: {'rot': (-s, 0, 0)}, 5: {'rot': (0, 0, 0)}, 9: {'rot': (s, 0, 0)}, 13: {'rot': (0, 0, 0), 'loc': (0, 0.05, 0)}, 17: {'rot': (-s, 0, 0), 'loc': (0, 0, 0)}},
        'armL': {1: {'rot': (-0.5, 0, 0)}, 9: {'rot': (0.5, 0, 0)}, 17: {'rot': (-0.5, 0, 0)}},
        'armR': {1: {'rot': (0.1, 0, 0)}, 9: {'rot': (-0.1, 0, 0)}, 17: {'rot': (0.1, 0, 0)}},
        'body': {1: {'loc': (0, 0, 0), 'rot': (0.05, 0, 0.07)}, 5: {'loc': (0, 0.05, 0), 'rot': (0.05, 0, 0)}, 9: {'loc': (0, 0, 0), 'rot': (0.05, 0, -0.07)}, 13: {'loc': (0, 0.05, 0), 'rot': (0.05, 0, 0)}, 17: {'loc': (0, 0, 0), 'rot': (0.05, 0, 0.07)}},
        'head': {1: {'rot': (-0.03, 0, -0.06)}, 9: {'rot': (-0.03, 0, 0.06)}, 17: {'rot': (-0.03, 0, -0.06)}},
        'disc': {1: {'rot': (0, 0, 0), 'loc': (0, 0, 0)}, 5: {'rot': (0, T / 4, 0), 'loc': (0, 0.02, 0)}, 9: {'rot': (0, T / 2, 0), 'loc': (0, 0, 0)}, 13: {'rot': (0, T * 3 / 4, 0), 'loc': (0, 0.02, 0)}, 17: {'rot': (0, T, 0), 'loc': (0, 0, 0)}},
    })
    lib.make_action(arm, 'idle', 48, {
        'body': {1: {'loc': (0, 0, 0)}, 25: {'loc': (0, 0.014, 0)}, 49: {'loc': (0, 0, 0)}},
        'head': {1: {'rot': (0, 0, 0.03)}, 25: {'rot': (0.02, 0, -0.03)}, 49: {'rot': (0, 0, 0.03)}},
        'armL': {1: {'rot': (0, 0, 0)}, 25: {'rot': (0.05, 0, 0)}, 49: {'rot': (0, 0, 0)}},
        'disc': {1: {'rot': (0, 0, 0), 'loc': (0, 0, 0)}, 13: {'rot': (0, T / 4, 0), 'loc': (0, 0.025, 0)}, 25: {'rot': (0, T / 2, 0), 'loc': (0, 0, 0)}, 37: {'rot': (0, T * 3 / 4, 0), 'loc': (0, 0.025, 0)}, 49: {'rot': (0, T, 0), 'loc': (0, 0, 0)}},
    })
    lib.export_glb(OUT + '/kappa' + ('' if not form else f'-f{form}') + '.glb', [body, glow, arm], animations=True)
    return sum(len(o.data.polygons) for o in (body, glow))


# ── 赤鬼（docs/35 ⑤）：紅皮膚、兩根圓頭的角、深色捲髮、虎皮腰布、右手扛金棒；化身一角變長＋金手環、化身二身上火紋＋背後雷鼓環 ──
O_SKIN = '#d9503f'
O_SKIN_D = '#b8382c'
O_HAIR = '#3a2620'
O_HAIR_TEX = '#43302a'  # 捲髮貼圖（平均約 0.88）乘上去之後和舊的 O_HAIR 差不多亮
O_HORN = '#f4e6c8'
O_TIGER = '#f2c14e'
O_STRIPE = '#3a2a1e'
O_CLUB = '#5a4a3e'
O_STUD = '#c9c2b0'
O_MARK = '#ffcf5a'
O_DRUM = '#ff8a3a'
ONI_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'mouth': ['mouth'], 'loose_ok': ['drum', 'drumring']}


def oni_hairline(x, y):
    """赤鬼的頭髮：一頂蓬蓬的捲髮，前面露出額頭（角從額頭上方長出來）、兩側蓋到耳朵上、後面到後頸；邊緣一撮一撮的波浪"""
    f = smooth((-y + 0.05) / 0.35)
    wave = 0.022 * math.cos(11 * math.atan2(x, -y))
    return 0.93 + (1.08 - 0.93) * f + wave


def build_oni(form=0):
    """form 1 = 化身一「大鬼」（角變長、金手環、金棒加金箍）；2 = 化身二「鬼神」（再加身上發光火紋、背後一圈雷鼓）。"""
    lib.reset()
    paint_atlas.paint(OUT.rsplit('/', 1)[0] + '/textures', 'oni')  # 貼圖集（docs/37 第二批）
    b = Builder(atlas_white=rect_uv(CA['white'], 0.5, 0.5))
    cyl = lambda key: ('cyl', lambda s_, t_: rect_uv(CA[key], s_, t_))  # noqa: E731
    # 身體：寬一點、胸前淺一點的紅
    b.sphere('torso', 0.33, (0, 0, 0.42), O_SKIN, 'body', scale=(1.12, 0.96, 1.02), seg=28, rings=18)
    b.sphere('chest', 0.24, (0, -0.11, 0.48), O_SKIN_D, 'body', scale=(1.0, 0.7, 0.8), seg=20, rings=12)
    # 虎皮腰布：腰下一圈黃底、三條深色條紋
    # 虎皮（第二版）：條紋畫在貼圖上（第一版是幾顆深色球，近看像斑點）
    b.uv(cyl('robe')).sphere('cloth', 0.335, (0, 0, 0.3), O_TIGER, 'body', scale=(1.14, 1.0, 0.52), seg=28, rings=14)
    b.sphere('neck', 0.14, (0, 0, 0.66), O_SKIN, 'body', seg=12, rings=8)
    # 手：左手握拳垂著、右手往上扛金棒
    for sx, bone in ((-1, 'armL'), (1, 'armR')):
        sh = Vector((sx * 0.3, 0, 0.56))
        hand = Vector((sx * 0.46, -0.04, 0.36)) if sx < 0 else Vector((0.52, -0.12, 0.54))
        rod(b, 'arm', sh, hand, 0.085, 0.07, O_SKIN, bone, seg=12)
        b.sphere('hand', 0.09, tuple(hand), O_SKIN, bone, seg=12, rings=8)
        if form:
            # 化身：金手環
            b.torus('bangle', 0.08, 0.022, tuple(sh + (hand - sh) * 0.7), GOLD, bone, rot=(0.3, 0, 0), seg=16, tube=6)
    # 金棒：右手握著，斜斜往上扛（前端粗、一圈圈的釘）
    # 扛在右肩、往後斜（側面看在頭的後面，不會擋到臉：轉檯圖第 3 格抓到的）
    c0, c1 = Vector((0.52, -0.12, 0.54)), Vector((0.66, 0.42, 1.22))
    rod(b, 'club', c0, c1, 0.05, 0.1, O_CLUB, 'armR', seg=14)
    d = (c1 - c0)
    L = d.length
    dn = d.normalized()
    # 釘：沿棒身上半段，三圈各 6 顆，壓在表面上
    ax = Vector((1, 0, 0)).cross(dn).normalized()
    ay = dn.cross(ax).normalized()
    for r in range(3):
        t = 0.55 + r * 0.15
        rad = 0.05 + (0.1 - 0.05) * t
        ctr = c0 + d * t
        for k in range(6):
            a = k / 6 * math.pi * 2 + r * 0.5
            pt = ctr + (ax * math.cos(a) + ay * math.sin(a)) * rad
            b.sphere('stud', 0.026, tuple(pt), O_STUD, 'armR', seg=8, rings=6)
    if form:
        b.torus('clubband', 0.085, 0.02, tuple(c0 + d * 0.45), GOLD, 'armR', rot=(math.acos(max(-1, min(1, dn.z))), 0, -math.atan2(dn.x, dn.y)), seg=16, tube=6)
    # 腳：短腿＋大腳
    for sx, bone in ((-1, 'legL'), (1, 'legR')):
        rod(b, 'leg', (sx * 0.15, 0, 0.22), (sx * 0.15, -0.02, 0.08), 0.095, 0.085, O_SKIN, bone, seg=12)
        b.sphere('foot', 0.13, (sx * 0.15, -0.08, 0.06), O_SKIN_D, bone, scale=(1.0, 1.4, 0.5), seg=14, rings=8)
    # 頭：同一套臉的規則；嘴是咧開的小嘴＋兩顆小獠牙
    b.sphere('head', HR, (0, 0, HC_Z), O_SKIN, 'head', scale=HS, seg=32, rings=20)
    b.uv(cyl('hair'))
    hair_shell(b, 'hair', oni_hairline, O_HAIR_TEX)
    # 第二版（docs/37 第二批）：眼睛（粗眉、金色虹彩）、腮紅、咧開的嘴＋兩顆小獠牙都是畫出來的
    for sx in (-1, 1):
        decal(b, 'eye', sx * 0.14, 0.9, EYE_W, EYE_H, CA['eyeR' if sx > 0 else 'eyeL'], lift=0.002)
        decal(b, 'blush', sx * 0.27, 0.765, 0.12, 0.08, CA['blush'], lift=0.001)
    decal(b, 'mouth', 0.0, 0.738, 0.1, 0.064, CA['mouth'], n=(5, 4))
    # 角：從頭髮上方長出來（底部埋進頭裡、圓頭不尖）；化身一更長、稍微往外彎
    hl = 0.2 if not form else 0.28
    for sx in (-1, 1):
        hx, hy = sx * 0.17, -0.08
        hz = HC_Z + HR * HS[2] * 0.72
        b.lathe('horn', [(0.0, 0.0), (0.075, 0.0), (0.065, hl * 0.5), (0.04, hl * 0.85), (0.0, hl)], (hx, hy, hz), O_HORN, 'head', seg=16, rot=(0, sx * (0.28 if not form else 0.38), 0))
    g = Builder()
    if form >= 2:
        # 鬼神：腰上一條發光的金色注連繩（胸前三顆發光點在轉檯圖上看起來像斑點，改成繩）
        g.torus('belt', 0.35, 0.04, (0, 0, 0.36), O_MARK, 'body', scale=(1.1, 0.96, 1), seg=40, tube=8)
        # 背後一圈雷鼓（不接觸身體，像風神雷神的鼓環）
        g.torus('drumring', 0.55, 0.025, (0, 0.34, 0.95), O_DRUM, 'body', rot=(math.pi / 2, 0, 0), seg=40, tube=8)
        for k in range(6):
            a = k / 6 * math.pi * 2
            g.sphere('drum', 0.09, (math.cos(a) * 0.55, 0.34, 0.95 + math.sin(a) * 0.55), O_DRUM, 'body', scale=(1, 0.6, 1), seg=12, rings=8)
    audit.run(b.parts + g.parts, ONI_SPEC, '赤鬼' + ('' if not form else f'（化身{form}）'))
    body = b.join('AkaOni')
    objs = [body]
    glowobj = None
    if g.parts:
        glowobj = g.join('GlowOni')
        objs.append(glowobj)
    arm = lib.make_armature('OniRig', {
        'root': ((0, 0, 0), (0, 0, 0.12), None),
        'body': ((0, 0, 0.14), (0, 0, 0.62), 'root'),
        'head': ((0, 0, 0.64), (0, 0, 1.12), 'body'),
        'armL': ((-0.3, 0, 0.56), (-0.3, 0, 0.76), 'body'),
        'armR': ((0.3, 0, 0.56), (0.3, 0, 0.76), 'body'),
        'legL': ((-0.15, 0, 0.24), (-0.15, 0, 0.38), 'root'),
        'legR': ((0.15, 0, 0.24), (0.15, 0, 0.38), 'root'),
    })
    for o in objs:
        lib.bind(o, arm)
    s = 0.55
    lib.make_action(arm, 'walk', 16, {
        'legL': {1: {'rot': (s, 0, 0)}, 5: {'rot': (0, 0, 0), 'loc': (0, 0.05, 0)}, 9: {'rot': (-s, 0, 0), 'loc': (0, 0, 0)}, 13: {'rot': (0, 0, 0)}, 17: {'rot': (s, 0, 0)}},
        'legR': {1: {'rot': (-s, 0, 0)}, 5: {'rot': (0, 0, 0)}, 9: {'rot': (s, 0, 0)}, 13: {'rot': (0, 0, 0), 'loc': (0, 0.05, 0)}, 17: {'rot': (-s, 0, 0), 'loc': (0, 0, 0)}},
        'armL': {1: {'rot': (-0.45, 0, 0)}, 9: {'rot': (0.45, 0, 0)}, 17: {'rot': (-0.45, 0, 0)}},
        'armR': {1: {'rot': (0.08, 0, 0)}, 9: {'rot': (-0.08, 0, 0)}, 17: {'rot': (0.08, 0, 0)}},
        'body': {1: {'loc': (0, 0, 0), 'rot': (0.05, 0, 0.06)}, 5: {'loc': (0, 0.05, 0), 'rot': (0.05, 0, 0)}, 9: {'loc': (0, 0, 0), 'rot': (0.05, 0, -0.06)}, 13: {'loc': (0, 0.05, 0), 'rot': (0.05, 0, 0)}, 17: {'loc': (0, 0, 0), 'rot': (0.05, 0, 0.06)}},
        'head': {1: {'rot': (-0.03, 0, -0.05)}, 9: {'rot': (-0.03, 0, 0.05)}, 17: {'rot': (-0.03, 0, -0.05)}},
    })
    lib.make_action(arm, 'idle', 48, {
        'body': {1: {'loc': (0, 0, 0)}, 25: {'loc': (0, 0.014, 0)}, 49: {'loc': (0, 0, 0)}},
        'head': {1: {'rot': (0, 0, 0.03)}, 25: {'rot': (0.02, 0, -0.03)}, 49: {'rot': (0, 0, 0.03)}},
        'armR': {1: {'rot': (0, 0, 0)}, 25: {'rot': (-0.06, 0, 0)}, 49: {'rot': (0, 0, 0)}},
    })
    lib.export_glb(OUT + '/aka-oni' + ('' if not form else f'-f{form}') + '.glb', objs + [arm], animations=True)
    return sum(len(o.data.polygons) for o in objs)


# ── 敵人：村人（D88，Blender 版；實例化網格一次畫幾百隻 → 低面數，三角形 ≤ 600）──
# 遊戲裡敵人只有約 20 像素高：重點是輪廓（頭巾、火把）與主色，臉照同一套規則但面數很少。
# 約定同 src/units/humans.ts：腳底 z = 0、身高約 1.3、腳的頂點在 0.16 以下（頂點著色器用它做走路）。
V_EARTH, V_BELT, V_SKIN, V_HAIR, V_BAND, V_WOOD, V_FOOT, V_EYE, V_FIRE = '#a58563', '#2b2b30', '#f8dcbc', '#6b4532', '#d88a3a', '#6a4b2e', '#3a3029', '#1e1a24', '#ff9a3c'
VILLAGER_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'max_tris': 600, 'loose_ok': ['flame']}


def enemy_hairline(x, y):
    """敵人的髮際線（相對頭的大小）：前面到額頭、兩側在耳朵上方、後面到後頸"""
    yn = -y / (HR * HS[1])
    f = smooth((yn + 0.05) / 0.9)
    front = HC_Z + HR * (0.5 - 0.18 * smooth(abs(x) / (0.8 * HR)))
    back = HC_Z - HR * 0.45
    return back + (front - back) * f


def build_villager():
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    b.sphere('robe', 0.27, (0, 0, 0.36), V_EARTH, None, scale=(1.0, 0.95, 1.1), seg=8, rings=6)
    for sx in (-1, 1):
        b.sphere('hand', 0.075, (sx * 0.3, -0.04, 0.38), V_SKIN, None, seg=4, rings=3)
        b.sphere('foot', 0.085, (sx * 0.11, -0.03, 0.065), V_FOOT, None, scale=(1, 1.35, 0.75), seg=4, rings=3)
    b.sphere('head', HR, (0, 0, HC_Z), V_SKIN, None, scale=HS, seg=10, rings=7)
    hair_shell(b, 'hair', enemy_hairline, V_HAIR, seg=(12, 8), grow=1.08)
    for sx in (-1, 1):
        ex, ez = sx * 0.088, 0.8
        rx, rz = head_tilt(ex, ez)
        b.sphere('eye', 0.07, (ex, head_y(ex, ez) + 0.004, ez), V_EYE, None, scale=(0.7, 0.36, 1.2), rot=(rx, 0, rz), seg=6, rings=3)
        hx, hz = ex - sx * 0.014, ez + 0.04
        t = head_tilt(hx, hz)
        b.sphere('hl', 0.026, (hx, head_y(hx, hz) - 0.016, hz), WHITE, None, scale=(1.0, 0.3, 1.2), rot=(t[0], 0, t[1]), seg=5, rings=3)
    # 頭巾：額頭一圈橙色帶子（壓在髮際線上）＋後面的結
    b.torus('band', HR * 1.03, 0.038, (0, 0, HC_Z + HR * 0.35), V_BAND, None, rot=(-0.18, 0, 0), seg=10, tube=3, scale=(HS[0], HS[1], 1))
    # 火把：左手斜舉的木棒＋火焰（火焰在遊戲裡會被調亮、發光）
    rod(b, 'torch', (-0.3, -0.06, 0.38), (-0.44, -0.14, 0.8), 0.03, 0.03, V_WOOD, None, seg=5)
    b.lathe('flame', [(0.0, 0.0), (0.09, 0.02), (0.06, 0.16), (0.0, 0.26)], (-0.44, -0.14, 0.8), V_FIRE, None, seg=5, close_bottom=False)
    audit.run(b.parts, VILLAGER_SPEC, '村人')
    ob = b.join('Villager')
    lib.export_glb(OUT + '/villager.glb', [ob], animations=False)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    use_head(0.94, 0.36, (1.1, 0.98, 0.96))
    return tris


# ── 敵人共用的底子（村人、足輕、弓手、退魔僧）：身體、手、腳、頭、頭髮、眼睛；各自再加帽子、武器 ──
def enemy_base(b, robe, bscale=(1.0, 0.95, 1.1), hair=V_HAIR, collar=True, eye_z=0.8, head_seg=(10, 7)):
    b.sphere('robe', 0.27, (0, 0, 0.36), robe, None, scale=bscale, seg=8, rings=6)
    for sx in (-1, 1):
        if collar:
            rod(b, 'collar', (sx * 0.1, -0.2, 0.6), (0, -0.25, 0.47), 0.03, 0.03, '#f4efe4', None, seg=4)
        b.sphere('hand', 0.075, (sx * 0.3 * bscale[0], -0.04, 0.38), V_SKIN, None, seg=4, rings=3)
        b.sphere('foot', 0.085, (sx * 0.11, -0.03, 0.065), V_FOOT, None, scale=(1, 1.35, 0.75), seg=4, rings=3)
    b.sphere('head', HR, (0, 0, HC_Z), V_SKIN, None, scale=HS, seg=head_seg[0], rings=head_seg[1])
    if hair:
        hair_shell(b, 'hair', enemy_hairline, hair, seg=(12, 8), grow=1.08)
    for sx in (-1, 1):
        ex, ez = sx * 0.088, eye_z
        rx, rz = head_tilt(ex, ez)
        b.sphere('eye', 0.07, (ex, head_y(ex, ez) + 0.004, ez), V_EYE, None, scale=(0.7, 0.36, 1.2), rot=(rx, 0, rz), seg=6, rings=3)
        hx, hz = ex - sx * 0.014, ez + 0.04
        t = head_tilt(hx, hz)
        b.sphere('hl', 0.026, (hx, head_y(hx, hz) - 0.016, hz), WHITE, None, scale=(1.0, 0.3, 1.2), rot=(t[0], 0, t[1]), seg=5, rings=3)


def finish_enemy(b, spec, label, name, fname):
    audit.run(b.parts, spec, label)
    ob = b.join(name)
    lib.export_glb(OUT + '/' + fname, [ob], animations=False)
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    use_head(0.94, 0.36, (1.1, 0.98, 0.96))
    return tris


def arc(b, name, x0, z0, radius, half_deg, r, color, n=6, sign=-1):
    """半圓弧（弓）：弧在 x–z 平面，兩端在 x = x0、最凸處離身體最遠（sign = -1 往 -x 凸）。沿弧排 n 段的細桿，回傳兩端點"""
    ha = math.radians(half_deg)
    pts = []
    for i in range(n + 1):
        a = -ha + 2 * ha * i / n
        pts.append((x0 + sign * radius * (math.cos(a) - math.cos(ha)), -0.14, z0 + radius * math.sin(a)))
    for i in range(n):
        rod(b, name, pts[i], pts[i + 1], r, r, color, None, seg=4)
    return pts


ASHIGARU_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'max_tris': 700, 'loose_ok': ['hl']}
YUMI_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'max_tris': 700}
TAIMASOU_SPEC = {'head': ['head'], 'hair': [], 'eyes': ['eye'], 'bald': True, 'max_tris': 900}


def build_ashigaru():
    """足輕：藍灰胴甲、草黃陣笠（帽頂紅點）、胸前一面大圓盾（朱色，金色盾心）——輪廓靠「大斗笠＋大圓盾」"""
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    enemy_base(b, '#6b7a8f', bscale=(1.12, 1.0, 1.1), collar=False, head_seg=(9, 6))
    # 陣笠：寬寬的圓錐帽，蓋到眉毛上
    b.lathe('jingasa', [(0.42, 0.0), (0.43, 0.02), (0.3, 0.07), (0.1, 0.17), (0.0, 0.21)], (0, 0, HC_Z + 0.2), '#c9a86a', None, seg=9)
    b.sphere('crest', 0.05, (0, 0, HC_Z + 0.4), '#d8453a', None, seg=5, rings=3)
    # 盾：胸前的大圓盾（朱色）＋深色盾緣＋金色中心
    b.cone('shield', 0.36, 0.36, 0.07, (0, -0.36, 0.42), '#d88a3a', None, rot=(math.pi / 2, 0, 0), seg=10)
    b.torus('shieldrim', 0.36, 0.035, (0, -0.4, 0.42), V_FOOT, None, rot=(math.pi / 2, 0, 0), seg=10, tube=3)
    b.sphere('boss', 0.08, (0, -0.42, 0.42), '#e8c25a', None, scale=(1, 0.6, 1), seg=5, rings=3)
    return finish_enemy(b, ASHIGARU_SPEC, '足輕', 'Ashigaru', 'ashigaru.glb')


def build_yumi():
    """弓手：綠衣、白頭帶（兩條飄帶）、左手邊一把豎著的大弓＋弦、背後一筒箭——輪廓靠「大弓」"""
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    enemy_base(b, '#5f8a74', bscale=(0.95, 0.92, 1.15))
    b.torus('band', HR * 1.03, 0.036, (0, 0, HC_Z + HR * 0.3), '#f4efe4', None, rot=(-0.12, 0, 0), seg=10, tube=3, scale=(HS[0], HS[1], 1))
    rod(b, 'tail', (0.05, HR * 1.0, HC_Z + 0.08), (0.12, HR * 1.18, HC_Z - 0.12), 0.03, 0.02, '#f4efe4', None, seg=4)
    # 弓：左手邊（-x）一把豎著的半圓大弓，最凸處離身體約 0.35 公尺；弦在兩端之間
    pts = arc(b, 'bow', -0.3, 0.55, 0.5, 70, 0.032, '#6a4b2e', n=6, sign=-1)
    rod(b, 'string', pts[0], pts[-1], 0.012, 0.012, '#f4efe4', None, seg=4)
    # 背後的箭筒＋箭羽
    rod(b, 'quiver', (0.1, 0.22, 0.4), (0.18, 0.28, 0.84), 0.07, 0.07, '#7a5a38', None, seg=6)
    b.sphere('fletch', 0.055, (0.2, 0.28, 0.9), '#f4efe4', None, seg=5, rings=3)
    return finish_enemy(b, YUMI_SPEC, '弓手', 'Yumi', 'yumi.glb')


def build_taimasou():
    """退魔僧（小頭目，遊戲裡放大 2.4 倍）：光頭、紫色僧衣、金色袈裟斜披、脖子一串大念珠、右手錫杖＋金環"""
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    enemy_base(b, '#6a4a9a', bscale=(1.15, 1.05, 1.15), hair=None, eye_z=0.82)
    # 袈裟：從左肩斜到右腰的一條金帶
    rod(b, 'kesa', (-0.17, -0.27, 0.58), (0.2, -0.32, 0.2), 0.05, 0.05, '#e8c25a', None, seg=5)
    # 念珠：脖子一圈深色大珠
    for i in range(8):
        a = math.radians(i * 45)
        b.sphere('bead', 0.04, (0.2 * math.sin(a), -0.2 * math.cos(a), 0.62), '#3a2a20', None, seg=4, rings=3)
    # 錫杖：右手一根長杖＋頂端金色的環
    rod(b, 'staff', (0.36, -0.1, 0.0), (0.36, -0.1, 1.25), 0.026, 0.026, '#6a4b2e', None, seg=5)
    b.torus('ring', 0.1, 0.022, (0.36, -0.1, 1.3), '#e8c25a', None, rot=(math.pi / 2, 0, 0), seg=10, tube=3)
    return finish_enemy(b, TAIMASOU_SPEC, '退魔僧', 'Taimasou', 'taimasou.glb')


KAWAGARI_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'max_tris': 1000, 'loose_ok': ['hl']}


def build_kawagari():
    """獵河武士（第 2 關頭目，D95，遊戲裡放大 2.4 倍）：青綠上衣＋深紫袴、頭頂髮髻、白鉢卷（後面兩條飄帶）、
    左腰一把斜插的長刀（深色鞘、白柄、金鍔）、右肩扛一圈捲起來的網——輪廓靠「髮髻＋長刀＋肩上的網」"""
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    enemy_base(b, '#2f6f7a', bscale=(1.12, 1.02, 1.1))
    # 袴：腰以下一圈深紫的寬裙褲（蓋住身體下半，腳露出來）
    b.cone('hakama', 0.3, 0.25, 0.2, (0, 0, 0.2), '#3a3550', None, seg=10)
    # 髮髻：頭頂往後一小段（埋進頭髮裡）
    rod(b, 'topknot', (0, 0.02, HC_Z + HR * 0.92), (0, 0.16, HC_Z + HR * 1.02), 0.045, 0.04, V_HAIR, None, seg=5)
    # 鉢卷＋後面兩條飄帶
    b.torus('band', HR * 1.03, 0.036, (0, 0, HC_Z + HR * 0.3), '#f4efe4', None, rot=(-0.12, 0, 0), seg=10, tube=3, scale=(HS[0], HS[1], 1))
    for sx in (-1, 1):
        rod(b, 'tail', (sx * 0.04, HR * 1.0, HC_Z + 0.08), (sx * 0.1, HR * 1.2, HC_Z - 0.1), 0.028, 0.02, '#f4efe4', None, seg=4)
    # 長刀：左腰斜插（鞘從前下往後上），刀柄朝前、金色刀鍔
    rod(b, 'saya', (-0.28, -0.12, 0.3), (0.26, 0.5, 0.5), 0.034, 0.03, '#2b2b30', None, seg=5)
    rod(b, 'tsuka', (-0.28, -0.12, 0.3), (-0.42, -0.3, 0.25), 0.035, 0.035, '#f4efe4', None, seg=5)
    b.torus('tsuba', 0.055, 0.016, (-0.29, -0.13, 0.3), '#e8c25a', None, rot=(math.pi / 2, 0, 0.9), seg=8, tube=3)
    # 網：右肩扛一圈（壓在肩上，往後斜），上面幾個結
    net_c, net_rot, net_r = (0.24, 0.05, 0.6), (0.3, 1.2, 0), 0.17
    b.torus('net', net_r, 0.05, net_c, '#c8b48a', None, rot=net_rot, seg=10, tube=4)
    # 網上的結：放在網圈的中心線上（套用網圈同一個旋轉，Blender 的 XYZ 歐拉角 = Rz·Ry·Rx）
    rx, ry, _ = net_rot
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        x, y, z = net_r * math.cos(a), net_r * math.sin(a), 0.0
        y, z = y * math.cos(rx) - z * math.sin(rx), y * math.sin(rx) + z * math.cos(rx)
        x, z = x * math.cos(ry) + z * math.sin(ry), -x * math.sin(ry) + z * math.cos(ry)
        b.sphere('knot', 0.04, (net_c[0] + x, net_c[1] + y, net_c[2] + z), '#a8925e', None, seg=4, rings=3)
    return finish_enemy(b, KAWAGARI_SPEC, '獵河武士', 'Kawagari', 'kawagari.glb')


SOHEI_SPEC = {'head': ['head'], 'hair': ['hood'], 'eyes': ['eye'], 'max_tris': 700, 'loose_ok': ['hl']}


def hood_line(x, y):
    """裹頭的邊緣：前面在額頭（和頭髮一樣），兩側與後面一路包到脖子（只露出臉）"""
    yn = -y / (HR * HS[1])
    f = smooth((yn + 0.05) / 0.9)
    front = HC_Z + HR * (0.45 - 0.12 * smooth(abs(x) / (0.8 * HR)))
    back = HC_Z - HR * 0.95
    return back + (front - back) * f
SHINOBI_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'max_tris': 700, 'loose_ok': ['hl']}
ONMYOJI_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'max_tris': 700, 'loose_ok': ['hl']}
TAIKO_SPEC = {'head': ['head'], 'hair': ['hair'], 'eyes': ['eye'], 'max_tris': 700, 'loose_ok': ['hl']}


def build_sohei():
    """僧兵（E-2，護法）：白色裹頭（往後包住頭、臉露在前面）、灰紫僧衣、右手長薙刀——輪廓靠「白頭巾＋比人高的長柄刀」"""
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    enemy_base(b, '#4b4f63', bscale=(1.12, 1.02, 1.12), hair=None, eye_z=0.8)
    # 裹頭：像頭髮一樣貼著頭的一整片白布（只露出臉，邊緣在額頭）＋垂到肩膀的布尾
    hair_shell(b, 'hood', hood_line, '#dfe8f6', seg=(12, 8), grow=1.1)  # 冷白（暖白在暖光下會像皮膚，轉檯圖抓到的）
    b.sphere('hoodtail', 0.16, (0, 0.2, HC_Z - 0.26), '#dfe8f6', None, scale=(1.4, 0.6, 1.0), seg=6, rings=4)
    # 薙刀：右手一根長柄＋頂端的彎刃
    rod(b, 'pole', (0.36, -0.1, 0.0), (0.36, -0.1, 1.32), 0.024, 0.024, '#6a4b2e', None, seg=5)
    b.cone('blade', 0.07, 0.0, 0.34, (0.38, -0.1, 1.48), '#d6dde4', None, rot=(0, 0.2, 0), seg=4, scale=(1, 0.35, 1))
    return finish_enemy(b, SOHEI_SPEC, '僧兵', 'Sohei', 'sohei.glb')


def build_shinobi():
    """探子（E-2，衝刺）：深藍緊身衣、深色頭巾、面巾遮住下半臉、紅色長巾往後飄、背後斜背短刀——輪廓靠「蒙面＋紅飄巾」，體型瘦小"""
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    enemy_base(b, '#2c3350', bscale=(0.9, 0.88, 1.08), hair='#3a4266', collar=False)
    # 面巾：蓋住臉的下半（在眼睛下面）
    b.sphere('mask', HR * 0.98, (0, -0.02, HC_Z - 0.1), '#3a4266', None, scale=(1.04, 1.0, 0.62), seg=10, rings=6)
    # 紅長巾：從後腦往後下方飄
    rod(b, 'scarf', (0.0, HR * 0.9, HC_Z + 0.05), (0.08, HR * 1.6, HC_Z - 0.2), 0.035, 0.03, '#d8453a', None, seg=4)
    # 背後斜背的短刀
    rod(b, 'blade', (-0.2, 0.24, 0.3), (0.2, 0.26, 0.82), 0.028, 0.028, '#2b2b30', None, seg=5)
    return finish_enemy(b, SHINOBI_SPEC, '探子', 'Shinobi', 'shinobi.glb')


def build_onmyoji():
    """陰陽師（E-2，紅圈）：高高的黑色烏帽子、淡藍白狩衣、兩邊垂下的寬袖、右手一張白符紙（紅印）——輪廓靠「高帽子」"""
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    enemy_base(b, '#dfe8f2', bscale=(1.08, 1.0, 1.12))
    # 烏帽子：頭頂一個往後微斜的高帽（底部壓進頭髮裡）
    b.cone('eboshi', 0.17, 0.12, 0.42, (0, 0.06, HC_Z + HR * 0.85 + 0.17), '#1f1f26', None, rot=(0.22, 0, 0), seg=8)
    # 寬袖：身體兩側往下垂
    for sx in (-1, 1):
        b.sphere('sleeve', 0.15, (sx * 0.33, 0.0, 0.33), '#dfe8f2', None, scale=(0.55, 0.9, 1.15), seg=7, rings=5)
    # 符紙：右手前面一張豎起來的白紙＋紅印
    b.box('ofuda', (0.12, 0.016, 0.24), (0.3, -0.24, 0.52), '#f6efd2', None)
    b.box('seal', (0.05, 0.02, 0.05), (0.3, -0.25, 0.56), '#d8453a', None)
    return finish_enemy(b, ONMYOJI_SPEC, '陰陽師', 'Onmyoji', 'onmyoji.glb')


def build_taiko():
    """太鼓兵（E-2，鼓舞）：紅頭帶、土黃短衣、胸前一面大太鼓（朱紅鼓身、米白鼓面）、兩手各一根鼓棒——輪廓靠「大鼓」"""
    lib.reset()
    use_head(0.86, 0.31, (1.02, 0.98, 0.96))
    b = Builder()
    enemy_base(b, '#c9a86a', bscale=(1.08, 1.0, 1.08), collar=False)
    b.torus('band', HR * 1.03, 0.036, (0, 0, HC_Z + HR * 0.3), '#d8453a', None, rot=(-0.12, 0, 0), seg=10, tube=3, scale=(HS[0], HS[1], 1))
    # 大鼓：胸前橫掛，鼓面朝前
    b.cone('drum', 0.26, 0.26, 0.22, (0, -0.38, 0.4), '#c8402f', None, rot=(math.pi / 2, 0, 0), seg=12)
    b.cone('drumhead', 0.22, 0.22, 0.02, (0, -0.5, 0.4), '#efe2c4', None, rot=(math.pi / 2, 0, 0), seg=12)
    # 鼓棒
    for sx in (-1, 1):
        rod(b, 'stick', (sx * 0.3, -0.1, 0.38), (sx * 0.42, -0.3, 0.72), 0.022, 0.022, '#6a4b2e', None, seg=4)
    return finish_enemy(b, TAIKO_SPEC, '太鼓兵', 'Taiko', 'taiko.glb')


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


# ── 場景道具（docs/37 第一批）：石燈籠、木柵欄 ──
# 遊戲端用場景的貼圖材質（src/art/worldMaterial.ts：三向投影的岩石／木頭細節貼圖）；哪一層寫在頂點色的 alpha：0.125 + 0.25 × 層（2 = 岩石、3 = 木頭）
def layer_color(h, layer):
    c = lib.hex_color(h)
    return (c[0], c[1], c[2], 0.125 + 0.25 * layer)


ROCK, WOODL = 2, 3
LANTERN_STONE = '#a39d90'
LANTERN_STONE_D = '#8c8678'
MOSS = '#7d8a5e'


def build_stone_lantern():
    """春日型石燈籠（約 1.6 公尺）：六角的基礎、圓柱（中間一圈節）、中台、火袋（六根細柱，中間是發光的燈室）、六角的笠（角往上翹）、寶珠。"""
    lib.reset()
    b = Builder()
    st = layer_color(LANTERN_STONE, ROCK)
    sd = layer_color(LANTERN_STONE_D, ROCK)
    b.lathe('kiso', [(0.38, 0.0), (0.38, 0.1), (0.33, 0.14), (0.2, 0.18)], (0, 0, 0), st, seg=6, rot=(0, 0, math.pi / 6))
    b.lathe('kisomoss', [(0.36, 0.0), (0.395, 0.01), (0.395, 0.055), (0.36, 0.075)], (0, 0, 0), layer_color(MOSS, ROCK), seg=6, rot=(0, 0, math.pi / 6))
    b.cone('sao', 0.1, 0.12, 0.66, (0, 0, 0.17 + 0.33), st, seg=12, caps=False)
    b.torus('fushi', 0.115, 0.022, (0, 0, 0.5), sd, seg=12, tube=5)
    b.lathe('chudai', [(0.14, 0.82), (0.24, 0.86), (0.3, 0.9), (0.3, 0.95)], (0, 0, 0), st, seg=6, rot=(0, 0, math.pi / 6))
    # 火袋：上下兩片六角板＋六根細柱（中間看得到發光的燈室）
    b.lathe('hibot', [(0.24, 0.95), (0.24, 0.99)], (0, 0, 0), sd, seg=6, rot=(0, 0, math.pi / 6))
    b.lathe('hitop', [(0.25, 1.24), (0.25, 1.28)], (0, 0, 0), sd, seg=6, rot=(0, 0, math.pi / 6))
    for k in range(6):
        a = k * math.pi / 3
        b.cone('hashira', 0.032, 0.032, 0.27, (math.cos(a) * 0.215, math.sin(a) * 0.215, 1.115), st, seg=6)
    # 笠：六角、邊緣往外延伸，六個角往上翹（蕨手）
    hat = b.lathe('kasa', [(0.47, 1.28), (0.47, 1.31), (0.36, 1.36), (0.2, 1.43), (0.07, 1.48)], (0, 0, 0), st, seg=6, rot=(0, 0, math.pi / 6))
    for v in hat.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        if r > 0.4:
            v.co.z += 0.045
    for k in range(6):
        a = k * math.pi / 3 + math.pi / 6
        b.sphere('warabite', 0.035, (math.cos(a) * 0.47, math.sin(a) * 0.47, 1.365), st, seg=6, rings=4)
    b.cone('ukebana', 0.05, 0.08, 0.06, (0, 0, 1.5), sd, seg=12)
    b.sphere('hoju', 0.07, (0, 0, 1.57), st, scale=(1, 1, 1.15), seg=10, rings=6)
    b.cone('hojutip', 0.0, 0.04, 0.06, (0, 0, 1.66), st, seg=10)
    g = Builder()
    g.lathe('light', [(0.175, 0.985), (0.175, 1.245)], (0, 0, 0), layer_color('#ffcf7a', ROCK), seg=6, rot=(0, 0, math.pi / 6))
    audit.run_prop(b.parts + g.parts, {'max_tris': 1000}, '石燈籠')  # 一張地圖約 16 座，按區塊合併成少數幾個網格（worldView）
    ob = b.join('StoneLantern')
    gl = g.join('GlowLantern')
    lib.export_glb(OUT + '/stone-lantern.glb', [ob, gl], animations=False)
    return len(ob.data.polygons)


def build_fence():
    """四目垣風的木柵欄（一段 2 公尺、高 0.85）：三根方柱、三條橫的竹子、直的竹子，交叉處綁黑繩。沿 X 軸。"""
    lib.reset()
    b = Builder()
    post = layer_color('#7a5234', WOODL)
    bamboo = layer_color('#c2ad72', WOODL)
    rope = layer_color('#3a2a24', WOODL)
    for x in (-1.0, 0.0, 1.0):
        b.box('post', (0.09, 0.09, 0.9), (x, 0, 0.45), post, bevel=0.015)
        b.cone('postcap', 0.0, 0.07, 0.05, (x, 0, 0.92), post, seg=4, rot=(0, 0, math.pi / 4))
    for z in (0.3, 0.62):
        rod(b, 'rail', (-1.04, 0.06, z), (1.04, 0.06, z), 0.024, 0.024, bamboo, None, seg=8)
    for k in range(8):
        x = -0.875 + k * 0.25
        rod(b, 'slat', (x, 0.1, 0.04), (x, 0.1, 0.82), 0.018, 0.016, bamboo, None, seg=6)
        b.sphere('tie', 0.026, (x, 0.08, 0.62), rope, scale=(1, 0.9, 1.3), seg=6, rings=4)
    audit.run_prop(b.parts, {'max_tris': 900}, '木柵欄')
    ob = b.join('Fence')
    lib.export_glb(OUT + '/fence.glb', [ob], animations=False)
    return len(ob.data.polygons)


if __name__ == '__main__':
    n1 = build_chochin()
    n3 = build_kappa()
    nf = [build_chochin(1), build_chochin(2), build_kappa(1), build_kappa(2), build_oni(), build_oni(1), build_oni(2)]
    n4 = build_villager()
    n5 = [build_ashigaru(), build_yumi(), build_taimasou(), build_kawagari(), build_sohei(), build_shinobi(), build_onmyoji(), build_taiko()]
    n2 = build_torii()
    n6 = [build_stone_lantern(), build_fence()]
    print('faces: forms', nf, 'chochin', n1, 'kappa', n3, 'torii', n2, 'villager tris', n4, 'props', n6, 'ashigaru/yumi/taimasou tris', n5)
