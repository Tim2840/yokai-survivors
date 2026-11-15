// 敵人轉檯圖（docs/29 第二道，敵人版）：同一種敵人排一排，分別朝 正面／右前 45°／右側／背面／左側，再加一張「遊玩距離」。
// 敵人是實例化網格，不能單獨轉鏡頭，所以改成轉敵人（__game.enemyYaw）；玩家藏起來（__game.hidePlayer）。
// 用法：NODE_PATH=node_modules node scripts/shots/enemy-turnaround.mjs <標籤> <敵人 id，例 villager> [look] → screenshots/enemy-<標籤>.png
import { execFileSync } from 'node:child_process';
import { launch, openPage, startRun } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const id = process.argv[3] || 'villager';
const look = process.argv[4] ?? 'cel';
const YAWS = [['正面', 0], ['右前 45°', 45], ['右側', 90], ['背面', 180], ['左側', -90]];
const browser = await launch();
const ctx = await openPage(browser, { name: 'desktop', width: 1280, height: 720 }, `?q=1&seed=93&model=blender&look=${look}`);
const { page } = ctx;
await startRun(ctx);
await page.waitForFunction(() => window.__game.blenderReady, null, { timeout: 30000 });
await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' });
await page.evaluate(({ id, yaws }) => {
  const g = window.__game;
  g.god = true;
  g.clearEnemies();
  g.freeze(true);
  g.hidePlayer(true);
  yaws.forEach(([, deg], k) => {
    const i = g.spawnAt(id, -2.6 + k * 1.3, -2.2, 0, 0);
    g.enemyYaw(i, deg);
  });
  g.setCamera(0, 6, 2.2);
  g.render(); g.render();
}, { id, yaws: YAWS });
await page.screenshot({ path: `screenshots/enemy-${tag}-close.png` });
await page.evaluate(() => { const g = window.__game; g.setCamera(0, g.playCamera.pitch, g.playCamera.dist); g.render(); g.render(); });
await page.screenshot({ path: `screenshots/enemy-${tag}-play.png` });
await ctx.close();
await browser.close();
execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
a=Image.open('screenshots/enemy-${tag}-close.png').convert('RGB'); b=Image.open('screenshots/enemy-${tag}-play.png').convert('RGB')
w,h=a.size
a=a.crop((0,140,w,560)); b=b.crop((w//2-320,h//2-120,w//2+320,h//2+200)).resize((1280,640))
s=Image.new('RGB',(w,a.size[1]+640),(20,20,28)); s.paste(a,(0,0)); s.paste(b,(0,a.size[1]))
s.save('screenshots/enemy-${tag}.png')
`], { stdio: 'inherit' });
console.log(`screenshots/enemy-${tag}.png（上：${YAWS.map((y) => y[0]).join('、')}；下：遊玩距離放大 2 倍）`);
