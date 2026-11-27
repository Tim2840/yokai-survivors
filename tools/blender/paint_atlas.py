"""玩家角色的貼圖集（docs/37 第一、二批）：臉（眼睛、嘴、腮紅）、布料、編織、木紋、頭髮、燈籠紙、龜殼、虎皮，全部用程式畫（不是別人的圖）。
三隻妖怪共用同一個版面（atlas.py），每隻一張圖：chochin／kappa／oni-atlas.png；畫風一致（同一套眼睛的畫法），顏色與內容依 STYLES。
用法：python3 tools/blender/paint_atlas.py [輸出資料夾，預設 src/assets/textures] [角色]（build.py 建模前也會自動呼叫）
- chochin-atlas.png（1024）：base color；眼睛／嘴／腮紅／燈籠紙是真實顏色（頂點色白），布料／編織／木紋／頭髮是「細節」（≈0.8～1，乘在頂點色上）。
- chochin-glow.png（256）：發光貼圖，只有燈籠紙那一格亮（燈籠紙從獨立的發光網格改成身體的一部分，少一次 draw call）。
- 形狀先畫在 4 倍大的畫布上再縮小（抗鋸齒）；乾淨卡通：清楚的色塊＋柔和的漸層，不放照片雜訊。
"""
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlas import CHOCHIN as R, SIZE, SKIN  # noqa: E402

# 每隻妖怪的臉：skin = 貼片底色（= 頭的頂點色，不然貼片邊緣看得出來）、虹彩的漸層、眼皮線、腮紅、嘴（None = 嘴是模型，例如河童的扁嘴）、兇一點的眉眼（赤鬼）
STYLES = {
    'chochin': {'skin': SKIN, 'iris': [(0.0, '#1c1028'), (0.42, '#3a1a34'), (0.68, '#8a3f2a'), (0.9, '#e09238'), (1.0, '#f2b450')], 'iglow': '#ffc866', 'lid': '#24121f', 'blush': '#ff8c8c', 'blushline': '#f0606e', 'mouth': 'open', 'brow': False},
    'kappa': {'skin': '#66a67c', 'iris': [(0.0, '#0a1c22'), (0.42, '#123a3c'), (0.7, '#1f7a6a'), (0.9, '#4fd0b0'), (1.0, '#8af0d0')], 'iglow': '#9fffe0', 'lid': '#0c2620', 'blush': '#ff9a8a', 'blushline': '#e86a6a', 'mouth': None, 'brow': False},
    'oni': {'skin': '#d9503f', 'iris': [(0.0, '#1a0a08'), (0.42, '#3a1408'), (0.68, '#a8501a'), (0.9, '#f2b030'), (1.0, '#ffe070')], 'iglow': '#ffe080', 'lid': '#2a0c08', 'blush': '#ff8a72', 'blushline': '#b8302a', 'mouth': 'fangs', 'brow': True},
}

SS = 4  # 超取樣倍數


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def canvas(w, h, color):
    return Image.new('RGBA', (w * SS, h * SS), hexrgb(color) + (255,))


def down(im, w, h):
    return im.resize((w, h), Image.LANCZOS)


def ellipse(d, cx, cy, rx, ry, **kw):
    d.ellipse([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], **kw)


def vgrad(w, h, stops):
    """直向漸層（stops：[(t, '#hex')…]，t = 0 在上）→ RGBA 圖"""
    t = np.linspace(0, 1, h)[:, None]
    out = np.zeros((h, w, 3))
    for k in range(3):
        xs = [s[0] for s in stops]
        ys = [hexrgb(s[1])[k] for s in stops]
        out[..., k] = np.interp(t, xs, ys)
    a = np.full((h, w, 1), 255.0)
    return Image.fromarray(np.concatenate([out, a], 2).astype(np.uint8), 'RGBA')


def mask_ellipse(w, h, cx, cy, rx, ry, blur=0):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


