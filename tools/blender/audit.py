"""角色模型的數字稽核（docs/29）。在 build.py 合併零件之前呼叫；有任何一條不過就不匯出（exit 1）。

為什麼有這個檔案（2026-11-14，使用者：「你為什麼會犯這個錯，要建立一個檢查方法，避免一樣的錯誤發生」）：
提燈小僧第三版的瀏海和後腦頭髮是兩個獨立物件、中間露出頭皮，五官位置也是憑感覺填的數字——我只從一個斜前方角度看截圖，
從沒看過側面與背面，也沒有量過任何比例。這裡把「眼睛看才會發現」的缺陷變成會自動擋下來的數字：

  A. 頭髮連續：從頭頂沿每一條經線往下，第一個打到的必須是「頭髮…頭髮，皮膚…皮膚」，只能換一次（不能頭髮→頭皮→又是頭髮）。
  B. 頭髮厚度：頭髮外表面離頭皮不能太遠（以前後腦是一顆比頭還大的球）。
  C. 五官位置：眼睛高度、眼距、左右對稱、嘴的位置、嘴不能和眼睛上下重疊、離下巴要有距離——用比例，不用絕對數字。
  D. 五官貼在臉上：每個五官都要和頭的表面相交（不能浮在外面，也不能整個埋進去）。
  E. 沒有懸空的零件：每個零件都要和至少一個別的零件相交。
  F. 太細的零件（警告）：像素化後會變雜點。

比例的範圍是 Q 版的一般通則（docs/28 第六節查到的：眼睛放低、眼距約一個眼寬、五官精簡），加上我對第三、四版的量測；
不是哪一款遊戲的官方數字。之後覺得某條太嚴或太鬆，改 RULES 並在 docs/29 記一行原因。
"""
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

RULES = {
    # 眼睛中心在「前額髮際線 → 下巴」的幾成處
    'eye_height': (0.35, 0.60),
    # 兩眼內側的距離 ÷ 一個眼寬
    'eye_gap': (0.70, 1.25),
    # 嘴的中心在「髮際線 → 下巴」的幾成處
    'mouth_height': (0.62, 0.88),
    # 嘴的下緣離下巴至少幾成臉高
    'chin_clearance': 0.08,
    # 左右對稱的容許差（公尺）
    'symmetry': 0.005,
    # 五官凸出臉表面最多多少（公尺）
    'feature_proud': 0.06,
    # 頭髮外表面離頭皮最多幾成頭半徑
    'hair_thickness': 0.20,
    # 零件最細的一邊小於這個就警告（公尺）
    'thin': 0.012,
}


def base(ob):
    return ob.name.split('.')[0]


def world_verts(ob):
    return [ob.matrix_world @ v.co for v in ob.data.vertices]


def bbox(obs):
    pts = [p for o in obs for p in world_verts(o)]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def tree(obs):
    verts, polys = [], []
    for o in obs:
        off = len(verts)
        verts.extend(world_verts(o))
        polys.extend([tuple(off + i for i in p.vertices) for p in o.data.polygons])
    return BVHTree.FromPolygons(verts, polys) if polys else None


def first_hit(origin, direction, head_t, hair_t):
    """從 origin 沿 direction 射過去，先打到頭髮還是皮膚；回傳 ('H' 或 'S' 或 None, 頭髮距離, 皮膚距離)"""
    hs = head_t.ray_cast(origin, direction)
    hh = hair_t.ray_cast(origin, direction) if hair_t else (None, None, None, None)
    ds = hs[3] if hs[0] is not None else None
    dh = hh[3] if hh[0] is not None else None
    if ds is None and dh is None:
        return None, dh, ds
    if dh is not None and (ds is None or dh < ds - 1e-5):
        return 'H', dh, ds
    return 'S', dh, ds


