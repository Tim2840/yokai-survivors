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