# ── 眼睛 ──
def paint_eye(outer_left, st):
    w, h = 256, 320
    W, H = w * SS, h * SS
    im = canvas(w, h, st['skin'])
    cx, cy, rx, ry = 0.5 * w, 0.55 * h, 0.41 * w, 0.42 * h
    # 虹彩：上深（深紫）→ 中段酒紅 → 下面暖琥珀；下半部再亮一圈
    iris = vgrad(W, H, st['iris'])
    im.paste(iris, (0, 0), mask_ellipse(W, H, cx * SS, cy * SS, rx * SS, ry * SS))
    glowm = mask_ellipse(W, H, cx * SS, (cy + 0.2 * ry) * SS, rx * 0.72 * SS, ry * 0.5 * SS, blur=10 * SS)
    im.paste(Image.new('RGBA', (W, H), hexrgb(st['iglow']) + (255,)), (0, 0), glowm.point(lambda v: int(v * 0.55)))
    d = ImageDraw.Draw(im)
    # 瞳孔（直向的橢圓）＋外圈深色描線
    ellipse(d, cx, cy + 0.02 * h, rx * 0.42, ry * 0.5, fill=hexrgb('#120818'))
    ellipse(d, cx, cy, rx, ry, outline=hexrgb(st['lid']), width=5 * SS)
    # 上眼皮：粗的弧線蓋在眼睛上緣，外眼角往外上翹出一撮睫毛
    lid = hexrgb(st['lid'])
    d.arc([(cx - rx * 1.06) * SS, (cy - ry * 1.04) * SS, (cx + rx * 1.06) * SS, (cy + ry * 1.04) * SS], 200, 340, fill=lid, width=15 * SS)
    o = -1 if outer_left else 1  # 外眼角在哪一邊
    ox, oy = cx + o * rx * 0.95, cy - ry * 0.42
    d.polygon([((ox - o * 12) * SS, (oy - 16) * SS), ((ox + o * 16) * SS, (oy - 30) * SS), ((ox + o * 4) * SS, (oy + 6) * SS)], fill=lid)
    d.polygon([((ox - o * 4) * SS, (oy + 2) * SS), ((ox + o * 15) * SS, (oy + 4) * SS), ((ox + o * 1) * SS, (oy + 18) * SS)], fill=lid)
    if st['brow']:
        # 赤鬼：粗眉，內側低、外側高（眉頭壓下來比較兇，但眼睛仍然大而圓）
        ix, iy = cx - o * rx * 0.8, cy - ry * 0.98
        ox2, oy2 = cx + o * rx * 0.75, cy - ry * 1.2
        d.line([ix * SS, iy * SS, ox2 * SS, oy2 * SS], fill=lid, width=17 * SS)
        ellipse(d, ix, iy, 8.5, 8.5, fill=lid)
        ellipse(d, ox2, oy2, 8.5, 8.5, fill=lid)
    # 下睫毛：外側一小段細線
    d.arc([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], 20 if not outer_left else 120, 60 if not outer_left else 160, fill=hexrgb('#5a2a30'), width=4 * SS)
    # 高光：左上一個大的、右下一個小的、下面一點亮光（兩眼同一邊：光從同一個方向來）
    ellipse(d, cx - rx * 0.32, cy - ry * 0.36, rx * 0.3, ry * 0.25, fill=(255, 255, 255, 255))
    ellipse(d, cx + rx * 0.34, cy + ry * 0.2, rx * 0.12, ry * 0.1, fill=(255, 255, 255, 255))
    ellipse(d, cx - rx * 0.18, cy + ry * 0.58, rx * 0.07, ry * 0.05, fill=(255, 246, 220, 255))
    return down(im, w, h)


def paint_mouth(st):
    w, h = 192, 128
    im = canvas(w, h, st['skin'])
    d = ImageDraw.Draw(im)
    cx, top, mw, mh = w / 2, h * 0.3, w * 0.34, h * 0.5
    # 張開的笑嘴：上緣平、下緣圓（半個橢圓），裡面暗紅、下面粉紅舌頭
    d.chord([(cx - mw) * SS, (top - mh) * SS, (cx + mw) * SS, (top + mh) * SS], 0, 180, fill=hexrgb('#6e1c2c'))
    tm = Image.new('L', im.size, 0)
    ImageDraw.Draw(tm).ellipse([(cx - mw * 0.6) * SS, (top + mh * 0.35) * SS, (cx + mw * 0.6) * SS, (top + mh * 1.25) * SS], fill=255)
    cm = Image.new('L', im.size, 0)
    ImageDraw.Draw(cm).chord([(cx - mw) * SS, (top - mh) * SS, (cx + mw) * SS, (top + mh) * SS], 0, 180, fill=255)
    from PIL import ImageChops
    im.paste(Image.new('RGBA', im.size, hexrgb('#ff7f8e') + (255,)), (0, 0), ImageChops.multiply(tm, cm))
    d.chord([(cx - mw) * SS, (top - mh) * SS, (cx + mw) * SS, (top + mh) * SS], 0, 180, outline=hexrgb('#4a1420'), width=3 * SS)
    d.line([(cx - mw) * SS, top * SS, (cx + mw) * SS, top * SS], fill=hexrgb('#4a1420'), width=4 * SS)
    if st['mouth'] == 'fangs':
        # 赤鬼：上緣兩顆白色小獠牙（朝下的圓頭三角）
        for sx in (-1, 1):
            fx = cx + sx * mw * 0.55
            d.polygon([((fx - 9) * SS, (top + 1) * SS), ((fx + 9) * SS, (top + 1) * SS), (fx * SS, (top + 22) * SS)], fill=(255, 250, 240, 255))
    return down(im, w, h)


