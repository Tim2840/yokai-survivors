"""提燈小僧的貼圖集（docs/37 第一批）：臉（眼睛、嘴、腮紅）、布料、斗笠編織、木紋、頭髮、燈籠紙，全部用程式畫（不是別人的圖）。
用法：python3 tools/blender/paint_atlas.py [輸出資料夾，預設 src/assets/textures]（build.py 建模前也會自動呼叫）
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
def paint_eye(outer_left):
    w, h = 256, 320
    W, H = w * SS, h * SS
    im = canvas(w, h, SKIN)
    cx, cy, rx, ry = 0.5 * w, 0.55 * h, 0.41 * w, 0.42 * h
    # 虹彩：上深（深紫）→ 中段酒紅 → 下面暖琥珀；下半部再亮一圈
    iris = vgrad(W, H, [(0.0, '#1c1028'), (0.42, '#3a1a34'), (0.68, '#8a3f2a'), (0.9, '#e09238'), (1.0, '#f2b450')])
    im.paste(iris, (0, 0), mask_ellipse(W, H, cx * SS, cy * SS, rx * SS, ry * SS))
    glowm = mask_ellipse(W, H, cx * SS, (cy + 0.2 * ry) * SS, rx * 0.72 * SS, ry * 0.5 * SS, blur=10 * SS)
    im.paste(Image.new('RGBA', (W, H), hexrgb('#ffc866') + (255,)), (0, 0), glowm.point(lambda v: int(v * 0.55)))
    d = ImageDraw.Draw(im)
    # 瞳孔（直向的橢圓）＋外圈深色描線
    ellipse(d, cx, cy + 0.02 * h, rx * 0.42, ry * 0.5, fill=hexrgb('#120818'))
    ellipse(d, cx, cy, rx, ry, outline=hexrgb('#24121f'), width=5 * SS)
    # 上眼皮：粗的弧線蓋在眼睛上緣，外眼角往外上翹出一撮睫毛
    lid = hexrgb('#24121f')
    d.arc([(cx - rx * 1.06) * SS, (cy - ry * 1.04) * SS, (cx + rx * 1.06) * SS, (cy + ry * 1.04) * SS], 200, 340, fill=lid, width=15 * SS)
    o = -1 if outer_left else 1  # 外眼角在哪一邊
    ox, oy = cx + o * rx * 0.95, cy - ry * 0.42
    d.polygon([((ox - o * 12) * SS, (oy - 16) * SS), ((ox + o * 16) * SS, (oy - 30) * SS), ((ox + o * 4) * SS, (oy + 6) * SS)], fill=lid)
    d.polygon([((ox - o * 4) * SS, (oy + 2) * SS), ((ox + o * 15) * SS, (oy + 4) * SS), ((ox + o * 1) * SS, (oy + 18) * SS)], fill=lid)
    # 下睫毛：外側一小段細線
    d.arc([(cx - rx) * SS, (cy - ry) * SS, (cx + rx) * SS, (cy + ry) * SS], 20 if not outer_left else 120, 60 if not outer_left else 160, fill=hexrgb('#5a2a30'), width=4 * SS)
    # 高光：左上一個大的、右下一個小的、下面一點亮光（兩眼同一邊：光從同一個方向來）
    ellipse(d, cx - rx * 0.32, cy - ry * 0.36, rx * 0.3, ry * 0.25, fill=(255, 255, 255, 255))
    ellipse(d, cx + rx * 0.34, cy + ry * 0.2, rx * 0.12, ry * 0.1, fill=(255, 255, 255, 255))
    ellipse(d, cx - rx * 0.18, cy + ry * 0.58, rx * 0.07, ry * 0.05, fill=(255, 246, 220, 255))
    return down(im, w, h)


def paint_mouth():
    w, h = 192, 128
    im = canvas(w, h, SKIN)
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
    return down(im, w, h)


def paint_blush():
    w, h = 192, 128
    W, H = w * SS, h * SS
    im = canvas(w, h, SKIN)
    m = mask_ellipse(W, H, W / 2, H / 2, W * 0.36, H * 0.3, blur=12 * SS).point(lambda v: int(v * 0.9))
    im.paste(Image.new('RGBA', (W, H), hexrgb('#ff8c8c') + (255,)), (0, 0), m)
    d = ImageDraw.Draw(im)
    for k in (-1, 0, 1):
        x = w / 2 + k * w * 0.13
        d.line([(x + 7) * SS, (h * 0.38) * SS, (x - 7) * SS, (h * 0.62) * SS], fill=hexrgb('#f0606e'), width=4 * SS)
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
    # 髮束：往下流的線條（一圈 24 束），每束中間亮、邊緣暗
    # 髮束寬窄不一（兩組週期疊加），對比低——太整齊會像南瓜的稜
    k = 18
    sx = (x / w * k + 0.25 * np.sin(y / h * 5 + x / w * 2 * math.pi * 3)) % 1
    sx2 = (x / w * 31 + 0.3 * np.sin(y / h * 4)) % 1
    strand = 0.84 + 0.06 * np.sin(sx * math.pi) + 0.04 * np.sin(sx2 * math.pi) - 0.04 * noise(w, h, 3)
    # 天使環：頭頂下方一圈亮帶（v = 0.28～0.36），被髮束切成一段一段
    band = np.exp(-((y / h - 0.32) / 0.035) ** 2) * (0.5 + 0.5 * np.sin(sx * math.pi))
    a = strand + 0.2 * band
    return to_img(np.clip(a, 0, 1))


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
        cx, cy, r = cu * w, 0.5 * h, 0.12 * w
        ellipse(d, cx, cy, r * 1.25, r * 2.0, outline=hexrgb('#a81c18'), width=7 * SS)  # 球面展開後橫向會被壓扁，先拉長
        for i in range(3):
            a = i * 2 * math.pi / 3 - math.pi / 2
            px, py = cx + math.cos(a) * r * 0.5, cy + math.sin(a) * r * 0.8
            ellipse(d, px, py, r * 0.32, r * 0.5, fill=hexrgb('#a81c18'))
            qa = a + 1.1
            d.line([px * SS, py * SS, (cx + math.cos(qa) * r * 0.95) * SS, (cy + math.sin(qa) * r * 1.5) * SS], fill=hexrgb('#a81c18'), width=5 * SS)
    return down(im, w, h)


def paint(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    atlas = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 255))
    for key, img in (('eyeL', paint_eye(True)), ('eyeR', paint_eye(False)), ('mouth', paint_mouth()), ('blush', paint_blush()),
                     ('paper', paint_paper()), ('robe', paint_robe()), ('straw', paint_straw()), ('wood', paint_wood()), ('hair', paint_hair())):
        x, y, w, h = R[key]
        atlas.paste(img.resize((w, h)), (x, y))
    atlas.convert('RGB').save(out / 'chochin-atlas.png', optimize=True)
    # 發光貼圖：只有燈籠紙那一格（亮度照紙的顏色，家紋與竹骨比較暗）
    glow = Image.new('RGB', (SIZE, SIZE), (0, 0, 0))
    x, y, w, h = R['paper']
    glow.paste(atlas.crop((x, y, x + w, y + h)).convert('RGB'), (x, y))
    glow.resize((256, 256), Image.LANCZOS).save(out / 'chochin-glow.png', optimize=True)
    return out / 'chochin-atlas.png'


if __name__ == '__main__':
    print(paint(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'src/assets/textures'))
