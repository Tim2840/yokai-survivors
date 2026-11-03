// r1：整局流程（M1 Exit）。主選單 → 選妖怪 → 戰鬥 → 升級就點卡 → 波次結束就點「出發」→ 到第 3 波 → 放棄 → 結算 → 重載後存檔還在。
// 全用真實點擊；每一輪用「畫面狀態字串」做卡住偵測（連續 12 輪沒變就失敗並印出最後狀態）。三種畫面各跑一次。
import { openPage, startRun, press, step, expect, shot, reportErrors, untilDone, snapshotOf, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'r1', desc: '整局流程：開局→升級選卡→整備→放棄→結算→重載後存檔還在（三種畫面）', max: 420, stall: 40 };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=11');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      let sawLevelUp = false;
      let sawIntermission = false;
      await step(
        `${vp.name} 打到第 3 波（升級就選卡、整備就出發）`,
        () =>
          untilDone({
            snapshot: () => snapshotOf(page),
            done: (snap) => JSON.parse(snap).wave >= 3 && JSON.parse(snap).phase === 'combat' && !JSON.parse(snap).screens.includes('levelup'),
            act: async (snap) => {
              const s = JSON.parse(snap);
              if (s.screens.includes('levelup')) {
                sawLevelUp = true;
                await press(ctx, '.overlay[data-screen="levelup"] .card');
              } else if (s.screens.includes('intermission')) {
                sawIntermission = true;
                await press(ctx, '#btn-inter-next');
              } else {
                await page.evaluate(() => window.__game.advance(1));
                await page.evaluate(() => window.__game.render());
              }
            },
          }),
        200,
      );
      expect(sawLevelUp, `第 1～2 波內沒有升級過（${vp.name}）`);
      expect(sawIntermission, `沒有進過整備（${vp.name}）`);
      const mid = await page.evaluate(() => window.__game.run);
      expect(mid.picked >= 1, `升級後沒有選過卡（${vp.name}）`);
      files.push(await shot(ctx, 'r1-combat'));

      await step(`${vp.name} 暫停→放棄→結算`, async () => {
        await press(ctx, '#btn-pause');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        await press(ctx, '#btn-pause-quit');
        await page.waitForFunction(() => window.__game.state === 'RUN_END' && window.__game.screens.includes('runend'));
      });
      files.push(await shot(ctx, 'r1-end'));
      const endText = await page.evaluate(() => document.querySelector('.overlay[data-screen="runend"]').innerText);
      expect(/功德/.test(endText) && /擊敗/.test(endText), `結算畫面少了統計（${vp.name}）：${endText}`);

      await step(`${vp.name} 重載後存檔還在`, async () => {
        const before = await page.evaluate(() => JSON.parse(localStorage.getItem('yokai-survivors-save-v1')));
        expect(before.stats.runs === 1, `存檔的局數不對（${vp.name}）：${before.stats.runs}`);
        expect(before.stats.bestWave >= 3, `存檔的最高波數不對（${vp.name}）：${before.stats.bestWave}`);
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.__game && window.__game.state === 'MENU');
        const after = await page.evaluate(() => JSON.parse(localStorage.getItem('yokai-survivors-save-v1')));
        expect(after.stats.runs === 1 && after.stats.bestWave === before.stats.bestWave && after.merit === before.merit, `重載後存檔變了（${vp.name}）`);
      });

      await step(`${vp.name} 再來一局`, async () => {
        await startRun(ctx);
        const r = await page.evaluate(() => window.__game.run);
        expect(r.wave === 1 && r.level === 0 && r.kills === 0, `新的一局沒有重置（${vp.name}）：${JSON.stringify(r)}`);
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
