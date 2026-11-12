// Q56：取代發射的技法（繞身）在場時，暫停頁的能力欄寫出穿透／濺射／碎裂的轉換（手機直式、桌面）
import { launch, openPage, startRun, press, VIEWPORTS } from '../regress/lib.mjs';
const browser = await launch();
for (const vp of VIEWPORTS.filter((v) => v.name !== 'phone-landscape')) {
  const ctx = await openPage(browser, vp, '?q=1&seed=93');
  const { page } = ctx;
  await startRun(ctx);
  await page.evaluate(() => { const g = window.__game; g.god = true; g.giveTech && g.giveTech('ring'); g.give('splash', 'epic'); g.give('pierce', 'rare'); g.advance(0.1); g.render(); });
  await press(ctx, '#btn-abilities');
  await page.waitForFunction(() => window.__game.screens.includes('pause'));
  const txt = await page.evaluate(() => document.querySelector('#sum-stats').innerText.replace(/\s+/g, ' '));
  console.log(vp.name, txt);
  await page.screenshot({ path: `screenshots/pausenote-${vp.name}.png` });
  await ctx.close();
}
await browser.close();
