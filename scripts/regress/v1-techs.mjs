// v1：技法（D48；D49 起技法卡機率混在一般升級卡裡、最高 8 級、分稀有度）。主武器 4 級不再跳面板 → 升級卡裡出現一張技法卡（標稀有度、「技法」、適合）
// → 真的點 → 學會、戰鬥中看得到效果 → 再拿一張（新的，或已有的下一級：卡上寫 Lv1→Lv2）→ 能力面板寫出技法
// → 第 1 關過關：過關畫面不再跳技法面板，直接出發 → 第 2 關道祖神（D47）：HUD 提示與箭頭（15 秒後收掉）→ 走過去按住
// → 面板是「換掉 X → Y」提案＋「維持現狀」→ 點換 → 技法換了、HUD 提示、能力面板仍列出技法；同一關不再出現。
import { openPage, startRun, press, step, expect, shot, reportErrors, walkOnto, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'v1', desc: '技法：升級卡裡的技法卡→真的點→效果出現→再拿一張（新的或升級）→能力面板→過關畫面不跳技法→道祖神（箭頭→走過去按住→換掉一個）（三種畫面）', max: 600, stall: 60 };

/** 道祖神的提示秒數（DOSOJIN.hintSeconds） */
const HINT = 15;

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
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
          } else if (sc.includes('levelup') && !(await page.locator('#lv-title').innerText()).includes('道祖神')) {
            // 一般升級：選第一張「不是技法卡」的（技法卡偶爾會出現，這裡不想多拿）
            await page.locator('.overlay[data-screen="levelup"] .card:not([data-card^="tech:"])').first().click();
          }
          else break;
        }
      };
      const cardsInfo = () => page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.card, t: c.innerText.replace(/\s+/g, ' '), r: { x: r.x, y: r.y, w: r.width, h: r.height } };
      }));
      const inView = (c) => c.r.x >= 0 && c.r.y >= 0 && c.r.x + c.r.w <= vp.width + 1;

      // D49：技法卡機率混在一般升級卡裡（開發介面 techNext 讓下一次升級一定有一張，其餘全用真實點擊）
      const takeTechCard = async (label) => {
        await page.evaluate(() => { const g = window.__game; g.techNext(); g.addXp(60); g.render(); });
        await page.waitForFunction(() => window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        const title = await page.locator('#lv-title').innerText();
        expect(/升級/.test(title), `技法卡應該在一般升級面板裡（${label}）：${title}`);
        const cards = await cardsInfo();
        const tc = cards.filter((c) => c.id.startsWith('tech:'));
        expect(tc.length === 1 && /技法/.test(tc[0].t) && /(凡|良|珍|極)/.test(tc[0].t), `升級卡裡沒有剛好一張技法卡（${label}）：${JSON.stringify(cards)}`);
        for (const c of cards) expect(inView(c), `卡片超出畫面（${vp.name}）：${JSON.stringify(c.r)}`);
        files.push(await shot(ctx, `v1-techcard-${label === '第 1 張' ? 1 : 2}`));
        await press(ctx, `.overlay[data-screen="levelup"] .card[data-card="${tc[0].id}"]`);
        await dismiss();
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        return tc[0];
      };
      let first = '';
      await step(`${vp.name} 主武器 4 級不再跳出技法面板`, async () => {
        await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 3; i++) g.give('ghostfire', 'common'); g.render(); });
        await dismiss();
        const sc = await page.evaluate(() => window.__game.screens);
        expect(!sc.includes('levelup'), `主武器 4 級跳出面板：${sc}`);
        expect((await techs()).length === 0, '沒選就有技法');
      });
      await step(`${vp.name} 升級卡裡出現技法卡 → 真的點 → 學會`, async () => {
        const c = await takeTechCard('第 1 張');
        first = c.id.slice('tech:'.length);
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
      await step(`${vp.name} 再拿一張技法卡（新的或已有的下一級，卡上寫 Lv）`, async () => {
        const before = await page.evaluate(() => ({ t: window.__game.run.techs, l: window.__game.run.techLevels }));
        const c = await takeTechCard('第 2 張');
        const id = c.id.slice('tech:'.length);
        const after = await page.evaluate(() => ({ t: window.__game.run.techs, l: window.__game.run.techLevels }));
        if (before.t.includes(id)) {
          expect(/Lv1→Lv2/.test(c.t), `已有的技法卡沒寫升級：${c.t}`);
          expect(after.l[after.t.indexOf(id)] === 2, `已有的技法沒有升到 2 級：${JSON.stringify(after)}`);
        } else {
          expect(after.t.length === 2 && after.t.includes(id), `新技法沒學會：${JSON.stringify(after)}`);
          if (first === 'ring') expect(!['bounce', 'homing'].includes(id), `燈籠環在身上還出現 ${id}`);
        }
      });
      await step(`${vp.name} 能力面板寫出技法`, async () => {
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const txt = await page.locator('#sum-cards li[data-card="ghostfire"]').innerText();
        expect(/技法 \S+ Lv\d：適合/.test(txt), `能力面板沒寫技法：${txt}`);
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });
      await step(`${vp.name} 第 1 關過關：過關畫面不再跳技法面板，可以直接出發`, async () => {
        await page.evaluate(() => window.__game.clearStage());
        await page.waitForFunction(() => window.__game.state === 'INTERMISSION' && window.__game.screens.includes('intermission'), null, { timeout: 15000 });
        // 過關收進來的魂火可能先升級（一般的升級卡）：先選掉
        for (let i = 0; i < 30 && (await page.evaluate(() => window.__game.screens)).includes('levelup'); i++) {
          const title = await page.locator('#lv-title').innerText();
          expect(!/鬼火的技法/.test(title), `過關畫面跳出技法面板：${title}`);
          await page.locator('.overlay[data-screen="levelup"] .card:not([data-card^="tech:"])').first().click();
        }
        files.push(await shot(ctx, 'v1-clear'));
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
        expect(/技法 \S+ Lv\d：適合/.test(txt), `換了之後能力面板沒有技法：${txt}`);
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
