// m1：小地圖（D66，docs/21）。三種畫面：開局看得到、在畫面內、不蓋住其他 HUD 與按鈕 → 要素預告結束後出現符號（形狀＋功能色）→
// 點一下放大（不暫停模擬）、再點縮回 → 畫布不是空的、玩家在中央附近有白色箭頭。卡住偵測。
import { openPage, startRun, press, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'm1', desc: '小地圖：看得到、不蓋住其他 HUD 與按鈕、要素出現符號、點一下放大不暫停、畫布有內容（三種畫面）', max: 120, stall: 45 };

const rects = (page, sels) =>
  page.evaluate((list) => {
    const out = {};
    for (const s of list) {
      const el = document.querySelector(s);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0 || r.height === 0) continue;
      out[s] = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return out;
  }, sels);
const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=91');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => { window.__game.god = true; window.__game.advance(1); window.__game.render(); });

      await step(`${vp.name} 小地圖看得到、在畫面內、不蓋住其他 HUD 與按鈕`, async () => {
        await page.waitForFunction(() => { const e = document.querySelector('#minimap'); return !!e && !e.classList.contains('hidden'); }, null, { timeout: 8000 });
        const others = ['.hud-hp', '#btn-abilities', '#btn-pause', '#btn-jump', '#btn-ult', '#stick-base', '#boss-bar', '.hud-wave b', '.hud-wave span'];
        const r = await rects(page, ['#minimap', ...others]);
        const m = r['#minimap'];
        expect(m, '沒有小地圖');
        expect(m.x >= 0 && m.y >= 0 && m.x + m.w <= vp.width + 1 && m.y + m.h <= vp.height + 1, `小地圖在畫面外（${vp.name}）：${JSON.stringify(m)}`);
        for (const s of others) if (r[s]) expect(!hit(m, r[s]), `小地圖蓋住 ${s}（${vp.name}）：${JSON.stringify(m)} vs ${JSON.stringify(r[s])}`);
        expect(m.w >= 90 && m.w <= 260, `小地圖大小不對：${m.w}`);
      });

      await step(`${vp.name} 站進要素時的說明框、提示文字、箭頭不被小地圖蓋住`, async () => {
        await page.evaluate(() => { window.__game.forceElement('jizo', 'common'); window.__game.advance(0.2); window.__game.render(); });
        const s = await page.evaluate(() => window.__game.run.focus);
        void s;
        const r = await rects(page, ['#minimap', '#element-box', '#portal-box', '.hud-wave em', '#boss-bar']);
        const m = r['#minimap'];
        for (const sel of ['#element-box', '#portal-box', '.hud-wave em', '#boss-bar']) if (r[sel]) expect(!hit(m, r[sel]), `小地圖蓋住 ${sel}（${vp.name}）：${JSON.stringify(m)} vs ${JSON.stringify(r[sel])}`);
      });

      await step(`${vp.name} 要素預告結束後出現符號（形狀＋功能色）、預告中不出現`, async () => {
        const n0 = await page.evaluate(() => window.__game.run.markers.length);
        await page.evaluate(() => window.__game.forceElement('jizo', 'common'));
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
        const wait = await page.evaluate(() => window.__game.run.focus);
        // forceElement 會直接給出可用的要素（announce 已結束）：符號數量要多 1，且是石地藏的符號
        const ms = await page.evaluate(() => window.__game.run.markers);
        expect(ms.length > n0, `要素沒有出現在小地圖（${n0} → ${ms.length}）`);
        expect(ms.some((m) => m.shape === 'circle' && m.group === 'boon'), `沒有石地藏的符號：${JSON.stringify(ms)}`);
        void wait;
        await page.evaluate(() => window.__game.render());
        await page.waitForTimeout(250);
      });

      await step(`${vp.name} 畫布有內容、玩家的白色箭頭在中央附近`, async () => {
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        await page.waitForTimeout(300);
        const info = await page.evaluate(() => {
          const c = document.querySelector('#minimap canvas');
          const g = c.getContext('2d');
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let opaque = 0;
          let white = 0;
          let cx = 0;
          let cy = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 20) opaque++;
            if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240 && d[i + 3] > 200) {
              white++;
              const p = i / 4;
              cx += p % c.width;
              cy += Math.floor(p / c.width);
            }
          }
          return { w: c.width, h: c.height, opaque, white, cx: white ? cx / white / c.width : -1, cy: white ? cy / white / c.height : -1 };
        });
        expect(info.opaque > info.w * info.h * 0.5, `畫布幾乎是空的：${JSON.stringify(info)}`);
        expect(info.white > 4, `看不到玩家的白色箭頭：${JSON.stringify(info)}`);
        files.push(await shot(ctx, 'm1-minimap'));
      });

      await step(`${vp.name} 點一下放大、不暫停模擬；再點縮回`, async () => {
        const w0 = (await rects(page, ['#minimap']))['#minimap'].w;
        const t0 = await page.evaluate(() => window.__game.simTime);
        await press(ctx, '#minimap');
        await page.evaluate(() => { window.__game.advance(0.5); window.__game.render(); });
        await page.waitForTimeout(250);
        const r1 = (await rects(page, ['#minimap']))['#minimap'];
        expect(r1.w > w0 * 1.4, `沒有放大：${w0} → ${r1.w}`);
        expect(r1.x + r1.w <= vp.width + 1 && r1.y + r1.h <= vp.height + 1, `放大後超出畫面（${vp.name}）：${JSON.stringify(r1)}`);
        const sim = await page.evaluate(() => ({ paused: window.__game.paused, t: window.__game.simTime, screens: window.__game.screens }));
        expect(!sim.paused && sim.t > t0 && !sim.screens.includes('pause'), `點小地圖不該暫停：${JSON.stringify(sim)}`);
        // 放大後也不能蓋住按鈕與搖桿
        const rb = await rects(page, ['#btn-jump', '#btn-ult', '#stick-base', '.hud-hp', '#btn-abilities', '#btn-pause']);
        for (const [sel, rr] of Object.entries(rb)) expect(!hit(r1, rr), `放大後的小地圖蓋住 ${sel}（${vp.name}）：${JSON.stringify(r1)} vs ${JSON.stringify(rr)}`);
        files.push(await shot(ctx, 'm1-minimap-big'));
        await press(ctx, '#minimap');
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        await page.waitForTimeout(250);
        const r2 = (await rects(page, ['#minimap']))['#minimap'];
        expect(Math.abs(r2.w - w0) < 2, `沒有縮回：${w0} → ${r2.w}`);
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
