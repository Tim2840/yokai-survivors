// 試玩紀錄驗收：真實點擊開局 → 跳幾下、升幾級（真的點卡）→ 倒下 → 結算畫面有紀錄、按「複製」
import { launch, openPage, startRun, VIEWPORTS, advance } from './helpers.mjs';
const browser = await launch();
let bad = 0;
for (const vp of VIEWPORTS) {
  const ctx = await openPage(browser, vp, '?seed=21');
  const p = ctx.page;
  await startRun(ctx);
  for (let i = 0; i < 3; i++) {
    await p.keyboard.press('Space');
    await p.evaluate(() => { for (let k = 0; k < 60; k++) window.__game.advance(1 / 60); });
  }
  if (vp.hasTouch) await p.evaluate(() => { document.querySelector('#btn-jump')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); for (let k = 0; k < 60; k++) window.__game.advance(1 / 60); });
  for (let n = 0; n < 4; n++) {
    await p.evaluate(() => { window.__game.addXp(30); window.__game.advance(0.05); });
    for (let k = 0; k < 4; k++) {
      const card = await p.$('.overlay[data-screen="levelup"]:not(.hidden) .card');
      if (!card || !(await card.isVisible())) break;
      await card.click();
      await p.evaluate(() => window.__game.advance(0.05));
    }
  }
  await advance(p, 5);
  await p.evaluate(() => { const g = window.__game; g.god = false; g.setHp(0.01); g.spawn('villager', 30); });
  await p.waitForFunction(() => { window.__game.advance(0.2); return window.__game.state === 'RUN_END'; }, null, { timeout: 60000, polling: 100 });
  await p.evaluate(() => { window.__game.render(); });
  const text = await p.evaluate(() => document.querySelector('#end-log-text')?.textContent ?? '');
  const hidden = await p.evaluate(() => document.querySelector('#end-log')?.hidden);
  await p.click('#btn-end-copy');
  await p.waitForTimeout(200);
  const btn = await p.evaluate(() => document.querySelector('#btn-end-copy')?.textContent);
  await p.screenshot({ path: `screenshots/playlog-${vp.name}.png` });
  const ok = !hidden && /種子/.test(text) && /選卡 [1-9]/.test(text) && /跳躍 [1-9]/.test(text) && !/undefined|NaN|\{/.test(text);
  console.log(vp.name, ok ? 'OK' : 'BAD', JSON.stringify(text), '| 按鈕：', btn, '| errors', ctx.errors?.length ?? 0);
  if (!ok) bad++;
  await ctx.close?.();
}
await browser.close();
process.exit(bad ? 1 : 0);
