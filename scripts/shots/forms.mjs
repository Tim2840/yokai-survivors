// 化身（D94）驗收截圖：手機直式，兩隻妖怪各拍「化身那一刻」與「化身二之後」（選角用真實點擊）
import { launch, openPage, VIEWPORTS, waitBlender, freezeAndShoot, setCamera, clearOverlays } from './helpers.mjs';

/** 一次只升一級（levelTo 一步給 40 經驗，可能一口氣越過化身那一級），每級把選卡點掉，升到 L 級為止 */
async function upTo(page, L) {
  for (let k = 0; k < 60; k++) {
    if ((await page.evaluate(() => window.__game.run.level)) >= L) return;
    await page.evaluate(() => { const g = window.__game; g.addXp(g.run.xpNeeded - g.run.xp + 0.05); g.advance(0.05); });
    await page.waitForFunction(() => window.__game.screens.includes('levelup') || !window.__game.run.awaitingPick, null, { timeout: 15000 });
    await clearOverlays(page, 8);
  }
}
import { waitState, press } from '../regress/lib.mjs';
const browser = await launch();
for (const y of ['chochin-kozo', 'kappa']) {
  const ctx = await openPage(browser, VIEWPORTS[0], '?model=blender&seed=21');
  const page = ctx.page;
  await waitState(page, 'MENU');
  await press(ctx, '#btn-start');
  await page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
  await press(ctx, `.yokai-card[data-yokai="${y}"]`);
  await press(ctx, '#btn-setup-go');
  await waitState(page, 'COMBAT');
  await waitBlender(page);
  await page.evaluate(() => { window.__game.god = true; });
  await setCamera(page, 25, 30, 9);
  await page.evaluate(() => { const g = window.__game; g.spawn('villager', 25); g.advance(1); });
  // 9 級以前用真實點擊選卡（面板會關）；最後一級才觸發化身，選卡面板延後開
  await upTo(page, 9);
  await page.evaluate(() => { const g = window.__game; g.addXp(g.run.xpNeeded - g.run.xp + 0.05); g.advance(0.25); g.render(); });
  const shown = await page.evaluate(() => window.__game.screens);
  await freezeAndShoot(page, `screenshots/form-burst-${y}-phone-portrait.png`);
  console.log(y, '化身那一刻畫面上的介面：', JSON.stringify(shown), '化身階段', await page.evaluate(() => window.__game.run.form));
  await page.evaluate(() => window.__game.freeze(false));
  // 演出結束後選卡面板要自己打開（真實時間 1.6 秒）
  await page.waitForFunction(() => window.__game.screens.includes('levelup'), null, { timeout: 15000 });
  console.log(y, '演出結束後選卡面板開了');
  await upTo(page, 19);
  await page.evaluate(() => { const g = window.__game; g.addXp(g.run.xpNeeded - g.run.xp + 0.05); g.advance(0.25); g.render(); });
  const st = await page.evaluate(() => ({ yokai: window.__game.run.yokai, form: window.__game.run.form, hp: Math.round(window.__game.run.hp), note: document.querySelector('#wave-note')?.textContent }));
  await freezeAndShoot(page, `screenshots/form2-${y}-phone-portrait.png`);
  console.log(y, JSON.stringify(st));
  await ctx.close?.();
}
await browser.close();
