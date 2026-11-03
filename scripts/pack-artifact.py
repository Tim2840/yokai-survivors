"""
把 `npm run build:single` 的輸出（dist-single/index.html）轉成 Artifact 分享頁用的內容：
拿掉 <html>、<head>、<body> 外殼標籤，其餘原樣保留。

用法：python3 scripts/pack-artifact.py <輸出檔路徑> [頁面標題]
（測試頁用「百鬼陣 測試版」，主網址不給、維持「百鬼陣」）

踩過的雷：比對標籤一定要用 \b。只寫 `</?head` 會連 <header>（頂端介面的外框）一起刪掉，
分享頁就沒有介面，但開發版完全正常，很難發現。所以最後有斷言，找不到頂端容器（#app、#ui）就直接失敗。
"""
import re
import sys

s = open('dist-single/index.html', encoding='utf-8').read()
s = re.sub(r'<!doctype html>\s*', '', s, flags=re.I)
s = re.sub(r'</?(?:html|head|body)\b[^>]*>', '', s)
s = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>|<link rel="icon"[^>]*>|<link rel="preconnect"[^>]*>', '', s)
assert re.search(r'<div id="app"></div>', s) and re.search(r'<div id="ui"></div>', s), '打包後找不到 #app／#ui：標籤比對誤刪了東西'
if len(sys.argv) > 2:
    s, n = re.subn(r'<title>[^<]*</title>', '<title>' + sys.argv[2] + '</title>', s, count=1)
    assert n == 1, '找不到 <title>'
s = '<meta name="color-scheme" content="dark">\n' + s.lstrip()
open(sys.argv[1], 'w', encoding='utf-8').write(s)
