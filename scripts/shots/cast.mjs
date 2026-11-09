// 角色陣容截圖（D72 日系 Q 版）：玩家角色＋每種人類站成一排、鏡頭拉近，看造型與臉。
// 用法：NODE_PATH=node_modules node scripts/shots/cast.mjs <標籤>（要開著 npx vite --port 5173）
import { launch, openPage, VIEWPORTS } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const browser = await launch();
for (const yokai of ['chochin-kozo', 'kappa']) {
  for (const vp of [VIEWPORTS[0], VIEWPORTS[2]]) {
    const ctx = await openPage(browser, vp, '?q=4&seed=93');
    const { page } = ctx;
    await page.waitForFunction(() => window.__game && window.__game.state === 'MENU');
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__game.screens.includes('setup'));
    await page.locator(`.yokai-card[data-yokai="${yokai}"]`).click();
    await page.locator('#btn-setup-go').click();
    await page.waitForFunction(() => window.__game.state === 'COMBAT');
    await page.evaluate(() => {
      const g = window.__game;
      g.god = true;
      g.clearEnemies();
      g.spawnAt('villager', -2.6, -2.2);
      g.spawnAt('ashigaru', -0.9, -2.8);
      g.spawnAt('yumi', 0.9, -2.8);
      g.spawnAt('villager', 2.6, -2.2, 1);
      g.spawnAt('taimasou', 0, -7, 2);
      g.advance(0.05);
    });
    for (const [name, yaw, pitch, dist] of [['close', 0, 18, 6.5], ['game', 0, 38, 13]]) {
      await page.evaluate(([y, p, d]) => { window.__game.setCamera(y, p, d); window.__game.render(); window.__game.render(); }, [yaw, pitch, dist]);
      await page.screenshot({ path: `screenshots/cast-${tag}-${yokai}-${name}-${vp.name}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
console.log('done');