def paint_blush(st):
    w, h = 192, 128
    W, H = w * SS, h * SS
    im = canvas(w, h, st['skin'])
    m = mask_ellipse(W, H, W / 2, H / 2, W * 0.36, H * 0.3, blur=12 * SS).point(lambda v: int(v * 0.9))
    im.paste(Image.new('RGBA', (W, H), hexrgb(st['blush']) + (255,)), (0, 0), m)
    d = ImageDraw.Draw(im)
    for k in (-1, 0, 1):
        x = w / 2 + k * w * 0.13
        d.line([(x + 7) * SS, (h * 0.38) * SS, (x - 7) * SS, (h * 0.62) * SS], fill=hexrgb(st['blushline']), width=4 * SS)
    return down(im, w, h)


# ── 細節貼圖（乘在頂點色上；平均約 0.8～0.9） ──
rng = np.random.default_rng(7)


def noise(w, h, scale, octaves=3):
    """可以左右無縫接起來的雜訊（用整數週期的正弦疊加，不用隨機貼片）"""
    y, x = np.mgrid[0:h, 0:w]
    out = np.zeros((h, w))
    for o in range(octaves):
        f = scale * (2 ** o)
        for _ in range(4):
            kx = rng.integers(1, max(2, int(f))) * 2 * math.pi / w
            ky = rng.uniform(0.5, 1.5) * f * 2 * math.pi / h
            ph = rng.uniform(0, 2 * math.pi)
            out += np.sin(x * kx + y * ky + ph) / (2 ** o)
    out -= out.min()
    return out / max(out.max(), 1e-6)


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).convert('RGBA')


def paint_robe():
    w, h = 512, 512
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    base = 0.95 - 0.05 * noise(w, h, 3)
    # 織紋：很細的經緯線
    weave = 0.97 + 0.03 * np.sign(np.sin(x * math.pi / 2)) * np.sign(np.sin(y * math.pi / 2))
    # 直向的皺褶：繞一圈 7 道，柔和的明暗
    folds = 0.9 + 0.1 * (0.5 + 0.5 * np.cos(x / w * 7 * 2 * math.pi + 0.8 * np.sin(y / h * 3)))
    # 青海波暗紋（一圈 10 個）：同心圓弧，線條只比底色暗一點
    cw = w / 10
    ch = cw / 2
    sea = np.ones((h, w))
    for row in range(int(h / ch) + 2):
        for col in range(11):
            cx = col * cw + (cw / 2 if row % 2 else 0)
            cy = row * ch
            r = np.hypot(((x - cx + w / 2) % w) - w / 2, y - cy)
            above = y <= cy
            ring = (np.abs((r % (cw / 8)) - cw / 16) < 1.2) & (r < cw / 2) & above
            sea = np.where(ring, np.minimum(sea, 0.84), sea)
    a = base * weave * folds * sea
    return to_img(a / a.mean() * 0.86)


def paint_straw():
    w, h = 256, 256
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    # 斜紋編織：兩個方向的條紋交錯
    s1 = np.sin((x + y) * 2 * math.pi / 16)
    s2 = np.sin((x - y) * 2 * math.pi / 16)
    check = np.sign(np.sin(x * 2 * math.pi / 32)) * np.sign(np.sin(y * 2 * math.pi / 32))
    a = 0.86 + 0.1 * np.where(check > 0, s1, s2) - 0.04 * noise(w, h, 4)
    return to_img(a)


def paint_wood():
    w, h = 256, 256
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    g = np.sin((y + 6 * np.sin(x / w * 2 * math.pi * 2)) * 2 * math.pi / 22)
    a = 0.85 + 0.08 * g - 0.06 * noise(w, h, 6)
    return to_img(a)


