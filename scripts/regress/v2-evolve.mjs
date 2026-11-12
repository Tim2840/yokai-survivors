// v2：技法進化（D53）。兩個技法都練到 5 級 → 「可以進化」提示 → 合魂祠出現（箭頭指過去）→ 走過去按住 → 進化面板（只列進化）→ 真的點進化卡 →
// HUD「進化成功」→ 能力面板的「技法進化」列出已進化 → 少佔一格。另外：選卡畫面的技法卡帶詞條（條數看稀有度）、法具卡只寫會影響的現有招式。三種畫面，卡住偵測。
// 用開發介面 giveTech／techLevel 直接把技法練到 5 級（真的練要很久），其餘全是真實操作。
import { openPage, startRun, press, step, expect, shot, reportErrors, walkOnto, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'v2', desc: '技法進化：兩招 5 級→提示→合魂祠出現、箭頭→走過去按住→進化面板→點進化卡→HUD 進化成功→能力面板列出進化、少佔一格；技法卡帶詞條、不再有適合加成（三種畫面）', max: 240, stall: 60 };

const inViewOf = (vp) => (c) => c.r.x >= 0 && c.r.y >= 0 && c.r.x + c.r.w <= vp.width + 1 && c.r.y + c.r.h <= vp.height + 1;

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=71');
    const { page } = ctx;
    const inView = inViewOf(vp);
    try {
      await step(`${vp.name} 開局`, () => startRun(ctx), 40);
      await page.evaluate(() => (window.__game.god = true));
      const dismiss = async () => {
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
      };
      const cardsInfo = () => page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => {
        const r = c.getBoundingClientRect();
        return { id: c.dataset.card, rarity: c.dataset.rarity, aff: Number(c.querySelector('.caffix')?.dataset.affixes ?? 0), t: c.innerText.replace(/\s+/g, ' '), r: { x: r.x, y: r.y, w: r.width, h: r.height } };
      }));

      await step(`${vp.name} 選卡畫面：技法卡帶詞條（條數 = 稀有度）、沒有「適合 n/m」`, async () => {
        await page.evaluate(() => { window.__game.techNext(); });
        for (let g = 0; g < 60 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); g++) await page.evaluate(() => window.__game.addXp(10));
        const cs = await cardsInfo();
        const tech = cs.find((c) => c.id.startsWith('tech:'));
        expect(tech, `沒有技法卡：${JSON.stringify(cs.map((c) => c.t))}`);
        const want = { common: 2, rare: 2, epic: 3, legend: 3 }[tech.rarity];
        expect(tech.aff === want && /詞條（只對這個技法）：/.test(tech.t), `技法卡的詞條條數不對（${tech.rarity} 應該 ${want} 條）：${JSON.stringify(tech)}`);
        // 詞條只強化技法本身：不能出現最大生命、護甲這類全身的能力值（D74）
        const afx = tech.t.split('詞條（只對這個技法）：')[1] ?? '';
        expect(!/最大生命|護甲|再生|迴避|移動速度|拾取|幸運/.test(afx), `技法卡的詞條出現了全身的能力值：${tech.t}`);
        // D77：統一名稱（和能力值同一組字）；舊的「威力／頻率」不能再出現
        expect(/(攻擊力|範圍|攻擊速度|連鎖|暴擊率|暴擊傷害|持續時間) \+\d+%|數量 \+\d/.test(afx) && !/威力|頻率/.test(tech.t), `技法卡的詞條格式或名稱不對：${tech.t}`);
        expect(!/適合 \d\/\d|效果 \+\d+%/.test(tech.t), `技法卡還有適合加成：${tech.t}`);
        files.push(await shot(ctx, 'v2-fit'));
        await page.locator(`.overlay[data-screen="levelup"] .card[data-card="${tech.id}"]`).click();
        await dismiss();
      }, 60);

      await step(`${vp.name} 鬼火與一個技法都練到 5 級：HUD 提示「材料齊了」、合魂祠出現、箭頭指過去`, async () => {
        await page.evaluate(() => {
          const g = window.__game;
          g.giveTech('ring');
          g.techLevel('ring', 5);
          g.techLevel('ghostfire', 5);
          g.advance(0.1);
          g.render();
        });
        const ev = await page.evaluate(() => window.__game.run.evolvable);
        expect(ev.includes('evoRing'), `沒有可以進化的：${JSON.stringify(ev)}`);
        const box = await page.locator('#synergy-box').innerText();
        expect(/材料齊了/.test(box) && /百鬼環/.test(box), `HUD 沒有「材料齊了」提示：${box}`);
        for (let i = 0; i < 40 && !(await page.evaluate(() => window.__game.run.fuseSlot)); i++) {
          await page.evaluate(() => window.__game.advance(0.25));
          await dismiss();
        }
        const f = await page.evaluate(() => window.__game.run.fuseSlot);
        expect(f, `合魂祠沒有出現（${vp.name}）`);
        for (let i = 0; i < 24 && (await page.evaluate(() => window.__game.run.fuseSlot.announce)) > 0; i++) await page.evaluate(() => window.__game.advance(0.25));
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
        expect(await page.locator('#portal-box').isVisible() && /合魂祠/.test(await page.locator('#portal-text').innerText()), `沒有指向合魂祠的箭頭`);
        await hudTopOk(ctx, '・合魂祠提示');
        files.push(await shot(ctx, 'v2-shrine'));
      }, 90);

      await step(`${vp.name} 走過去按住 → 進化面板只列進化 → 點進化卡 → 進化成功`, async () => {
        const spot = await page.evaluate(() => window.__game.run.fuseSlot);
        for (let tries = 0; tries < 3 && !(await walkOnto(ctx, spot.x, spot.z)); tries++) await dismiss();
        const open = async () => (await page.evaluate(() => window.__game.screens)).includes('levelup') && (await page.locator('#lv-title').innerText()).includes('合魂祠');
        for (let i = 0; i < 24 && !(await open()); i++) {
          await dismiss();
          const r = await page.evaluate(() => window.__game.run);
          if (Math.hypot(r.px - spot.x, r.pz - spot.z) > 1.2) await walkOnto(ctx, spot.x, spot.z);
          await page.evaluate(() => window.__game.advance(0.25));
        }
        await page.evaluate(() => window.__game.render());
        expect(await open(), `按住合魂祠沒有開進化面板`);
        const cs = await cardsInfo();
        expect(cs.length === 1 && cs[0].id === 'evo:evoRing' && /進化/.test(cs[0].t) && /燈籠環 Lv5/.test(cs[0].t) && /鬼火 Lv5/.test(cs[0].t), `進化卡不對：${JSON.stringify(cs)}`);
        for (const c of cs) expect(inView(c), `進化卡超出畫面（${vp.name}）：${JSON.stringify(c.r)}`);
        files.push(await shot(ctx, 'v2-pick'));
        const used0 = await page.evaluate(() => window.__game.run.techs.length);
        await press(ctx, '.overlay[data-screen="levelup"] .card[data-card="evo:evoRing"]');
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        const r = await page.evaluate(() => window.__game.run);
        expect(r.evolved.includes('evoRing'), `沒有進化：${JSON.stringify(r.evolved)}`);
        expect(used0 === r.techs.length, '進化後技法都還在（有鬼火的不省格）');
        await page.evaluate(() => { window.__game.advance(0.1); window.__game.render(); });
        const box = await page.locator('#synergy-box').innerText();
        expect(/進化成功/.test(box) && /百鬼環/.test(box), `HUD 沒有寫進化成功：${box}`);
        for (let i = 0; i < 6; i++) await page.evaluate(() => window.__game.advance(0.5));
        expect(!(await page.evaluate(() => window.__game.run.fuseSlot)), '進化後合魂祠還在');
      }, 90);

      await step(`${vp.name} 「能力」面板：技法進化列出已進化、技法列出適合的法具`, async () => {
        await dismiss();
        await page.evaluate(() => window.__game.techLevel('ring', 7)); // 進化形態 7 級（D79：只顯示等級，沒有專屬強化）
        await press(ctx, '#btn-abilities');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const evo = await page.evaluate(() => [...document.querySelectorAll('#sum-evo li')].map((li) => ({ id: li.dataset.evo, done: li.classList.contains('fused'), t: li.innerText.replace(/\s+/g, ' ') })));
        expect(evo.some((e) => e.id === 'evoRing' && e.done && /燈籠環 Lv5\/5/.test(e.t)), `能力面板沒列出已進化：${JSON.stringify(evo)}`);
        const form = await page.evaluate(() => {
          const el = document.querySelector('#sum-evo li[data-evo="evoRing"] .evo-form');
          return el ? { lv: el.dataset.formLevel, items: [...el.querySelectorAll('i')].map((i) => ({ ok: i.classList.contains('ok'), t: i.innerText })) } : null;
        });
        expect(form && form.lv === '7' && form.items.length === 1 && form.items[0].ok && /進化形態 Lv7\/8/.test(form.items[0].t), `進化形態的等級列不對（D79 起只有等級）：${JSON.stringify(form)}`);
        const txt = await page.locator('#sum-cards li[data-card="ghostfire"]').innerText();
        expect(/技法 燈籠環 Lv7：適合 .+/.test(txt) && /技法 鬼火 Lv\d：適合 .+/.test(txt), `技法列沒寫出適合的法具（詳細在暫停頁）：${txt}`);
        // 提燈小僧的畫面不准出現河童的字（新角色加進來之後最容易漏的是共用畫面）
        const body = await page.evaluate(() => document.body.innerText);
        const foreign = ['水盤', '河童', '激流盤', '水花', '渦盤', '水衣', '水坑', '間歇泉', '雨乞', '大波', '回潮', '渦流', '相撲', '滑水', '水域', '水牢'].filter((w) => body.includes(w));
        expect(foreign.length === 0, `提燈小僧的能力面板出現別的角色的字：${foreign.join('、')}`);
        files.push(await shot(ctx, 'v2-pause'));
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
