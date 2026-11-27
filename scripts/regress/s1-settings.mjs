// s1：設定畫面（D103）。用玩家會做的事：主選單點「設定」→ 拉音量滑桿、點畫質／特效／字級／小地圖的按鈕 →
// 每一項真的生效（音量、畫質模式、手感倍率、字級變數、小地圖轉向）→ 點「完成」回主選單 → 重載還在 →
// 開局後頂端列在「大」字級下不擠壞 → 暫停頁點「設定」→ 改回標準字級 → 「完成」回到暫停頁 → 繼續。三種畫面。
import { openPage, startRun, press, step, expect, shot, reportErrors, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 's1', desc: '設定畫面：主選單→改音量／畫質／特效／字級／小地圖→真的生效→重載還在→大字級下 HUD 不擠壞→暫停頁也開得到、完成回暫停頁（三種畫面）', max: 240, stall: 60 };

const S = (page) => page.evaluate(() => window.__game.settings);
const inView = async (ctx, sel) => {
  const b = await ctx.page.locator(sel).boundingBox();
  return b && b.x >= -1 && b.y >= -1 && b.x + b.width <= ctx.vp.width + 1 && b.y + b.height <= ctx.vp.height + 1;
};

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=11');
    const { page } = ctx;
    try {
      await step(`${vp.name} 主選單 → 設定：面板在畫面內、每一列都看得到`, async () => {
        await page.waitForFunction(() => window.__game.state === 'MENU');
        await press(ctx, '#btn-settings');
        await page.waitForFunction(() => window.__game.screens.includes('settings'));
        expect(await inView(ctx, '.settings-panel'), `設定面板超出畫面（${vp.name}）`);
        expect((await page.locator('.settings-panel .set-row').count()) === 6, '設定少了幾列');
        expect(await inView(ctx, '#btn-settings-close'), `「完成」鈕不在畫面內（${vp.name}）`);
      });

      await step(`${vp.name} 改每一項，馬上生效、存進存檔`, async () => {
        await page.locator('#set-sfx').fill('20');
        await page.locator('#set-music').fill('0');
        for (const [g, v] of [['set-quality', 'low'], ['set-fx', 'off'], ['set-text', 'large'], ['set-mm', 'on']]) await press(ctx, `#${g} .seg-btn[data-v="${v}"]`);
        const s = await S(page);
        expect(Math.abs(s.saved.sfx - 0.2) < 1e-6 && s.saved.music === 0, `音量沒存：${JSON.stringify(s.saved)}`);
        const au = await page.evaluate(() => window.__game.audio.volumes);
        expect(Math.abs(au.sfx - 0.2) < 1e-6 && au.music === 0, `音量沒生效：${JSON.stringify(au)}`);
        expect((await page.evaluate(() => window.__game.quality.mode)) === 'low', '畫質模式沒變');
        expect(s.feel.shake === 0 && s.feel.pops === 0, `特效關閉沒生效：${JSON.stringify(s.feel)}`);
        expect(s.ts === '1.15', `字級沒變：${s.ts}`);
        expect(s.saved.fx === 'off' && s.saved.text === 'large' && s.saved.minimapRotate === true && s.saved.quality === 'low', `沒存：${JSON.stringify(s.saved)}`);
        expect((await page.locator('#set-text .seg-btn.on').getAttribute('data-v')) === 'large', '按下的按鈕沒標成選中');
        expect(await inView(ctx, '.settings-panel'), `大字級時設定面板超出畫面（${vp.name}）`);
        files.push(await shot(ctx, 's1-settings'));
        await press(ctx, '#btn-settings-close');
        await page.waitForFunction(() => !window.__game.screens.includes('settings') && window.__game.state === 'MENU');
      });

      await step(`${vp.name} 重載後設定還在（字級、特效、畫質、小地圖）`, async () => {
        await page.reload();
        await page.waitForFunction(() => window.__game && window.__game.state === 'MENU');
        const s = await S(page);
        expect(s.saved.fx === 'off' && s.saved.text === 'large' && s.saved.minimapRotate && s.saved.quality === 'low', `重載後沒了：${JSON.stringify(s.saved)}`);
        expect(s.ts === '1.15' && s.feel.shake === 0, `重載後沒套用：${JSON.stringify(s)}`);
      });

      await step(`${vp.name} 開局：大字級下頂端列不擠壞；小地圖跟著鏡頭轉`, async () => {
        await startRun(ctx);
        await page.evaluate(() => { window.__game.god = true; window.__game.advance(0.5); window.__game.render(); });
        await hudTopOk(ctx, '・大字級');
        await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 3; i++) { g.advance(0.2); g.render(); } });
        const rot = await page.evaluate(() => document.querySelector('.minimap')?.dataset.rot ?? null);
        expect(rot !== null, '小地圖沒有轉');
        files.push(await shot(ctx, 's1-large-hud'));
      });

      await step(`${vp.name} 暫停頁 → 設定 → 改回標準字級 → 完成回到暫停頁 → 繼續`, async () => {
        await press(ctx, '#btn-pause');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        await press(ctx, '#btn-pause-settings');
        await page.waitForFunction(() => window.__game.screens.includes('settings') && !window.__game.screens.includes('pause'));
        await press(ctx, '#set-text .seg-btn[data-v="normal"]');
        await press(ctx, '#set-mm .seg-btn[data-v="off"]');
        await press(ctx, '#btn-settings-close');
        await page.waitForFunction(() => window.__game.screens.includes('pause') && !window.__game.screens.includes('settings'));
        const s = await S(page);
        expect(s.ts === '1' && !s.saved.minimapRotate, `改回去沒生效：${JSON.stringify(s)}`);
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
        await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 3; i++) { g.advance(0.2); g.render(); } });
        expect((await page.evaluate(() => document.querySelector('.minimap')?.dataset.rot ?? null)) === null, '關掉後小地圖還在轉');
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
