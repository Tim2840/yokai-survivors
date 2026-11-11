// g1：化身、化身限定技法、局外解鎖技法格子（D83、D84，docs/25）。玩家會做的事：
// 神社看到「技法格子 3／5」→ 功德不夠買不了 → 領測試功德 → 真的點「開第 4 格」→ page.reload() 之後還在 → 開局這一局有 4 格；
// 一路升級（真的點卡）到 10 級 → 畫面提示化身、角色變大、能力面板寫出化身名稱與還沒解鎖的技法 → 之後的技法卡出現「化身限定」。
// 三種畫面，卡住偵測。
import { openPage, waitState, press, step, expect, shot, reportErrors, startRun, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'g1', desc: '化身與技法格子：神社買第 4 格→重載還在→開局 4 格；升到 10 級化身（提示、變大、能力面板）→技法卡出現化身限定（三種畫面）', max: 240, stall: 75 };

const FORM_TECHS = ['kitsunebi', 'ring', 'pillar'];
const slotInfo = (page) => page.evaluate(() => {
  const r = document.querySelector('#shrine-slots .shrine-ult');
  const b = r.querySelector('button[data-act="slot"]');
  return { have: r.dataset.slots, t: r.innerText.replace(/\s+/g, ' '), btn: b ? { disabled: b.disabled, t: b.innerText } : null };
});
const cards = (page) => page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => ({ id: c.dataset.card, t: c.innerText.replace(/\s+/g, ' ') })));

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=77');
    const { page } = ctx;
    try {
      await step(`${vp.name} 神社：技法格子 3／5，功德不夠時按鈕不能按`, async () => {
        await waitState(page, 'MENU');
        await press(ctx, '#btn-shrine');
        await page.waitForFunction(() => window.__game.screens.includes('shrine'), null, { timeout: 10000 });
        const s = await slotInfo(page);
        expect(s.have === '3' && /3／5/.test(s.t) && s.btn && s.btn.disabled && /開第 4 格/.test(s.btn.t), `技法格子那一列不對：${JSON.stringify(s)}`);
      });

      await step(`${vp.name} 領功德 → 真的點「開第 4 格」→ 4／5、功德扣掉`, async () => {
        await press(ctx, '#btn-shrine-cheat');
        const m0 = await page.locator('#shrine-merit').innerText();
        await page.locator('#shrine-slots button[data-act="slot"]').scrollIntoViewIfNeeded();
        await press(ctx, '#shrine-slots button[data-act="slot"]');
        const s = await slotInfo(page);
        const m1 = await page.locator('#shrine-merit').innerText();
        expect(s.have === '4' && /4／5/.test(s.t) && /開第 5 格/.test(s.btn?.t ?? ''), `買了之後不是 4 格：${JSON.stringify(s)}`);
        expect(m0 !== m1, `功德沒有扣：${m0} → ${m1}`);
        files.push(await shot(ctx, 'g1-shrine'));
      });

      await step(`${vp.name} 重新載入之後格子還在；開局這一局有 4 格`, async () => {
        await page.reload({ waitUntil: 'load' });
        await waitState(page, 'MENU');
        await press(ctx, '#btn-shrine');
        await page.waitForFunction(() => window.__game.screens.includes('shrine'), null, { timeout: 10000 });
        const s = await slotInfo(page);
        expect(s.have === '4', `重載後格子不見了：${JSON.stringify(s)}`);
        await press(ctx, '#btn-shrine-back');
        await startRun(ctx);
        const r = await page.evaluate(() => window.__game.run);
        expect(r.techMax === 4 && r.form === 0, `開局不是 4 格或已經化身：${r.techMax}／${r.form}`);
      }, 60);

      await step(`${vp.name} 化身前：升級卡不會出現化身限定技法`, async () => {
        await page.evaluate(() => { window.__game.god = true; });
        for (let n = 0; n < 4; n++) {
          await page.evaluate(() => window.__game.techNext());
          for (let g = 0; g < 60 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(6));
          const lv = await page.evaluate(() => window.__game.run.level);
          if (lv >= 10) break;
          const cs = await cards(page);
          const bad = cs.find((c) => FORM_TECHS.some((id) => c.id === `tech:${id}`) || /化身限定/.test(c.t));
          expect(!bad, `${lv} 級（還沒化身）就出現化身限定技法：${JSON.stringify(bad)}`);
          // 選不是技法的那一張（留著格子）
          const i = cs.findIndex((c) => !c.id.startsWith('tech'));
          await page.locator('.overlay[data-screen="levelup"] .card').nth(Math.max(0, i)).click();
          await page.waitForTimeout(30);
        }
      }, 60);

      await step(`${vp.name} 升到 10 級 → 化身：畫面有提示、角色變大、能力面板寫出化身與還沒解鎖的技法`, async () => {
        for (let g = 0; g < 300 && (await page.evaluate(() => window.__game.run.level)) < 10; g++) {
          if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) {
            const cs = await cards(page);
            const i = cs.findIndex((c) => !c.id.startsWith('tech'));
            await page.locator('.overlay[data-screen="levelup"] .card').nth(Math.max(0, i)).click();
          } else await page.evaluate(() => window.__game.addXp(20));
        }
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) {
          const cs = await cards(page);
          await page.locator('.overlay[data-screen="levelup"] .card').nth(Math.max(0, cs.findIndex((c) => !c.id.startsWith('tech')))).click();
        }
        const r = await page.evaluate(() => window.__game.run);
        expect(r.level >= 10 && r.form === 1, `到不了 10 級或沒有化身：${r.level}／${r.form}`);
        await page.evaluate(() => { window.__game.advance(0.05); window.__game.render(); });
        const note = await page.locator('#wave-note').innerText();
        expect(/化身/.test(note) && /提燈法師/.test(note), `畫面沒有化身的提示：「${note}」`);
        await hudTopOk(ctx, '（化身提示）');
        files.push(await shot(ctx, 'g1-form'));
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const f = await page.evaluate(() => { const li = document.querySelector('#sum-form li'); return { form: li.dataset.form, t: li.innerText.replace(/\s+/g, ' ') }; });
        expect(f.form === '1' && /提燈法師/.test(f.t) && /20 級時化身/.test(f.t) && /第 2 次化身後可學：鬼火柱/.test(f.t) && !/可學：(狐火分裂|燈籠環)/.test(f.t), `能力面板的化身那一格不對：${JSON.stringify(f)}`);
        files.push(await shot(ctx, 'g1-pause'));
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      }, 75);

      await step(`${vp.name} 化身後：技法卡會出現「化身限定」的技法，真的點了就學會`, async () => {
        let got = null;
        for (let n = 0; n < 40 && !got; n++) {
          await page.evaluate(() => window.__game.techNext());
          for (let g = 0; g < 80 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(30));
          const cs = await cards(page);
          const c = cs.find((x) => /化身限定/.test(x.t));
          if (c) {
            expect(['tech:kitsunebi', 'tech:ring'].includes(c.id), `第一階化身出現的不是第一階的技法：${JSON.stringify(c)}`);
            if (!files.some((f) => f.includes('g1-card') && f.includes(vp.name))) files.push(await shot(ctx, 'g1-card'));
            await page.locator(`.overlay[data-screen="levelup"] .card[data-card="${c.id}"]`).click();
            got = c.id.slice(5);
          } else {
            const i = cs.findIndex((x) => !x.id.startsWith('tech'));
            await page.locator('.overlay[data-screen="levelup"] .card').nth(Math.max(0, i)).click();
          }
          while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) {
            const c2 = await cards(page);
            await page.locator('.overlay[data-screen="levelup"] .card').nth(Math.max(0, c2.findIndex((x) => !x.id.startsWith('tech')))).click();
          }
        }
        expect(got, '化身後 40 次升級都沒有出現化身限定技法');
        const techs = await page.evaluate(() => window.__game.run.techs);
        expect(techs.includes(got), `點了化身限定技法卻沒學會：${JSON.stringify(techs)}`);
      }, 75);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
