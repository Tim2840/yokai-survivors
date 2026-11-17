// 子彈不追蹤（2026-11-17）驗收截圖：提燈小僧帶彈跳打一群人、暫停頁的彈跳說明（手機直式）
import { openRun, freezeAndShoot, setCamera, levelTo } from './helpers.mjs';
const { browser, page } = await openRun('?model=blender&seed=21');
await levelTo(page, 4);
await page.evaluate(() => { const g = window.__game; g.giveTech('bounce'); g.spawn('villager', 14); });
await setCamera(page, 25, 55, 13);
await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 40; i++) g.advance(1 / 30); });
// 等到場上有彈跳的小火（gen 3）再拍
for (let k = 0; k < 60; k++) {
  const n = await page.evaluate(() => { const r = window.__game.runObj ?? null; return 0; });
  await page.evaluate(() => window.__game.advance(1 / 30));
}
await freezeAndShoot(page, 'screenshots/straight-combat-phone-portrait.png');
await page.evaluate(() => window.__game.freeze(false));
await page.click('#btn-pause');
await page.evaluate(() => window.__game.render());
const txt = await page.evaluate(() => document.querySelector('.overlay:not(.hidden)')?.innerText ?? '');
await page.screenshot({ path: 'screenshots/straight-pause-phone-portrait.png' });
console.log(txt.split('\n').filter((l) => /彈跳|跳/.test(l)).join('\n'));
await browser.close();
