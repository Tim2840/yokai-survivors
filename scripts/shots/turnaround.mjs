// 角色轉檯圖（docs/29 模型驗收第二道）：固定 9 個視角，從「真正的正面」算起（讀角色面向，不靠猜角度），沒有 HUD。
// 正面、右前 45°、右側、背面、左側、左前 45°、俯視、臉部特寫、手機遊玩大小。每格左上角有標籤。
// 用法：NODE_PATH=node_modules node scripts/shots/turnaround.mjs <標籤> [look] → screenshots/turnaround-<標籤>.png
// **回報任何模型改動前一定要跑，並把整張圖逐格讀過**（只看斜前方一個角度，側面與背面的缺陷看不到）。
import { execFileSync } from 'node:child_process';
import { launch, openPage, startRun } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const look = process.argv[3] ?? 'cel';
const VIEWS = [
  { name: '1 正面', dyaw: 0, pitch: 3, dist: 2.6 },
  { name: '2 右前 45°', dyaw: 45, pitch: 3, dist: 2.6 },
  { name: '3 右側', dyaw: 90, pitch: 3, dist: 2.6 },
  { name: '4 背面', dyaw: 180, pitch: 3, dist: 2.6 },
  { name: '5 左側', dyaw: -90, pitch: 3, dist: 2.6 },
  { name: '6 左前 45°', dyaw: -45, pitch: 3, dist: 2.6 },
  { name: '7 俯視', dyaw: 0, pitch: 60, dist: 3.2 },
  { name: '8 臉部特寫', dyaw: 0, pitch: 0, dist: 1.95 },
  { name: '9 遊玩視角與大小', dyaw: 180, pitch: 0, dist: 0, play: true },
];
const browser = await launch();
const ctx = await openPage(browser, { name: 'desktop', width: 1280, height: 720 }, `?q=1&seed=93&model=blender&look=${look}`);
const { page } = ctx;
await startRun(ctx);
await page.waitForFunction(() => window.__game.blenderReady, null, { timeout: 30000 });
await page.evaluate(() => { const g = window.__game; g.god = true; g.clearEnemies(); g.driveWorld(1, 0.4); for (let i = 0; i < 8; i++) g.advance(0.1); g.driveWorld(null); for (let i = 0; i < 20; i++) g.advance(0.1); });
// 藏掉所有介面，只留畫布與標籤
await page.addStyleTag({ content: 'body *:not(canvas):not(#ta-label){visibility:hidden !important} canvas{visibility:visible !important} #ta-label{position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:99999;font:700 22px sans-serif;color:#fff;background:rgba(0,0,0,.65);padding:4px 12px;border-radius:8px;visibility:visible !important}' });
await page.evaluate(() => { const d = document.createElement('div'); d.id = 'ta-label'; document.body.appendChild(d); });
const files = [];
for (let k = 0; k < VIEWS.length; k++) {
  const v = VIEWS[k];
  await page.evaluate((v) => {
    const g = window.__game;
    const yaw = g.facingDeg + v.dyaw;
    if (v.play) g.setCamera(yaw, g.playCamera.pitch, g.playCamera.dist); else g.setCamera(yaw, v.pitch, v.dist);
    document.getElementById('ta-label').textContent = v.name;
    g.advance(0.02); g.render(); g.render();
  }, v);
  const f = `screenshots/turnaround-${tag}-${k + 1}.png`;
  await page.screenshot({ path: f });
  files.push(f);
}
await ctx.close();
await browser.close();
execFileSync('python3', ['scripts/shots/sheet.py', `screenshots/turnaround-${tag}.png`, ...files], { stdio: 'inherit' });
console.log(`screenshots/turnaround-${tag}.png`);
