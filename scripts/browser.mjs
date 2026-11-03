// 測試腳本選哪個瀏覽器（所有 scripts/*.mjs 共用）。
//   CHROMIUM_PATH=...  指定瀏覽器執行檔（最優先）
//   PW_CHANNEL=...     指定 Playwright 的 channel（例如 msedge、chrome）
//   舊容器有 /opt/pw-browsers/chromium 就用它
//   Windows：預設用內建的 Edge（msedge）。Playwright 自己下載的 chrome-headless-shell.exe 是「命令列程式」，
//   每次啟動 Windows 都會跳出一個黑色命令列視窗，跑整套測試會一直閃；Edge 是圖形程式，不會跳視窗。
//   都沒有：用 Playwright 預設（npx playwright install chromium）。
import { existsSync } from 'node:fs';

export function browserChoice() {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH };
  if (process.env.PW_CHANNEL) return { channel: process.env.PW_CHANNEL };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium' };
  if (process.platform === 'win32' && existsSync('C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')) return { channel: 'msedge' };
  return {};
}
