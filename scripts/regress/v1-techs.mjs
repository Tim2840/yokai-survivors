// v1：技法（D48，取代 D31 的招式變化）。主武器 4 級 → 跳出「鬼火的技法」三選一（三張、標「技法」與「適合」）→ 真的點（三種畫面各選不同的系）
// → 戰鬥中看得到效果 → 7 級再跳一次（和已有的互斥／混搭提示、版面不超出畫面）→ 能力面板寫出兩個技法
// → 第 1 關過關：過關畫面上疊著技法三選一（擋住「出發」，選完才能出發）→ 第 2 關道祖神（D47）：HUD 提示與箭頭（15 秒後收掉）→ 走過去按住
// → 面板是「換掉 X → Y」提案＋「維持現狀」→ 點換 → 技法換了、HUD 提示、能力面板改名；同一關不再出現。
import { openPage, startRun, press, step, expect, shot, reportErrors, walkOnto, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'v1', desc: '技法：4 級三選一→真的點→效果出現→7 級再選→能力面板→過關畫面選第 3 個→道祖神（箭頭→走過去按住→換掉一個）（三種畫面各選一個系）', max: 600, stall: 60 };

/** 三種畫面各偏好不同的系（沒抽到就選第一張）；對照 docs/15 第 8.5 節 */
const FAMILY = ['分裂系', '環繞系', '燃燒系'];
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
      const techs = async () => (await page.evaluate(() => window.__game.run)).techs;
      const dismiss = async () => {
        for (let i = 0; i < 40; i++) {
          const sc = await page.evaluate(() => window.__game.screens);
          if (sc.includes('result')) {
            await page.waitForFunction(() => !document.querySelector('#btn-result-ok').disabled, null, { timeout: 5000 });
            await page.locator('#btn-result-ok').click();
          } else if (sc.includes('levelup') && !(await page.locator('#lv-title').innerText()).includes('技法') && !(await page.locator('#lv-title').innerText()).includes('道祖神')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
          else break;
        }
      };
      const cardsInfo = () => page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.card, t: c.innerText.replace(/\s+/g, ' '), r: { x: r.x, y: r.y, w: r.width, h: r.height } };
      }));
      const inView = (c) => c.r.x >= 0 && c.r.y >= 0 && c.r.x + c.r.w <= vp.width + 1;

      let first = '';
      await step(`${vp.name} 鬼火升到 4 級 → 技法三選一`, async () => {
        await page.evaluate(() => { const g = window.__game; g.give('ghostfire', 'common'); g.give('ghostfire', 'common'); });
        expect(!(await page.evaluate(() => window.__game.screens)).includes('levelup'), '3 級就跳出技法');
        await page.evaluate(() => { window.__game.give('ghostfire', 'common'); window.__game.render(); });
        await page.waitForFunction(() => window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        const title = await page.locator('#lv-title').innerText();
        expect(/技法/.test(title), `面板標題不對：${title}`);
        const cards = await cardsInfo();
        expect(cards.length === 3 && cards.every((c) => /技法/.test(c.t) && /適合/.test(c.t) && c.id.startsWith('tech:')), `技法卡不對：${JSON.stringify(cards)}`);
        for (const c of cards) expect(inView(c), `卡片超出畫面（${vp.name}）：${JSON.stringify(c.r)}`);
        files.push(await shot(ctx, 'v1-pick'));
        const want = cards.find((c) => c.t.includes(FAMILY[vi])) ?? cards[0];
        first = want.id.slice('tech:'.length);
        await press(ctx, `.overlay[data-screen="levelup"] .card[data-card="${want.id}"]`);
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        expect(JSON.stringify(await techs()) === JSON.stringify([first]), `選的技法沒有生效：${JSON.stringify(await techs())}`);
      });
      await step(`${vp.name} 戰鬥中看得到效果`, async () => {
        await page.evaluate(() => window.__game.spawn('villager', 14));
        for (let i = 0; i < 10; i++) {
          await page.evaluate(() => window.__game.advance(0.3));
          await dismiss();
        }
        await page.evaluate(() => window.__game.render());
        const r = await page.evaluate(() => window.__game.run);
        if (first === 'ring') expect(r.orbit >= 1 && r.projectiles === 0, `燈籠環應該有繞身鬼火、沒有投射物：${r.orbit}／${r.projectiles}`);
        expect(r.kills > 0, `${first} 打不倒任何敵人`);
        files.push(await shot(ctx, `v1-${first}`));
      });
      let second = '';
      await step(`${vp.name} 7 級再選一個（不重複、不和已有的互斥、版面不破）`, async () => {
        await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 2; i++) g.give('ghostfire', 'common'); });
        await dismiss();
        expect(!(await page.evaluate(() => window.__game.screens)).includes('levelup'), '5、6 級就跳出技法');
        await page.evaluate(() => { window.__game.give('ghostfire', 'common'); window.__game.render(); });
        await page.waitForFunction(() => window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        const cards = await cardsInfo();
        expect(cards.length >= 1 && cards.every((c) => c.id.startsWith('tech:') && c.id !== 'tech:' + first), `第二次的技法卡不對：${JSON.stringify(cards)}`);
        if (first === 'ring') expect(cards.every((c) => !/彈跳|歸巢/.test(c.t)), `燈籠環在身上還提案彈跳／歸巢：${JSON.stringify(cards)}`);
        for (const c of cards) expect(inView(c), `卡片超出畫面（${vp.name}）：${JSON.stringify(c.r)}`);
        files.push(await shot(ctx, 'v1-pick2'));
        second = cards[0].id.slice('tech:'.length);
        await press(ctx, `.overlay[data-screen="levelup"] .card[data-card="${cards[0].id}"]`);
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        expect(JSON.stringify(await techs()) === JSON.stringify([first, second]), `第二個技法沒有生效：${JSON.stringify(await techs())}`);
      });
      await step(`${vp.name} 能力面板寫出技法`, async () => {
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const txt = await page.locator('#sum-cards li[data-card="ghostfire"]').innerText();
        expect(/技法：/.test(txt), `能力面板沒寫技法：${txt}`);
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });
      await step(`${vp.name} 第 1 關過關：過關畫面疊著技法三選一，選完才能出發`, async () => {
        await page.evaluate(() => window.__game.clearStage());
        await page.waitForFunction(() => window.__game.state === 'INTERMISSION' && window.__game.screens.includes('intermission'), null, { timeout: 15000 });
        await page.waitForFunction(() => window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        // 過關時收進來的魂火可能先升級：先選掉一般的升級卡，技法面板排在後面（打斷的規則不變：只有升級選卡）
        for (let i = 0; i < 30 && !(await page.locator('#lv-title').innerText()).includes('技法'); i++) {
          if (!(await page.evaluate(() => window.__game.screens)).includes('levelup')) break;
          await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        }
        const title = await page.locator('#lv-title').innerText();
        expect(/技法/.test(title), `過關畫面的面板標題不對：${title}`);
        const cards = await cardsInfo();
        expect(cards.length >= 1 && cards.every((c) => c.id.startsWith('tech:')), `過關畫面的技法卡不對：${JSON.stringify(cards)}`);
        for (const c of cards) expect(inView(c), `卡片超出畫面（${vp.name}）：${JSON.stringify(c.r)}`);
        // 「出發」被面板擋住（玩家碰不到）
        const covered = await page.evaluate(() => {
          const b = document.querySelector('#btn-inter-next').getBoundingClientRect();
          const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
          return !!el && !el.closest('#btn-inter-next');
        });
        expect(covered, `技法面板沒有擋住「出發」（${vp.name}）`);
        files.push(await shot(ctx, 'v1-clear-pick'));
        await press(ctx, `.overlay[data-screen="levelup"] .card[data-card="${cards[0].id}"]`);
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        expect((await techs()).length === 3, `過關畫面選的技法沒有生效：${JSON.stringify(await techs())}`);
        await press(ctx, '#btn-inter-next');
        await page.waitForFunction(() => window.__game.state === 'COMBAT' && window.__game.run.stage === 2);
      }, 60);

      const dos = async () => (await page.evaluate(() => window.__game.run.elements)).find((e) => e.kind === 'dosojin' && !e.used && e.announce <= 0);
      let spot;
      await step(`${vp.name} 道祖神出現：HUD 提示與箭頭（${HINT} 秒後自己收掉）`, async () => {
        for (let i = 0; i < 80 && !(await dos()); i++) {
          await page.evaluate(() => window.__game.advance(0.5));
          await dismiss();
        }
        spot = await dos();
        expect(spot, `選了技法之後沒有出現道祖神（${vp.name}）`);
        await page.evaluate(([x, z]) => { window.__game.teleport(x + 12, z); window.__game.advance(0.1); window.__game.render(); }, [spot.x, spot.z]);
        const note = await page.locator('#wave-note').innerText();
        expect(/道祖神出現了/.test(note), `沒有道祖神的提示：${note}`);
        const arrow = await page.locator('#portal-text').innerText();
        expect(/道祖神 \d+ 公尺/.test(arrow) && (await page.locator('#portal-box').isVisible()), `道祖神的箭頭不對：${arrow}`);
        await hudTopOk(ctx, '・道祖神提示');
        files.push(await shot(ctx, 'v1-dosojin'));
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
      await step(`${vp.name} 走過去按住 → 換掉一個技法`, async () => {
        const before = await techs();
        for (let tries = 0; tries < 3 && !(await walkOnto(ctx, spot.x, spot.z)); tries++) await dismiss();
        const dosOpen = async () => (await page.evaluate(() => window.__game.screens)).includes('levelup') && (await page.locator('#lv-title').innerText()).includes('道祖神');
        for (let i = 0; i < 24 && !(await dosOpen()); i++) {
          await dismiss();
          const r = await page.evaluate(() => window.__game.run);
          if (Math.hypot(r.px - spot.x, r.pz - spot.z) > 1.2) await walkOnto(ctx, spot.x, spot.z);
          await page.evaluate(() => window.__game.advance(0.25));
        }
        await page.evaluate(() => window.__game.render());
        const title = await page.locator('#lv-title').innerText();
        expect(/道祖神/.test(title), `按住道祖神沒有開技法面板：${title}`);
        const cards = await cardsInfo();
        const swaps = cards.filter((c) => c.id.startsWith('tech-swap:'));
        const keep = cards.filter((c) => c.id === 'tech-keep');
        expect(swaps.length >= 1 && swaps.length <= 2 && keep.length === 1 && cards[cards.length - 1].id === 'tech-keep', `提案不對：${JSON.stringify(cards.map((c) => c.id))}`);
        expect(swaps.every((c) => /換掉「/.test(c.t)) && /維持現狀/.test(keep[0].t), `提案文字不對：${JSON.stringify(cards.map((c) => c.t))}`);
        for (const c of cards) expect(inView(c), `卡片超出畫面（${vp.name}）：${JSON.stringify(c.r)}`);
        files.push(await shot(ctx, 'v1-dosojin-pick'));
        const [old, nw] = swaps[0].id.slice('tech-swap:'.length).split('>');
        expect(before.includes(old) && !before.includes(nw), `提案的舊／新不對：${old}>${nw}／${before}`);
        await press(ctx, `.overlay[data-screen="levelup"] .card[data-card="${swaps[0].id}"]`);
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        const after = await techs();
        expect(!after.includes(old) && after.includes(nw) && after.length === before.length, `沒有換成 ${nw}：${before} → ${after}`);
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
        const box = await page.locator('#synergy-box').innerText();
        expect(/技法換成「/.test(box), `HUD 沒有寫換成什麼：${box}`);
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const txt = await page.locator('#sum-cards li[data-card="ghostfire"]').innerText();
        expect(/技法：/.test(txt), `換了之後能力面板沒有技法：${txt}`);
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
