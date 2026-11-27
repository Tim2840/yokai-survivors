"""地面／道具的貼圖層（docs/37 第一批）：把 Poly Haven 的 CC0 照片貼圖轉成「細節貼圖」，放進 src/assets/textures/。
用法：python3 tools/textures/prep_layers.py [candidates 資料夾]（先跑 node scripts/assets/fetch-polyhaven.mjs <id…>）

為什麼要轉（不直接用照片）：
- 顏色由我們的色票決定（地形頂點色 × 貼圖），照片原本的綠、棕會讓顏色失控（和風乾淨卡通，D89）。
  所以每個色頻除以自己的平均（變成中性灰），只留一部分原本的色相變化（CHROMA），對比度乘上 CONTRAST。
- 平均亮度固定在 MEAN（貼圖是「乘」上去的，地形頂點色要乘 1/MEAN 補回來；遊戲端讀 LAYER_MEAN）。
- 石板與岩石把 AO（縫隙的陰影）乘進去：沒有法線貼圖也看得出凹凸（卡通著色的 3 階光影配法線貼圖會碎成一塊一塊）。
- 先 3×3 拼起來再縮小、取中間：縮小時邊緣不會被夾住，拼接處仍然無縫。
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'candidates'
OUT = ROOT / 'src/assets/textures'
SIZE = 512
MEAN = 0.72

# 圖層：遊戲裡的名字 → (Poly Haven id, 對比, 保留多少原本色相, 乘不乘 AO)
LAYERS = {
    'grass': ('sparse_grass', 1.7, 0.55, False),
    'dirt': ('park_dirt', 1.4, 0.4, False),
    'stone': ('grey_stone_path', 1.25, 0.2, True),
    'rock': ('rock_face_03', 1.6, 0.25, True),
    'wood': ('weathered_planks', 1.3, 0.3, True),
}


def tile_resize(im, size):
    w, h = im.size
    big = Image.new(im.mode, (w * 3, h * 3))
    for i in range(3):
        for j in range(3):
            big.paste(im, (i * w, j * h))
    big = big.resize((size * 3, size * 3), Image.LANCZOS)
    return big.crop((size, size, size * 2, size * 2))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, (pid, contrast, chroma, use_ao) in LAYERS.items():
        d = SRC / 'polyhaven' / pid
        rgb = np.asarray(tile_resize(Image.open(d / f'{pid}_Diffuse.jpg').convert('RGB'), SIZE), dtype=np.float64) / 255
        if use_ao:
            ao = np.asarray(tile_resize(Image.open(d / f'{pid}_AO.jpg').convert('L'), SIZE), dtype=np.float64) / 255
            rgb = rgb * ao[..., None]
        mean = rgb.reshape(-1, 3).mean(0)
        neutral = rgb / mean  # 每個色頻平均 1
        lum = neutral.mean(2, keepdims=True)
        x = lum * (1 - chroma) + neutral * chroma
        x = 1 + (x - 1) * contrast
        x = x * MEAN
        # 太亮的點夾到 1 會讓平均掉一點；修正回 MEAN
        x = np.clip(x, 0, 1)
        x = np.clip(x * (MEAN / x.mean()), 0, 1)
        img = Image.fromarray((x * 255 + 0.5).astype(np.uint8))
        path = OUT / f'ground-{name}.jpg'
        img.save(path, quality=84, optimize=True, progressive=True)
        report[name] = {'source': pid, 'mean': round(float(x.mean()), 3), 'bytes': path.stat().st_size}
        print(name, report[name])
    # 遊戲端讀這份（src/art/worldMaterial.ts 的 LAYER_MEAN）：頂點色要乘 1/平均 補亮度，兩邊不會對不上
    (OUT / 'layers.json').write_text(json.dumps({'mean': MEAN, 'layers': report}, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps(report, ensure_ascii=False))


main()
