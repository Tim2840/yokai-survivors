// f1：手感（D69）。用玩家會遇到的事件驗證：被打 → 螢幕震動＋紅色暈邊（之後淡出）；頭目倒下 → 頓幀（模擬真的停一下）＋大震動；
// 打倒敵人 → 爆圈；升級 → 光環；`?fx=off`（減少特效）全部關掉但遊戲照常。三種畫面，卡住偵測。
import { openPage, startRun, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'f1', desc: '手感：被打有震動與暈邊、頭目倒下有頓幀、擊殺有爆圈、升級有光環、?fx=off 全關（三種畫面）', max: 150, stall: 50 };

const feel = (page) => page.evaluate(() => window.__game.run.feel);
const dismiss = async (page) => {
  while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
};

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=93');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);

      await step(`${vp.name} 被打：震動＋紅色暈邊；暈邊之後淡出`, async () => {
        await page.evaluate(() => { window.__game.god = false; window.__game.spawn('villager', 14); });
        let f = null;
        for (let i = 0; i < 80; i++) {
          await page.evaluate(() => window.__game.advance(0.25));
          const hp = await page.evaluate(() => window.__game.run.hp);
          if (hp < (await page.evaluate(() => window.__game.run.maxHp))) { f = await feel(page); break; }
        }
        expect(f, '一直沒有被打到');
        expect(f.shake > 0, `被打沒有震動：${JSON.stringify(f)}`);
        await page.evaluate(() => { window.__game.god = true; window.__game.render(); });
        const f2 = await feel(page);
        expect(f2.vignette > 0.1, `被打沒有紅色暈邊：${JSON.stringify(f2)}`);
        // 截圖用：無頭瀏覽器截圖要真實時間，暈邊早就淡掉了 → 截圖前把它固定在被打當下的強度（只是為了看外觀）
        await page.addStyleTag({ content: '#hurt-vignette { opacity: 0.6 !important; transition: none !important; }' });
        files.push(await shot(ctx, 'f1-hurt'));
        await page.evaluate(() => document.querySelectorAll('style').forEach((st) => { if (st.textContent.includes('#hurt-vignette { opacity: 0.6')) st.remove(); }));
        // 淡出：多畫幾幀（真實時間）後暈邊變小
        for (let i = 0; i < 16; i++) { await page.waitForTimeout(150); await page.evaluate(() => window.__game.render()); }
        const f3 = await feel(page);
        expect(f3.vignette < f2.vignette, `暈邊沒有淡出：${f2.vignette} → ${f3.vignette}`);
      }, 60);

      await step(`${vp.name} 打倒敵人有爆圈`, async () => {
        await dismiss(page);
        await page.evaluate(() => { window.__game.god = true; });
        const k0 = await page.evaluate(() => window.__game.run.kills);
        let pops = 0;
        await page.evaluate(() => window.__game.spawn('villager', 20));
        for (let i = 0; i < 60 && pops === 0; i++) {
          await page.evaluate(() => window.__game.advance(0.5));
          const k = await page.evaluate(() => window.__game.run.kills);
          if (k > k0) {
            await page.evaluate(() => window.__game.render());
            pops = (await feel(page)).pops;
          }
        }
        const k1 = await page.evaluate(() => window.__game.run.kills);
        expect(k1 > k0 && pops > 0, `擊殺沒有爆圈（擊殺 ${k0} → ${k1}、爆圈 ${pops}）`);
      }, 60);

      await step(`${vp.name} 頭目倒下：頓幀（模擬真的停一下）＋大震動`, async () => {
        await dismiss(page);
        await page.evaluate(() => { window.__game.god = true; });
        const ok = await page.evaluate(() => window.__game.summonBoss());
        expect(ok, '召喚不了頭目');
        for (let i = 0; i < 10; i++) await page.evaluate(() => window.__game.advance(0.2));
        // 殺頭目到數完凍結步數，整段放在同一次 evaluate 裡（同步執行）：真實畫面迴圈（1～2 FPS）不會插進來把頓幀吃掉
        const { f, frozen, moved } = await page.evaluate(() => {
          const g = window.__game;
          g.killBoss();
          g.advance(1 / 60); // 頭目倒下的事件在下一步送出
          const f = g.run.feel;
          let frozen = 0;
          let moved = 0;
          let last = g.run.time;
          for (let i = 0; i < 40; i++) {
            g.advance(1 / 60);
            const t = g.run.time;
            if (t - last < 1e-6) frozen++;
            else moved++;
            last = t;
          }
          return { f, frozen, moved };
        });
        expect(f.hitStop > 0.02 && f.shake > 0.5, `頭目倒下沒有頓幀或大震動：${JSON.stringify(f)}`);
        expect(frozen >= 3 && frozen <= 12, `頓幀的長度不對（凍住 ${frozen} 步，應該約 8 步）`);
        expect(moved >= 20, `頓幀過了模擬沒有恢復（只動了 ${moved} 步）`);
        await page.evaluate(() => window.__game.render());
        files.push(await shot(ctx, 'f1-boss'));
      }, 60);

      await step(`${vp.name} 升級有光環`, async () => {
        await dismiss(page);
        await page.evaluate(() => { window.__game.addXp(5000); });
        await page.waitForFunction(() => window.__game.screens.includes('levelup'), null, { timeout: 15000 });
        // 光環只活 0.75 秒（畫面時間）：用真正的畫面迴圈等它出現（dev 的 render() 一幀給 1 秒，會直接讓它過期）
        await page.waitForFunction(() => window.__game.run.feel.pops > 0, null, { timeout: 15000 }).catch(() => {});
        const f = await feel(page);
        expect(f.pops > 0, `升級沒有光環：${JSON.stringify(f)}`);
        files.push(await shot(ctx, 'f1-levelup'));
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      }, 60);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }

    // 減少特效：?fx=off → 全關，遊戲照常
    const c2 = await openPage(browser, vp, '?q=4&seed=94&fx=off');
    try {
      await startRun(c2);
      const p2 = c2.page;
      await p2.evaluate(() => { window.__game.god = false; window.__game.spawn('villager', 14); });
      let hurt = false;
      for (let i = 0; i < 80 && !hurt; i++) {
        await p2.evaluate(() => window.__game.advance(0.25));
        hurt = await p2.evaluate(() => window.__game.run.hp < window.__game.run.maxHp);
      }
      expect(hurt, '?fx=off 時被打不到（遊戲沒照常）');
      await p2.evaluate(() => { window.__game.god = true; window.__game.render(); });
      let f = await feel(p2);
      expect(f.shake === 0 && f.vignette === 0, `?fx=off 還有震動或暈邊：${JSON.stringify(f)}`);
      await p2.evaluate(() => { window.__game.summonBoss(); });
      for (let i = 0; i < 10; i++) await p2.evaluate(() => window.__game.advance(0.2));
      await p2.evaluate(() => window.__game.killBoss());
      f = await feel(p2);
      expect(f.hitStop === 0 && f.shake === 0, `?fx=off 頭目倒下還有頓幀或震動：${JSON.stringify(f)}`);
      reportErrors(c2);
    } finally {
      await c2.close();
    }
  }
  return files;
}
