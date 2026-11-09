// y1：河童（M2-3 順序 2）。選妖怪畫面點河童（選取、顯示大招）→ 開局是河童（水盤、河童的技法池）→ 水盤真的飛出去打到人 →
// 雨乞（回血）→ 鬼火換成水盤的選卡 → 水盤與一個技法 5 級 → 進化 → 神社列出河童的兩招大招。三種畫面，卡住偵測。
import { openPage, waitState, press, step, expect, shot, reportErrors, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'y1', desc: '河童：選角點河童→開局是河童（水盤）→打到人→雨乞回血→選卡是水盤與河童的技法→進化→神社列出兩招大招（三種畫面）', max: 200, stall: 60 };

/** 河童的畫面不准出現提燈小僧的專屬字（D64 之後的自我審查：新角色最容易漏的是共用畫面裡殘留的別人的字） */
const FOREIGN = ['鬼火', '狐火', '燈籠', '提燈', '燃燒', '燈油', '衛星燈', '業火', '火種', '燈火'];
async function leaks(page, where) {
  const text = await page.evaluate(() => document.body.innerText.replace(/魂火/g, ''));
  const hit = FOREIGN.filter((w) => text.includes(w));
  expect(hit.length === 0, `河童的「${where}」畫面出現別的角色的字：${hit.join('、')}`);
}

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=81');
    const { page } = ctx;
    try {
      await step(`${vp.name} 選妖怪畫面點河童`, async () => {
        await waitState(page, 'MENU');
        await press(ctx, '#btn-start');
        await page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
        await press(ctx, '.yokai-card[data-yokai="kappa"]');
        const sel = await page.evaluate(() => [...document.querySelectorAll('.yokai-card')].map((c) => ({ id: c.dataset.yokai, selected: c.classList.contains('selected'), locked: c.classList.contains('locked') })));
        expect(sel.find((c) => c.id === 'kappa')?.selected === true && sel.find((c) => c.id === 'kappa')?.locked === false, `河童沒有被選中或還鎖著：${JSON.stringify(sel)}`);
        expect(sel.find((c) => c.id === 'chochin-kozo')?.selected === false, '提燈小僧還是選中的');
        const line = await page.locator('#setup-ult').innerText();
        expect(/雨乞/.test(line), `選妖怪畫面沒寫河童的大招：${line}`);
        files.push(await shot(ctx, 'y1-setup'));
        await press(ctx, '#btn-setup-go');
        await waitState(page, 'COMBAT');
      }, 40);

      await step(`${vp.name} 開局是河童：水盤、河童的技法池`, async () => {
        const s = await page.evaluate(() => window.__game.run);
        expect(s.yokai === 'kappa' && s.weaponId === 'waterdisc', `開局不是河童：${s.yokai}／${s.weaponId}`);
        await page.evaluate(() => (window.__game.god = true));
      });

      await step(`${vp.name} 水盤飛出去、來回打到人`, async () => {
        await page.evaluate(() => { window.__game.spawn('villager', 6); window.__game.advance(2.5); window.__game.render(); });
        const k = await page.evaluate(() => window.__game.run.kills);
        for (let i = 0; i < 20; i++) await page.evaluate(() => { window.__game.advance(0.5); });
        const k2 = await page.evaluate(() => window.__game.run.kills);
        expect(k2 > k, `水盤沒有打倒任何人（${k} → ${k2}）`);
        await page.evaluate(() => window.__game.render());
        await leaks(page, '戰鬥');
        files.push(await shot(ctx, 'y1-combat'));
      }, 60);

      await step(`${vp.name} 雨乞：量表滿了按大招 → 回血`, async () => {
        await page.evaluate(() => { window.__game.god = false; window.__game.setHp(20); window.__game.chargeUlt(); window.__game.advance(0.1); window.__game.render(); });
        const hp0 = await page.evaluate(() => window.__game.run.hp);
        await press(ctx, '#btn-ult');
        await page.evaluate(() => window.__game.advance(0.3));
        const hp1 = await page.evaluate(() => window.__game.run.hp);
        expect(hp1 > hp0 + 10, `雨乞沒有回血（${hp0} → ${hp1}）`);
        await page.evaluate(() => (window.__game.god = true));
      });

      await step(`${vp.name} 升級選卡：主武器是水盤、技法卡是河童的`, async () => {
        await page.evaluate(() => { window.__game.techNext(); });
        for (let g = 0; g < 60 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(10));
        const cs = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => ({ id: c.dataset.card, t: c.innerText.replace(/\s+/g, ' ') })));
        const tech = cs.find((c) => c.id.startsWith('tech:'));
        expect(tech && ['torrent', 'splash', 'whirl', 'veil', 'pond', 'geyser'].includes(tech.id.slice(5)), `技法卡不是河童的：${JSON.stringify(cs)}`);
        expect(!cs.some((c) => /鬼火/.test(c.t) && c.id === 'ghostfire'), '河童的選卡出現了鬼火');
        await leaks(page, '升級選卡');
        files.push(await shot(ctx, 'y1-pick'));
        await page.locator(`.overlay[data-screen="levelup"] .card[data-card="${tech.id}"]`).click();
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      }, 60);

      await step(`${vp.name} 水盤與渦盤都 5 級 → 能進化 → 進化成功`, async () => {
        await page.evaluate(() => {
          const g = window.__game;
          g.giveTech('whirl');
          g.techLevel('whirl', 5);
          g.techLevel('waterdisc', 5);
          g.advance(0.1);
          g.render();
        });
        const ev = await page.evaluate(() => window.__game.run.evolvable);
        expect(ev.includes('evoWhirl'), `沒有可以進化的：${JSON.stringify(ev)}`);
        const box = await page.locator('#synergy-box').innerText();
        expect(/材料齊了/.test(box) && /渦潮陣/.test(box), `HUD 沒有「材料齊了」：${box}`);
        await leaks(page, '可以進化');
        files.push(await shot(ctx, 'y1-evolve'));
      });

      await step(`${vp.name} 「能力」面板：河童的主武器、技法、進化、大招都是河童的字`, async () => {
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        await leaks(page, '能力');
        // 水盤本來就來回穿透：能力面板不該出現「穿透」（欄位、適合的法具都不列）
        const paneText = await page.evaluate(() => document.querySelector('.overlay[data-screen="pause"]').innerText);
        expect(!/穿透/.test(paneText), `河童的能力面板出現對水盤沒用的「穿透」：${paneText.match(/.{0,12}穿透.{0,8}/)?.[0]}`);
        const head = await page.locator('.weapon-head').innerText();
        expect(/水盤/.test(head), `能力面板的主武器標題不是水盤：${head}`);
        files.push(await shot(ctx, 'y1-pause'));
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }

    // 神社：河童的兩招大招
    const c2 = await openPage(browser, vp, '?q=4&seed=82');
    try {
      await waitState(c2.page, 'MENU');
      await press(c2, '#btn-shrine');
      await c2.page.waitForFunction(() => window.__game.screens.includes('shrine'), null, { timeout: 10000 });
      const rows = await c2.page.evaluate(() => [...document.querySelectorAll('.shrine-ult')].map((r) => ({ id: r.dataset.ult, y: r.dataset.yokai })));
      expect(['rainPrayer', 'tidalWave'].every((id) => rows.some((r) => r.id === id && r.y === 'kappa')), `神社沒有列出河童的兩招：${JSON.stringify(rows)}`);
      // 神社列出所有妖怪的大招，本來就會看到別人的字，不掃
      files.push(await shot(c2, 'y1-shrine'));
      reportErrors(c2);
    } finally {
      await c2.close();
    }
  }
  return files;
}