def paint_hair():
    w, h = 256, 512
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    # 髮束（第二版）：第一版一圈 18 條等寬的稜，近看像南瓜。改成：每一束的寬度與位置用隨機的累積分布決定（寬窄不一），
    # 只在髮束之間畫一條細的暗線（不是整片的明暗起伏），髮尾往下慢慢偏一點（自然的流向）
    edges = np.cumsum(rng.uniform(0.6, 1.4, 22))
    edges = edges / edges[-1]
    u = (x / w + 0.03 * np.sin(y / h * 3 + 1.3) * (y / h)) % 1
    d = np.min(np.abs(u[..., None] - edges[None, None, :]), axis=2)
    d = np.minimum(d, 1 - d)
    gap = np.exp(-(d * w / 1.6) ** 2)
    strand = 0.9 - 0.12 * gap - 0.04 * noise(w, h, 3)
    # 天使環：頭頂下方一圈亮帶（v = 0.28～0.36），被髮束切成一段一段
    band = np.exp(-((y / h - 0.32) / 0.035) ** 2) * (1 - gap)
    a = strand + 0.2 * band
    return to_img(np.clip(a, 0, 1))


def paint_shell():
    """龜殼（河童；乘在殼的頂點色上）：一格一格的六角甲片，邊緣暗溝、中間有同心的生長紋"""
    w, h = 512, 512
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    cw = w / 6
    best = np.full((h, w), 1e9)
    second = np.full((h, w), 1e9)
    for row in range(-1, int(h / (cw * 0.87)) + 2):
        for col in range(6):  # 左右是接起來的（% w），只要一圈 6 個；多放會和繞回來的重疊、交界變成整片暗
            cx = col * cw + (cw / 2 if row % 2 else 0)
            cy = row * cw * 0.87
            dd = np.hypot(((x - cx + w / 2) % w) - w / 2, y - cy)
            second = np.where(dd < best, best, np.minimum(second, dd))
            best = np.minimum(best, dd)
    edge = second - best  # 離兩格交界的距離
    groove = 1 - 0.45 * np.exp(-(edge / 3.0) ** 2)
    rings = 0.94 + 0.06 * np.cos(best / 6.0 * 2 * math.pi)
    return to_img(np.clip(0.95 * groove * rings - 0.04 * noise(w, h, 4), 0, 1))


def paint_tiger():
    """虎皮（赤鬼的腰布；乘在黃色頂點色上）：波浪狀、粗細不一的深色條紋（第一版是幾顆深色球，近看像斑點）"""
    w, h = 512, 512
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    a = np.ones((h, w))
    n = 9
    for k in range(n):
        cx = (k + rng.uniform(-0.2, 0.2)) * w / n
        wid = rng.uniform(7, 13)
        ln = rng.uniform(0.55, 0.9)
        wave = cx + 10 * np.sin(y / h * 2 * math.pi * 1.5 + k) + 6 * np.sin(y / h * 9 + k * 2)
        taper = np.clip(1 - np.abs(y / h - 0.5) / (ln / 2), 0, 1) ** 0.5
        dx = np.abs(((x - wave + w / 2) % w) - w / 2)
        a = np.minimum(a, np.where(dx < wid * taper, 0.22, 1.0))
    fur = 0.94 + 0.06 * noise(w, h, 8)
    return to_img(np.clip(a * fur, 0, 1))


def paint_curls():
    """捲髮（赤鬼）：一圈一圈的小捲（暗色弧線），代替直的髮束"""
    w, h = 256, 512
    y, x = np.mgrid[0:h, 0:w].astype(np.float64)
    a = np.full((h, w), 0.92)
    cs = 32
    for row in range(int(h / cs) + 1):
        for col in range(int(w / cs) + 1):
            cx = col * cs + (cs / 2 if row % 2 else 0) + rng.uniform(-4, 4)
            cy = row * cs + rng.uniform(-4, 4)
            r = np.hypot(((x - cx + w / 2) % w) - w / 2, y - cy)
            ang = np.arctan2(y - cy, x - cx)
            arc = (np.abs(r - cs * 0.36) < 1.6) & (ang > -0.3) & (ang < 2.6)
            a = np.where(arc, 0.66, a)
    return to_img(np.clip(a - 0.04 * noise(w, h, 3), 0, 1))


