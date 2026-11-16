// p1：效能預算（docs/06 第 6 節）。無頭瀏覽器用軟體算圖，FPS 沒有意義，所以不量 FPS，量「與機器無關」的數字：
// 400 隻敵人＋滿場鬼火與魂火時的 draw call（桌機 ≤ 120、手機 ≤ 80）、著色器程式數（預編譯後不再增加）、敵人數量上限（桌機 400、手機 200）。
import { openPage, startRun, step, expect, reportErrors, waitState, press, VIEWPORTS } from './lib.mjs';
import { TECH_LOADOUT } from './p1-loadout.mjs';

export const meta = { id: 'p1', desc: '效能預算：滿場時 draw call、著色器程式數不增加、敵人上限（三種畫面）；每隻妖怪帶滿技法（測試頁的 Blender 模型）也要在預算內', max: 480, stall: 60 };

export async function run(browser) {
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=9&count=12&hp=50');
    const { page } = ctx;
    try {
      await startRun(ctx);
      await page.evaluate(() => {
        window.__game.god = true;
        window.__game.setTime(300);
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
      // 三角形預算：每隻敵人 ≤ 700（造型減面後約 450），加地形（120×120 公尺 ≈ 29,000）與其他約 80,000（D88：主角改成 Blender 模型，約 12,000 三角形、陰影再畫一次，比舊模型多約 18,000）
      expect(after.perf.triangles <= after.run.enemies * 700 + 80000, `三角形 ${after.perf.triangles} 太多（${after.run.enemies} 隻，${vp.name}）`);
      expect(after.perf.calls <= budget, `draw call ${after.perf.calls} 超過預算 ${budget}（${vp.name}）`);
      expect(after.perf.programs === before.programs, `預編譯之後又編了新的著色器：${before.programs} → ${after.perf.programs}（${vp.name}）`);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }

  // 第二部分（2026-11-16）：每隻妖怪帶滿自己的技法、用測試頁的 Blender 模型，手機橫式（最吃 draw call 的版面）滿場也要 ≤ 預算。
  // 為什麼：河童帶 4 招滿場時，程式建模版是 86～88 次（超過 80），但 p1 原本只測提燈小僧不帶技法，所以一直沒抓到（docs/30 第 ⑪ 節）。
  const vp = VIEWPORTS[1];
  for (const [yokai, techs] of Object.entries(TECH_LOADOUT)) {
    const ctx = await openPage(browser, vp, '?q=4&seed=9&count=12&hp=50&model=blender');
    const { page } = ctx;
    try {
      await waitState(page, 'MENU');
      await press(ctx, '#btn-start');
      await page.waitForFunction(() => window.__game.screens.includes('setup'));
      await press(ctx, `.yokai-card[data-yokai="${yokai}"]`);
      await press(ctx, '#btn-setup-go');
      await waitState(page, 'COMBAT');
      await page.waitForFunction(() => window.__game.blenderReady, null, { timeout: 30000 });
      let r;
      await step(`${yokai} 帶滿技法打到滿場`, async () => {
        r = await page.evaluate((techs) => {
          const g = window.__game;
          g.god = true;
          g.setTime(300);
          g.giveTech(...techs);
          for (const t of techs) g.techLevel(t, 5);
          for (let i = 0; i < 15; i++) {
            g.advance(1);
            for (let c = 0; c < 6 && g.run.awaitingPick; c++) {
              const b = [...document.querySelectorAll('.overlay:not(.hidden) button')].find((x) => x.offsetParent !== null);
              if (b) b.click();
            }
          }
          g.render();
          const before = g.perf.programs;
          g.advance(2);
          g.render();
          return { enemies: g.run.enemies, calls: g.perf.calls, programs: g.perf.programs, before };
        }, techs);
      });
      console.log(`    ${yokai}（${techs.join('、')}，Blender 模型，${vp.name}）：敵人 ${r.enemies}、draw call ${r.calls}、程式 ${r.programs}`);
      expect(r.enemies > 120, `${yokai} 沒打到滿場：${r.enemies}`);
      expect(r.calls <= 80, `${yokai} 帶滿技法 draw call ${r.calls} 超過手機預算 80`);
      expect(r.programs === r.before, `${yokai}：預編譯之後又編了新的著色器 ${r.before} → ${r.programs}`);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return [];
}
