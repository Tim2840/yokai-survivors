// 建模師的改前／改後對照（docs/37 第 4 節）：同一局種子、同樣的鏡頭、Blender 模型、沒有敵人（看場景與角色），
// 最後一張是「忙碌的畫面」（一堆敵人＋魂火），看精緻化之後敵人有沒有和地面混在一起。
// 用法：NODE_PATH=node_modules node scripts/shots/art-compare.mjs <標籤，例 before／after>（要開著 npx vite --port 5173）
// → screenshots/artcmp-<標籤>-<鏡頭>-<裝置>.png
import { launch, openPage, startRun, VIEWPORTS } from '../regress/lib.mjs';
import { waitBlender } from './helpers.mjs';

const tag = process.argv[2] || 'now';
const VIEWS = [
  { name: 'play', yaw: 0, pitch: 38 }, // 一般遊玩鏡頭（預設距離）
  { name: 'low', yaw: 200, pitch: 10, dist: 6 }, // 低角度看地面質感與道具
  { name: 'close', yaw: 160, pitch: 14, dist: 3.2 }, // 角色近景
];
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  const ctx = await openPage(browser, vp, '?q=4&seed=93&model=blender');
  const { page } = ctx;
  await startRun(ctx);
  await waitBlender(page);
  await page.evaluate(() => { const g = window.__game; g.god = true; g.clearEnemies(); g.advance(0.1); g.freeze(true); });
  for (const v of VIEWS) {
    await page.evaluate(({ yaw, pitch, dist }) => { const g = window.__game; g.freeze(false); g.setCamera(yaw, pitch, dist); g.freeze(true); g.render(); g.render(); }, v);
    await page.screenshot({ path: `screenshots/artcmp-${tag}-${v.name}-${vp.name}.png` });
  }
  await page.evaluate(() => {
    const g = window.__game;
    g.freeze(false);
    g.setCamera(0, 40);
    g.spawn('villager', 50);
    g.spawn('ashigaru', 8);
    g.spawn('yumi', 4);
    g.tankEnemies();
    g.dropOrbs(14, 4);
    for (let i = 0; i < 40; i++) g.advance(0.05);
    g.freeze(true);
    g.render();
    g.render();
  });
  await page.screenshot({ path: `screenshots/artcmp-${tag}-busy-${vp.name}.png` });
  const perf = await page.evaluate(() => window.__game.perf);
  console.log(vp.name, JSON.stringify(perf));
  await ctx.close?.();
}
await browser.close();
