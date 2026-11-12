// 水墨特效截圖（D85）：每隻妖怪兩組技法（地面＋柱子＋種子／繞身＋護身＋連鎖），手機直式與桌面。
// 用法：Q=0 NODE_PATH=node_modules node scripts/shots/ink.mjs <標籤>（Q=0 才有光暈）
import { launch, openPage, press, waitState, VIEWPORTS } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const SETS = {
  'chochin-kozo': { field: ['hellfire', 'pillar', 'seed'], near: ['ring', 'ward', 'kitsunebi'] },
  kappa: { field: ['domain', 'geyser', 'prison'], near: ['whirl', 'sumo', 'vortex'], move: ['wake', 'vortex', 'torrent'] },
};
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  for (const [yokai, sets] of Object.entries(SETS)) {
    for (const [name, techs] of Object.entries(sets)) {
      const ctx = await openPage(browser, vp, (process.env.Q ? `?q=${process.env.Q}&` : '?') + 'seed=93');
      const { page } = ctx;
      await waitState(page, 'MENU');
      await press(ctx, '#btn-start');
      await page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
      await press(ctx, `.yokai-card[data-yokai="${yokai}"]`);
      await press(ctx, '#btn-setup-go');
      await waitState(page, 'COMBAT');
      await page.evaluate((t) => {
        const g = window.__game;
        g.god = true;
        g.giveTech(...t);
        for (let i = 0; i < 2; i++) g.give('volley', 'epic');
        g.setCamera(0, 42);
        g.spawn('villager', 50);
        for (let i = 0; i < 30; i++) g.advance(0.2);
      }, techs);
      for (let k = 0; k < 6; k++) {
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        await page.evaluate(() => { window.__game.spawn('villager', 12); for (let i = 0; i < 5; i++) window.__game.advance(0.2); });
      }
      while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      if (name === 'move') await page.evaluate(() => { const g = window.__game; g.driveWorld(1, 0.3); for (let i = 0; i < 12; i++) g.advance(0.1); g.driveWorld(0, 0); });
      while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      await page.evaluate(() => { window.__game.advance(0.15); window.__game.render(); window.__game.render(); });
      await page.screenshot({ path: `screenshots/ink-${tag}-${yokai}-${name}-${vp.name}.png` });
      await ctx.close();
    }
  }
}
await browser.close();
console.log('done');
