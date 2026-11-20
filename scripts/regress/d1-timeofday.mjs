// d1：時段加成（D96，docs/28 第四節）。開發版網址 ?tod= 強制這一關的時段 → 開局頂端字幕寫出這個時段的加成（數字和 TOD_BONUS 一致）
// → 關卡名稱旁有時段小標籤 → 頂端列不被擠壞（hudTopOk）→ 6 秒後字幕收掉、標籤還在 → 真的有加成（能力值）。
// 手機直式跑三個時段；橫式與桌面只跑最長的「白天」。卡住偵測靠 step 的秒數上限。
import { openPage, startRun, step, expect, shot, reportErrors, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'd1', desc: '時段加成：開局字幕寫出加成→關卡旁的時段標籤→頂端列不擠壞→字幕收掉標籤還在→能力值真的變（手機直式三個時段、橫式與桌面白天）', max: 300, stall: 60 };

const NAME = { night: '夜晚', dusk: '黃昏', day: '白天' };
const NOTE = { night: /^夜晚：大招充能 \+15%、吸取範圍 \+20%$/, dusk: /^黃昏：經驗 \+20%，寶箱 10% 機率高一階$/, day: /^白天：移速 \+10%、回復 0\.5\/秒\n人類 −20%、經驗 −10%$/ };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const tods = vp.name === 'phone-portrait' ? ['night', 'dusk', 'day'] : ['day'];
    for (const tod of tods) {
      const ctx = await openPage(browser, vp, `?q=4&seed=31&tod=${tod}`);
      const { page } = ctx;
      try {
        await step(`${vp.name} ${tod} 開局`, () => startRun(ctx), 40);
        await step(`${vp.name} ${tod}：開局字幕、關卡旁的「${NAME[tod]}」標籤、頂端列不擠壞`, async () => {
          await page.evaluate(() => { window.__game.god = true; window.__game.advance(0.3); window.__game.render(); });
          expect((await page.evaluate(() => window.__game.run.tod)) === tod, `這一關的時段不是 ${tod}`);
          const note = await page.locator('#wave-note').innerText();
          expect(NOTE[tod].test(note), `開局字幕不對（${tod}）：${note}`);
          const tag = page.locator('#wave-text small.tod');
          expect(await tag.isVisible(), `看不到時段標籤（${vp.name}）`);
          expect((await tag.innerText()) === NAME[tod], `標籤文字不對：${await tag.innerText()}`);
          await hudTopOk(ctx, `・時段 ${tod}`);
          files.push(await shot(ctx, `d1-${tod}`));
        });
        await step(`${vp.name} ${tod}：6 秒後字幕收掉、標籤還在；能力值有加成`, async () => {
          await page.evaluate(() => { for (let i = 0; i < 7; i++) window.__game.advance(1); window.__game.render(); });
          const note = await page.locator('#wave-note').innerText();
          expect(!/^(夜晚|黃昏|白天)：/.test(note), `字幕沒收掉：${note}`);
          expect(await page.locator('#wave-text small.tod').isVisible(), '字幕收掉後標籤也不見了');
          const s = await page.evaluate(() => window.__game.run.stats);
          if (tod === 'day') expect(s.regen >= 0.99, `白天沒有回復加成（基礎 0.5 ＋ 0.5）：${s.regen}`);
          if (tod === 'night') expect(s.pickup >= 2.39, `夜晚沒有拾取範圍加成（基礎 2 ×1.2）：${s.pickup}`);
        });
        reportErrors(ctx);
      } finally {
        await ctx.close();
      }
    }
  }
  return files;
}
