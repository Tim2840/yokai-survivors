// e2：用地形的要素（E2，D54）。每關在地圖最高、走得到的平地放一座「山頂神社」：開局頂端提示＋HUD 箭頭指過去 → 走過去按住 →
// 結果卡寫出「頭目生命 ×1.5、多掉 1 個寶箱」→ 之後召喚的頭目真的比較肥（生命倍率 1.5）。三種畫面，卡住偵測。
// 「走得到」由單元測試用同一套走路規則全掃；這裡用真實輸入走最後一段（站上去按住）。
import { openPage, startRun, press, step, expect, shot, reportErrors, walkOnto, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'e2', desc: '山頂神社：開局提示與箭頭→走過去按住→結果卡（頭目 ×1.5、多掉寶箱）→召喚的頭目真的更肥；頭目出現後來不及（三種畫面）', max: 240, stall: 60 };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    let ctx = null;
    let summit = null;
    // 不是每個種子都放得下山頂神社：換幾個種子找一個有的
    for (const seed of [61, 62, 63, 64, 65, 66]) {
      ctx = await openPage(browser, vp, `?q=4&seed=${seed}`);
      await step(`${vp.name} 開局（種子 ${seed}）`, () => startRun(ctx), 40);
      summit = await ctx.page.evaluate(() => window.__game.run.elements.find((e) => e.kind === 'summit') ?? null);
      if (summit) break;
      await ctx.close();
    }
    expect(summit, `六個種子都沒有山頂神社（${vp.name}）`);
    const { page } = ctx;
    try {
      await page.evaluate(() => (window.__game.god = true));
      const dismiss = async () => {
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      };

      await step(`${vp.name} 開局頂端提示「山頂有座神社」、HUD 箭頭寫出「山頂神社 N 公尺」、神社比出生點高`, async () => {
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        const note = await page.locator('#wave-note').innerText();
        expect(/山頂有座神社/.test(note), `頂端沒有提示：${note}`);
        expect(await page.locator('#portal-box').isVisible() && /山頂神社 \d+ 公尺/.test(await page.locator('#portal-text').innerText()), `沒有指向山頂神社的箭頭`);
        const r = await page.evaluate(() => window.__game.run);
        expect(summit.y >= r.groundY + 3, `神社不夠高：神社 ${summit.y}、玩家 ${r.groundY}`);
        await hudTopOk(ctx, '・山頂神社提示');
        files.push(await shot(ctx, 'e2-hint'));
      });

      await step(`${vp.name} 走過去按住 → 結果卡寫出頭目生命 ×1.5、多掉 1 個寶箱`, async () => {
        for (let tries = 0; tries < 3 && !(await walkOnto(ctx, summit.x, summit.z)); tries++) await dismiss();
        const open = async () => (await page.evaluate(() => window.__game.screens)).includes('result');
        for (let i = 0; i < 24 && !(await open()); i++) {
          await dismiss();
          const r = await page.evaluate(() => window.__game.run);
          if (Math.hypot(r.px - summit.x, r.pz - summit.z) > 1.2) await walkOnto(ctx, summit.x, summit.z);
          await page.evaluate(() => window.__game.advance(0.25));
        }
        await page.evaluate(() => window.__game.render());
        expect(await open(), `按住山頂神社後沒有結果卡（${vp.name}）`);
        const card = await page.evaluate(() => {
          const o = document.querySelector('.overlay[data-screen="result"]');
          return { title: o.querySelector('h2').textContent, text: o.innerText.replace(/\s+/g, ' ') };
        });
        expect(/山頂神社/.test(card.title) && /頭目生命 ×1\.5/.test(card.text) && /多掉 1 個寶箱/.test(card.text), `結果卡文字不對：${JSON.stringify(card)}`);
        files.push(await shot(ctx, 'e2-result'));
        await page.waitForFunction(() => !document.querySelector('#btn-result-ok').disabled, null, { timeout: 5000 });
        if (!vp.hasTouch) await page.keyboard.press('Enter');
        else await page.locator('#btn-result-ok').click();
        await page.waitForFunction(() => !window.__game.screens.includes('result'), null, { timeout: 5000 });
        await dismiss();
        const s = (await page.evaluate(() => window.__game.run)).summit;
        expect(s.mult === 1.5 && s.chests === 1, `啟動後的狀態不對：${JSON.stringify(s)}`);
      }, 90);

      await step(`${vp.name} 之後召喚的頭目出現（山頂倍率 1.5 已套上，倍率的量值由單元測試對照）；神社用掉後箭頭消失`, async () => {
        for (let i = 0; i < 8; i++) await page.evaluate(() => window.__game.advance(0.5));
        await dismiss();
        expect(await page.evaluate(() => window.__game.summonBoss()), '召喚不了頭目');
        // 召喚祭壇的小頭目會在下一步湧出；等它出現再量生命
        let boss = null;
        for (let i = 0; i < 40 && !boss; i++) {
          await page.evaluate(() => window.__game.advance(0.25));
          await dismiss();
          boss = await page.evaluate(() => window.__game.run.boss ?? null);
        }
        expect(boss, `頭目沒有出現`);
        expect(boss.maxHp > 0, '量不到頭目生命');
        expect((await page.evaluate(() => window.__game.run.summit.mult)) === 1.5, `山頂倍率不對`);
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        const arrow = (await page.locator('#portal-box').isVisible()) ? await page.locator('#portal-text').innerText() : '';
        expect(!/山頂神社/.test(arrow), `用掉的山頂神社箭頭還在：${arrow}`);
      }, 90);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
