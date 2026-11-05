// k1：補給品（D39）。人類掉的供品與法器：真的走過去撿（鍵盤／搖桿）→ 不暫停、HUD 提示「撿到 X：效果」→ 效果生效。
// 糰子／飯糰／御神酒（回血）、招魂鈴（魂火全飛過來）、雷鼓（周圍倒下）、雪女的吐息（人類凍住）、小判（功德）。
// 補給品用開發介面放在玩家旁（掉落是機率），其餘全用真實輸入。三種畫面，卡住偵測。
import { openPage, startRun, step, expect, shot, reportErrors, walkOnto, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'k1', desc: '補給品：真的走過去撿→不暫停、HUD 提示→回血／魂火全飛過來／落雷／凍住／功德（三種畫面）', max: 400, stall: 60 };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=71');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      const dismiss = async () => {
        for (let i = 0; i < 40; i++) {
          const sc = await page.evaluate(() => window.__game.screens);
          if (sc.includes('result')) {
            await page.waitForFunction(() => !document.querySelector('#btn-result-ok').disabled, null, { timeout: 5000 });
            await page.locator('#btn-result-ok').click();
          } else if (sc.includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
          else break;
        }
      };
      const r = () => page.evaluate(() => window.__game.run);
      /** 放一個補給品在旁邊，用真實輸入走過去；回傳撿到前後的快照與 HUD 提示文字 */
      const pick = async (kind) => {
        await dismiss();
        expect(await page.evaluate((k) => window.__game.forcePickup(k, 4), kind), `放不下 ${kind}`);
        const snap = await r();
        // 剛放的那一個 = 離玩家最近的同種（截圖那一步放的留在遠處）
        const p = snap.pickups.filter((x) => x.kind === kind).sort((a, b) => Math.hypot(a.x - snap.px, a.z - snap.pz) - Math.hypot(b.x - snap.px, b.z - snap.pz))[0];
        const countBefore = snap.pickups.filter((x) => x.kind === kind).length;
        expect(p, `找不到剛放的 ${kind}`);
        await page.evaluate(() => window.__game.render());
        const before = await r();
        let ok = false;
        for (let tries = 0; tries < 3 && !ok; tries++) {
          await walkOnto(ctx, p.x, p.z);
          await dismiss();
          ok = (await r()).pickups.filter((x) => x.kind === kind).length < countBefore;
        }
        expect(ok, `走過去沒有撿到 ${kind}（${vp.name}）`);
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
        // 不暫停：沒有結果卡、模擬照常在走
        const sc = await page.evaluate(() => window.__game.screens);
        expect(!sc.includes('result'), `撿補給品不該跳結果卡（${vp.name}）`);
        await dismiss(); // 撿到的魂火可能剛好升級（升級選卡本來就會暫停）
        const t0 = (await r()).time;
        await page.evaluate(() => window.__game.advance(0.2));
        expect((await r()).time > t0, `撿補給品後模擬停住了（${vp.name}）`);
        const box = page.locator('#synergy-box');
        expect(await box.isVisible(), `撿到 ${kind} 沒有 HUD 提示（${vp.name}）`);
        return { before, after: await r(), note: await box.innerText() };
      };

      await step(`${vp.name} 外觀：七種補給品放在地上（截圖）`, async () => {
        await page.evaluate(() => {
          const g = window.__game;
          ['dango', 'onigiri', 'sake', 'bell', 'drum', 'yukiBreath', 'koban'].forEach((k, i) => g.forcePickup(k, 2.5 + i * 0.9));
          g.advance(0.05);
          g.render();
        });
        expect((await r()).pickups.length === 7, `應該有 7 個補給品：${JSON.stringify((await r()).pickups)}`);
        files.push(await shot(ctx, 'k1-pickups'));
        await page.evaluate(() => window.__game.teleport(window.__game.run.px - 30, window.__game.run.pz));
      });

      await step(`${vp.name} 飯糰：回血、提示寫出回了多少`, async () => {
        await page.evaluate(() => window.__game.setHp(10));
        const { before, after, note } = await pick('onigiri');
        const healed = Number((/撿到 飯糰：回復 (\d+) 生命/.exec(note) ?? [])[1]);
        expect(healed > 10, `提示不對（應寫出回了多少）：${note}`);
        expect(after.hp - before.hp > 10, `飯糰沒回血：${before.hp} → ${after.hp}`);
        files.push(await shot(ctx, 'k1-onigiri'));
      });

      await step(`${vp.name} 招魂鈴：遠處的魂火全部飛過來`, async () => {
        // 在很遠處（比鬼火瞄準距離 30 公尺＋碎火 6 公尺還遠）放一圈魂火。以前靠 3 秒內打倒人類掉出來：
        // 掉在哪、掉幾個看運氣，撿鈴的時候可能一個都沒有，之後打倒的人類掉的新魂火又被算成「沒飛過來」
        await dismiss();
        const FAR = 42;
        const placed = await page.evaluate((d) => window.__game.dropOrbs(12, d), FAR + 8);
        const far0 = await page.evaluate((d) => window.__game.orbsLooseBeyond(d), FAR);
        expect(placed === 12 && far0 >= 12, `放不下魂火：放了 ${placed}、遠處 ${far0}`);
        const { note } = await pick('bell');
        expect(/撿到 招魂鈴：魂火全部飛過來/.test(note), `提示不對：${note}`);
        const far1 = await page.evaluate((d) => window.__game.orbsLooseBeyond(d), FAR);
        expect(far1 === 0, `招魂鈴後遠處還有 ${far1} 個魂火沒動（${vp.name}）`);
        // 飛過來的全部被收走（之後打倒的人類掉的新魂火不算：它們沒被鈴拉，orbsPulled 只數在飛的）
        for (let i = 0; i < 24 && (await r()).orbsPulled > 0; i++) {
          await page.evaluate(() => window.__game.advance(0.5));
          await dismiss();
        }
        const s1 = await r();
        expect(s1.orbsPulled === 0, `招魂鈴拉過來的魂火沒收到：還有 ${s1.orbsPulled} 個在飛（${vp.name}）`);
      });

      await step(`${vp.name} 雪女的吐息：人類凍住（不動）`, async () => {
        await page.evaluate(() => { window.__game.spawn('villager', 12); window.__game.advance(0.5); });
        await dismiss();
        const { note } = await pick('yukiBreath');
        expect(/撿到 雪女的吐息：人類凍住 \d+ 秒/.test(note), `提示不對：${note}`);
        expect((await r()).frozen, `撿了雪女的吐息但人類沒凍住（${vp.name}）`);
        files.push(await shot(ctx, 'k1-freeze'));
      });

      await step(`${vp.name} 雷鼓：周圍的人類倒下`, async () => {
        await page.evaluate(() => { window.__game.spawn('villager', 15); window.__game.advance(0.3); });
        await dismiss();
        const k0 = (await r()).kills;
        const { note } = await pick('drum');
        expect(/撿到 雷鼓：周圍落雷，倒下 \d+ 人/.test(note), `提示不對：${note}`);
        expect((await r()).kills > k0, `雷鼓沒有打倒人類：${k0} → ${(await r()).kills}`);
      });

      await step(`${vp.name} 小判：功德`, async () => {
        const { note } = await pick('koban');
        expect(/撿到 小判：功德 \+\d+/.test(note), `提示不對：${note}`);
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
