// j1：頭目各自的技能（D95，docs/34）。三種畫面：召喚退魔僧 → 血條上寫名字 → 封魔陣預告（地上紅圈）→ 站著不動被打到、扣血
// → 再一次，用真實輸入（鍵盤／搖桿）走出紅圈 → 不扣血 → 半血變招（血條變色）→ 過關、下一關 → 頭目是獵河武士。卡住偵測。
import { openPage, startRun, press, step, expect, shot, reportErrors, waitState, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'j1', desc: '頭目技能：召喚→名字→封魔陣站著被打、走出紅圈躲掉→半血變招→第 2 關是獵河武士（三種畫面）', max: 420, stall: 44 };

async function summon(page) {
  await page.evaluate(() => window.__game.summonBoss());
  for (let k = 0; k < 60; k++) {
    if (await page.evaluate(() => window.__game.run.boss)) break;
    await page.evaluate(() => window.__game.advance(0.1));
  }
  expect(await page.evaluate(() => window.__game.run.boss), '召喚後頭目沒有出現');
  await page.evaluate(() => { const g = window.__game; g.bossOnly(); g.bossTo(7, 0); g.advance(0.05); });
}
/** 讓畫面真的畫一幀（HUD 只在真的畫的時候更新） */
const nameIs = (page, want) => page.waitForFunction((w) => document.querySelector('#boss-name')?.textContent === w && !document.querySelector('#boss-bar').classList.contains('hidden'), want, { timeout: 20000 });

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=61');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      await step(`${vp.name} 召喚退魔僧 → 血條寫「退魔僧」`, async () => {
        await summon(page);
        await nameIs(page, '退魔僧');
      });
      await step(`${vp.name} 封魔陣：站著不動 → 預告紅圈出現、頭目站定 → 被打到扣血`, async () => {
        const r = await page.evaluate(() => {
          const g = window.__game;
          g.god = false;
          g.setHp(g.run.maxHp);
          g.bossCast('seal');
          g.advance(0.3);
          const b = g.run.boss;
          return { state: b.state, shape: b.tele.shape, hp0: g.run.hp };
        });
        expect(r.state === 'windup' && r.shape === 2, `封魔陣沒有預告紅圈：${JSON.stringify(r)}`);
        files.push(await shot(ctx, 'j1-seal'));
        const hp1 = await page.evaluate(() => { const g = window.__game; for (let t = 0; t < 1.2; t += 0.05) g.advance(0.05); return g.run.hp; });
        expect(hp1 < r.hp0, `站在紅圈裡沒被打到：${r.hp0} → ${hp1}`);
      });
      await step(`${vp.name} 封魔陣：用真實輸入走出紅圈 → 不扣血`, async () => {
        await page.evaluate(() => { const g = window.__game; g.god = true; for (let t = 0; t < 2.5; t += 0.1) g.advance(0.1); g.bossTo(7, 0); g.god = false; g.setHp(g.run.maxHp); g.bossCast('seal'); g.advance(0.05); });
        const hits0 = await page.evaluate(() => window.__game.run.boss.hits);
        // 往頭目的反方向（-x）走：桌面按 A、觸控把搖桿往左推
        if (!vp.hasTouch) await page.keyboard.down('KeyA');
        else {
          const box = await page.locator('#stick-base').boundingBox();
          const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
          await page.mouse.move(sx, sy);
          await page.mouse.down();
          await page.mouse.move(sx - 45, sy, { steps: 4 });
        }
        for (let k = 0; k < 14; k++) await page.evaluate(() => window.__game.advance(0.1));
        if (!vp.hasTouch) await page.keyboard.up('KeyA');
        else await page.mouse.up();
        const r = await page.evaluate(() => ({ hits: window.__game.run.boss.hits, skill: window.__game.run.boss.skill, state: window.__game.run.boss.state }));
        expect(r.hits === hits0, `走出紅圈還是被封魔陣打到（${vp.name}）：${JSON.stringify(r)}`);
        await page.evaluate(() => (window.__game.god = true));
      });
      await step(`${vp.name} 半血變招：血條變色`, async () => {
        await page.evaluate(() => { const g = window.__game; g.bossHp(0.45); g.advance(0.1); });
        await page.waitForFunction(() => document.querySelector('#boss-bar').classList.contains('phase2'), null, { timeout: 20000 });
        expect(await page.evaluate(() => window.__game.run.boss.phase2), '頭目沒有進入第二階段');
        files.push(await shot(ctx, 'j1-phase2'));
      });
      await step(`${vp.name} 過關 → 下一關 → 召喚 → 血條寫「獵河武士」`, async () => {
        await page.evaluate(() => { const g = window.__game; g.clearStage(); g.advance(0.1); });
        await page.waitForFunction(() => window.__game.screens.includes('intermission'), null, { timeout: 20000 });
        await press(ctx, '#btn-inter-next');
        await waitState(page, 'COMBAT');
        await page.evaluate(() => (window.__game.god = true));
        await summon(page);
        await nameIs(page, '獵河武士');
        const id = await page.evaluate(() => window.__game.run.boss.id);
        expect(id === 'kawagari', `第 2 關的頭目不是獵河武士：${id}`);
        await page.evaluate(() => { window.__game.bossCast('net'); window.__game.advance(0.4); });
        files.push(await shot(ctx, 'j1-kawagari'));
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
