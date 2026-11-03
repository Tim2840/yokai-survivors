// b1：開機到主選單（M0 Exit）。三種畫面各一次：
// 狀態到 MENU、畫布有畫出東西（不是全黑／全同色）、標題與按鈕在畫面內且點得到、點「開始」有回應、沒有任何頁面錯誤；各截一張圖。
import { openPage, waitState, press, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'b1', desc: '開機到主選單（三種畫面）', max: 120, stall: 30 };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp);
    try {
      await step(`${vp.name} 到 MENU`, () => waitState(ctx.page, 'MENU'), meta.stall);
      await step(`${vp.name} 畫布有內容`, async () => {
        await ctx.page.evaluate(() => window.__game.render());
        const varied = await ctx.page.evaluate(() => {
          const c = document.querySelector('#app canvas');
          const gl = c.getContext('webgl2', { preserveDrawingBuffer: true }) || c.getContext('webgl');
          window.__game.render();
          const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
          const px = new Uint8Array(4);
          const seen = new Set();
          for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.15], [0.5, 0.85], [0.1, 0.5], [0.9, 0.5]]) {
            gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            seen.add(px.join(','));
          }
          return seen.size;
        });
        expect(varied >= 2, `畫布看起來是單一顏色（${vp.name}）`);
      });
      await step(`${vp.name} 點開始`, async () => {
        await press(ctx, '#btn-start');
        await ctx.page.waitForFunction(() => {
          const t = document.getElementById('toast');
          return t && !t.classList.contains('hidden') && t.textContent.length > 0;
        }, null, { timeout: 10000 });
        // 提示泡泡不能蓋到選單（舊版橫式手機會壓到選單底部）
        const overlap = await ctx.page.evaluate(() => {
          const a = document.getElementById('toast').getBoundingClientRect();
          const b = document.querySelector('.menu').getBoundingClientRect();
          return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
        });
        expect(!overlap, `提示泡泡蓋到選單（${vp.name}）`);
        // 選單整個在畫面內
        const inView = await ctx.page.evaluate(() => {
          const r = document.querySelector('.menu').getBoundingClientRect();
          return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
        });
        expect(inView, `選單超出畫面（${vp.name}）`);
      });
      files.push(await shot(ctx, 'b1-menu'));
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
