// 美術截圖（D71，docs/23）：同一局種子、同樣幾個鏡頭，前後對照用。
// 用法：NODE_PATH=node_modules node scripts/shots/art.mjs <標籤，例 before／after>（要開著 npx vite --port 5173）
import { launch, openPage, startRun, VIEWPORTS } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const look = process.argv[3] ? `&look=${process.argv[3]}` : '';
const VIEWS = [
  { name: 'high', yaw: 0, pitch: 55 },
  { name: 'mid', yaw: 0, pitch: 38 },
  { name: 'low', yaw: 350, pitch: 12 },
];
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  const ctx = await openPage(browser, vp, '?q=4&seed=93' + look);
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
  // 第 2 關（日系風格是黃昏）：走正常的過關流程
  const levelups = async () => { while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click(); };
  await page.evaluate(() => { window.__game.clearEnemies(); window.__game.clearStage(); });
  await page.waitForFunction(() => window.__game.state === 'INTERMISSION' || window.__game.screens.includes('levelup'), null, { timeout: 20000 });
  await levelups();
  await page.waitForFunction(() => window.__game.state === 'INTERMISSION', null, { timeout: 20000 });
  await levelups();
  await page.locator('#btn-inter-next').click();
  await page.waitForFunction(() => window.__game.state === 'COMBAT' && window.__game.run.stage === 2, null, { timeout: 20000 });
  await page.waitForTimeout(1500); // 換關的淡入（畫面上的遮罩）跑完再拍
  for (const v of [VIEWS[1], VIEWS[2]]) {
    await page.evaluate(({ yaw, pitch }) => { window.__game.god = true; window.__game.setCamera(yaw, pitch); window.__game.render(); window.__game.render(); }, v);
    await page.screenshot({ path: `screenshots/art-${tag}-stage2-${v.name}-${vp.name}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log('done');
