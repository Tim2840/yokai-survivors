// l1：法具與等級（D30）。真的點升級卡 → 卡片寫出「新！」或「Lv a → b」、主武器標「主武器」；選了以後等級真的加一；
// 道具欄裝滿 6 格以後，升級只出現已有的道具（與主武器、備用獎勵）。三種畫面，卡住偵測。
import { openPage, startRun, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'l1', desc: '法具：卡片顯示新／等級、點了等級加一、主武器標示、道具欄滿了只出現已有的（三種畫面）', max: 300, stall: 60 };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=61');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      const levelUp = async () => {
        for (let g = 0; g < 60 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(10));
        expect((await page.evaluate(() => window.__game.screens)).includes('levelup'), `加魂火後沒有升級（${vp.name}）`);
      };
      // 技法卡（D49：機率混在升級卡裡）不是法具，這裡不看
      const cards = () => page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card:not([data-card^="tech:"])')].map((c) => ({ id: c.dataset.card, lv: c.querySelector('.clv').textContent, tag: c.querySelector('.rname').textContent, weapon: c.classList.contains('r-weapon') })));

      await step(`${vp.name} 連續升級 12 次：每張卡寫出新／等級、點了等級真的加一`, async () => {
        let sawWeapon = false;
        for (let k = 0; k < 12; k++) {
          await levelUp();
          const cs = await cards();
          for (const c of cs) {
            expect(/新！|Lv\d+ → \d+|^$/.test(c.lv), `卡片等級文字不對：${JSON.stringify(c)}`);
            if (c.id === 'ghostfire') {
              sawWeapon = true;
              expect(c.weapon && /主武器/.test(c.tag), `主武器卡沒有標示：${JSON.stringify(c)}`);
            }
          }
          if (k === 0) files.push(await shot(ctx, 'l1-pick'));
          const before = await page.evaluate(() => window.__game.run.ult.counts);
          const pick = cs[k % cs.length];
          await page.locator(`.overlay[data-screen="levelup"] .card[data-card="${pick.id}"]`).first().click();
          await page.waitForFunction(() => true);
          const after = await page.evaluate(() => window.__game.run.ult.counts);
          if (!['heal', 'meritBag'].includes(pick.id)) expect((after[pick.id] ?? 0) === (before[pick.id] ?? 0) + 1, `選了 ${pick.id} 等級沒有加一：${before[pick.id]} → ${after[pick.id]}`);
          while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        }
        void sawWeapon;
      }, 120);

      await step(`${vp.name} 取捨道具：拿了妖刀 → 力量變高、最大生命變低；「能力」面板寫出好處與代價`, async () => {
        const s0 = await page.evaluate(() => window.__game.run.stats);
        const had = await page.evaluate(() => window.__game.run.ult.counts.cursedBlade ?? 0);
        await page.evaluate(() => { window.__game.give('cursedBlade', 'rare'); window.__game.advance(0.1); });
        const s1 = await page.evaluate(() => window.__game.run.stats);
        expect(s1.power > s0.power && s1.maxHp < s0.maxHp, `妖刀的好處／代價沒套上：${JSON.stringify({ s0: [s0.power, s0.maxHp], s1: [s1.power, s1.maxHp] })}`);
        await page.locator('#btn-abilities').click();
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const row = await page.locator('#sum-cards li[data-card="cursedBlade"]').innerText();
        const lv = had + 1;
        expect(new RegExp(`妖刀[\\s\\S]*Lv${lv}`).test(row) && new RegExp(`，但最大生命 -${12 * lv}\\b`).test(row), `面板的取捨文字不對：${row}`);
        files.push(await shot(ctx, 'l1-trade'));
        await page.locator('#btn-pause-resume').click();
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });

      await step(`${vp.name} 道具欄裝滿 6 格 → 只出現已有的`, async () => {
        const owned = await page.evaluate(() => {
          const g = window.__game;
          const pool = ['power', 'atkSpeed', 'area', 'hp', 'speed', 'armor', 'regen', 'dodge', 'volley', 'splash', 'pierce'];
          const has = () => pool.filter((id) => (g.run.ult.counts[id] ?? 0) > 0);
          for (const id of pool) if (has().length < 6 && !has().includes(id)) g.give(id, 'common');
          return has();
        });
        expect(owned.length === 6, `沒有裝滿 6 格：${owned}`);
        for (let k = 0; k < 6; k++) {
          await levelUp();
          const cs = await cards();
          for (const c of cs) expect([...owned, 'ghostfire', 'heal', 'meritBag'].includes(c.id), `欄位滿了還出現新道具 ${c.id}（${vp.name}）`);
          await page.locator('.overlay[data-screen="levelup"] .card').first().click();
          while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        }
      }, 90);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
