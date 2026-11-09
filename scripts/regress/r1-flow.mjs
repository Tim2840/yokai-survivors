// r1：整局流程（M1.5 Exit，D22；D34 起頭目由召喚祭壇叫出來）。主選單 → 選妖怪 → 戰鬥（升級就點卡）→ 跳到 30% → 召喚祭壇顯現（箭頭）
// → 真的走過去站著按住 → 頭目出現（血條）→ 頭目倒下 → 傳送門（箭頭）＋寶箱
// → 真的走進去（鍵盤或搖桿）→ 過關畫面 → 點「出發」→ 第 2 關 → 暫停放棄 → 結算 → 重載後存檔還在 → 再來一局會重置。
// 跳時間、傳送到祭壇旁、頭目「倒下」用開發介面（頭目 HP 太高、等 3 分鐘沒意義），其餘（走過去、按住、點卡、走進傳送門）全用真實輸入。三種畫面各一次，卡住偵測。
import { openPage, startRun, press, step, expect, shot, reportErrors, untilDone, snapshotOf, walkOnto as walkOntoLib, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'r1', desc: '整局流程：開局→升級選卡→召喚祭壇（箭頭→走過去按住）→頭目→傳送門＋寶箱→過關畫面→第 2 關（難度 %）→放棄→結算→重載後存檔還在（三種畫面）', max: 600, stall: 60 };


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

      const walkOnto = (x, z) => walkOntoLib(ctx, x, z);

      await step(`${vp.name} 召喚祭壇：30% 之前沒有、之後顯現，HUD 箭頭指過去`, async () => {
        const dur = await page.evaluate(() => window.__game.run.time + window.__game.run.timeLeft);
        await page.evaluate((d) => window.__game.setTime(0.28 * d), dur);
        await page.evaluate(() => window.__game.advance(0.5));
        if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await dismissLevelUps();
        expect((await page.evaluate(() => window.__game.run.summon.altar)) === null, `30% 之前就有召喚祭壇（${vp.name}）`);
        await page.evaluate((d) => window.__game.setTime(0.31 * d), dur);
        for (let i = 0; i < 8; i++) {
          await page.evaluate(() => window.__game.advance(0.5));
          if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await dismissLevelUps();
        }
        const sm = await page.evaluate(() => window.__game.run.summon);
        expect(sm.stage && sm.altar && !sm.bossSpawned, `召喚祭壇沒顯現：${JSON.stringify(sm)}`);
        await page.evaluate(() => window.__game.render());
        expect(await page.locator('#portal-box').isVisible(), `召喚祭壇的箭頭沒顯示（${vp.name}）`);
        const txt = await page.locator('#portal-text').innerText();
        expect(/召喚祭壇 \d+ 公尺/.test(txt), `箭頭文字不對：${txt}`);
        // 第 30% 剛好也是足輕第一次出場：新人類的提示會先佔 7 秒的提示欄，之後才輪到祭壇的提示（箭頭一直都在）
        for (let i = 0; i < 40 && (await page.locator('#wave-note').innerText()) !== '召喚祭壇出現了'; i++) {
          await page.evaluate(() => window.__game.advance(0.5));
          if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await dismissLevelUps();
          await page.evaluate(() => window.__game.render());
        }
        const note = await page.locator('#wave-note').innerText();
        expect(note === '召喚祭壇出現了', `提示文字不對：${note}`);
        await hudTopOk(ctx, '・召喚祭壇提示');
        files.push(await shot(ctx, 'r1-altar'));
      });

      await step(`${vp.name} 走上祭壇站著按住 → 頭目出現：血條顯示、祭壇收掉`, async () => {
        const a = await page.evaluate(() => window.__game.run.summon.altar);
        let sawResult = false;
        await walkOnto(a.x, a.z);
        if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) {
          await dismissLevelUps();
          await walkOnto(a.x, a.z);
        }
        await page.evaluate(() => { window.__game.advance(0.4); window.__game.render(); });
        expect(await page.locator('#element-box').isVisible(), `站上祭壇但沒有提示（${vp.name}）`);
        const title = await page.locator('#element-title').innerText();
        expect(title === '極・召喚祭壇', `提示標題不對：${title}`);
        const desc = await page.locator('#element-desc').innerText();
        expect(/越晚召喚越強（生命 ×[\d.]+）/.test(desc), `祭壇說明不對：${desc}`);
        // 召喚成功會跳結果卡（D36）：寫出小頭目的生命倍率，真的點「繼續」（頭目和結果卡在同一步出現）
        const handleResult = async () => {
          if (!(await page.evaluate(() => window.__game.screens)).includes('result')) return false;
          const txt = await page.locator('.overlay[data-screen="result"] .result-lines').innerText();
          expect(/小頭目出現了！生命 ×[\d.]+/.test(txt), `召喚的結果卡文字不對：${txt}`);
          sawResult = true;
          files.push(await shot(ctx, 'r1-summon-result'));
          await page.waitForFunction(() => !document.querySelector('#btn-result-ok').disabled, null, { timeout: 5000 });
          await press(ctx, '#btn-result-ok');
          await page.waitForFunction(() => !window.__game.screens.includes('result'), null, { timeout: 5000 });
          return true;
        };
        for (let i = 0; i < 20; i++) {
          const sc = await page.evaluate(() => window.__game.screens);
          if (await handleResult()) continue;
          if (sc.includes('levelup')) {
            await dismissLevelUps();
            await walkOnto(a.x, a.z);
          }
          await page.evaluate(() => window.__game.advance(0.25));
          if (await page.evaluate(() => window.__game.run.bossAlive)) break;
        }
        await handleResult();
        expect(sawResult, `召喚後沒有結果卡（${vp.name}）`);
        expect(await page.evaluate(() => window.__game.run.bossAlive), `按住了但頭目沒出現（${vp.name}）`);
        expect((await page.evaluate(() => window.__game.run.summon.altar)) === null, `召喚後祭壇還在（${vp.name}）`);
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
        await hudTopOk(ctx, '・頭目倒下提示');
        const chest = await page.evaluate(() => window.__game.run.elements.find((e) => e.kind === 'chest'));
        expect(chest && chest.rarity === 'rare', `小頭目沒掉良階寶箱：${JSON.stringify(chest)}`);
        const pt = await page.evaluate(() => window.__game.run.portal);
        expect(Math.hypot(chest.x - pt.x, chest.z - pt.z) > 3.3, `寶箱壓在傳送門上（${vp.name}）`);
        files.push(await shot(ctx, 'r1-portal'));
      });

      await step(`${vp.name} 走進傳送門（真的按鍵／推搖桿）→ 過關畫面`, async () => {
        // 站在傳送門旁 3 公尺處，用真實輸入（鍵盤／搖桿）走進去（walkOnto）。途中升級（D15 暫停）的話：
        // 選完卡、手指放回搖桿再走一次（以前選卡會放開搖桿、之後沒再按，敵人變多後升級變頻繁就偶爾卡在這步）
        for (let tries = 0; tries < 5 && (await page.evaluate(() => window.__game.state)) !== 'INTERMISSION'; tries++) {
          if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await dismissLevelUps();
          const pt = await page.evaluate(() => window.__game.run.portal);
          await walkOnto(pt.x, pt.z);
          for (let i = 0; i < 8 && (await page.evaluate(() => window.__game.state)) !== 'INTERMISSION'; i++) {
            if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) break;
            await page.evaluate(() => window.__game.advance(0.25));
          }
        }
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
        const st2 = await page.locator('.hud-wave b').innerText();
        const df2 = await page.locator('#wave-diff').innerText();
        expect(st2 === '第 2 關' && df2 === '難度 +50%', `HUD 沒更新成第 2 關（含難度）：${st2}／${df2}`);
        await hudTopOk(ctx, '・第 2 關難度');
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
