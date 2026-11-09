// u1：大招（D52：局外裝配；取消卡片融合）。開局就帶著裝配的大招（選妖怪畫面寫出來）→ 大招鈕在、量表沒滿按了沒反應 →
// 量表滿了鈕發亮 → 真的按（按鈕／F 鍵）→ 打倒周圍敵人、量表歸零、進入冷卻倒數 → 「能力」面板寫出大招與升級累計。
// 再走一遍神社：打開神社 → 領測試功德 → 裝配第 2 招、升一級 → page.reload() 之後還在 → 開局帶的是第 2 招、放出來真的有效果。
// 三種畫面，卡住偵測。量表用開發介面 chargeUlt 充滿（等殺敵充能太久），其餘全是真實操作。
import { openPage, press, step, expect, shot, reportErrors, waitState, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'u1', desc: '大招：開局就有裝配的大招→量表沒滿沒反應→滿了鈕發亮→按鈕／F 鍵放→打倒敵人、冷卻倒數→能力面板；神社裝配第 2 招、升級、重載後還在、開局帶那一招（三種畫面）', max: 360, stall: 60 };

const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=51');
    const { page } = ctx;
    try {
      await waitState(page, 'MENU');
      await step(`${vp.name} 選妖怪畫面寫出裝配的大招（預設炎獄燈 Lv0）；開局`, async () => {
        await press(ctx, '#btn-start');
        await page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
        const line = await page.locator('#setup-ult').innerText();
        expect(/炎獄燈/.test(line) && /Lv0/.test(line), `選妖怪畫面沒寫出裝配的大招：${line}`);
        await press(ctx, '#btn-setup-go');
        await waitState(page, 'COMBAT');
        await page.evaluate(() => (window.__game.god = true));
      }, 40);
      const ult = () => page.evaluate(() => window.__game.run.ult);
      const dismiss = async () => {
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      };

      await step(`${vp.name} 開局就有大招鈕（不用湊配方、不用融合）；不蓋到其他操作；量表沒滿`, async () => {
        const u = await ult();
        expect(u.equipped.length === 1 && u.equipped[0] === 'infernoLantern', `開局沒帶裝配的大招：${JSON.stringify(u)}`);
        expect(await page.locator('#btn-ult').isVisible(), `開局沒有大招鈕（${vp.name}）`);
        expect(!u.ready, '量表不該已經滿了');
        const b = await page.locator('#btn-ult').boundingBox();
        for (const sel of ['#btn-jump', '#stick-base', '#btn-pause', '#btn-abilities']) {
          const o = await page.locator(sel).first().boundingBox();
          expect(!overlap(b, o), `大招鈕蓋住 ${sel}（${vp.name}）：${JSON.stringify(b)} vs ${JSON.stringify(o)}`);
        }
        expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, `大招鈕超出畫面（${vp.name}）：${JSON.stringify(b)}`);
        files.push(await shot(ctx, 'u1-start'));
      });

      await step(`${vp.name} 選卡畫面不再出現大招材料、融合卡；法具卡只寫適合的技法`, async () => {
        for (let k = 0; k < 6; k++) {
          for (let g = 0; g < 60 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(10));
          const info = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => ({ id: c.dataset.card, ult: c.classList.contains('r-ult') || !!c.querySelector('.ulthint'), t: c.innerText.replace(/\s+/g, ' ') })));
          for (const c of info) {
            expect(!c.ult && !/融合|大招材料|材料/.test(c.t), `選卡還有大招融合的字樣：${JSON.stringify(c)}`);
          }
          await page.locator('.overlay[data-screen="levelup"] .card').first().click();
          await dismiss();
        }
      }, 60);

      await step(`${vp.name} 量表沒滿按下去沒有反應`, async () => {
        await page.evaluate(() => { window.__game.spawn('villager', 12); window.__game.advance(0.3); });
        await dismiss();
        const before = await page.evaluate(() => window.__game.run.ult);
        expect(!before.ready, '量表不該已經滿了');
        await press(ctx, '#btn-ult');
        await page.evaluate(() => window.__game.advance(0.1));
        const after = await page.evaluate(() => window.__game.run.ult);
        expect(after.charge >= before.charge, `量表沒滿卻發動了：${before.charge} → ${after.charge}`);
      });

      await step(`${vp.name} 量表滿 → 鈕發亮 → 真的按 → 敵人被打倒、量表歸零、冷卻倒數`, async () => {
        await page.evaluate(() => { window.__game.spawn('villager', 12); window.__game.chargeUlt(); window.__game.advance(0.05); window.__game.render(); });
        expect(await page.locator('#btn-ult.ready').count() === 1, `量表滿了鈕沒有發亮（${vp.name}）`);
        const e0 = await page.evaluate(() => window.__game.run.enemies);
        expect(e0 > 0, '場上沒有敵人可打');
        const k0 = await page.evaluate(() => window.__game.run.kills);
        if (!vp.hasTouch) await page.keyboard.press('KeyF');
        else await press(ctx, '#btn-ult');
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        const r1 = await page.evaluate(() => window.__game.run);
        expect(r1.kills > k0, `按了大招沒有打倒敵人：${k0} → ${r1.kills}`);
        expect(r1.ult.charge < 5, `發動後量表沒有歸零：${r1.ult.charge}`);
        expect(await page.locator('#btn-ult.ready').count() === 0, `發動後鈕還在發亮（${vp.name}）`);
        expect(await page.locator('#btn-ult.cooling').count() === 1, `發動後沒有進入冷卻（${vp.name}）`);
        const cd = await page.locator('#ult-key').innerText();
        expect(/^\d+ 秒$/.test(cd), `冷卻倒數文字不對：${cd}`);
        await page.evaluate(() => { window.__game.spawn('villager', 6); window.__game.advance(0.3); });
        await dismiss();
        if (!vp.hasTouch) await page.keyboard.press('KeyF');
        else await press(ctx, '#btn-ult');
        await page.evaluate(() => window.__game.advance(0.1));
        expect((await page.evaluate(() => window.__game.run.ult.charge)) < 5, `冷卻中量表在充能`);
        files.push(await shot(ctx, 'u1-cast'));
      });

      if (!vp.hasTouch) {
        await step(`${vp.name} 桌面用滑鼠點大招鈕也能放`, async () => {
          await page.evaluate(() => { window.__game.spawn('villager', 10); window.__game.chargeUlt(); window.__game.advance(0.3); window.__game.render(); });
          await dismiss();
          const k0 = await page.evaluate(() => window.__game.run.kills);
          await press(ctx, '#btn-ult');
          await page.evaluate(() => window.__game.advance(0.3));
          expect((await page.evaluate(() => window.__game.run.kills)) > k0, '點大招鈕沒有效果');
        });
      }

      await step(`${vp.name} 「能力」面板：寫出裝配的大招、等級與升級累計`, async () => {
        await dismiss();
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const info = await page.evaluate(() => [...document.querySelectorAll('#sum-ult li')].map((li) => ({ id: li.dataset.ult, t: li.innerText.replace(/\s+/g, ' ') })));
        expect(info.length === 1 && info[0].id === 'infernoLantern', `應只列出裝配的那一招：${JSON.stringify(info)}`);
        expect(/炎獄燈/.test(info[0].t) && /Lv0\/5/.test(info[0].t) && /威力 ×1/.test(info[0].t) && /冷卻 25 秒/.test(info[0].t), `大招的等級或升級累計不對：${info[0].t}`);
        files.push(await shot(ctx, 'u1-pause'));
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }

    // ── 神社：裝配、升級、存檔 → 重載 → 還在、開局真的帶那一招 ──
    const ctx2 = await openPage(browser, vp, '?q=4&seed=52');
    const p2 = ctx2.page;
    try {
      await waitState(p2, 'MENU');
      const shrineInfo = () =>
        p2.evaluate(() => ({
          merit: document.querySelector('#shrine-merit').innerText,
          rows: [...document.querySelectorAll('.shrine-ult[data-yokai="chochin-kozo"]')].map((r) => ({ id: r.dataset.ult, equipped: r.classList.contains('equipped'), t: r.innerText.replace(/\s+/g, ' ') })),
        }));
      await step(`${vp.name} 神社：列出 2 招、預設裝配炎獄燈；領測試功德、裝配鬼火亂舞、升一級`, async () => {
        await press(ctx2, '#btn-shrine');
        await p2.waitForFunction(() => window.__game.screens.includes('shrine'), null, { timeout: 10000 });
        let info = await shrineInfo();
        expect(info.rows.length === 2 && info.rows[0].id === 'infernoLantern' && info.rows[0].equipped && info.rows[1].id === 'ghostfireDance', `神社的大招列表不對：${JSON.stringify(info)}`);
        files.push(await shot(ctx2, 'u1-shrine'));
        await press(ctx2, '#btn-shrine-cheat');
        info = await shrineInfo();
        expect(/功德 1000/.test(info.merit), `領了功德沒變：${info.merit}`);
        await p2.locator('.shrine-ult[data-ult="ghostfireDance"] button[data-act="equip"]').click();
        await p2.locator('.shrine-ult[data-ult="ghostfireDance"] button[data-act="up"]').click();
        info = await shrineInfo();
        const d = info.rows.find((r) => r.id === 'ghostfireDance');
        expect(d.equipped && /Lv1\/5/.test(d.t), `裝配或升級沒生效：${d.t}`);
        expect(!info.rows.find((r) => r.id === 'infernoLantern').equipped, '炎獄燈還標示已裝配');
        expect(/功德 9\d\d/.test(info.merit) && !/功德 1000/.test(info.merit), `升級沒扣功德：${info.merit}`);
        // 面板在畫面內、按鈕夠大、可捲動
        const box = await p2.evaluate(() => {
          const r = document.querySelector('.shrine-panel').getBoundingClientRect();
          const bs = [...document.querySelectorAll('.shrine-ult button')].map((b) => b.getBoundingClientRect().height);
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, minBtn: Math.min(...bs) };
        });
        expect(box.top >= 0 && box.left >= 0 && box.bottom <= vp.height + 1 && box.right <= vp.width + 1, `神社面板超出畫面（${vp.name}）：${JSON.stringify(box)}`);
        expect(box.minBtn >= 36, `神社按鈕太小（${vp.name}）：${box.minBtn}`);
        files.push(await shot(ctx2, 'u1-shrine2'));
      });
      await step(`${vp.name} 存檔 → 重新載入 → 神社還是鬼火亂舞 Lv1、功德還在`, async () => {
        await p2.reload({ waitUntil: 'load' });
        await waitState(p2, 'MENU');
        await press(ctx2, '#btn-shrine');
        await p2.waitForFunction(() => window.__game.screens.includes('shrine'), null, { timeout: 10000 });
        const info = await shrineInfo();
        const d = info.rows.find((r) => r.id === 'ghostfireDance');
        expect(d.equipped && /Lv1\/5/.test(d.t), `重載後裝配／等級不見了：${JSON.stringify(info)}`);
        expect(/功德 9\d\d/.test(info.merit), `重載後功德不見了：${info.merit}`);
        await press(ctx2, '#btn-shrine-back');
        await p2.waitForFunction(() => !window.__game.screens.includes('shrine'));
      });
      await step(`${vp.name} 開局帶的是鬼火亂舞 Lv1：選妖怪畫面寫出來、放出去攻擊力真的變高、升級的幅度比 Lv0 大`, async () => {
        await press(ctx2, '#btn-start');
        await p2.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
        const line = await p2.locator('#setup-ult').innerText();
        expect(/鬼火亂舞/.test(line) && /Lv1/.test(line), `選妖怪畫面沒寫出鬼火亂舞 Lv1：${line}`);
        await press(ctx2, '#btn-setup-go');
        await waitState(p2, 'COMBAT');
        await p2.evaluate(() => (window.__game.god = true));
        const u = await p2.evaluate(() => window.__game.run.ult);
        expect(u.equipped[0] === 'ghostfireDance' && Math.abs(u.mods.power - 1.1) < 1e-9, `開局沒帶鬼火亂舞 Lv1：${JSON.stringify(u)}`);
        const p0 = await p2.evaluate(() => window.__game.run.stats.power);
        await p2.evaluate(() => { window.__game.chargeUlt(); window.__game.advance(0.05); });
        if (!vp.hasTouch) await p2.keyboard.press('KeyF');
        else await press(ctx2, '#btn-ult');
        await p2.evaluate(() => window.__game.advance(0.2));
        const p1 = await p2.evaluate(() => window.__game.run.stats.power);
        expect(p1 > p0 * 1.3, `鬼火亂舞沒有加攻擊力：${p0} → ${p1}`);
      }, 60);
      reportErrors(ctx2);
    } finally {
      await ctx2.close();
    }
  }
  return files;
}
