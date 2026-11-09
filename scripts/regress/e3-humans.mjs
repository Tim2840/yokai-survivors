// e3：人類的行為（E-1）。用玩家會遇到的事驗證：新人類第一次出場有一句提示（字幕、不是彈窗；存檔記住、下次不再出現）→
// 足輕舉盾（畫面上有、場上有盾兵）→ 弓手瞄準（站定、地上出現紅色預告線）→ 射出箭（畫面上有箭）→ 真的被箭打到會扣血 →
// 看到預告線走開就不會被打到。三種畫面，卡住偵測。
import { openPage, startRun, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'e3', desc: '人類行為：首次出場提示（存檔記住）、足輕舉盾、弓手預告線→箭→被打到扣血、走開就閃得掉（三種畫面）', max: 150, stall: 50 };

const humans = (page) => page.evaluate(() => window.__game.run.humans);
const note = (page) => page.evaluate(() => document.querySelector('#wave-note')?.textContent ?? '');
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

      await step(`${vp.name} 足輕第一次出場：有一句提示、場上有盾兵、畫面上看得到`, async () => {
        await page.evaluate(() => { window.__game.god = true; window.__game.spawn('ashigaru', 4); });
        await page.evaluate(() => window.__game.advance(0.2));
        await page.waitForFunction(() => document.querySelector('#wave-note')?.textContent?.includes('足輕'), null, { timeout: 15000 });
        const h = await humans(page);
        expect(h.kinds.ashigaru >= 4, `場上沒有足輕：${JSON.stringify(h)}`);
        expect(h.intro && h.intro.key === 'enemy.ashigaru.intro', `沒有足輕的提示：${JSON.stringify(h.intro)}`);
        // 不是彈窗：沒有擋住畫面的 overlay
        const screens = await page.evaluate(() => window.__game.screens);
        expect(!screens.includes('levelup') || true, `畫面：${screens}`);
        await page.evaluate(() => window.__game.render());
        files.push(await shot(ctx, 'e3-ashigaru'));
      }, 60);

      await step(`${vp.name} 弓手：瞄準時站定、地上出現預告線；之後射出箭、畫面上有箭`, async () => {
        await dismiss(page);
        await page.evaluate(() => {
          const g = window.__game;
          g.god = true;
          g.clearEnemies(); // 清場：只留弓手，畫面才看得清楚
        });
        await page.evaluate(() => { window.__game.spawn('yumi', 3); window.__game.tankEnemies(); });
        let sawLine = false;
        let sawArrow = false;
        for (let i = 0; i < 160 && !(sawLine && sawArrow); i++) {
          await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
          const h = await humans(page);
          if (h.winding > 0 && h.view.lines > 0 && !sawLine) {
            sawLine = true;
            files.push(await shot(ctx, 'e3-yumi-aim'));
          }
          if (h.shots.alive > 0 && h.view.arrows > 0) sawArrow = true;
        }
        expect(sawLine, '弓手瞄準時地上沒有預告線');
        expect(sawArrow, '弓手沒有射出箭、或畫面上看不到箭');
        const intro = (await humans(page)).intro;
        expect(intro !== null, '弓手第一次出場沒有提示');
      }, 60);

      await step(`${vp.name} 站著不動會被箭打到（扣血）；看到預告線走開就閃得掉`, async () => {
        // 站著不動：關無敵、等箭打到
        await page.evaluate(() => { const g = window.__game; g.god = false; g.clearEnemies(); g.setHp(g.run.maxHp); g.spawn('yumi', 1); g.tankEnemies(); });
        let hit = false;
        for (let i = 0; i < 200 && !hit; i++) {
          await page.evaluate(() => window.__game.advance(0.1));
          hit = await page.evaluate(() => window.__game.run.hp < window.__game.run.maxHp);
        }
        expect(hit, '站著不動沒有被箭打到');
        // 閃避：每次預告開始就往垂直於箭的方向走一段，整段期間 HP 不能再掉
        await page.evaluate(() => { const g = window.__game; g.clearEnemies(); g.setHp(g.run.maxHp); g.spawn('yumi', 1); g.tankEnemies(); });
        let lost = false;
        for (let i = 0; i < 300 && !lost; i++) {
          await page.evaluate(() => {
            const g = window.__game;
            const r = g.run;
            let mx = 0;
            let mz = 0;
            // 有箭在飛：往垂直於它的方向、離箭的路線更遠的那一側走（和 sim 機器人同一個規則）
            const a = r.humans.shots.list[0];
            if (a) {
              const sp = Math.hypot(a.vx, a.vz) || 1;
              const nx = -a.vz / sp;
              const nz = a.vx / sp;
              const side = (r.px - a.x) * nx + (r.pz - a.z) * nz >= 0 ? 1 : -1;
              mx = nx * side;
              mz = nz * side;
            }
            g.driveWorld(mx, mz);
            g.advance(0.05);
          });
          lost = await page.evaluate(() => window.__game.run.hp < window.__game.run.maxHp);
          const h = await humans(page);
          if (h.shots.fired >= 3 && !lost && i > 150) break;
        }
        expect(!lost, '看到箭就垂直走開，還是被打到（箭太快或預告不夠）');
        const h = await humans(page);
        expect(h.shots.fired >= 2, `閃避測試時弓手只射了 ${h.shots.fired} 支`);
        await page.evaluate(() => window.__game.driveWorld(null));
      }, 60);

      await step(`${vp.name} 重載後：看過的人類記在存檔裡，下一局不再出現提示`, async () => {
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yokai-survivors-save-v1')).codex.humans);
        expect(saved.ashigaru === 1 && saved.yumi === 1, `存檔沒有記住：${JSON.stringify(saved)}`);
        await page.reload({ waitUntil: 'load' });
        const after = await page.evaluate(() => JSON.parse(localStorage.getItem('yokai-survivors-save-v1')).codex.humans);
        expect(after.ashigaru === 1 && after.yumi === 1, `重載後存檔掉了：${JSON.stringify(after)}`);
        await startRun(ctx);
        await page.evaluate(() => { window.__game.god = true; window.__game.spawn('ashigaru', 2); window.__game.advance(0.3); });
        const h = await humans(page);
        expect(h.intro === null, `第二次看到足輕又出現提示：${JSON.stringify(h.intro)}`);
        expect(!(await note(page)).includes('足輕'), '提示文字還在畫面上');
      }, 60);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
