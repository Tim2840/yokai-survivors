// t1：測試頁的試玩調整面板（D18、G1 用）。用真實點擊與打字改「敵人數量倍率」→ 完成 → 開局，這一局用的就是新值；
// 重載後還在；還原預設；結算畫面有種子。主網址不能有這個面板（check:main 與 b1 不會看到 #btn-tune 以外的東西，這裡只測測試頁）。
import { openPage, startRun, press, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 't1', desc: '試玩調整面板：改數字→開局生效→重載後還在→還原預設；結算畫面有種子（三種畫面）', max: 240, stall: 40 };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=21');
    const { page } = ctx;
    let defaultCount = '';
    try {
      await page.waitForFunction(() => window.__game && window.__game.state === 'MENU');
      await step(`${vp.name} 開面板：五個欄位與按鈕都在畫面內`, async () => {
        await press(ctx, '#btn-tune');
        await page.waitForFunction(() => window.__game.screens.includes('tuning'));
        for (const sel of ['#tune-countScale', '#tune-hpScale', '#tune-damageScale', '#tune-volley', '#tune-splash', '#btn-tune-reset', '#btn-tune-done']) {
          const b = await page.locator(sel).boundingBox();
          expect(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, `${sel} 不在畫面內（${vp.name}）：${JSON.stringify(b)}`);
        }
        files.push(await shot(ctx, 't1-panel'));
      });
      await step(`${vp.name} 改數量倍率 → 完成 → 開局用新值`, async () => {
        defaultCount = await page.locator('#tune-countScale').inputValue();
        expect(defaultCount !== '1.5', `預設值不能是測試要改成的 1.5（${vp.name}）`);
        await page.locator('#tune-countScale').fill('1.5');
        await page.locator('#tune-volley').fill('3');
        await press(ctx, '#btn-tune-done');
        await page.waitForFunction(() => !window.__game.screens.includes('tuning'));
        await startRun(ctx);
        const r = await page.evaluate(() => window.__game.run);
        expect(r.tuning.countScale === 1.5 && r.tuning.volley === 3, `開局沒用到新值（${vp.name}）：${JSON.stringify(r.tuning)}`);
        await page.evaluate(() => window.__game.advance(1));
      });
      await step(`${vp.name} 重載後還在、還原預設`, async () => {
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.__game && window.__game.state === 'MENU');
        await press(ctx, '#btn-tune');
        expect(await page.locator('#tune-countScale').inputValue() === '1.5', `重載後數量倍率不是 1.5（${vp.name}）`);
        await press(ctx, '#btn-tune-reset');
        expect(await page.locator('#tune-countScale').inputValue() === defaultCount, `還原後不是預設 ${defaultCount}（${vp.name}）`);
        await press(ctx, '#btn-tune-done');
      });
      await step(`${vp.name} 結算畫面有種子`, async () => {
        await startRun(ctx);
        await press(ctx, '#btn-pause');
        await press(ctx, '#btn-pause-quit');
        await page.waitForFunction(() => window.__game.screens.includes('runend'));
        const txt = await page.evaluate(() => document.querySelector('.overlay[data-screen="runend"]').innerText);
        expect(/種子 \d+/.test(txt), `結算畫面沒有種子（${vp.name}）：${txt}`);
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
