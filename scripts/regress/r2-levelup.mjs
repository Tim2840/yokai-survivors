// r2：升級選卡（D15）。戰鬥中升級 → 模擬暫停、跳出三選一 → 模擬確實停住 → 用真實點擊（或鍵盤 1/2/3）選卡 → 戰鬥繼續。
// 對照組：沒有升級時戰鬥照跑。三種畫面各一次；卡牌不能超出畫面、不能互相蓋住。
import { openPage, startRun, press, step, expect, shot, reportErrors, snapshotOf, untilDone, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'r2', desc: '升級暫停選卡：模擬停住、三張卡版面不破、點選與鍵盤都能選、選完繼續（三種畫面）', max: 300, stall: 40 };

/** 戰鬥進行中（波次中段）給足一級的魂火，等升級面板出現。升級之後的一切（面板、暫停、點卡）都是真實流程 */
async function levelUpMidWave(ctx, extra = 0) {
  const { page } = ctx;
  await page.evaluate((x) => {
    window.__game.advance(2);
    const r = window.__game.run;
    window.__game.addXp(6 + 2.5 * r.level + x);
    window.__game.render();
  }, extra);
  await page.waitForFunction(() => window.__game.screens.includes('levelup'), null, { timeout: 10000 });
  const r = await page.evaluate(() => window.__game.run);
  expect(r.phase === 'combat', `升級當下不是戰鬥中：${r.phase}`);
}

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=5');
    const { page } = ctx;
    try {
      await startRun(ctx);
      await page.evaluate(() => (window.__game.god = true));

      await step(`${vp.name} 升級出現三選一`, async () => {
        await levelUpMidWave(ctx);
        const cards = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => ({ id: c.dataset.card, r: c.dataset.rarity })));
        expect(cards.length === 3, `卡片不是 3 張：${JSON.stringify(cards)}`);
        expect(new Set(cards.map((c) => c.id)).size === 3, `三張卡有重複：${JSON.stringify(cards)}`);
      });

      await step(`${vp.name} 卡片版面：在畫面內、不重疊、字沒被切掉`, async () => {
        const rects = await page.evaluate(() =>
          [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => {
            const r = c.getBoundingClientRect();
            return { l: r.left, t: r.top, r: r.right, b: r.bottom, clipped: c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1 };
          }),
        );
        for (const [i, r] of rects.entries()) {
          expect(r.l >= 0 && r.t >= 0 && r.r <= vp.width && r.b <= vp.height, `第 ${i + 1} 張卡超出畫面（${vp.name}）：${JSON.stringify(r)}`);
          expect(!r.clipped, `第 ${i + 1} 張卡的字被切掉（${vp.name}）`);
        }
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          expect(a.r <= b.l + 1 || b.r <= a.l + 1 || a.b <= b.t + 1 || b.b <= a.t + 1, `卡片 ${i + 1} 與 ${j + 1} 重疊（${vp.name}）`);
        }
        files.push(await shot(ctx, 'r2-cards'));
      });

      await step(`${vp.name} 選卡時模擬確實停住`, async () => {
        const before = await page.evaluate(() => ({ t: window.__game.run.time, p: window.__game.paused }));
        expect(before.p === true, `選卡面板開著但沒有暫停（${vp.name}）`);
        await page.evaluate(() => window.__game.advance(3));
        const after = await page.evaluate(() => window.__game.run);
        expect(after.time === before.t, `選卡時戰鬥時間還在走：${before.t} → ${after.time}（${vp.name}）`);
        expect(after.awaitingPick === true, `沒有在等選卡（${vp.name}）`);
      });

      await step(`${vp.name} 點卡 → 面板關閉、戰鬥繼續`, async () => {
        const t0 = await page.evaluate(() => window.__game.run.time);
        await press(ctx, '.overlay[data-screen="levelup"] .card');
        // 可能一次升了好幾級：連續選完
        await untilDone({
          snapshot: () => snapshotOf(page),
          done: (snap) => !JSON.parse(snap).screens.includes('levelup'),
          act: async () => press(ctx, '.overlay[data-screen="levelup"] .card'),
          maxRounds: 20,
        });
        const after = await page.evaluate(() => ({ p: window.__game.paused, r: window.__game.run }));
        expect(after.p === false, `選完卡後還是暫停（${vp.name}）`);
        expect(after.r.picked >= 1 && after.r.awaitingPick === false, `選卡沒生效（${vp.name}）：${JSON.stringify(after.r)}`);
        await page.evaluate(() => window.__game.advance(1));
        const t1 = await page.evaluate(() => window.__game.run.time);
        expect(t1 > t0, `選完卡後戰鬥時間沒繼續：${t0} → ${t1}（${vp.name}）`);
      });

      await step(`${vp.name} 鍵盤 1／2／3 也能選（桌面）`, async () => {
        if (vp.hasTouch) return;
        await levelUpMidWave(ctx);
        await page.keyboard.press('Digit2');
        await untilDone({
          snapshot: () => snapshotOf(page),
          done: (snap) => !JSON.parse(snap).screens.includes('levelup'),
          act: async () => page.keyboard.press('Digit1'),
          maxRounds: 20,
        });
      });
      await step(`${vp.name} 一次升好幾級：連續選到完，每次都是新的三張`, async () => {
        await levelUpMidWave(ctx, 120);
        const seen = [];
        await untilDone({
          snapshot: () => snapshotOf(page),
          done: (snap) => !JSON.parse(snap).screens.includes('levelup'),
          act: async () => {
            const ids = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => c.dataset.card + ':' + c.dataset.rarity).join(','));
            seen.push(ids);
            expect(await page.evaluate(() => window.__game.paused), `連續選卡的中間沒暫停（${vp.name}）`);
            await press(ctx, '.overlay[data-screen="levelup"] .card');
          },
          maxRounds: 30,
        });
        expect(seen.length >= 3, `預期連升 3 級以上，實際只選了 ${seen.length} 次（${vp.name}）`);
        expect(await page.evaluate(() => window.__game.paused) === false, `連續選完後沒恢復（${vp.name}）`);
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
