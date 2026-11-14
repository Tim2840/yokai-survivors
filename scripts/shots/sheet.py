"""把轉檯圖的 9 張截圖裁成中間一塊、排成 3×3 一張（scripts/shots/turnaround.mjs 用）。用法：sheet.py <輸出> <圖 1> … <圖 9>"""
import sys
from PIL import Image

out, files = sys.argv[1], sys.argv[2:]
W, H = 440, 520
tiles = []
for f in files:
    im = Image.open(f).convert('RGB')
    w, h = im.size
    # 標籤在最上方中間：保留上緣，左右以畫面中心裁
    # 角色在畫面中間偏下；標籤在最上方，另外貼回左上角
    t = im.crop(((w - W) // 2, 150, (w + W) // 2, 150 + H))
    t.paste(im.crop(((w - 360) // 2, 4, (w + 360) // 2, 44)), (0, 0))
    tiles.append(t)
cols = 3
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows), (20, 20, 28))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % cols) * W, (i // cols) * H))
sheet.save(out)
