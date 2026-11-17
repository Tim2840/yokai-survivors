// 赤鬼（docs/35）驗收截圖：選妖怪畫面、揮擊（扇形／震波）、怒氣資源條（手機直式）
import { launch, openPage, waitBlender, setCamera, VIEWPORTS } from './helpers.mjs';
import { press, waitState } from '../regress/lib.mjs';
const vp = VIEWPORTS[Number(process.argv[2] ?? 0)];
const browser = await launch();
const ctx = await openPage(browser, vp, '?model=blender&seed=21');
const { page } = ctx;
await waitState(page, 'MENU');
await press(ctx, '#btn-start');
await page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
await press(ctx, '.yokai-card[data-yokai="aka-oni"]');
await page.screenshot({ path: `screenshots/oni-setup-${vp.name}.png` });
const setupTxt = await page.evaluate(() => document.querySelector('.overlay:not(.hidden)')?.innerText ?? '');
await press(ctx, '#btn-setup-go');
await waitState(page, 'COMBAT');
await waitBlender(page);
await page.evaluate(() => { window.__game.god = true; });
await setCamera(page, 20, 40, 9);
await page.evaluate(() => { const g = window.__game; g.spawn('villager', 10); g.advance(0.5); });
// 等一下揮擊（扇形）
let shot = 0;
for (let k = 0; k < 400 && shot < 2; k++) {
  const sw = await page.evaluate(() => { const g = window.__game; g.advance(1 / 30); const r = g.run; return r.swing; });
  if (sw && sw.age >= 0 && sw.age < 0.08 && (shot === 0 ? !sw.shock : sw.shock)) {
    await page.evaluate(() => { const g = window.__game; g.freeze(true); g.render(); g.render(); });
    await page.screenshot({ path: `screenshots/oni-${shot === 0 ? 'swing' : 'shock'}-${vp.name}.png` });
    await page.evaluate(() => window.__game.freeze(false));
    shot++;
  }
}
// 怒氣：被打幾下
await page.evaluate(() => { const g = window.__game; g.god = false; for (let i = 0; i < 6; i++) { g.hurtForTest(1); g.advance(0.6); } g.god = true; g.advance(0.05); });
// HUD 只在真的畫一幀時更新：等資源條亮起來
await page.waitForFunction(() => document.querySelectorAll('#res-pips i.on').length > 0, null, { timeout: 15000 }).catch(() => {});
const hud = await page.evaluate(() => ({ res: document.querySelector('#res-box')?.className, label: document.querySelector('#res-label')?.textContent, on: document.querySelectorAll('#res-pips i.on').length, rage: window.__game.run.rage }));
await page.evaluate(() => window.__game.render());
await page.screenshot({ path: `screenshots/oni-rage-${vp.name}.png` });
console.log(JSON.stringify({ shots: shot, hud, setup: setupTxt.split('\n').filter((l) => /赤鬼|金棒|怒|鬼神|大招/.test(l)) }));
await browser.close();
