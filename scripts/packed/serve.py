# 打包檔的本機伺服器，模擬 Artifact 的限制：不准 fetch（connect-src 'none'）。
# 用法：python3 scripts/packed/serve.py <資料夾> [埠，預設 5181]
# 為什麼：測試頁在 Artifact 裡不能 fetch，模型檔若用 fetch 載入會默默退回舊模型（使用者 2026-11-14「為什麼造型又恢復以前醜醜的樣子」）。
import http.server, socketserver, sys, os, functools
root = sys.argv[1] if len(sys.argv) > 1 else '.'
port = int(sys.argv[2]) if len(sys.argv) > 2 else 5181
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'none'")
        super().end_headers()
    def log_message(self, *a):
        pass
socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(('', port), functools.partial(H, directory=os.path.abspath(root))).serve_forever()
