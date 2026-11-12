// Blender 試作的並排截圖（docs/26）：同一個鏡頭，現有的程式模型 vs Blender 腳本模型（?model=blender），提燈小僧＋鳥居。
// 用法：NODE_PATH=node_modules node scripts/shots/blender.mjs <標籤>
import { launch, openPage, startRun, VIEWPORTS } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const VIEWS = [
  { name: 'close', yaw: 20, pitch: 14, dist: 4.2 },
  { name: 'face', yaw: 200, pitch: 8, dist: 3.4 },
  { name: 'play', yaw: 0, pitch: 40, dist: 0 },
  { name: 'torii', yaw: 40, pitch: 12, dist: 11 },
];
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  for (const kind of ['code', 'blender']) {
    const ctx = await openPage(browser, vp, '?q=1&seed=93' + (kind === 'blender' ? '&model=blender' : '') + (process.env.LOOK ? '&look=' + process.env.LOOK : ''));
    const { page } = ctx;
    await startRun(ctx);
    if (kind === 'blender') await page.waitForFunction(() => window.__game.blenderReady, null, { timeout: 30000 });
    await page.evaluate(() => { const g = window.__game; g.god = true; g.clearEnemies(); g.driveWorld(1, 0.4); for (let i = 0; i < 8; i++) g.advance(0.1); });
    for (const v of VIEWS) {
      await page.evaluate(({ yaw, pitch, dist }) => { const g = window.__game; if (dist) g.setCamera(yaw, pitch, dist); else g.setCamera(yaw, pitch); g.advance(0.05); g.render(); g.render(); }, v);
      await page.screenshot({ path: `screenshots/blender-${tag}-${v.name}-${kind}-${vp.name}.png` });
    }
    const perf = await page.evaluate(() => window.__game.perf);
    console.log(vp.name, kind, JSON.stringify(perf));
    await ctx.close();
  }
}
await browser.close();
console.log('done');
