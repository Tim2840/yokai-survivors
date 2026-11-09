// c1：自由視角鏡頭（D23）。用真實的滑鼠拖曳／觸控拖曳／Q、E 鍵轉視角：方向對、俯仰夾住、不會因為轉視角而移動玩家；
// 被暫停面板擋住時不轉；觸控只有螢幕右側（搖桿以外）才轉；鏡頭在地圖上各種位置與角度都不穿進地形（全掃，用 __game.settle() 不畫圖，快）。
import { openPage, startRun, press, step, expect, shot, reportErrors, mouseDrag, touchDrag, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'c1', desc: '自由視角：拖曳／觸控／Q E 轉視角、俯仰夾住、暫停時不轉、鏡頭不穿地（三種畫面）', max: 600, stall: 120 };

export async function run(browser) {
  const files = [];
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=8');
    const { page } = ctx;
    try {
      await startRun(ctx);
      await page.evaluate(() => { window.__game.god = true; window.__game.render(); });
      const cam = () => page.evaluate(() => window.__game.camera);
      const pos = () => page.evaluate(() => ({ x: window.__game.run.px, z: window.__game.run.pz }));
      const cx = vp.width * 0.7, cy = vp.height * 0.5;

      await step(`${vp.name} 開局鏡頭在預設方向、在玩家後上方`, async () => {
        const c = await cam();
        expect(Math.abs(c.yaw) < 1e-6, `開局 yaw 不是 0：${c.yaw}`);
        expect(c.y > c.groundY + 3, `鏡頭沒有在玩家上方：${JSON.stringify(c)}`);
      });

      if (!vp.hasTouch) {
        await step(`${vp.name} 滑鼠向左拖 → 視角往左轉（yaw 增加）；向右拖 → 往右轉；玩家不動`, async () => {
          const p0 = await pos();
          const y0 = (await cam()).yaw;
          await mouseDrag(page, { x: cx, y: cy }, { x: cx - 120, y: cy });
          await page.evaluate(() => window.__game.settle());
          const y1 = (await cam()).yaw;
          expect(y1 > y0 + 0.3, `向左拖，yaw 應該增加：${y0} → ${y1}`);
          await mouseDrag(page, { x: cx, y: cy }, { x: cx + 240, y: cy });
          await page.evaluate(() => window.__game.settle());
          const y2 = (await cam()).yaw;
          expect(y2 < y1 - 0.6, `向右拖，yaw 應該減少：${y1} → ${y2}`);
          const p1 = await pos();
          expect(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 1e-6, `轉視角時玩家移動了`);
        });
        await step(`${vp.name} 右鍵拖曳也能轉`, async () => {
          const y0 = (await cam()).yaw;
          await page.mouse.move(cx, cy);
          await page.mouse.down({ button: 'right' });
          await page.mouse.move(cx - 100, cy, { steps: 5 });
          await page.mouse.up({ button: 'right' });
          await page.evaluate(() => window.__game.settle());
          expect((await cam()).yaw > y0 + 0.25, '右鍵拖曳沒有轉視角');
        });
        await step(`${vp.name} Q／E 鍵轉視角`, async () => {
          const y0 = (await cam()).yaw;
          await page.keyboard.down('KeyQ');
          await page.evaluate(() => window.__game.settle());
          await page.keyboard.up('KeyQ');
          const y1 = (await cam()).yaw;
          expect(y1 !== y0, 'Q 鍵沒有轉視角');
          await page.keyboard.down('KeyE');
          await page.evaluate(() => window.__game.settle());
          await page.keyboard.up('KeyE');
          expect((await cam()).yaw !== y1, 'E 鍵沒有轉視角');
        });
      } else {
        await step(`${vp.name} 觸控：從右半邊拖曳會轉；從左邊（搖桿區）拖曳不轉`, async () => {
          const y0 = (await cam()).yaw;
          await touchDrag(page, { x: vp.width * 0.8, y: vp.height * 0.4 }, { x: vp.width * 0.8 - 90, y: vp.height * 0.4 });
          await page.evaluate(() => window.__game.settle());
          const y1 = (await cam()).yaw;
          expect(y1 > y0 + 0.3, `觸控向左拖，yaw 應該增加：${y0} → ${y1}`);
          await touchDrag(page, { x: vp.width * 0.1, y: vp.height * 0.3 }, { x: vp.width * 0.1 + 80, y: vp.height * 0.3 });
          await page.evaluate(() => window.__game.settle());
          const y2 = (await cam()).yaw;
          expect(Math.abs(y2 - y1) < 1e-6, `從左邊（搖桿區）拖曳不該轉視角：${y1} → ${y2}`);
        });
      }

      await step(`${vp.name} 俯仰夾在 8°～75°`, async () => {
        // 觸控起點避開右下的跳躍鈕（手指按在按鈕上是跳躍，不是轉視角）
        const down = vp.hasTouch ? () => touchDrag(page, { x: vp.width * 0.55, y: vp.height * 0.2 }, { x: vp.width * 0.55, y: vp.height * 0.9 }, 8) : () => mouseDrag(page, { x: cx, y: cy * 0.4 }, { x: cx, y: vp.height - 5 }, 8);
        const up = vp.hasTouch ? () => touchDrag(page, { x: vp.width * 0.55, y: vp.height * 0.9 }, { x: vp.width * 0.55, y: vp.height * 0.1 }, 8) : () => mouseDrag(page, { x: cx, y: vp.height - 5 }, { x: cx, y: 3 }, 8);
        // 拖曳很慢（無頭瀏覽器），途中可能升級（選卡面板開著時拖曳不算，這是對的）：像玩家一樣先選完卡再拖
        const clearPick = async () => {
          while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        };
        for (let i = 0; i < 6; i++) {
          await clearPick();
          await down();
        }
        await page.evaluate(() => window.__game.settle());
        const hi = (await cam()).pitch;
        expect(Math.abs(hi - (75 * Math.PI) / 180) < 1e-6, `向下拖到底，俯角應該是 75°：${(hi * 180) / Math.PI}`);
        for (let i = 0; i < 12; i++) {
          await clearPick();
          await up();
        }
        await page.evaluate(() => window.__game.settle());
        const lo = (await cam()).pitch;
        expect(Math.abs(lo - (8 * Math.PI) / 180) < 1e-6, `向上拖到底，俯角應該是 8°：${(lo * 180) / Math.PI}`);
      }, 75); // 18 次拖曳、每次 8 步：無頭瀏覽器在日系風格（多一道後製）下要 30～45 秒

      await step(`${vp.name} 暫停面板開著時，拖曳不轉視角`, async () => {
        // 這一路上可能剛好升級（模擬暫停、選卡面板蓋住 HUD）：像玩家一樣先選完卡
        while ((await page.evaluate(() => window.__game.screens)).includes('levelup')) await page.locator('.overlay[data-screen="levelup"] .card').first().click();
        await press(ctx, '#btn-pause');
        await page.waitForFunction(() => window.__game.screens.includes('pause'));
        const y0 = (await cam()).yaw;
        if (vp.hasTouch) await touchDrag(page, { x: vp.width * 0.6, y: vp.height * 0.4 }, { x: vp.width * 0.6 - 90, y: vp.height * 0.4 });
        else await mouseDrag(page, { x: vp.width * 0.8, y: 10 }, { x: vp.width * 0.8 - 90, y: 10 });
        await page.evaluate(() => window.__game.settle());
        expect(Math.abs((await cam()).yaw - y0) < 1e-6, `暫停中視角被轉動了（${vp.name}）`);
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction(() => !window.__game.screens.includes('pause'));
      });

      await step(`${vp.name} 鏡頭掃描：多個位置（台地腳下、緩坡、懸崖邊、台地頂、丘上）× 多個角度，鏡頭都在地形上方`, async () => {
        const info = await page.evaluate(() => window.__game.map);
        const spots = [];
        for (const p of info.plateaus) {
          for (const [r, a] of [[p.r + 3, p.rampDir], [p.r + 3, p.rampDir + 2], [p.r - 1, p.rampDir + 2], [p.r * 0.5, 0], [p.r + 12, p.rampDir]]) {
            spots.push([p.x + Math.cos(a) * r, p.z + Math.sin(a) * r]);
          }
        }
        for (const h of info.hills.slice(0, 4)) spots.push([h.x, h.z]);
        let worst = Infinity;
        let n = 0;
        for (const [x, z] of spots) {
          const ok = await page.evaluate(([x, z]) => window.__game.teleport(x, z), [x, z]);
          if (!ok) continue;
          for (let k = 0; k < 3; k++) {
            // 掃描用滑鼠拖曳（快）；觸控的轉視角規則上面已單獨測過
            await mouseDrag(page, { x: cx, y: cy }, { x: cx - 140, y: cy + (k % 2 ? 40 : -40) }, 2);
            await page.evaluate(() => window.__game.settle());
            const c = await cam();
            worst = Math.min(worst, c.y - c.groundY);
            n++;
            expect(c.y - c.groundY >= 0.3, `鏡頭穿進地形（${vp.name}，位置 ${x.toFixed(1)},${z.toFixed(1)}，yaw ${c.yaw.toFixed(2)}，離地 ${(c.y - c.groundY).toFixed(2)}）`);
          }
        }
        expect(n >= 30, `掃描的組數太少：${n}`);
        console.log(`    ${vp.name}：鏡頭掃描 ${n} 組，最小離地 ${worst.toFixed(2)} 公尺`);
        files.push(await shot(ctx, 'c1-terrain'));
      }, 120);
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return files;
}