def tomoe(d, cx, cy, rx, ry, col):
    """三巴紋：三個逗點形（頭是圓、尾巴沿著圓繞出去）；rx／ry 分開是因為球面展開後橫向會被壓扁"""
    for i in range(3):
        a0 = i * 2 * math.pi / 3
        hx, hy = cx + math.cos(a0) * rx * 0.42, cy + math.sin(a0) * ry * 0.42
        ellipse(d, hx, hy, rx * 0.3, ry * 0.3, fill=col)
        pts = []
        for k in range(13):
            t = k / 12
            a = a0 + t * 2.1
            rr = 0.42 + 0.48 * t
            wdt = 0.28 * (1 - t)
            pts.append((cx + math.cos(a) * rx * (rr + wdt), cy + math.sin(a) * ry * (rr + wdt)))
        for k in range(12, -1, -1):
            t = k / 12
            a = a0 + t * 2.1
            rr = 0.42 + 0.48 * t
            wdt = 0.28 * (1 - t)
            pts.append((cx + math.cos(a) * rx * (rr - wdt * 0.2), cy + math.sin(a) * ry * (rr - wdt * 0.2)))
        d.polygon([(px * SS, py * SS) for px, py in pts], fill=col)


def paint_paper():
    """燈籠紙（真實顏色）：u 繞一圈（u = 0.75 是正面）、v 從上到下。中間最亮、上下偏橘；竹骨的影子；正面與背面各一個紅色的三巴紋"""
    w, h = 256, 512
    im = vgrad(w, h, [(0.0, '#d8601e'), (0.2, '#f59a3a'), (0.5, '#ffd98a'), (0.8, '#f59a3a'), (1.0, '#d8601e')])
    d = ImageDraw.Draw(im)
    for k in range(1, 9):
        yy = h * k / 9
        d.line([0, yy, w, yy], fill=hexrgb('#b8481e') + (255,), width=4)
    im = im.resize((w * SS, h * SS), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for cu in (0.25, 0.75):
        # 第二版：外圈粗一點、三巴紋是真的逗點形（第一版是三顆圓加線，看起來像蟲）；橫向半徑 / 直向半徑 ≈ 0.62（球面展開後正面看是圓的）
        cx, cy, rx = cu * w, 0.5 * h, 0.13 * w
        ry = rx / 0.62 * (w / h) * 2
        col = hexrgb('#a01a16')
        ellipse(d, cx, cy, rx * 1.18, ry * 1.18, outline=col, width=8 * SS)
        tomoe(d, cx, cy, rx * 0.95, ry * 0.95, col)
    return down(im, w, h)


def paint(out_dir, char='chochin'):
    """char：chochin／kappa／oni。版面一樣，每一格畫的東西依角色：robe 格 = 僧衣（小僧）、龜殼（河童）、虎皮（赤鬼）；hair 格 = 直髮束或捲髮。"""
    global rng
    rng = np.random.default_rng(7)  # 每次從同一個種子開始：同一個角色每次建模畫出來都一樣（.png 不會無故變動）
    st = STYLES[char]
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    atlas = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 255))
    cells = [('eyeL', paint_eye(True, st)), ('eyeR', paint_eye(False, st)), ('blush', paint_blush(st))]
    if st['mouth']:
        cells.append(('mouth', paint_mouth(st)))
    if char == 'chochin':
        cells += [('paper', paint_paper()), ('robe', paint_robe()), ('straw', paint_straw()), ('wood', paint_wood()), ('hair', paint_hair())]
    elif char == 'kappa':
        cells += [('robe', paint_shell()), ('hair', paint_hair())]
    else:
        cells += [('robe', paint_tiger()), ('hair', paint_curls()), ('wood', paint_wood())]
    for key, img in cells:
        x, y, w, h = R[key]
        atlas.paste(img.resize((w, h)), (x, y))
    atlas.convert('RGB').save(out / f'{char}-atlas.png', optimize=True)
    if char != 'chochin':
        return out / f'{char}-atlas.png'
    # 發光貼圖：只有燈籠紙那一格（亮度照紙的顏色，家紋與竹骨比較暗）
    glow = Image.new('RGB', (SIZE, SIZE), (0, 0, 0))
    x, y, w, h = R['paper']
    glow.paste(atlas.crop((x, y, x + w, y + h)).convert('RGB'), (x, y))
    glow.resize((256, 256), Image.LANCZOS).save(out / 'chochin-glow.png', optimize=True)
    return out / 'chochin-atlas.png'


if __name__ == '__main__':
    print(paint(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'src/assets/textures', sys.argv[2] if len(sys.argv) > 2 else 'chochin'))
