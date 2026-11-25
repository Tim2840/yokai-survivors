// e4：E-2 新人類（docs/22）。用玩家會遇到的事驗證：
// 僧兵第一次出場有一句提示（字幕、不是彈窗）＋地上的護法範圍 → 太鼓兵的鼓舞範圍 →
// 陰陽師在腳下畫紅圈：站著不動會被打到（跳也一樣）、用真的移動（鍵盤／搖桿）走出圈就沒事 →
// 探子衝刺前地上有預告線 → 精英詞綴的腳下光圈。三種畫面，卡住偵測。
import { openPage, startRun, step, expect, shot, reportErrors, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'e4', desc: 'E-2 新人類：僧兵提示與護法範圍、太鼓兵範圍、陰陽師紅圈（站著被打、走出去沒事）、探子預告線、精英詞綴光圈（三種畫面）', max: 240, stall: 60 };

const view = (page) => page.evaluate(() => window.__game.run.humans.view);
const note = (page) => page.evaluate(() => document.querySelector('#wave-note')?.textContent ?? '');

/** 用真實輸入往右走 seconds 秒（桌面按住 D；觸控推搖桿） */
async function walkRight(ctx, seconds) {
  const { page, vp } = ctx;
  let box = null;
  if (!vp.hasTouch) await page.keyboard.down('KeyD');
  else {
    box = await page.locator('#stick-base').boundingBox();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 45, sy, { steps: 4 });
  }
  for (let t = 0; t < seconds; t += 0.1) await page.evaluate(() => window.__game.advance(0.1));
  if (!vp.hasTouch) await page.keyboard.up('KeyD');
  else await page.mouse.up();
}

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=93&tod=night');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      // 紅圈的預告秒數：從開發伺服器讀資料（不寫死）
      const C = await page.evaluate(async () => (await import('/src/data/enemies.ts')).ENEMIES.onmyoji.caster);

      await step(`${vp.name} 僧兵第一次出場：一句提示（不是彈窗）、地上有護法範圍；太鼓兵也有範圍`, async () => {
        await page.evaluate(() => { const g = window.__game; g.god = true; g.clearEnemies(); g.spawnAt('sohei', -3, -5); g.spawnAt('villager', -2, -6); g.advance(0.2); g.render(); });
        await page.waitForFunction(() => document.querySelector('#wave-note')?.textContent?.includes('僧兵'), null, { timeout: 15000 });
        expect(/先打僧兵/.test(await note(page)), `僧兵提示不對：${await note(page)}`);
        expect(!(await page.evaluate(() => window.__game.screens)).some((s) => s !== 'hud'), '出現了彈窗');
        expect((await view(page)).auras >= 1, '畫面上沒有護法範圍');
        await page.evaluate(() => { const g = window.__game; g.spawnAt('taiko', 4, -7); g.advance(0.1); g.render(); });
        expect((await view(page)).auras >= 2, '太鼓兵沒有鼓舞範圍');
        await hudTopOk(ctx, '・僧兵提示');
        files.push(await shot(ctx, 'e4-aura'));
      });

      await step(`${vp.name} 陰陽師的紅圈：站著不動（還跳起來）會被打到`, async () => {
        await page.evaluate(() => { const g = window.__game; g.god = false; g.clearEnemies(); g.setHp(g.run.maxHp); g.spawnAt('onmyoji', 0, 10); });
        for (let k = 0; k < 80 && (await page.evaluate(() => window.__game.run.curseZones)) === 0; k++) await page.evaluate(() => window.__game.advance(0.1));
        expect((await page.evaluate(() => window.__game.run.curseZones)) > 0, '陰陽師沒有畫紅圈');
        await page.evaluate(() => { window.__game.advance(0.5); window.__game.render(); });
        expect((await view(page)).zones >= 1, '畫面上沒有紅圈');
        files.push(await shot(ctx, 'e4-zone'));
        const hp0 = await page.evaluate(() => window.__game.run.hp);
        // 跳起來（真的按跳）：紅圈是地上的咒，跳也躲不掉
        if (!vp.hasTouch) await page.keyboard.press('Space');
        else await page.locator('#btn-jump').tap();
        for (let t = 0; t < C.windup; t += 0.1) await page.evaluate(() => window.__game.advance(0.1));
        const hp1 = await page.evaluate(() => window.__game.run.hp);
        expect(hp1 < hp0, `站在紅圈裡沒被打到：${hp0} → ${hp1}`);
      });

      await step(`${vp.name} 陰陽師的紅圈：看到圈就用真的移動走出去 → 不扣血`, async () => {
        await page.evaluate(() => { const g = window.__game; g.setHp(g.run.maxHp); g.advance(1.5); });
        const before = await page.evaluate(() => window.__game.run.curseZones);
        for (let k = 0; k < 80 && (await page.evaluate(() => window.__game.run.curseZones)) <= before; k++) await page.evaluate(() => window.__game.advance(0.1));
        // 有一個新的、還沒落下的圈：馬上往旁邊走（半徑 2 公尺，移速約 4，走 1 秒就出去了）
        const hp0 = await page.evaluate(() => window.__game.run.hp);
        await walkRight(ctx, C.windup + 0.2);
        const hp1 = await page.evaluate(() => window.__game.run.hp);
        expect(hp1 >= hp0, `走出紅圈還是被打到：${hp0} → ${hp1}`);
      });

      await step(`${vp.name} 探子衝刺前，地上有預告線`, async () => {
        // 正常生（會走過來）＋打不死：spawnAt 的速度是 0，被武器擊退出觸發距離就回不來（除錯時抓到的）
        await page.evaluate(() => { const g = window.__game; g.god = true; g.clearEnemies(); g.spawn('shinobi', 1); g.tankEnemies(); });
        let seen = false;
        for (let k = 0; k < 150 && !seen; k++) {
          await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
          seen = (await view(page)).lines >= 1;
        }
        expect(seen, '探子沒有衝刺預告線');
        files.push(await shot(ctx, 'e4-dash'));
      });

      await step(`${vp.name} 精英詞綴：腳下有光圈（四種）`, async () => {
        await page.evaluate(() => {
          const g = window.__game;
          g.clearEnemies();
          [1, 2, 3, 4].forEach((c, k) => g.setAffix(g.spawnAt('villager', -4.5 + k * 3, -6, 1), c));
          g.advance(0.1);
          g.render();
        });
        expect((await view(page)).affixes === 4, `詞綴光圈數不對：${(await view(page)).affixes}`);
        files.push(await shot(ctx, 'e4-affix'));
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
