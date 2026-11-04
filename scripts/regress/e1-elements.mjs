// e1：地圖要素（M2-1）。真的走進去、按住不動：石地藏（護甲）、詛咒祭壇（一升一降）、結界石（圈內加成、走出去消失）。
// 要素用開發介面放到玩家身邊（隨機落下的位置不固定），其餘（走路、HUD 提示、效果）全用真實輸入與畫面。三種畫面各一次，卡住偵測。
import { openPage, startRun, step, expect, shot, reportErrors, snapshotOf, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'e1', desc: '地圖要素：走近→提示→按住→效果（石地藏、詛咒祭壇、結界石）三種畫面', max: 400, stall: 60 };

const SIDES = [[0, 3, 'KeyW', 0, -1], [0, -3, 'KeyS', 0, 1], [-3, 0, 'KeyD', 1, 0], [3, 0, 'KeyA', -1, 0]];

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=21&stage=3600');
    const { page } = ctx;
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      const dismiss = async () => {
        for (let i = 0; i < 6 && (await page.evaluate(() => window.__game.screens)).includes('levelup'); i++) {
          await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        }
      };
      /** 往前跑 sec 秒；升級選卡打斷時（模擬暫停）要先選完才會繼續 */
      const play = async (sec) => {
        for (let t = 0; t < sec - 1e-9; t += 0.25) {
          await page.evaluate(() => window.__game.advance(0.25));
          await dismiss();
        }
      };
      const stats = () => page.evaluate(() => window.__game.run.stats);
      const el = () => page.evaluate(() => window.__game.run.elements);

      /** 放一個要素，站到它旁邊 3 公尺，用真實輸入走到離它 0.8 公尺內就放開 */
      const approach = async (kind, rarity) => {
        const spot = await page.evaluate(([k, r]) => window.__game.forceElement(k, r), [kind, rarity]);
        expect(spot, `放不下 ${kind}（${vp.name}）`);
        let side = null;
        for (const sd of SIDES) {
          const ok = await page.evaluate(([x, z]) => window.__game.teleport(x, z), [spot.x + sd[0], spot.z + sd[1]]);
          if (ok) { side = sd; break; }
        }
        expect(side, `${kind} 四周都被擋住（${vp.name}）`);
        await page.evaluate(() => window.__game.advance(0.1));
        let stickBox = null;
        if (!vp.hasTouch) await page.keyboard.down(side[2]);
        else {
          stickBox = await page.locator('#stick-base').boundingBox();
          const sx = stickBox.x + stickBox.width / 2, sy = stickBox.y + stickBox.height / 2;
          await page.mouse.move(sx, sy);
          await page.mouse.down();
          await page.mouse.move(sx + side[3] * 40, sy + side[4] * 40, { steps: 4 });
        }
        for (let i = 0; i < 20; i++) {
          await page.evaluate(() => window.__game.advance(0.1));
          const d = await page.evaluate(([x, z]) => { const r = window.__game.run; return Math.hypot(r.px - x, r.pz - z); }, [spot.x, spot.z]);
          if (d < 0.8) break;
        }
        if (!vp.hasTouch) await page.keyboard.up(side[2]);
        else await page.mouse.up();
        return spot;
      };
      const leave = async (spot) => {
        await page.evaluate(([x, z]) => window.__game.teleport(x + 14, z), [spot.x, spot.z]);
        await page.evaluate(() => window.__game.advance(0.3));
      };

      await step(`${vp.name} 石地藏：走近出現提示、按住 1 秒 → 護甲 +3（靈階）`, async () => {
        const s0 = await stats();
        const spot = await approach('jizo', 'rare');
        await page.evaluate(() => { window.__game.advance(0.4); window.__game.render(); });
        expect(await page.locator('#element-box').isVisible(), `走近了但沒有要素提示（${vp.name}）`);
        const title = await page.locator('#element-title').innerText();
        expect(title === '靈・石地藏', `提示標題不對：${title}`);
        const fill = await page.locator('#element-fill').evaluate((n) => parseFloat(n.style.width));
        expect(fill > 5 && fill < 100, `按住途中進度條應該在中間：${fill}`);
        files.push(await shot(ctx, 'e1-jizo'));
        await play(1);
        const s1 = await stats();
        expect(Math.abs(s1.armor - s0.armor - 3) < 1e-6, `石地藏護甲沒加 3：${s0.armor} → ${s1.armor}`);
        await leave(spot);
        expect(!(await page.locator('#element-box').isVisible()), `離開了提示還在（${vp.name}）`);
      });

      await step(`${vp.name} 詛咒祭壇：按住 1.5 秒 → 隨機數個效果（好處加屬性、詛咒讓敵人變強）`, async () => {
        const s0 = await stats();
        const spot = await approach('altar', 'epic');
        const info = (await el()).find((e) => e.kind === 'altar' && Math.hypot(e.x - spot.x, e.z - spot.z) < 0.01);
        expect(info, '找不到剛放的祭壇');
        expect(info.effects.length === 3, `妖階祭壇應該抽 3 個效果：${JSON.stringify(info.effects)}`);
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        const desc = await page.locator('#element-desc').innerText();
        const shown = desc.split('\n').filter(Boolean).length;
        expect(shown === 3, `祭壇說明應該列出 3 個效果：${desc}`);
        expect(/敵人/.test(desc), `說明裡沒有詛咒（敵人變強）：${desc}`);
        files.push(await shot(ctx, 'e1-altar'));
        await play(2);
        const s1 = await stats();
        const curse = await page.evaluate(() => window.__game.run.curse);
        for (const f of info.effects) {
          if (f.curse) expect(Math.abs(curse[f.id] - f.v) < 1e-6, `詛咒 ${f.id} 沒生效：${JSON.stringify(curse)}`);
          else expect(s1[f.id] > s0[f.id], `好處 ${f.id} 沒變大：${s0[f.id]} → ${s1[f.id]}`);
        }
        await leave(spot);
      });

      await step(`${vp.name} 結界石：站進圈內攻擊力 +32%、走出去恢復`, async () => {
        const s0 = await stats();
        const spot = await approach('barrier', 'rare');
        await page.evaluate(() => window.__game.advance(0.3));
        const s1 = await stats();
        expect(Math.abs(s1.power / s0.power - 1.32) < 1e-6, `結界圈內攻擊力不對：${s0.power} → ${s1.power}`);
        await leave(spot);
        const s2 = await stats();
        expect(Math.abs(s2.power - s0.power) < 1e-6, `走出圈外攻擊力沒恢復：${s2.power}`);
      });

      await dismiss();
      reportErrors(ctx);
      expect(JSON.parse(await snapshotOf(page)).state === 'COMBAT', `最後狀態不是 COMBAT（${vp.name}）`);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
