// v1：招式變化。主武器升到 4 級 → 跳出「鬼火的變化」三選一（三張、標「招式變化」、寫出適合的道具）→ 真的點一張
// （三種畫面各選不同的一種，三種都走到）→ 戰鬥中看得到效果（分裂的小火、繞身鬼火、燃燒地）→ 能力面板寫出變化名稱。
import { openPage, startRun, press, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'v1', desc: '招式變化：主武器 4 級跳出三選一→真的點→效果出現→能力面板寫出變化（三種畫面各選一種）', max: 300, stall: 50 };

const PICK = ['kitsunebi', 'lanternRing', 'hellfire'];

export async function run(browser) {
  const files = [];
  for (const [vi, vp] of VIEWPORTS.entries()) {
    const ctx = await openPage(browser, vp, '?q=4&seed=71');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      await step(`${vp.name} 鬼火升到 4 級 → 變化三選一`, async () => {
        await page.evaluate(() => { const g = window.__game; g.give('ghostfire', 'common'); g.give('ghostfire', 'common'); });
        expect(!(await page.evaluate(() => window.__game.screens)).includes('levelup'), '3 級就跳出變化');
        await page.evaluate(() => { window.__game.give('ghostfire', 'common'); window.__game.render(); });
        await page.waitForFunction(() => window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        const title = await page.locator('.overlay[data-screen="levelup"] h2').innerText();
        expect(/變化/.test(title), `面板標題不對：${title}`);
        const cards = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => ({ id: c.dataset.card, t: c.innerText.replace(/\s+/g, ' ') })));
        expect(cards.length === 3 && cards.every((c) => /招式變化/.test(c.t) && /適合/.test(c.t)), `變化卡不對：${JSON.stringify(cards)}`);
        files.push(await shot(ctx, 'v1-pick'));
        const want = PICK[vi];
        const idx = cards.findIndex((c) => c.id === 'variant:' + want);
        expect(idx >= 0, `找不到 ${want}`);
        await press(ctx, `.overlay[data-screen="levelup"] .card[data-card="variant:${want}"]`);
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        expect((await page.evaluate(() => window.__game.run.variant)) === want, '選的變化沒有生效');
      });
      await step(`${vp.name} 戰鬥中看得到效果`, async () => {
        await page.evaluate(() => window.__game.spawn('villager', 14));
        for (let i = 0; i < 10; i++) {
          await page.evaluate(() => window.__game.advance(0.3));
          while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        }
        await page.evaluate(() => window.__game.render());
        const r = await page.evaluate(() => window.__game.run);
        const want = PICK[vi];
        if (want === 'lanternRing') expect(r.orbit >= 1 && r.projectiles === 0, `燈籠環應該有繞身鬼火、沒有投射物：${r.orbit}／${r.projectiles}`);
        if (want === 'hellfire') expect(r.zones > 0 || r.kills > 0, `業火應該留下燃燒地：${r.zones}`);
        expect(r.kills > 0, `${want} 打不倒任何敵人`);
        files.push(await shot(ctx, `v1-${want}`));
      });
      await step(`${vp.name} 能力面板寫出變化`, async () => {
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const txt = await page.locator('#sum-cards li[data-card="ghostfire"]').innerText();
        expect(/變化/.test(txt), `能力面板沒寫變化：${txt}`);
        await press(ctx, '#btn-pause-resume');
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
