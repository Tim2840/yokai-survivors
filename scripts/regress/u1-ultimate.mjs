// u1：終極技（大招，D29）。湊齊配方 → 融合提示 → 大招鈕出現、量表沒滿按了沒反應 → 量表滿了鈕發亮 → 真的點鈕（桌面也試 F 鍵）→ 範圍內的敵人被打倒、量表歸零。
// 「能力」面板列出配方進度；選卡畫面的卡片寫出大招材料進度。三種畫面，卡住偵測。量表用開發介面 chargeUlt 充滿（等殺敵充能太久），其餘全是真實操作。
import { openPage, startRun, press, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'u1', desc: '大招：湊齊配方→融合提示→大招鈕→量表滿了才能放→真的按鈕／F 鍵→打倒周圍敵人→能力面板與選卡提示（三種畫面）', max: 300, stall: 50 };

const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=51');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      const ult = () => page.evaluate(() => window.__game.run.ult);
      const dismiss = async () => {
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      };

      await step(`${vp.name} 還沒融合：沒有大招鈕`, async () => {
        expect(!(await page.locator('#btn-ult').isVisible()), `還沒融合就出現大招鈕（${vp.name}）`);
      });

      await step(`${vp.name} 選卡畫面：卡片上寫出大招材料進度`, async () => {
        // 先給一張鬼火增殖（鬼火亂舞的材料），再連續升級直到卡片上出現「大招」那一行
        await page.evaluate(() => { window.__game.give('volley', 'common'); });
        let saw = false;
        let sawComplete = false;
        for (let k = 0; k < 25 && !saw; k++) {
          for (let g = 0; g < 40 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(20));
          const lines = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card .csyn.ult')].map((e) => ({ t: e.textContent, ready: e.classList.contains('ready') })));
          for (const l of lines) {
            expect(/大招/.test(l.t), `大招提示文字不對：${l.t}`);
            saw = true;
            if (l.ready) sawComplete = true;
          }
          if (saw) files.push(await shot(ctx, 'u1-pick'));
          await dismiss();
        }
        expect(saw, `連續升級 25 次都沒在卡片上看到大招材料提示（${vp.name}）`);
        void sawComplete;
      }, 60);

      await step(`${vp.name} 湊齊「鬼火亂舞」「炎獄燈」配方 → 融合提示、大招鈕`, async () => {
        await page.evaluate(() => {
          const g = window.__game;
          for (const c of ['volley', 'atkSpeed', 'atkSpeed', 'splash', 'splash', 'area', 'area', 'power']) g.give(c, 'common');
          g.advance(0.2); g.render();
        });
        const u = await ult();
        expect(u.fused.includes('ghostfireDance') && u.fused.includes('infernoLantern'), `沒有融合：${JSON.stringify(u)}`);
        expect(await page.locator('#synergy-box').isVisible(), `融合後沒有提示（${vp.name}）`);
        const txt = await page.locator('#synergy-box').innerText();
        expect(/融合成功/.test(txt), `融合提示文字不對：${txt}`);
        expect(await page.locator('#btn-ult').isVisible(), `融合後沒有大招鈕（${vp.name}）`);
        const b = await page.locator('#btn-ult').boundingBox();
        for (const sel of ['#btn-jump', '#stick-base', '#btn-pause', '#btn-abilities']) {
          const o = await page.locator(sel).first().boundingBox();
          expect(!overlap(b, o), `大招鈕蓋住 ${sel}（${vp.name}）：${JSON.stringify(b)} vs ${JSON.stringify(o)}`);
        }
        expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, `大招鈕超出畫面（${vp.name}）：${JSON.stringify(b)}`);
        files.push(await shot(ctx, 'u1-fused'));
      });

      await step(`${vp.name} 量表沒滿按下去沒有反應`, async () => {
        await page.evaluate(() => { window.__game.spawn('villager', 12); window.__game.advance(0.3); });
        await dismiss();
        const before = await page.evaluate(() => ({ k: window.__game.run.kills, u: window.__game.run.ult }));
        expect(!before.u.ready, '量表不該已經滿了');
        await press(ctx, '#btn-ult');
        await page.evaluate(() => window.__game.advance(0.1));
        const after = await page.evaluate(() => window.__game.run.ult);
        expect(after.charge >= before.u.charge, `量表沒滿卻發動了：${before.u.charge} → ${after.charge}`);
      });

      await step(`${vp.name} 量表滿 → 鈕發亮 → 真的按 → 敵人被打倒、量表歸零`, async () => {
        await page.evaluate(() => window.__game.chargeUlt());
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
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

      await step(`${vp.name} 「能力」面板：配方進度與已融合標記`, async () => {
        await dismiss();
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const info = await page.evaluate(() => [...document.querySelectorAll('#sum-ult li')].map((li) => ({ id: li.dataset.ult, fused: li.classList.contains('fused'), t: li.innerText.replace(/\s+/g, ' ') })));
        expect(info.length === 4, `應列出 4 個配方：${JSON.stringify(info)}`);
        expect(info.find((x) => x.id === 'infernoLantern').fused, `炎獄燈沒標示已融合`);
        const th = info.find((x) => x.id === 'thunderSpear');
        const cn = (await ult()).counts;
        expect(new RegExp(`穿透 ${Math.min(2, cn.pierce ?? 0)}/2`).test(th.t) && new RegExp(`力量 ${Math.min(2, cn.power ?? 0)}/2`).test(th.t), `雷火槍的進度和實際拿到的卡對不上：${th.t} vs ${JSON.stringify(cn)}`);
        files.push(await shot(ctx, 'u1-recipes'));
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
