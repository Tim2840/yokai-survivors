// s1：卡片聯動（D28）。用開發介面把兩張卡給玩家（選卡的點擊流程由 r2 負責），確認 HUD 顯示聯動提示、4 秒後消失、
// 不蓋住倒數計時與暫停鈕（三種畫面），且屬性面板的數值有變。
import { openPage, startRun, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 's1', desc: '卡片聯動：拿到兩張指定的卡→HUD 提示出現、不蓋住倒數與暫停鈕、4 秒後消失（三種畫面）', max: 200, stall: 40 };

const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=31');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      await step(`${vp.name} 給兩張卡 → 聯動提示`, async () => {
        await page.evaluate(() => { window.__game.give('volley', 'common'); window.__game.advance(0.1); window.__game.render(); });
        expect(!(await page.locator('#synergy-box').isVisible()), `只有一張卡就出現聯動提示（${vp.name}）`);
        await page.evaluate(() => { window.__game.give('splash', 'rare'); window.__game.advance(0.1); window.__game.render(); });
        expect(await page.locator('#synergy-box').isVisible(), `湊齊兩張卡沒有聯動提示（${vp.name}）`);
        const txt = await page.locator('#synergy-box').innerText();
        expect(/連環爆/.test(txt), `提示文字不對：${txt}`);
        const box = await page.locator('#synergy-box').boundingBox();
        for (const sel of ['.hud-wave', '#btn-pause', '.hud-hp', '#element-box', '#portal-box', '#btn-jump', '#stick-base']) {
          const o = await page.locator(sel).first().boundingBox();
          expect(!overlap(box, o), `聯動提示蓋住 ${sel}（${vp.name}）：${JSON.stringify(box)} vs ${JSON.stringify(o)}`);
        }
        const inView = box.x >= 0 && box.x + box.width <= vp.width;
        expect(inView, `聯動提示超出畫面寬度（${vp.name}）`);
        files.push(await shot(ctx, 's1-synergy'));
      });
      await step(`${vp.name} 選卡畫面：卡片上寫出能湊成什麼聯動（版面不破）`, async () => {
        // 重開一局，先給一張「鬼火增殖」，再連續升級；卡池很小，幾次內一定會出現和聯動有關的卡
        await page.evaluate(() => window.__game.advance(0.1));
        let sawHint = false;
        let sawReady = false;
        for (let k = 0; k < 25 && !(sawHint && sawReady); k++) {
          // 一次只加一點點魂火，剛好升一級（加太多會一次升幾十級，要連選幾十次）
          for (let g = 0; g < 40 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(20));
          expect((await page.evaluate(() => window.__game.screens)).includes('levelup'), `加魂火後沒有升級（${vp.name}）`);
          const info = await page.evaluate(() =>
            [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => {
              const r = c.getBoundingClientRect();
              return { id: c.dataset.card, hints: [...c.querySelectorAll('.csyn')].map((h) => ({ t: h.textContent, ready: h.classList.contains('ready') })), clipped: c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
            }),
          );
          for (const c of info) {
            expect(!c.clipped, `帶聯動提示的卡字被切掉（${vp.name}）：${JSON.stringify(c)}`);
            expect(c.inView, `卡片超出畫面（${vp.name}）：${JSON.stringify(c)}`);
            for (const h of c.hints) {
              expect(/聯動/.test(h.t), `提示文字不對：${h.t}`);
              sawHint = true;
              if (h.ready) sawReady = true;
            }
          }
          if (!sawHint || k === 0) files.length < 99 && (k === 0 || sawHint) && files.push(await shot(ctx, 's1-pick'));
          // 優先選有「選了就觸發」或有提示的卡，沒有就選第一張
          const idx = info.findIndex((c) => c.hints.some((h) => h.ready));
          await page.locator('.overlay[data-screen="levelup"] .card').nth(Math.max(0, idx)).click();
          while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        }
        expect(sawHint, `連續升級 25 次都沒在卡片上看到聯動提示（${vp.name}）`);
      }, 60);

      await step(`${vp.name} 4 秒後消失`, async () => {
        await page.evaluate(() => window.__game.advance(4.5));
        const lv = await page.evaluate(() => window.__game.screens);
        if (lv.includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        await page.evaluate(() => window.__game.render());
        expect(!(await page.locator('#synergy-box').isVisible()), `聯動提示沒有消失（${vp.name}）`);
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
