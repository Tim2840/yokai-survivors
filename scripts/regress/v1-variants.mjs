// v1：招式變化。主武器升到 4 級 → 跳出「鬼火的變化」三選一（三張、標「招式變化」、寫出適合的道具）→ 真的點一張
// （三種畫面各選不同的一種，三種都走到）→ 戰鬥中看得到效果（分裂的小火、繞身鬼火、燃燒地）→ 能力面板寫出變化名稱。
// D47 道祖神：選完一段時間後出現（HUD 提示＋箭頭，過一陣子自己收掉）→ 用真實輸入走過去按住 → 面板標「目前」→ 點另一種 → 換掉、HUD 提示、能力面板改名；同一關不再出現。
import { openPage, startRun, press, step, expect, shot, reportErrors, walkOnto, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'v1', desc: '招式變化：主武器 4 級跳出三選一→真的點→效果出現→能力面板寫出變化→道祖神（箭頭→走過去按住→標「目前」→換成另一種）（三種畫面各選一種）', max: 420, stall: 60 };

const PICK = ['kitsunebi', 'lanternRing', 'hellfire'];
const NAME = { kitsunebi: '狐火分裂', lanternRing: '燈籠環', hellfire: '業火' };
/** 道祖神的提示秒數（DOSOJIN.hintSeconds） */
const HINT = 15;

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
      const dismiss = async () => {
        for (let i = 0; i < 40; i++) {
          const sc = await page.evaluate(() => window.__game.screens);
          if (sc.includes('result')) {
            await page.waitForFunction(() => !document.querySelector('#btn-result-ok').disabled, null, { timeout: 5000 });
            await page.locator('#btn-result-ok').click();
          } else if (sc.includes('levelup') && !(await page.locator('#lv-title').innerText()).includes('道祖神')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
          else break;
        }
      };
      const dos = async () => (await page.evaluate(() => window.__game.run.elements)).find((e) => e.kind === 'dosojin' && !e.used && e.announce <= 0);
      let spot;
      await step(`${vp.name} 道祖神出現：HUD 提示與箭頭（${HINT} 秒後自己收掉）`, async () => {
        for (let i = 0; i < 80 && !(await dos()); i++) {
          await page.evaluate(() => window.__game.advance(0.5));
          await dismiss();
        }
        spot = await dos();
        expect(spot, `選了變化之後沒有出現道祖神（${vp.name}）`);
        await page.evaluate(([x, z]) => { window.__game.teleport(x + 12, z); window.__game.advance(0.1); window.__game.render(); }, [spot.x, spot.z]);
        const note = await page.locator('#wave-note').innerText();
        expect(/道祖神出現了/.test(note), `沒有道祖神的提示：${note}`);
        const arrow = await page.locator('#portal-text').innerText();
        expect(/道祖神 \d+ 公尺/.test(arrow) && (await page.locator('#portal-box').isVisible()), `道祖神的箭頭不對：${arrow}`);
        await hudTopOk(ctx, '・道祖神提示');
        files.push(await shot(ctx, 'v1-dosojin'));
        // 不想換的人不會一直被叫過去：提示與箭頭過一陣子收掉，道祖神本身還在
        for (let i = 0; i < HINT * 2 + 2; i++) {
          await page.evaluate(() => window.__game.advance(0.5));
          await dismiss();
        }
        await page.evaluate(() => window.__game.render());
        const note2 = await page.locator('#wave-note').innerText();
        const arrowOn = (await page.locator('#portal-box').isVisible()) && /道祖神/.test(await page.locator('#portal-text').innerText());
        expect(!/道祖神/.test(note2) && !arrowOn, `道祖神的提示一直沒收掉：${note2}`);
        expect(await dos(), '道祖神自己不見了');
      }, 90);
      await step(`${vp.name} 走過去按住 → 面板標「目前」→ 點另一種 → 換掉`, async () => {
        const now = PICK[vi];
        const want = PICK[(vi + 1) % 3];
        for (let tries = 0; tries < 3 && !(await walkOnto(ctx, spot.x, spot.z)); tries++) await dismiss();
        // 按住途中剛好升級（一般的升級選卡）就先選掉，站著繼續按住
        const dosOpen = async () => (await page.evaluate(() => window.__game.screens)).includes('levelup') && (await page.locator('#lv-title').innerText()).includes('道祖神');
        for (let i = 0; i < 24 && !(await dosOpen()); i++) {
          await dismiss();
          const r = await page.evaluate(() => window.__game.run);
          if (Math.hypot(r.px - spot.x, r.pz - spot.z) > 1.2) await walkOnto(ctx, spot.x, spot.z);
          await page.evaluate(() => window.__game.advance(0.25));
        }
        await page.evaluate(() => window.__game.render());
        const title = await page.locator('#lv-title').innerText();
        expect(/道祖神/.test(title), `按住道祖神沒有開變化面板：${title}`);
        const cards = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => {
          const r = c.getBoundingClientRect();
          return { id: c.dataset.card, cur: c.dataset.current === '1', t: c.innerText.replace(/\s+/g, ' '), r: { x: r.x, y: r.y, w: r.width, h: r.height } };
        }));
        expect(cards.length === 3, `應該三種都在：${JSON.stringify(cards)}`);
        const cur = cards.filter((c) => c.cur);
        expect(cur.length === 1 && cur[0].id === 'variant:' + now && /目前/.test(cur[0].t), `「目前」標錯：${JSON.stringify(cards)}`);
        for (const c of cards) expect(c.r.x >= 0 && c.r.y >= 0 && c.r.x + c.r.w <= vp.width + 1, `卡片超出畫面（${vp.name}）：${JSON.stringify(c.r)}`);
        files.push(await shot(ctx, 'v1-dosojin-pick'));
        await press(ctx, `.overlay[data-screen="levelup"] .card[data-card="variant:${want}"]`);
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        expect((await page.evaluate(() => window.__game.run.variant)) === want, `沒有換成 ${want}`);
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
        const box = await page.locator('#synergy-box').innerText();
        expect(box.includes(`換成「${NAME[want]}」`), `HUD 沒有寫換成什麼：${box}`);
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const txt = await page.locator('#sum-cards li[data-card="ghostfire"]').innerText();
        expect(txt.includes(NAME[want]) && !txt.includes(NAME[now]), `能力面板的變化沒換：${txt}`);
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
        for (let i = 0; i < 50; i++) {
          await page.evaluate(() => window.__game.advance(1));
          await dismiss();
        }
        expect(!(await dos()), `同一關又出現道祖神（${vp.name}）`);
      }, 120);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
