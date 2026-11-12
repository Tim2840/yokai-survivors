// 老練的人類（Q55）：一般村人、足輕、老練的村人／足輕並排，夜晚，手機直式與桌面。
import { launch, openPage, startRun, VIEWPORTS } from '../regress/lib.mjs';
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  const ctx = await openPage(browser, vp, '?q=1&seed=93');
  const { page } = ctx;
  await startRun(ctx);
  await page.evaluate(() => {
    const g = window.__game;
    g.god = true; g.clearEnemies();
    // 左邊三隻一般、右邊三隻老練（同一種並排），在玩家前方（遠離鏡頭）
    [['villager', 0], ['ashigaru', 0], ['yumi', 0]].forEach(([id, vet], k) => g.spawnAt(id, -4.2 + k * 1.3, -5, 0, vet));
    [['villager', 1], ['ashigaru', 1], ['yumi', 1]].forEach(([id, vet], k) => g.spawnAt(id, 0.9 + k * 1.3, -5, 0, vet));
    g.setCamera(0, 20, 7);
    g.advance(0.05); g.render(); g.render();
  });
  await page.screenshot({ path: `screenshots/veteran-${vp.name}.png` });
  await ctx.close();
}
await browser.close();
console.log('done');
