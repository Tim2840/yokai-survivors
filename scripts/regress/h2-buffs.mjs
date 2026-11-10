// h2：限時效果的倒數標籤（D78，使用者 2026-11-10：「如若有時間限制，加成要顯示給使用者看」）。
// 用玩家會遇到的事：抽到凶籤（壞事、紅色）、真的按大招（鬼火亂舞，6 秒）、撿到雪女的吐息 → 血條下方出現標籤、秒數會倒數、到期消失；
// 好籤（整場）不出現標籤。標籤不能蓋住血條、關卡時間、右上的鈕與小地圖。三種畫面，卡住偵測。
import { openPage, startRun, step, expect, shot, press, reportErrors, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'h2', desc: '限時效果倒數標籤：凶籤、大招、雪女的吐息出現並倒數、到期消失；好籤（整場）不出現；不蓋住頂端介面（三種畫面）', max: 120, stall: 45 };

const chips = (page) => page.evaluate(() => [...document.querySelectorAll('#buff-box .buff:not(.more)')].map((c) => {
  const r = c.getBoundingClientRect();
  return { label: c.dataset.buff, text: c.innerText.replace(/\s+/g, ' '), bad: c.classList.contains('bad'), r: { x: r.x, y: r.y, w: r.width, h: r.height } };
}));
// 升級選卡跳出來時模擬會暫停：用真實點擊選掉（選第一張），時間才會繼續走
const frame = async (page, dt = 0) => {
  await page.evaluate((d) => { if (d > 0) window.__game.advance(d); window.__game.render(); }, dt);
  while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
};

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=93');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);

      await step(`${vp.name} 好籤（整場）不出現倒數標籤`, async () => {
        await page.evaluate(() => { window.__game.god = true; window.__game.omikuji('daikichi'); });
        await frame(page);
        const c = await chips(page);
        expect(c.length === 0, `整場效果出現了倒數標籤：${JSON.stringify(c)}`);
      });

      await step(`${vp.name} 凶籤 → 紅色標籤、有秒數；真的按大招 → 多一個；雪女的吐息 → 再多一個`, async () => {
        await page.evaluate(() => window.__game.omikuji('kyo'));
        await frame(page);
        let c = await chips(page);
        expect(c.length === 1 && c[0].bad && /凶/.test(c[0].text) && /\d+ 秒/.test(c[0].text), `凶籤的標籤不對：${JSON.stringify(c)}`);
        await page.evaluate(() => { window.__game.setUlt('ghostfireDance', 0); window.__game.spawn('villager', 6); window.__game.chargeUlt(); window.__game.advance(0.05); window.__game.render(); });
        if (!vp.hasTouch) await page.keyboard.press('KeyF');
        else await press(ctx, '#btn-ult');
        await frame(page, 0.1);
        c = await chips(page);
        expect(c.length >= 2 && c.some((x) => x.label.startsWith('ult.') && !x.bad), `按了大招沒有出現大招的標籤：${JSON.stringify(c)}`);
        await page.evaluate(() => window.__game.forcePickup('yukiBreath', 0));
        for (let i = 0; i < 10 && !(await page.evaluate(() => window.__game.buffs().some((b) => b.label === 'pickup.yukiBreath'))); i++) await frame(page, 0.1);
        await frame(page);
        c = await chips(page);
        const shown = await page.evaluate(() => window.__game.buffs().length);
        const more = await page.locator('#buff-box .buff.more').count();
        expect(shown >= 3 && (c.length >= 3 || more === 1), `雪女的吐息沒有出現（或超出上限沒有「+n」）：${JSON.stringify(c)}，總數 ${shown}`);
        // 不蓋住頂端介面
        await hudTopOk(ctx, '（有倒數標籤）');
        // 每個標籤都不能和頂端介面、關卡提示、指路、小地圖、大招鈕重疊（2026-11-10：手機直式第一版被指路蓋住，全掃看得到的 HUD 元素）
        const boxes = await page.evaluate(() => {
          const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; };
          const others = {};
          for (const sel of ['.hud-hp', '.hud-wave', '#wave-note', '.hud-btns', '.minimap', '#portal-box', '#element-box', '#trial-box', '#synergy-box', '#boss-bar', '#btn-ult', '#btn-jump']) {
            const e = document.querySelector(sel);
            const b = e && vis(e);
            if (b) others[sel] = b;
          }
          const chips = [...document.querySelectorAll('#buff-box .buff')].map(vis).filter(Boolean);
          return { others, chips };
        });
        const ov = (a, b) => a && b && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        expect(boxes.chips.length > 0, '看不到任何標籤');
        for (const c of boxes.chips) {
          expect(c.x >= 0 && c.y >= 0 && c.x + c.w <= vp.width + 1, `標籤跑出畫面（${vp.name}）：${JSON.stringify(c)}`);
          for (const [k, b] of Object.entries(boxes.others)) expect(!ov(c, b), `倒數標籤和 ${k} 重疊（${vp.name}）：${JSON.stringify({ chip: c, other: b })}`);
        }
        files.push(await shot(ctx, 'h2-buffs'));
      }, 45);

      await step(`${vp.name} 秒數會倒數；到期就消失`, async () => {
        const before = await page.evaluate(() => window.__game.buffs().find((b) => b.label === 'omikuji.kyo').left);
        await frame(page, 3);
        const after = await page.evaluate(() => window.__game.buffs().find((b) => b.label === 'omikuji.kyo')?.left ?? 0);
        expect(after < before - 2, `凶籤的秒數沒有倒數：${before} → ${after}`);
        for (let i = 0; i < 12; i++) await frame(page, 5);
        const c = await chips(page);
        expect(c.length === 0, `到期後標籤沒有消失：${JSON.stringify(c)}`);
      }, 45);
    } finally {
      reportErrors(ctx);
      await ctx.close();
    }
  }
  return files;
}