def audit_character(parts, spec, label='character'):
    """parts：Builder.parts（合併前）；spec：{'head': [...], 'hair': [...], 'eyes': [...], 'mouth': [...], 'bald': False, 'loose_ok': [...]}
    回傳 (problems, warnings, metrics)"""
    problems, warnings, m = [], [], {}
    by = {}
    for o in parts:
        by.setdefault(base(o), []).append(o)

    def pick(key):
        return [o for n in spec.get(key, []) for o in by.get(n, [])]

    head, hair, eyes, mouth = pick('head'), pick('hair'), pick('eyes'), pick('mouth')
    if not head:
        return ['找不到頭（spec.head）'], warnings, m
    lo, hi = bbox(head)
    C = (lo + hi) / 2
    R = max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) / 2
    head_t, hair_t = tree(head), tree(hair)

    # ── A、B：頭髮連續與厚度（每 15° 一條經線，從頭頂往下每 3° 一點）──
    if hair:
        breaks, thick, bald_top = [], 0.0, False
        for az in range(0, 360, 15):
            seq = ''
            for el in range(87, -31, -3):
                a, e = math.radians(az), math.radians(el)
                d = Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
                kind, dh, ds = first_hit(C + d * R * 3, -d, head_t, hair_t)
                if kind is None:
                    continue
                seq += kind
                if kind == 'H' and ds is not None:
                    thick = max(thick, ds - dh)
            if seq and seq[0] != 'H':
                bald_top = True
            # 合法的樣子只有「H…HS…S」：頭髮→皮膚之後不能再出現頭髮
            cut = seq.find('S')
            if cut >= 0 and 'H' in seq[cut:]:
                breaks.append(az)
        m['頭髮斷開的方位數'] = len(breaks)
        m['頭髮最大厚度／頭半徑'] = round(thick / R, 3)
        if breaks:
            problems.append(f'頭髮不連續：在方位 {breaks}° 這幾條經線上，頭髮和頭髮之間露出頭皮（0° = 正面、90° = 右側、180° = 背面）')
        if bald_top and not spec.get('bald'):
            problems.append('頭頂沒有頭髮')
        if thick / R > RULES['hair_thickness']:
            problems.append(f'頭髮太厚：離頭皮最遠 {thick:.3f} 公尺（頭半徑的 {thick / R:.0%}，上限 {RULES["hair_thickness"]:.0%}）——看起來會像戴頭盔或一顆大球')

    # 前額髮際線：從正面往頭射，由上往下第一個打到皮膚的高度（x 可指定）
    def hairline_at(x):
        z = hi.z
        while z > lo.z:
            kind, _, _ = first_hit(Vector((x, C.y - R * 3, z)), Vector((0, 1, 0)), head_t, hair_t)
            if kind == 'S':
                return z
            z -= R / 200
        return hi.z

    def surface_y(x, z):
        h = head_t.ray_cast(Vector((x, C.y - R * 3, z)), Vector((0, 1, 0)))
        return h[0].y if h[0] is not None else None

    def on_surface(name, obs):
        flo, fhi = bbox(obs)
        c = (flo + fhi) / 2
        ys = surface_y(c.x, c.z)
        if ys is None:
            problems.append(f'{name} 不在臉的範圍內（正面射線打不到頭）')
            return
        if fhi.y < ys - 1e-4:
            problems.append(f'{name} 浮在臉的外面：離表面 {ys - fhi.y:.3f} 公尺')
        elif flo.y > ys + 1e-4:
            problems.append(f'{name} 整個埋在頭裡面，看不到')
        elif ys - flo.y > RULES['feature_proud']:
            problems.append(f'{name} 凸出臉太多：{ys - flo.y:.3f} 公尺（上限 {RULES["feature_proud"]}）')

    # ── C、D：五官位置 ──
    if len(eyes) == 2:
        zh = hairline_at(0.0)
        zb = lo.z
        face_h = zh - zb
        L, Rr = sorted(eyes, key=lambda o: bbox([o])[0].x)
        (llo, lhi), (rlo, rhi) = bbox([L]), bbox([Rr])
        lc, rc = (llo + lhi) / 2, (rlo + rhi) / 2
        eye_w = ((lhi.x - llo.x) + (rhi.x - rlo.x)) / 2
        eye_h = ((lhi.z - llo.z) + (rhi.z - rlo.z)) / 2
        eye_z = (lc.z + rc.z) / 2
        m['臉高（髮際線到下巴）'] = round(face_h, 3)
        m['眼睛高度（0 = 髮際線，1 = 下巴）'] = round((zh - eye_z) / face_h, 3)
        m['眼距／眼寬'] = round((rlo.x - lhi.x) / eye_w, 3)
        a, b = RULES['eye_height']
        if not a <= (zh - eye_z) / face_h <= b:
            problems.append(f'眼睛高度不對：在髮際線到下巴的 {(zh - eye_z) / face_h:.0%} 處（要在 {a:.0%}～{b:.0%}）')
        a, b = RULES['eye_gap']
        if not a <= (rlo.x - lhi.x) / eye_w <= b:
            problems.append(f'眼距不對：兩眼內側相距 {(rlo.x - lhi.x) / eye_w:.2f} 個眼寬（要在 {a}～{b}；太大像魚、太小擠在一起）')
        if abs(lc.x + rc.x - 2 * C.x) > RULES['symmetry'] or abs(lc.z - rc.z) > RULES['symmetry']:
            problems.append(f'兩眼不對稱：中心 ({lc.x:.3f}, {lc.z:.3f}) 和 ({rc.x:.3f}, {rc.z:.3f})')
        for name, lo_e, hi_e in (('左眼', llo, lhi), ('右眼', rlo, rhi)):
            cx = (lo_e.x + hi_e.x) / 2
            if hi_e.z > hairline_at(cx) + eye_h * 0.25:
                problems.append(f'{name} 被瀏海蓋住超過四分之一')
        on_surface('左眼', [L])
        on_surface('右眼', [Rr])
        if mouth:
            mlo, mhi = bbox(mouth)
            mc = (mlo + mhi) / 2
            m['嘴的高度（0 = 髮際線，1 = 下巴）'] = round((zh - mc.z) / face_h, 3)
            m['嘴離下巴／臉高'] = round((mlo.z - zb) / face_h, 3)
            a, b = RULES['mouth_height']
            if not a <= (zh - mc.z) / face_h <= b:
                problems.append(f'嘴的高度不對：在髮際線到下巴的 {(zh - mc.z) / face_h:.0%} 處（要在 {a:.0%}～{b:.0%}）')
            if mhi.z > min(llo.z, rlo.z) + 1e-4:
                problems.append(f'嘴和眼睛上下重疊：嘴的上緣 {mhi.z:.3f} 高於眼睛的下緣 {min(llo.z, rlo.z):.3f}（五官擠在一起）')
            if (mlo.z - zb) / face_h < RULES['chin_clearance']:
                problems.append(f'嘴離下巴太近：只有臉高的 {(mlo.z - zb) / face_h:.0%}')
            if abs(mc.x - C.x) > RULES['symmetry']:
                problems.append(f'嘴沒有置中：x = {mc.x:.3f}')
            on_surface('嘴', mouth)
    elif eyes:
        problems.append(f'眼睛不是兩顆：{len(eyes)}')

    # ── E：懸空的零件（和誰都不相交）──
    trees = [(o, tree([o]), bbox([o])) for o in parts]
    loose_ok = set(spec.get('loose_ok', []))
    for o, t, (alo, ahi) in trees:
        if base(o) in loose_ok or t is None:
            continue
        touching = False
        for p, pt, (blo, bhi) in trees:
            if p is o or pt is None:
                continue
            if alo.x > bhi.x or blo.x > ahi.x or alo.y > bhi.y or blo.y > ahi.y or alo.z > bhi.z or blo.z > ahi.z:
                continue
            if t.overlap(pt):
                touching = True
                break
        if not touching:
            problems.append(f'零件「{o.name}」懸空：沒有碰到任何別的零件')

    # ── F：太細（警告）──
    for o, _, (alo, ahi) in trees:
        d = min(ahi.x - alo.x, ahi.y - alo.y, ahi.z - alo.z)
        if d < RULES['thin']:
            warnings.append(f'零件「{o.name}」最細只有 {d:.4f} 公尺，手機上會變雜點')
    return problems, warnings, m


def run(parts, spec, label='character', strict=True):
    problems, warnings, m = audit_character(parts, spec, label)
    print(f'── 模型稽核：{label} ──')
    for k, v in m.items():
        print(f'   {k}：{v}')
    for w in warnings:
        print(f'   ⚠ {w}')
    for p in problems:
        print(f'   ✗ {p}')
    print(f'   結果：{"✗ 不通過（" + str(len(problems)) + " 項）" if problems else "✓ 通過"}')
    if problems and strict:
        raise SystemExit(1)
    return problems
