// v2：技法進化（D53）。兩個技法都練到 8 級 → 「可以進化」提示 → 合魂祠出現（箭頭指過去）→ 走過去按住 → 進化面板（只列進化）→ 真的點進化卡 →
// HUD「進化成功」→ 能力面板的「技法進化」列出已進化 → 少佔一格。另外：選卡畫面的技法卡帶詞條（條數看稀有度）、法具卡只寫會影響的現有招式。三種畫面，卡住偵測。
// 用開發介面 giveTech／techLevel 直接把技法練到 8 級（真的練要很久），其餘全是真實操作。
import { openPage, startRun, press, step, expect, shot, reportErrors, walkOnto, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'v2', desc: '技法進化：兩招 8 級→提示→合魂祠出現、箭頭→走過去按住→進化面板→點進化卡→HUD 進化成功→能力面板列出進化、少佔一格；技法卡帶詞條、不再有適合加成（三種畫面）', max: 240, stall: 60 };

const inViewOf = (vp) => (c) => c.r.x >= 0 && c.r.y >= 0 && c.r.x + c.r.w <= vp.width + 1 && c.r.y + c.r.h <= vp.height + 1;

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=71');
    const { page } = ctx;
    const inView = inViewOf(vp);
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      const dismiss = async () => {
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      };
      const cardsInfo = () => page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.card, rarity: c.dataset.rarity, aff: Number(c.querySelector('.caffix')?.dataset.affixes ?? 0), t: c.innerText.replace(/\s+/g, ' '), r: { x: r.x, y: r.y, w: r.width, h: r.height } };
      }));

      await step(`${vp.name} 選卡畫面：技法卡帶詞條（條數 = 稀有度）、沒有「適合 n/m」`, async () => {
        await page.evaluate(() => { window.__game.techNext(); });
        for (let g = 0; g < 60 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(10));
        const cs = await cardsInfo();
        const tech = cs.find((c) => c.id.startsWith('tech:'));
        expect(tech, `沒有技法卡：${JSON.stringify(cs.map((c) => c.t))}`);
        const want = { common: 1, rare: 2, epic: 3, legend: 4 }[tech.rarity];
        expect(tech.aff === want && /詞條：/.test(tech.t), `技法卡的詞條條數不對（${tech.rarity} 應該 ${want} 條）：${JSON.stringify(tech)}`);
        expect(!/適合 \d\/\d|效果 \+\d+%/.test(tech.t), `技法卡還有適合加成：${tech.t}`);
        files.push(await shot(ctx, 'v2-fit'));
        await page.locator(`.overlay[data-screen="levelup"] .card[data-card="${tech.id}"]`).click();
        await dismiss();
      }, 60);

      await step(`${vp.name} 兩招都練到 8 級：HUD 提示「材料齊了」、合魂祠出現、箭頭指過去`, async () => {
        await page.evaluate(() => {
          const g = window.__game;
          g.giveTech('ring', 'satellite');
          g.techLevel('ring', 8);
          g.techLevel('satellite', 8);
          g.advance(0.1);
          g.render();
        });
        const ev = await page.evaluate(() => window.__game.run.evolvable);
        expect(ev.includes('evoArray'), `沒有可以進化的：${JSON.stringify(ev)}`);
        const box = await page.locator('#synergy-box').innerText();
        expect(/材料齊了/.test(box) && /百鬼燈陣/.test(box), `HUD 沒有「材料齊了」提示：${box}`);
        for (let i = 0; i < 40 && !(await page.evaluate(() => window.__game.run.fuseSlot)); i++) {
          await page.evaluate(() => window.__game.advance(0.25));
          await dismiss();
        }
        const f = await page.evaluate(() => window.__game.run.fuseSlot);
        expect(f, `合魂祠沒有出現（${vp.name}）`);
        for (let i = 0; i < 24 && (await page.evaluate(() => window.__game.run.fuseSlot.announce)) > 0; i++) await page.evaluate(() => window.__game.advance(0.25));
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
        expect(await page.locator('#portal-box').isVisible() && /合魂祠/.test(await page.locator('#portal-text').innerText()), `沒有指向合魂祠的箭頭`);
        await hudTopOk(ctx, '・合魂祠提示');
        files.push(await shot(ctx, 'v2-shrine'));
      }, 90);

      await step(`${vp.name} 走過去按住 → 進化面板只列進化 → 點進化卡 → 進化成功`, async () => {
        const spot = await page.evaluate(() => window.__game.run.fuseSlot);
        for (let tries = 0; tries < 3 && !(await walkOnto(ctx, spot.x, spot.z)); tries++) await dismiss();
        const open = async () => (await page.evaluate(() => window.__game.screens)).includes('levelup') && (await page.locator('#lv-title').innerText()).includes('合魂祠');
        for (let i = 0; i < 24 && !(await open()); i++) {
          await dismiss();
          const r = await page.evaluate(() => window.__game.run);
          if (Math.hypot(r.px - spot.x, r.pz - spot.z) > 1.2) await walkOnto(ctx, spot.x, spot.z);
          await page.evaluate(() => window.__game.advance(0.25));
        }
        await page.evaluate(() => window.__game.render());
        expect(await open(), `按住合魂祠沒有開進化面板`);
        const cs = await cardsInfo();
        expect(cs.length === 1 && cs[0].id === 'evo:evoArray' && /進化/.test(cs[0].t) && /燈籠環 Lv8/.test(cs[0].t) && /衛星燈 Lv8/.test(cs[0].t), `進化卡不對：${JSON.stringify(cs)}`);
        for (const c of cs) expect(inView(c), `進化卡超出畫面（${vp.name}）：${JSON.stringify(c.r)}`);
        files.push(await shot(ctx, 'v2-pick'));
        const used0 = await page.evaluate(() => window.__game.run.techs.length);
        await press(ctx, '.overlay[data-screen="levelup"] .card[data-card="evo:evoArray"]');
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        const r = await page.evaluate(() => window.__game.run);
        expect(r.evolved.includes('evoArray'), `沒有進化：${JSON.stringify(r.evolved)}`);
        expect(used0 === r.techs.length, '進化後兩個技法都還在（只是併成一個）');
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
        const box = await page.locator('#synergy-box').innerText();
        expect(/進化成功/.test(box) && /百鬼燈陣/.test(box), `HUD 沒有寫進化成功：${box}`);
        for (let i = 0; i < 6; i++) await page.evaluate(() => window.__game.advance(0.5));
        expect(!(await page.evaluate(() => window.__game.run.fuseSlot)), '進化後合魂祠還在');
      }, 90);

      await step(`${vp.name} 「能力」面板：技法進化列出已進化、技法列出適合的法具`, async () => {
        await dismiss();
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const evo = await page.evaluate(() => [...document.querySelectorAll('#sum-evo li')].map((li) => ({ id: li.dataset.evo, done: li.classList.contains('fused'), t: li.innerText.replace(/\s+/g, ' ') })));
        expect(evo.some((e) => e.id === 'evoArray' && e.done && /燈籠環 Lv8\/8/.test(e.t)), `能力面板沒列出已進化：${JSON.stringify(evo)}`);
        const txt = await page.locator('#sum-cards li[data-card="ghostfire"]').innerText();
        expect(/技法 燈籠環 Lv8：適合 .+/.test(txt) && /技法 鬼火 Lv\d：適合 .+/.test(txt), `技法列沒寫出適合的法具（詳細在暫停頁）：${txt}`);
        files.push(await shot(ctx, 'v2-pause'));
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
