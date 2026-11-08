// e1：地圖要素（M2-1）。真的走進去、按住不動：石地藏（護甲）、詛咒祭壇（一升一降）、結界石（圈內加成、走出去消失）。
// D36：集滿後跳結果卡（模擬停住、列出拿到什麼、防誤觸、真的點「繼續」或按 Enter；同時升級時先結果卡再選卡）。
// 要素用開發介面放到玩家身邊（隨機落下的位置不固定），其餘（走路、HUD 提示、效果）全用真實輸入與畫面。三種畫面各一次，卡住偵測。
import { openPage, startRun, step, expect, shot, reportErrors, snapshotOf, walkOnto, hudTopOk, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'e1', desc: '地圖要素：走近→提示→按住→結果卡（停住、列出拿到什麼、防誤觸、點繼續）→效果（石地藏、詛咒祭壇、結界石、賽錢箱、寶箱、神籤、百鬼試煉碑、狐面商走進紅圈收下）三種畫面', max: 600, stall: 60 };

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
        for (let i = 0; i < 40 && (await page.evaluate(() => window.__game.screens)).includes('levelup'); i++) {
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
      const screens = () => page.evaluate(() => window.__game.screens);
      /** 等結果卡出現（按住集滿後）：回傳卡上的標題與每一行 */
      const waitResult = async (label) => {
        for (let i = 0; i < 16 && !(await screens()).includes('result'); i++) await page.evaluate(() => window.__game.advance(0.25));
        expect((await screens()).includes('result'), `${label}集滿後沒有結果卡（${vp.name}）`);
        await page.evaluate(() => window.__game.render());
        const card = await page.evaluate(() => {
          const o = document.querySelector('.overlay[data-screen="result"]');
          const p = o.querySelector('.panel').getBoundingClientRect();
          return { title: o.querySelector('h2').textContent, lines: [...o.querySelectorAll('li')].map((li) => ({ t: li.dataset.line, text: li.textContent, cls: li.className })), box: { x: p.x, y: p.y, w: p.width, h: p.height } };
        });
        const b = card.box;
        expect(b.x >= 0 && b.y >= 0 && b.x + b.w <= vp.width + 1 && b.y + b.h <= vp.height + 1, `結果卡超出畫面（${vp.name}）：${JSON.stringify(b)}`);
        // 模擬停住：時間不走
        const t0 = await page.evaluate(() => window.__game.run.time);
        await page.evaluate(() => window.__game.advance(1));
        expect((await page.evaluate(() => window.__game.run.time)) === t0, `結果卡開著時模擬沒停（${vp.name}）`);
        return card;
      };
      /** 真的關掉結果卡：桌面按 Enter，觸控點「繼續」 */
      const closeResult = async () => {
        await page.waitForFunction(() => !document.querySelector('#btn-result-ok').disabled, null, { timeout: 5000 });
        if (!vp.hasTouch) await page.keyboard.press('Enter');
        else await page.locator('#btn-result-ok').click();
        await page.waitForFunction(() => !window.__game.screens.includes('result'), null, { timeout: 5000 });
      };

      const leave = async (spot) => {
        await page.evaluate(([x, z]) => window.__game.teleport(x + 14, z), [spot.x, spot.z]);
        await page.evaluate(() => window.__game.advance(0.3));
      };

      await step(`${vp.name} 石地藏：走近出現提示、按住 1 秒 → 護甲 +3（良階）`, async () => {
        const s0 = await stats();
        const spot = await approach('jizo', 'rare');
        await page.evaluate(() => { window.__game.advance(0.4); window.__game.render(); });
        expect(await page.locator('#element-box').isVisible(), `走近了但沒有要素提示（${vp.name}）`);
        const title = await page.locator('#element-title').innerText();
        expect(title === '良・石地藏', `提示標題不對：${title}`);
        const fill = await page.locator('#element-fill').evaluate((n) => parseFloat(n.style.width));
        expect(fill > 5 && fill < 100, `按住途中進度條應該在中間：${fill}`);
        files.push(await shot(ctx, 'e1-jizo'));
        const card = await waitResult('石地藏');
        expect(card.title === '良・石地藏', `結果卡標題不對：${card.title}`);
        expect(card.lines.some((l) => /^回復 \d+ 生命$/.test(l.text)) && card.lines.some((l) => l.text === '護甲 +3（60 秒）'), `結果卡內容不對：${JSON.stringify(card.lines)}`);
        files.push(await shot(ctx, 'e1-result'));
        // 同時升級：結果卡開著時加魂火 → 不能蓋上選卡面板；關掉結果卡後才出現選卡
        await page.evaluate(() => window.__game.addXp(20));
        expect(!(await screens()).includes('levelup'), `結果卡還開著就跳出選卡面板（${vp.name}）`);
        await closeResult();
        expect((await screens()).includes('levelup'), `關掉結果卡後沒有接著選卡（${vp.name}）`);
        await dismiss();
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
        expect(info.effects.length === 3, `珍階祭壇應該抽 3 個效果：${JSON.stringify(info.effects)}`);
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        const desc = await page.locator('#element-desc').innerText();
        const shown = desc.split('\n').filter(Boolean).length;
        expect(shown === 3, `祭壇說明應該列出 3 個效果：${desc}`);
        expect(/敵人/.test(desc), `說明裡沒有詛咒（敵人變強）：${desc}`);
        files.push(await shot(ctx, 'e1-altar'));
        const card = await waitResult('詛咒祭壇');
        expect(card.lines.length === 3, `結果卡應列出 3 個效果：${JSON.stringify(card.lines)}`);
        expect(card.lines.some((l) => l.t === 'curse' && /bad/.test(l.cls) && /敵人/.test(l.text)), `結果卡沒標出詛咒：${JSON.stringify(card.lines)}`);
        expect(card.lines.some((l) => l.t === 'stat' && /good/.test(l.cls)), `結果卡沒標出好處：${JSON.stringify(card.lines)}`);
        await closeResult();
        await dismiss();
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
        // 能力值 =（基礎 + 加算）×（1 + 百分比總和）：結界的 +32% 是加進百分比總和，所以攻擊力（基礎 1）多 0.32；前面的祭壇可能已經給過攻擊力，不能假設 s0 = 1
        expect(Math.abs(s1.power - s0.power - 0.32) < 1e-6, `結界圈內攻擊力不對：${s0.power} → ${s1.power}（應該多 0.32）`);
        await leave(spot);
        const s2 = await stats();
        expect(Math.abs(s2.power - s0.power) < 1e-6, `走出圈外攻擊力沒恢復：${s2.power}`);
      });

      await step(`${vp.name} 賽錢箱：按住 → 扣生命 → 三選一面板（標題不同）→ 真的點卡 → 繼續`, async () => {
        const hp0 = (await page.evaluate(() => window.__game.run)).hp;
        const spot = await approach('offering', 'rare');
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        const desc = await page.locator('#element-desc').innerText();
        expect(/20%/.test(desc), `賽錢箱說明沒寫出代價 20%：${desc}`);
        for (let i = 0; i < 12 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); i++) await page.evaluate(() => window.__game.advance(0.25));
        expect((await page.evaluate(() => window.__game.screens)).includes('levelup'), `按住賽錢箱後沒有開選卡面板（${vp.name}）`);
        const title = await page.locator('.overlay[data-screen="levelup"] h2').innerText();
        expect(/賽錢箱/.test(title), `面板標題不對：${title}`);
        // D53：每一次升級卡都有稀有度（主武器、多重、穿透、備用獎勵也算）：良階賽錢箱的三張卡全部是珍階
        const rar = await page.evaluate(() => [...document.querySelectorAll('.overlay[data-screen="levelup"] .card')].map((c) => [c.dataset.card, c.dataset.rarity]));
        expect(rar.length === 3 && rar.every(([, r]) => r === 'epic'), `良階賽錢箱應給三張珍階卡：${JSON.stringify(rar)}`);
        const r1 = await page.evaluate(() => window.__game.run);
        expect(r1.hp < hp0, `賽錢箱沒扣生命：${hp0} → ${r1.hp}`);
        await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        await leave(spot);
      });

      await step(`${vp.name} 寶箱：按住 → 免費三選一`, async () => {
        const hp0 = (await page.evaluate(() => window.__game.run)).hp;
        const spot = await approach('chest', 'epic');
        for (let i = 0; i < 12 && !(await page.evaluate(() => window.__game.screens)).includes('levelup'); i++) await page.evaluate(() => window.__game.advance(0.25));
        expect((await page.evaluate(() => window.__game.screens)).includes('levelup'), `按住寶箱後沒有開選卡面板（${vp.name}）`);
        const title = await page.locator('.overlay[data-screen="levelup"] h2').innerText();
        expect(/寶箱/.test(title), `面板標題不對：${title}`);
        await page.locator('.overlay[data-screen="levelup"] .card').nth(1).click();
        await page.waitForFunction(() => !window.__game.screens.includes('levelup'), null, { timeout: 5000 });
        const r1 = await page.evaluate(() => window.__game.run);
        expect(r1.hp >= hp0 - 1, `寶箱不該扣生命：${hp0} → ${r1.hp}`);
        await leave(spot);
      });

      await step(`${vp.name} 神籤：按住 → 結果卡寫出籤名與效果`, async () => {
        const spot = await approach('omikuji', 'epic');
        const card = await waitResult('神籤');
        expect(card.title === '珍・神籤', `結果卡標題不對：${card.title}`);
        expect(card.lines[0].t === 'omikuji' && /大吉|中吉|小吉|末吉|凶/.test(card.lines[0].text), `神籤結果文字不對：${JSON.stringify(card.lines)}`);
        files.push(await shot(ctx, 'e1-omikuji'));
        await closeResult();
        await dismiss();
        await leave(spot);
      });

      await step(`${vp.name} 狐面商：走近 → 提示寫出紅圈、藍圈兩個提案 → 真的走進紅圈站 1 秒 → 結果卡寫出拿到的取捨道具`, async () => {
        const spot = await page.evaluate(() => window.__game.forceElement('fox', 'rare'));
        expect(spot, `放不下狐面商（${vp.name}）`);
        // 自然落下的狐面商也可能在場：只看剛剛強制放的那一個（離 spot 最近的）
        const fox = (await el()).filter((e) => e.kind === 'fox').sort((p, q) => Math.hypot(p.x - spot.x, p.z - spot.z) - Math.hypot(q.x - spot.x, q.z - spot.z))[0];
        expect(fox && fox.offers.length === 2 && fox.rings.length === 2, `狐面商的提案或圈不對：${JSON.stringify(fox)}`);
        // 先站到商人旁邊看提示
        await page.evaluate(([x, z]) => { window.__game.teleport(x + 0.5, z); window.__game.advance(0.2); window.__game.render(); }, [spot.x, spot.z]);
        expect(await page.locator('#element-box').isVisible(), `走近狐面商沒有提示（${vp.name}）`);
        const title = await page.locator('#element-title').innerText();
        expect(title === '良・狐面商', `提示標題不對：${title}`);
        const desc = await page.locator('#element-desc').innerText();
        expect(/紅圈：.+，但.+/.test(desc) && /藍圈：.+，但.+/.test(desc), `提示沒寫出兩個提案與代價：${desc}`);
        files.push(await shot(ctx, 'e1-fox'));
        // 用真實輸入走進紅圈
        const r0 = fox.rings[0];
        const before = await page.evaluate((id) => window.__game.run.ult.counts[id] ?? 0, fox.offers[0]);
        let arrived = false;
        for (let tries = 0; tries < 3 && !arrived; tries++) {
          arrived = await walkOnto(ctx, r0.x, r0.z);
          await dismiss();
        }
        expect(arrived, `走不進紅圈（${vp.name}）`);
        const card = await waitResult('狐面商');
        expect(card.title === '良・狐面商', `結果卡標題不對：${card.title}`);
        expect(card.lines.length === 1 && card.lines[0].t === 'item' && /Lv\d：.+，但.+/.test(card.lines[0].text), `結果卡沒寫出拿到的道具：${JSON.stringify(card.lines)}`);
        files.push(await shot(ctx, 'e1-fox-result'));
        await closeResult();
        await dismiss();
        const after = await page.evaluate((id) => window.__game.run.ult.counts[id] ?? 0, fox.offers[0]);
        expect(after === before + 1, `紅圈的道具沒有升一級：${before} → ${after}`);
        await leave(spot);
      }, 60);

      // 試煉要跑 30 秒、期間升級選卡會把道具欄填滿，所以放在狐面商（要有空欄位）之後
      await step(`${vp.name} 百鬼試煉碑：走近 → 提示寫出三段門檻與寶箱 → 按住啟動 → HUD 倒數與打倒數 → 放大招打倒的算進去 → 時間到結果卡寫出成績與寶箱`, async () => {
        const spot = await approach('trial', 'rare');
        await page.evaluate(() => { window.__game.advance(0.2); window.__game.render(); });
        const title = await page.locator('#element-title').innerText();
        expect(title === '良・百鬼試煉碑', `提示標題不對：${title}`);
        const desc = await page.locator('#element-desc').innerText();
        const m = /打倒 (\d+)／(\d+)／(\d+) 隻/.exec(desc);
        expect(/按住開始/.test(desc) && m && +m[1] < +m[2] && +m[2] < +m[3] && +m[1] >= 75, `提示沒寫出門檻（良階碑第 1 段至少 75 隻）：${desc}`);
        const need0 = +m[1];
        for (let i = 0; i < 12 && !(await page.evaluate(() => window.__game.run.trial.active)); i++) await page.evaluate(() => window.__game.advance(0.25));
        expect(await page.evaluate(() => window.__game.run.trial.active), `按住之後試煉沒有開始（${vp.name}）`);
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        expect(await page.locator('#trial-box').isVisible(), `試煉中沒有 HUD 倒數（${vp.name}）`);
        const box0 = await page.locator('#trial-box').innerText();
        const mb = /^試煉 \d+／(\d+)・剩 \d+ 秒$/.exec(box0);
        expect(mb && +mb[1] >= need0 && +mb[1] <= need0 + 3, `HUD 文字不對（第 1 段約 ${need0}）：${box0}`);
        await hudTopOk(ctx, '・試煉中');
        files.push(await shot(ctx, 'e1-trial'));
        // 圈內放人、放大招打倒 → 數字增加
        await page.evaluate(() => { window.__game.spawn('villager', 10); window.__game.chargeUlt(); window.__game.advance(0.1); });
        if (!vp.hasTouch) await page.keyboard.press('KeyF');
        else await page.locator('#btn-ult').click();
        await page.evaluate(() => { window.__game.advance(0.3); window.__game.render(); });
        const k = await page.evaluate(() => window.__game.run.trial.kills);
        expect(k > 0, `打倒的人類沒有算進試煉：${k}`);
        const box1 = await page.locator('#trial-box').innerText();
        expect(new RegExp(`^試煉 ${k}／`).test(box1), `HUD 沒跟著更新：${box1}（kills ${k}）`);
        // 跑到時間結束
        for (let i = 0; i < 40 && !(await screens()).includes('result'); i++) {
          await page.evaluate(() => window.__game.advance(1));
          await dismiss();
        }
        const card = await waitResult('試煉碑');
        expect(card.title === '良・百鬼試煉碑', `結果卡標題不對：${card.title}`);
        expect(card.lines[0].t === 'trial' && /打倒 \d+ 隻/.test(card.lines[0].text) && /寶箱|什麼都沒有/.test(card.lines[0].text), `試煉結果文字不對：${JSON.stringify(card.lines)}`);
        files.push(await shot(ctx, 'e1-trial-result'));
        await closeResult();
        await dismiss();
        expect(!(await page.locator('#trial-box').isVisible()), `試煉結束 HUD 還在（${vp.name}）`);
        await leave(spot);
      }, 90);

      await step(`${vp.name} 結果卡防誤觸：剛出現的 0.4 秒內點「繼續」不會關`, async () => {
        const spot = await page.evaluate(() => window.__game.forceElement('jizo', 'common'));
        await page.evaluate(([x, z]) => window.__game.teleport(x, z), [spot.x, spot.z]);
        // 同一個 evaluate 裡：快進到結果卡出現，馬上點（不經過頁面的空檔）
        const r = await page.evaluate(() => {
          const g = window.__game;
          for (let i = 0; i < 80 && !g.screens.includes('result'); i++) g.advance(0.05);
          const opened = g.screens.includes('result');
          document.querySelector('#btn-result-ok').click();
          return { opened, still: g.screens.includes('result') };
        });
        expect(r.opened, `站上石地藏沒有結果卡（${vp.name}）`);
        expect(r.still, `剛出現就被點掉了（防誤觸沒作用，${vp.name}）`);
        await closeResult();
        await dismiss();
        await leave(spot);
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
