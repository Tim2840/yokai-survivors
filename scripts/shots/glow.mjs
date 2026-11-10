// 光暈檢查（2026-11-10 使用者：「這個光太炫光」）：河童＋繞身水盤＋水柱＋一群人，模擬後期畫面。前後對照用。
// 用法：NODE_PATH=node_modules node scripts/shots/glow.mjs <標籤>
import { launch, openPage, press, waitState, VIEWPORTS } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  for (const yokai of ['kappa', 'chochin-kozo']) {
    const ctx = await openPage(browser, vp, (process.env.Q ? `?q=${process.env.Q}&` : '?') + 'seed=93');
    const { page } = ctx;
    await waitState(page, 'MENU');
    await press(ctx, '#btn-start');
    await page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
    await press(ctx, `.yokai-card[data-yokai="${yokai}"]`);
    await press(ctx, '#btn-setup-go');
    await waitState(page, 'COMBAT');
    await page.evaluate((y) => {
      const g = window.__game;
      g.god = true;
      if (y === 'kappa') g.giveTech('whirl', 'geyser', 'splash');
      else g.giveTech('ring', 'pillar', 'kitsunebi');
      for (let i = 0; i < 4; i++) g.give('volley', 'epic');
      g.setCamera(0, 40);
      g.spawn('villager', 60);
      g.tankEnemies();
      g.dropOrbs(20, 5);
      for (let i = 0; i < 10; i++) g.advance(0.2);
    }, yokai);
    while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
    await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); window.__game.render(); });
    await page.screenshot({ path: `screenshots/glow-${tag}-${yokai}-${vp.name}.png` });
    await ctx.close();
  }
}
await browser.close();
console.log('done');
