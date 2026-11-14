"""稽核自己的測試（docs/29）：一顆「好的頭」要通過、一顆「壞的頭」要被抓到——壞的頭重現 2026-11-14 使用者指出的錯
（瀏海和後腦頭髮是兩個獨立物件、中間露出頭皮；眼距太寬；嘴和眼睛重疊；有懸空的零件）。
用法：python3 tools/blender/audit_selftest.py <裝了 bpy 的資料夾>；全部符合預期 exit 0，否則 exit 1。
改 audit.py 的規則之後一定要跑：確認它還抓得到這些錯（「舊版會紅」）。"""
import sys

sys.path.insert(0, sys.argv[1])
sys.path.insert(0, __file__.rsplit('/', 1)[0])

import lib  # noqa: E402
import audit  # noqa: E402
from lib import Builder  # noqa: E402

SPEC = {'head': ['head'], 'hair': ['hair', 'cap', 'fringe'], 'eyes': ['eye'], 'mouth': ['mouth']}
SKIN, HAIR, INK = '#ffd8bd', '#5a3b33', '#2a1830'


def head(b):
    b.sphere('head', 0.36, (0, 0, 0.94), SKIN, 'head', seg=32, rings=20)


def face(b, eye_x, eye_z, mouth_z):
    for sx in (-1, 1):
        b.sphere('eye', 0.08, (sx * eye_x, -(0.36 ** 2 - eye_x ** 2 - (eye_z - 0.94) ** 2) ** 0.5, eye_z), INK, 'head', scale=(0.8, 0.4, 1.2), seg=16, rings=10)
    b.sphere('mouth', 0.03, (0, -(0.36 ** 2 - (mouth_z - 0.94) ** 2) ** 0.5, mouth_z), INK, 'head', scale=(1.4, 0.5, 0.5), seg=12, rings=8)


def good():
    lib.reset()
    b = Builder()
    head(b)
    # 一整顆略大的球、往上往後一點：頭頂到髮際線都是頭髮，往下只換一次皮膚
    b.sphere('hair', 0.372, (0, 0.02, 0.975), HAIR, 'head', seg=32, rings=20)
    face(b, 0.125, 0.86, 0.72)
    return b.parts


def bad():
    lib.reset()
    b = Builder()
    head(b)
    b.sphere('cap', 0.372, (0, 0.13, 0.99), HAIR, 'head', seg=24, rings=16)  # 後腦一顆大球
    b.sphere('fringe', 0.2, (0, -0.255, 1.14), HAIR, 'head', scale=(1.6, 0.32, 0.45), seg=16, rings=10)  # 額頭另一塊，和後腦之間露出頭皮
    face(b, 0.2, 0.8, 0.79)  # 眼距太寬、嘴擠到眼睛的高度
    b.sphere('stray', 0.03, (0.7, 0, 1.5), INK, 'head')  # 懸空的零件
    return b.parts


ok = True
p, _, m = audit.audit_character(good(), SPEC)
print('好的頭：', m, '→', '通過' if not p else p)
if p:
    ok = False
p, _, m = audit.audit_character(bad(), SPEC)
print('壞的頭：', m)
for want in ('頭髮不連續', '頭髮太厚', '眼距不對', '嘴和眼睛上下重疊', '懸空'):
    hit = any(want in x for x in p)
    print(f'   {"✓ 抓到" if hit else "✗ 沒抓到"}：{want}')
    ok = ok and hit
print('稽核自我測試：', '✓ 通過' if ok else '✗ 不通過')
sys.exit(0 if ok else 1)
