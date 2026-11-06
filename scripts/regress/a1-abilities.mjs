// a1：「能力」面板（暫停畫面裡的已拿到的卡與目前的能力）。真實點 HUD 的「能力」鈕 → 看到卡片清單（數量、累計效果）與屬性（和 __game.run.stats 對得上）
// → 版面在畫面內、「繼續」鈕點得到 → 點繼續模擬繼續；桌面再測 C 鍵開關。三種畫面，卡住偵測。
import { openPage, startRun, press, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'a1', desc: '能力面板：點「能力」→ 已拿到的卡（數量、效果）與屬性對得上、版面不破、繼續鈕可點、C 鍵開關（三種畫面）', max: 240, stall: 40 };

const overlap = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=41');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      await step(`${vp.name} 「能力」鈕不蓋住別的 HUD`, async () => {
        const b = await page.locator('#btn-abilities').boundingBox();
        for (const sel of ['#btn-pause', '.hud-wave', '.hud-hp']) {
          const o = await page.locator(sel).first().boundingBox();
          expect(!overlap(b, o), `「能力」鈕蓋住 ${sel}（${vp.name}）：${JSON.stringify(b)} vs ${JSON.stringify(o)}`);
        }
        expect(b.x >= 0 && b.x + b.width <= vp.width, `「能力」鈕超出畫面（${vp.name}）`);
      });
      await step(`${vp.name} 開局：只有主武器鬼火 Lv1、道具欄 0/6`, async () => {
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const txt = await page.locator('#sum-cards').innerText();
        expect(/鬼火 Lv1\/8/.test(txt), `開局應該只看到鬼火 Lv1：${txt}`);
        const slots = await page.locator('#sum-slots').innerText();
        expect(/0\/6/.test(slots), `道具欄應該是 0/6：${slots}`);
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });
      await step(`${vp.name} 拿幾張卡 → 清單與屬性對得上`, async () => {
        await page.evaluate(() => {
          const g = window.__game;
          g.give('power', 'common'); g.give('power', 'rare'); g.give('hp', 'epic'); g.give('volley', 'common'); g.give('volley', 'common'); g.give('splash', 'rare'); g.give('splash', 'common'); g.give('splash', 'common'); g.give('armor', 'common');
          g.advance(0.2); g.render();
        });
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const info = await page.evaluate(() => {
          const rows = Object.fromEntries([...document.querySelectorAll('#sum-cards li[data-card]')].map((li) => [li.dataset.card, li.innerText.replace(/\s+/g, ' ')]));
          const stats = Object.fromEntries([...document.querySelectorAll('#sum-stats [data-stat]')].map((d) => [d.dataset.stat, d.querySelector('dd').innerText]));
          return { rows, stats, run: window.__game.run };
        });
        // 力量 凡 +10%、良 +12%（稀有度 ×1.2）→ Lv2、累計 +22%；強健 珍 = 20 × 1.5 = +30
        expect(/力量 Lv2\/5/.test(info.rows.power) && /\+22%/.test(info.rows.power), `力量的等級或累計效果不對：${info.rows.power}`);
        expect(/強健 Lv1\/5/.test(info.rows.hp) && /\+30/.test(info.rows.hp), `強健不對：${info.rows.hp}`);
        const slots = await page.locator('#sum-slots').innerText();
        expect(/5\/6/.test(slots), `道具欄應該是 5/6：${slots}`);
        expect(info.rows.volley && info.rows.splash && info.rows.armor, `少了卡片：${Object.keys(info.rows)}`);
        // D51：聯動已刪除，面板上不再有聯動區塊
        expect(!(await page.locator('#sum-syn').count()), '面板還有聯動區塊');
        const p = info.run.stats.power;
        expect(info.stats.power === `×${Number(p.toFixed(2))}`, `攻擊力顯示和實際不符：${info.stats.power} vs ${p}`);
        expect(info.stats.maxHp.includes(`/ ${Math.round(info.run.maxHp)}`), `最大生命顯示不符：${info.stats.maxHp}`);
        expect(/受傷 ×/.test(info.stats.armor), `護甲沒顯示減傷：${info.stats.armor}`);
        expect(Number(info.stats.volley) > 2, `鬼火數量沒算上卡片：${info.stats.volley}`);
        // 版面：面板在畫面內（可捲動）、繼續鈕在畫面內可點
        const box = await page.locator('.pause-panel').boundingBox();
        expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1, `能力面板超出畫面（${vp.name}）：${JSON.stringify(box)}`);
        files.push(await shot(ctx, 'a1-abilities'));
        const t0 = await page.evaluate(() => window.__game.run.time);
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
        await page.evaluate(() => window.__game.advance(1));
        const t1 = await page.evaluate(() => window.__game.run.time);
        expect(t1 > t0 + 0.5, `按繼續後模擬沒有繼續：${t0} → ${t1}`);
      });
      if (!vp.hasTouch) {
        await step(`${vp.name} C 鍵開關`, async () => {
          await page.keyboard.press('KeyC');
          await page.waitForFunction(() => window.__game.screens.includes('pause'));
          await page.keyboard.press('KeyC');
          await page.waitForFunction(() => !window.__game.screens.includes('pause'));
        });
      }
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
