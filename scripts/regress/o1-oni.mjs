// o1：赤鬼（M2-3 順序 3，docs/35）。選妖怪畫面點赤鬼（顯示大招）→ 開局是赤鬼（金棒）→ 揮擊真的打倒人 → 被人碰到 → 怒氣上升、HUD 資源條亮起
// → 升級選卡：技法卡是赤鬼的、沒有多重／碎裂／穿透 → 能力面板有揮擊欄位、沒有別的角色的字 → 鬼神化（大招鈕）→ 神社列出兩招。三種畫面，卡住偵測。
import { openPage, waitState, press, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'o1', desc: '赤鬼：選角→金棒揮擊打倒人→被打怒氣上升（HUD 資源條）→選卡是赤鬼的技法、沒有多重碎裂穿透→能力面板揮擊欄位→鬼神化→神社兩招（三種畫面）', max: 240, stall: 60 };

/** 赤鬼的畫面不准出現提燈小僧、河童的專屬字（共用畫面殘留別人的字，是新角色最容易漏的） */
const FOREIGN = ['鬼火', '狐火', '燈籠', '提燈', '燈油', '業火', '火種', '燈火', '水盤', '河童', '渦流', '水域', '水牢', '滑水', '回潮', '間歇泉', '相撲'];
async function leaks(page, where) {
  const text = await page.evaluate(() => document.body.innerText.replace(/魂火/g, ''));
  const hit = FOREIGN.filter((w) => text.includes(w));
  expect(hit.length === 0, `赤鬼的「${where}」畫面出現別的角色的字：${hit.join('、')}`);
}
const ONI_TECHS = ['combo', 'onimon', 'kaminari', 'spin', 'heavy', 'roar', 'rift', 'aftershock', 'oniward'];
const clearPicks = async (page) => {
  while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
};

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=91');
    const { page } = ctx;
    try {
      await step(`${vp.name} 選妖怪畫面點赤鬼`, async () => {
        await waitState(page, 'MENU');
        await press(ctx, '#btn-start');
        await page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
        await press(ctx, '.yokai-card[data-yokai="aka-oni"]');
        const sel = await page.evaluate(() => [...document.querySelectorAll('.yokai-card')].map((c) => ({ id: c.dataset.yokai, selected: c.classList.contains('selected'), locked: c.classList.contains('locked') })));
        expect(sel.find((c) => c.id === 'aka-oni')?.selected === true && sel.find((c) => c.id === 'aka-oni')?.locked === false, `赤鬼沒有被選中或還鎖著：${JSON.stringify(sel)}`);
        const line = await page.locator('#setup-ult').innerText();
        expect(/鬼神化/.test(line), `選妖怪畫面沒寫赤鬼的大招：${line}`);
        files.push(await shot(ctx, 'o1-setup'));
        await press(ctx, '#btn-setup-go');
        await waitState(page, 'COMBAT');
      }, 40);

      await step(`${vp.name} 開局是赤鬼：金棒；揮擊打倒人`, async () => {
        const s = await page.evaluate(() => window.__game.run);
        expect(s.yokai === 'aka-oni' && s.weaponId === 'kanabo', `開局不是赤鬼：${s.yokai}／${s.weaponId}`);
        await page.evaluate(() => { window.__game.god = true; window.__game.spawn('villager', 8); });
        const k = await page.evaluate(() => window.__game.run.kills);
        for (let i = 0; i < 24; i++) await page.evaluate(() => window.__game.advance(0.5));
        const k2 = await page.evaluate(() => window.__game.run.kills);
        expect(k2 > k, `金棒沒有打倒任何人（${k} → ${k2}）`);
        await clearPicks(page);
        await leaks(page, '戰鬥');
        files.push(await shot(ctx, 'o1-combat'));
      }, 60);

      await step(`${vp.name} 被人碰到 → 怒氣上升，HUD 資源條寫「怒氣」並亮起`, async () => {
        await clearPicks(page);
        await page.evaluate(() => { const g = window.__game; g.god = false; g.setHp(g.run.maxHp); g.spawn('villager', 12); });
        for (let i = 0; i < 40 && (await page.evaluate(() => window.__game.run.rage)) < 2; i++) {
          await page.evaluate(() => { const g = window.__game; g.advance(0.25); if (g.run.hp < 30) g.setHp(g.run.maxHp); });
          await clearPicks(page);
        }
        const rage = await page.evaluate(() => window.__game.run.rage);
        expect(rage >= 1, `被人碰到怒氣沒有上升：${rage}`);
        await page.evaluate(() => (window.__game.god = true));
        await page.waitForFunction(() => !document.querySelector('#res-box').classList.contains('hidden') && document.querySelectorAll('#res-pips i.on').length > 0, null, { timeout: 15000 });
        const lab = await page.locator('#res-label').innerText();
        expect(lab === '怒氣', `資源條標籤不對：${lab}`);
      }, 60);

      await step(`${vp.name} 升級選卡：技法卡是赤鬼的；沒有多重、碎裂、穿透`, async () => {
        await clearPicks(page);
        await page.evaluate(() => window.__game.techNext());
        for (let g = 0; g < 60 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(10));
        const cs = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => ({ id: c.dataset.card, t: c.innerText.replace(/\s+/g, ' ') })));
        const tech = cs.find((c) => c.id.startsWith('tech:'));
        expect(tech && ONI_TECHS.includes(tech.id.slice(5)), `技法卡不是赤鬼的：${JSON.stringify(cs)}`);
        expect(!cs.some((c) => ['volley', 'splash', 'pierce'].includes(c.id)), `赤鬼抽到揮擊沒用的卡：${JSON.stringify(cs.map((c) => c.id))}`);
        await leaks(page, '升級選卡');
        files.push(await shot(ctx, 'o1-pick'));
        await page.locator(`.overlay[data-screen="levelup"] .card[data-card="${tech.id}"]`).click();
        await clearPicks(page);
      }, 60);

      await step(`${vp.name} 能力面板：金棒、揮擊欄位、怒氣；沒有穿透與別人的字`, async () => {
        await clearPicks(page);
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const txt = await page.evaluate(() => document.querySelector('.overlay[data-screen="pause"]').innerText);
        for (const w of ['金棒', '揮擊半徑', '揮擊角度', '震波']) expect(txt.includes(w), `能力面板少了「${w}」`);
        expect(!/穿透|發射數|碎裂/.test(txt), `赤鬼的能力面板出現對揮擊沒用的欄位：${txt.match(/.{0,10}(穿透|發射數|碎裂).{0,6}/)?.[0]}`);
        await leaks(page, '能力');
        files.push(await shot(ctx, 'o1-pause'));
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });

      await step(`${vp.name} 鬼神化：量表滿了按大招鈕 → 受到的傷害減少`, async () => {
        await clearPicks(page);
        await page.evaluate(() => { window.__game.chargeUlt(); window.__game.advance(0.1); window.__game.render(); });
        await press(ctx, '#btn-ult');
        await page.evaluate(() => window.__game.advance(0.2));
        const guard = await page.evaluate(() => window.__game.run.frenzyGuard ?? 0);
        expect(guard > 0, `鬼神化沒有減傷：${guard}`);
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }

    const c2 = await openPage(browser, vp, '?q=4&seed=92');
    try {
      await waitState(c2.page, 'MENU');
      await press(c2, '#btn-shrine');
      await c2.page.waitForFunction(() => window.__game.screens.includes('shrine'), null, { timeout: 10000 });
      const rows = await c2.page.evaluate(() => [...document.querySelectorAll('.shrine-ult')].map((r) => ({ id: r.dataset.ult, y: r.dataset.yokai })));
      expect(['oniGod', 'kanaboQuake'].every((id) => rows.some((r) => r.id === id && r.y === 'aka-oni')), `神社沒有列出赤鬼的兩招：${JSON.stringify(rows)}`);
      files.push(await shot(c2, 'o1-shrine'));
      reportErrors(c2);
    } finally {
      await c2.close();
    }
  }
  return files;
}
