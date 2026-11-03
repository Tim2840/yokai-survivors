// r1：整局流程（M1.5 Exit，D22）。主選單 → 選妖怪 → 戰鬥（升級就點卡）→ 跳到頭目時間 → 頭目出現（血條）→ 頭目倒下 → 傳送門（箭頭）
// → 真的走進去（鍵盤或搖桿）→ 過關畫面 → 點「出發」→ 第 2 關 → 暫停放棄 → 結算 → 重載後存檔還在 → 再來一局會重置。
// 頭目的「出現」與「倒下」用開發介面跳時間與擊殺（頭目 HP 太高、等 8 分鐘沒意義），其餘全用真實點擊與按鍵。三種畫面各一次，卡住偵測。
import { openPage, startRun, press, step, expect, shot, reportErrors, untilDone, snapshotOf, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'r1', desc: '整局流程：開局→升級選卡→頭目→傳送門→過關畫面→第 2 關→放棄→結算→重載後存檔還在（三種畫面）', max: 600, stall: 60 };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=11');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      const dismissLevelUps = () =>
        untilDone({
          snapshot: () => snapshotOf(page),
          done: (snap) => !JSON.parse(snap).screens.includes('levelup'),
          act: () => press(ctx, '.overlay[data-screen="levelup"] .card'),
          maxRounds: 40,
        });

      await step(`${vp.name} 打 20 秒：湧出敵人、HUD 倒數在走`, async () => {
        for (let i = 0; i < 20; i++) {
          await page.evaluate(() => window.__game.advance(1));
          if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await dismissLevelUps();
        }
        await page.evaluate(() => window.__game.render());
        const r = await page.evaluate(() => window.__game.run);
        expect(r.stage === 1 && r.time > 19 && r.enemies > 0, `關卡沒在跑：${JSON.stringify(r)}`);
        const t = await page.locator('.hud-wave span').innerText();
        expect(/^\d+:\d\d$/.test(t) && t !== '10:00', `HUD 倒數沒走：${t}`);
        const st = await page.locator('.hud-wave b').innerText();
        expect(st === '第 1 關', `HUD 關卡名稱不對：${st}`);
      });

      await step(`${vp.name} 頭目出現：血條顯示`, async () => {
        const dur = await page.evaluate(() => window.__game.run.time + window.__game.run.timeLeft);
        await page.evaluate((d) => window.__game.setTime(0.79 * d), dur);
        for (let i = 0; i < 20; i++) {
          if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await dismissLevelUps();
          await page.evaluate(() => window.__game.advance(1));
          if (await page.evaluate(() => window.__game.run.bossAlive)) break;
        }
        expect(await page.evaluate(() => window.__game.run.bossAlive), `頭目時間到了但頭目沒出現（${vp.name}）`);
        await page.evaluate(() => window.__game.render());
      });
      expect(await page.locator('#boss-bar').isVisible(), `頭目出現了但血條沒顯示（${vp.name}）`);
      files.push(await shot(ctx, 'r1-boss'));

      await step(`${vp.name} 頭目倒下：傳送門開、箭頭與提示出現`, async () => {
        const ok = await page.evaluate(() => window.__game.killBoss());
        expect(ok === true, `killBoss 失敗（${vp.name}）`);
        await page.evaluate(() => { window.__game.advance(0.2); window.__game.render(); });
        const r = await page.evaluate(() => window.__game.run);
        expect(r.portal.active, `傳送門沒開（${vp.name}）`);
        expect(await page.locator('#portal-box').isVisible(), `傳送門箭頭沒顯示（${vp.name}）`);
        expect(!(await page.locator('#boss-bar').isVisible()), `頭目死了血條還在（${vp.name}）`);
        const txt = await page.locator('#portal-text').innerText();
        expect(/傳送門 \d+ 公尺/.test(txt), `箭頭距離文字不對：${txt}`);
        files.push(await shot(ctx, 'r1-portal'));
      });

      await step(`${vp.name} 走進傳送門（真的按鍵／推搖桿）→ 過關畫面`, async () => {
        // 站在傳送門旁 3 公尺處（挑一個沒被岩石或水擋住的方向；鏡頭沒轉，所以螢幕方向 = 世界方向），再用真實輸入走進去
        const sides = [[-3, 0, 'KeyD', 1, 0], [3, 0, 'KeyA', -1, 0], [0, -3, 'KeyS', 0, 1], [0, 3, 'KeyW', 0, -1]];
        let side = null;
        for (const sd of sides) {
          const ok = await page.evaluate(([dx, dz]) => { const p = window.__game.run.portal; return window.__game.teleport(p.x + dx, p.z + dz); }, [sd[0], sd[1]]);
          if (ok) { side = sd; break; }
        }
        expect(side !== null, `傳送門四周都被擋住，傳送不進去（${vp.name}）`);
        await page.evaluate(() => window.__game.advance(0.2));
        if (!vp.hasTouch) await page.keyboard.down(side[2]);
        else {
          const box = await page.locator('#stick-base').boundingBox();
          const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
          await page.mouse.move(sx, sy);
          await page.mouse.down();
          await page.mouse.move(sx + side[3] * 40, sy + side[4] * 40, { steps: 4 });
        }
        for (let i = 0; i < 12; i++) {
          await page.evaluate(() => window.__game.advance(0.25));
          if ((await page.evaluate(() => window.__game.state)) === 'INTERMISSION') break;
        }
        if (!vp.hasTouch) await page.keyboard.up(side[2]);
        else await page.mouse.up();
        await page.waitForFunction(() => window.__game.state === 'INTERMISSION' && window.__game.screens.includes('intermission'), null, { timeout: 15000 });
        const txt = await page.evaluate(() => document.querySelector('.overlay[data-screen="intermission"]').innerText);
        expect(/第 1 關完成/.test(txt), `過關畫面文字不對：${txt}`);
        files.push(await shot(ctx, 'r1-clear'));
      });

      await step(`${vp.name} 點「出發」→ 第 2 關（地圖換了、敵人清空、計時重來）`, async () => {
        // 過關清場收的魂火可能升級：先選完卡
        if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await dismissLevelUps();
        const before = await page.evaluate(() => window.__game.map);
        await press(ctx, '#btn-inter-next');
        await page.waitForFunction(() => window.__game.state === 'COMBAT' && window.__game.run.stage === 2);
        const r = await page.evaluate(() => window.__game.run);
        const after = await page.evaluate(() => window.__game);
        expect(r.time < 1 && r.timeLeft > 590, `第 2 關計時沒重來：${JSON.stringify(r)}`);
        expect(r.portal.active === false, '第 2 關傳送門還開著');
        const m2 = await page.evaluate(() => window.__game.map);
        expect(JSON.stringify(m2.plateaus) !== JSON.stringify(before.plateaus), `第 2 關的地圖沒換（${vp.name}）`);
        expect((await page.locator('.hud-wave b').innerText()) === '第 2 關', 'HUD 沒更新成第 2 關');
        void after;
        await page.evaluate(() => { window.__game.advance(1); window.__game.render(); });
        files.push(await shot(ctx, 'r1-stage2'));
      });

      await step(`${vp.name} 暫停→放棄→結算`, async () => {
        await press(ctx, '#btn-pause');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        await press(ctx, '#btn-pause-quit');
        await page.waitForFunction(() => window.__game.state === 'RUN_END' && window.__game.screens.includes('runend'));
      });
      const endText = await page.evaluate(() => document.querySelector('.overlay[data-screen="runend"]').innerText);
      expect(/功德/.test(endText) && /擊敗/.test(endText) && /關/.test(endText), `結算畫面少了統計（${vp.name}）：${endText}`);

      await step(`${vp.name} 重載後存檔還在`, async () => {
        const before = await page.evaluate(() => JSON.parse(localStorage.getItem('yokai-survivors-save-v1')));
        expect(before.stats.runs === 1, `存檔的局數不對（${vp.name}）：${before.stats.runs}`);
        expect(before.stats.bestStage >= 2, `存檔的最高關卡不對（${vp.name}）：${before.stats.bestStage}`);
        expect(before.merit > 0, `功德沒入帳（${vp.name}）`);
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.__game && window.__game.state === 'MENU');
        const after = await page.evaluate(() => JSON.parse(localStorage.getItem('yokai-survivors-save-v1')));
        expect(after.stats.runs === 1 && after.stats.bestStage === before.stats.bestStage && after.merit === before.merit, `重載後存檔變了（${vp.name}）`);
      });

      await step(`${vp.name} 再來一局`, async () => {
        await startRun(ctx);
        const r = await page.evaluate(() => window.__game.run);
        expect(r.stage === 1 && r.level === 0 && r.kills === 0 && r.portal.active === false, `新的一局沒有重置（${vp.name}）：${JSON.stringify(r)}`);
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
