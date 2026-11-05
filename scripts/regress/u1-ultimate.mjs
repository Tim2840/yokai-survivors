// u1：終極技（大招，D29；D30 第二步改進化式）。湊齊配方（含鬼火滿級）→「材料齊了」提示、還沒有大招鈕 → 走去開寶箱 → 寶箱裡的融合卡（真的點）→ 融合提示 → 大招鈕出現、量表沒滿按了沒反應 → 量表滿了鈕發亮 → 真的點鈕（桌面也試 F 鍵）→ 範圍內的敵人被打倒、量表歸零。
// 「能力」面板列出配方進度；選卡畫面的卡片寫出大招材料進度。三種畫面，卡住偵測。量表用開發介面 chargeUlt 充滿（等殺敵充能太久），其餘全是真實操作。
import { openPage, startRun, press, step, expect, shot, reportErrors, walkOnto, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'u1', desc: '大招：湊齊配方（鬼火滿級）→材料齊提示→走去開寶箱、跟著箭頭去合魂祠→點融合卡→融合提示→大招鈕→冷卻倒數→量表滿了才能放→真的按鈕／F 鍵→打倒周圍敵人→能力面板與選卡提示（三種畫面）', max: 300, stall: 50 };

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
          const lines = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card .csyn.ulthint, .overlay[data-screen="levelup"] .card .csyn.ult')].map((e) => {
            // 提示必須在自己那張卡裡面（曾經被大招鈕的樣式套到，飛到畫面右下角）
            const r = e.getBoundingClientRect();
            const c = e.closest('.card').getBoundingClientRect();
            const inside = r.left >= c.left - 1 && r.right <= c.right + 1 && r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
            return { t: e.textContent, ready: e.classList.contains('ready'), inside, pos: getComputedStyle(e).position };
          }));
          for (const l of lines) {
            expect(/大招/.test(l.t), `大招提示文字不對：${l.t}`);
            expect(l.inside && l.pos !== 'absolute', `大招提示跑出卡片外（${vp.name}）：${JSON.stringify(l)}`);
            saw = true;
            if (l.ready) sawComplete = true;
          }
          if (saw) files.push(await shot(ctx, 'u1-pick'));
          await dismiss();
        }
        expect(saw, `連續升級 25 次都沒在卡片上看到大招材料提示（${vp.name}）`);
        void sawComplete;
      }, 60);

      await step(`${vp.name} 湊齊「鬼火亂舞」「炎獄燈」配方（鬼火升到 8 級，Lv4 時點選招式變化）→「材料齊了」提示，但還沒融合`, async () => {
        await dismiss();
        for (let k = 0; k < 12; k++) {
          const lv = (await ult()).counts.ghostfire ?? 1;
          if (lv >= 8) break;
          await page.evaluate(() => window.__game.give('ghostfire', 'common'));
          // 主武器到 Lv4：同一個面板跳出招式變化三選一，真的點「狐火分裂」
          if ((await page.evaluate(() => window.__game.screens)).includes('levelup')) {
            const v = page.locator('.overlay[data-screen="levelup"] .card.r-variant[data-card="variant:kitsunebi"]');
            if (await v.count()) await v.click();
            else await dismiss();
          }
        }
        expect(((await ult()).counts.ghostfire ?? 0) === 8, `鬼火沒升到 8 級：${JSON.stringify((await ult()).counts)}`);
        await page.evaluate(() => {
          const g = window.__game;
          const c = g.run.ult.counts;
          const want = { volley: 2, atkSpeed: 2, splash: 2, area: 2, power: 1 };
          for (const [id, n] of Object.entries(want)) for (let i = c[id] ?? 0; i < n; i++) g.give(id, 'common');
          g.advance(0.2); g.render();
        });
        const u = await ult();
        expect(u.fused.length === 0, `湊齊就自動融合了（應該要開寶箱）：${JSON.stringify(u)}`);
        expect(u.fusable.includes('ghostfireDance') && u.fusable.includes('infernoLantern'), `配方沒湊齊：${JSON.stringify(u)}`);
        expect(!(await page.locator('#btn-ult').isVisible()), `還沒融合就有大招鈕（${vp.name}）`);
        const txt = await page.locator('#synergy-box').innerText();
        expect(/材料齊了，開寶箱融合/.test(txt), `材料齊的提示不對：${txt}`);
      }, 60);

      await step(`${vp.name} 走去開寶箱 → 面板最前面是融合卡 → 真的點 → 融合成功、大招鈕`, async () => {
        // 第 1 個用寶箱融合；第 2 個用地圖上的合魂祠（材料齊了才出現，HUD 箭頭指過去）
        for (let round = 0; round < 2; round++) {
          let spot;
          if (round === 0) {
            spot = await page.evaluate(() => window.__game.forceElement('chest', 'common'));
            expect(spot, `放不下寶箱（${vp.name}）`);
          } else {
            for (let i = 0; i < 16 && !(await page.evaluate(() => window.__game.run.elements.some((e) => e.kind === 'fuse' && !e.used && e.announce <= 0))); i++) {
              await page.evaluate(() => window.__game.advance(0.5));
              await dismiss();
            }
            spot = (await page.evaluate(() => window.__game.run.elements)).find((e) => e.kind === 'fuse' && !e.used);
            expect(spot, `材料齊了但地圖上沒有合魂祠（${vp.name}）`);
            await page.evaluate(([x, z]) => { window.__game.teleport(x + 12, z); window.__game.advance(0.1); window.__game.render(); }, [spot.x, spot.z]);
            const arrow = await page.locator('#portal-text').innerText();
            expect(/合魂祠 \d+ 公尺/.test(arrow), `合魂祠的箭頭不對：${arrow}`);
            await hudTopOk(ctx, '・合魂祠提示');
            files.push(await shot(ctx, 'u1-shrine'));
          }
          for (let tries = 0; tries < 3 && !(await walkOnto(ctx, spot.x, spot.z)); tries++) await dismiss();
          for (let i = 0; i < 12 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); i++) await page.evaluate(() => window.__game.advance(0.25));
          await page.evaluate(() => window.__game.render());
          const title = await page.locator('#lv-title').innerText();
          expect(round === 0 ? /寶箱/.test(title) : /合魂祠/.test(title), `開出來的面板不對（第 ${round + 1} 個）：${title}`);
          const cards = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => {
            const r = c.getBoundingClientRect();
            return { id: c.dataset.card, ult: c.classList.contains('r-ult'), t: c.innerText.replace(/\s+/g, ' '), r: { x: r.x, y: r.y, w: r.width, h: r.height } };
          }));
          expect(cards[0] && cards[0].ult, `寶箱第一張不是融合卡：${JSON.stringify(cards)}`);
          expect(/融合大招/.test(cards[0].t), `融合卡沒有標示：${cards[0].t}`);
          for (const c of cards) expect(c.r.x >= 0 && c.r.y >= 0 && c.r.x + c.r.w <= vp.width + 1 && c.r.y + c.r.h <= vp.height + 1, `卡片超出畫面（${vp.name}）：${JSON.stringify(c)}`);
          if (round === 0) files.push(await shot(ctx, 'u1-chest'));
          await page.locator('.overlay[data-screen="levelup"] .card.r-ult').first().click();
          await dismiss();
          await page.evaluate(() => { window.__game.advance(0.2); window.__game.render(); });
          if (round === 0) {
            expect(await page.locator('#synergy-box').isVisible(), `融合後沒有提示（${vp.name}）`);
            const txt = await page.locator('#synergy-box').innerText();
            expect(/融合成功/.test(txt), `融合提示文字不對：${txt}`);
          }
        }
        const u = await ult();
        expect(u.fused.includes('ghostfireDance') && u.fused.includes('infernoLantern'), `沒有融合：${JSON.stringify(u)}`);
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
        // 人類生在身邊 8 公尺（大招範圍內）；鬼火會把人類擊退，所以生完馬上放
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
        // 冷卻：鈕上寫倒數秒數；冷卻中按了沒反應
        expect(await page.locator('#btn-ult.cooling').count() === 1, `發動後沒有進入冷卻（${vp.name}）`);
        const cd = await page.locator('#ult-key').innerText();
        expect(/^\d+ 秒$/.test(cd), `冷卻倒數文字不對：${cd}`);
        const k1 = await page.evaluate(() => window.__game.run.kills);
        await page.evaluate(() => { window.__game.spawn('villager', 6); window.__game.advance(0.3); });
        await dismiss();
        if (!vp.hasTouch) await page.keyboard.press('KeyF');
        else await press(ctx, '#btn-ult');
        await page.evaluate(() => window.__game.advance(0.1));
        expect((await page.evaluate(() => window.__game.run.ult.charge)) < 5, `冷卻中量表在充能：${(await page.evaluate(() => window.__game.run.ult.charge))}`);
        void k1;
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
        expect(/鬼火 8\/8/.test(th.t), `雷火槍的配方沒列出鬼火滿級：${th.t}`);
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
