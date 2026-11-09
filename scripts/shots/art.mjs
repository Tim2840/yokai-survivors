// 美術截圖（D71，docs/23）：同一局種子、同樣幾個鏡頭，前後對照用。
// 用法：NODE_PATH=node_modules node scripts/shots/art.mjs <標籤，例 before／after>（要開著 npx vite --port 5173）
import { launch, openPage, startRun, VIEWPORTS } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const VIEWS = [
  { name: 'high', yaw: 0, pitch: 55 },
  { name: 'mid', yaw: 0, pitch: 38 },
  { name: 'low', yaw: 350, pitch: 12 },
];
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  const ctx = await openPage(browser, vp, '?q=4&seed=93');
  const { page } = ctx;
  await startRun(ctx);
  await page.evaluate(() => { window.__game.god = true; window.__game.clearEnemies(); });
  for (const v of VIEWS) {
    await page.evaluate(({ yaw, pitch }) => { window.__game.setCamera(yaw, pitch); window.__game.render(); window.__game.render(); }, v);
    await page.screenshot({ path: `screenshots/art-${tag}-${v.name}-${vp.name}.png` });
  }
  // 忙碌的畫面：一堆敵人＋魂火＋箭，看氣氛裝飾有沒有干擾可讀性
  await page.evaluate(() => {
    const g = window.__game;
    g.setCamera(0, 40);
    g.spawn('villager', 70);
    g.spawn('ashigaru', 8);
    g.spawn('yumi', 4);
    g.tankEnemies();
    g.dropOrbs(14, 4);
    for (let i = 0; i < 6; i++) g.advance(0.2);
    g.render();
    g.render();
  });
  await page.screenshot({ path: `screenshots/art-${tag}-busy-${vp.name}.png` });
  await ctx.close();
}
await browser.close();
console.log('done');
