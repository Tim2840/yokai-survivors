// 主角造型審查（D88）：同一個角色從多個角度近拍（臉朝鏡頭、側面、背面、全身），夜晚。
// 用法：LOOK=cel NODE_PATH=node_modules node scripts/shots/hero.mjs <標籤> [yaw,yaw,…] [model]
import { launch, openPage, startRun, VIEWPORTS } from '../regress/lib.mjs';
const tag = process.argv[2] || 'now';
const yaws = (process.argv[3] || '20,110,200,290').split(',').map(Number);
const model = process.argv[4] ?? 'blender';
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  const ctx = await openPage(browser, vp, '?q=1&seed=93' + (model ? '&model=' + model : '') + (process.env.LOOK ? '&look=' + process.env.LOOK : '') + (process.env.TOD ? '&tod=' + process.env.TOD : ''));
  const { page } = ctx;
  await startRun(ctx);
  if (model) await page.waitForFunction(() => window.__game.blenderReady, null, { timeout: 30000 });
  await page.evaluate(() => { const g = window.__game; g.god = true; g.clearEnemies(); g.driveWorld(1, 0.4); for (let i = 0; i < 8; i++) g.advance(0.1); });
  await page.evaluate(([d, pt]) => { window.__dist = d; window.__pitch = pt; }, [+(process.env.DIST || 2.7), +(process.env.PITCH || 7)]);
  for (const yaw of yaws) {
    await page.evaluate((y) => { const g = window.__game; g.setCamera(y, +(window.__pitch ?? 7), +(window.__dist ?? 2.7)); g.advance(0.05); g.render(); g.render(); }, yaw);
    await page.screenshot({ path: `screenshots/hero-${tag}-${yaw}-${vp.name}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log('done');
