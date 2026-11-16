#!/usr/bin/env bash
# 打包測試頁＋套上 Artifact 外殼＋開不准 fetch 的本機伺服器。
# 用法：bash scripts/packed/prepare.sh <要發佈的 html 路徑（放 scratchpad）>
# 之後：BASE_URL=http://localhost:5181/yokai-test.html NODE_PATH=node_modules node scripts/packed/check.mjs
set -euo pipefail
OUT="${1:?要給輸出路徑，例如 <scratchpad>/yokai-test.html}"
SERVE_DIR="${PACKED_DIR:-/tmp/yokai-packed}"
PORT="${PACKED_PORT:-5181}"
cd "$(dirname "$0")/../.."
npm run pack:test >/dev/null
# Artifact 外殼：doctype、viewport、空的 icon（沒有 icon 會有假 404 錯誤）
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="icon" href="data:,"></head><body>'; cat dist-artifact/yokai-test.html; } > "$OUT"
mkdir -p "$SERVE_DIR"
cp "$OUT" "$SERVE_DIR/yokai-test.html"
# 埠上已經有別的伺服器（可能在送別的資料夾的舊檔）→ 確認送出來的就是剛打包的檔，不是就換下一個埠
want=$(md5sum < "$OUT" | cut -d' ' -f1)
for try in 0 1 2 3 4; do
  P=$((PORT + try))
  if ! curl -s -o /dev/null "http://localhost:$P/"; then
    nohup python3 scripts/packed/serve.py "$SERVE_DIR" "$P" >/dev/null 2>&1 &
    sleep 1
  fi
  got=$(curl -s "http://localhost:$P/yokai-test.html" | md5sum | cut -d' ' -f1)
  if [ "$got" = "$want" ]; then PORT=$P; break; fi
  if [ "$try" = 4 ]; then echo "找不到送出新檔的埠（$PORT～$P）" >&2; exit 1; fi
done
echo "打包檔：$OUT（$(du -k "$OUT" | cut -f1) KB）"
echo "BASE_URL=http://localhost:$PORT/yokai-test.html"
