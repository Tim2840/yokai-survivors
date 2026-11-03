// p1：效能預算（docs/06 第 6 節）。無頭瀏覽器用軟體算圖，FPS 沒有意義，所以不量 FPS，量「與機器無關」的數字：
// 400 隻敵人＋滿場鬼火與魂火時的 draw call（桌機 ≤ 120、手機 ≤ 80）、著色器程式數（預編譯後不再增加）、敵人數量上限（桌機 400、手機 200）。
import { openPage, startRun, step, expect, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'p1', desc: '效能預算：滿場時 draw call、著色器程式數不增加、敵人上限（三種畫面）', max: 240, stall: 40 };

export async function run(browser) {
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=9&count=12&hp=50');
    const { page } = ctx;
    try {
      await startRun(ctx);
      await page.evaluate(() => {
        window.__game.god = true;
        window.__game.setWave(20);
      });
      await step(`${vp.name} 打到滿場`, async () => {
        for (let i = 0; i < 12; i++) {
          await page.evaluate(() => {
            window.__game.advance(1);
            window.__game.render();
          });
          const r = await page.evaluate(() => window.__game.run);
          if (r.awaitingPick) break;
        }
      });
      // 升級選卡會擋住，先把待選的選掉
      await page.evaluate(() => { while (window.__game.run.awaitingPick) document.querySelector('.overlay[data-screen="levelup"] .card').click(); });
      const before = await page.evaluate(() => { window.__game.render(); return window.__game.perf; });
      await page.evaluate(() => { window.__game.advance(3); window.__game.render(); });
      const after = await page.evaluate(() => ({ perf: window.__game.perf, run: window.__game.run }));
      const cap = vp.hasTouch ? 200 : 400;
      const budget = vp.hasTouch ? 80 : 120;
      console.log(`    ${vp.name}：敵人 ${after.run.enemies}（上限 ${cap}）、鬼火 ${after.run.projectiles}、魂火 ${after.run.orbs}、draw call ${after.perf.calls}、三角形 ${after.perf.triangles}、程式 ${after.perf.programs}`);
      expect(after.run.enemies > cap * 0.6, `沒打到滿場（${vp.name}）：${after.run.enemies}`);
      expect(after.run.enemies <= cap, `敵人超過上限 ${cap}（${vp.name}）：${after.run.enemies}`);
      // 三角形預算：每隻敵人 ≤ 700（造型減面後約 450），加地形與其他約 40,000
      expect(after.perf.triangles <= after.run.enemies * 700 + 40000, `三角形 ${after.perf.triangles} 太多（${after.run.enemies} 隻，${vp.name}）`);
      expect(after.perf.calls <= budget, `draw call ${after.perf.calls} 超過預算 ${budget}（${vp.name}）`);
      expect(after.perf.programs === before.programs, `預編譯之後又編了新的著色器：${before.programs} → ${after.perf.programs}（${vp.name}）`);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return [];
}
