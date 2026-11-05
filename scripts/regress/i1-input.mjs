// i1：輸入與暫停。桌面用鍵盤（WASD、方向鍵）、手機用虛擬搖桿（真實的指標事件）移動玩家；暫停鈕與 Esc 會停住戰鬥。
// 量法：同一局、同一刻，不動的對照組位置不變，按住的位置有變、方向對。
import { openPage, startRun, press, step, expect, reportErrors, mouseDrag, touchDrag, VIEWPORTS } from './lib.mjs';

export const meta = { id: 'i1', desc: '輸入：鍵盤與搖桿移動方向正確且相對鏡頭、跳躍（空白鍵／跳躍鈕）、不動就不動；暫停會停住戰鬥（三種畫面）', max: 300, stall: 40 };

export async function run(browser) {
  for (const vp of VIEWPORTS) {
    const ctx = await openPage(browser, vp, '?q=4&seed=2');
    const { page } = ctx;
    try {
      await startRun(ctx);
      await page.evaluate(() => {
        window.__game.god = true;
        window.__game.teleport(0, 0);
      });
      const pos = () => page.evaluate(() => ({ x: window.__game.run.px, z: window.__game.run.pz }));

      await step(`${vp.name} 不碰輸入：位置不變`, async () => {
        const a = await pos();
        await page.evaluate(() => window.__game.advance(1));
        const b = await pos();
        expect(Math.hypot(b.x - a.x, b.z - a.z) < 1e-6, `沒有輸入卻移動了（${vp.name}）：${JSON.stringify([a, b])}`);
      });

      if (!vp.hasTouch) {
        for (const [key, dx, dz] of [['KeyD', 1, 0], ['KeyA', -1, 0], ['KeyS', 0, 1], ['KeyW', 0, -1], ['ArrowRight', 1, 0]]) {
          await step(`${vp.name} 按住 ${key}`, async () => {
            await page.evaluate(() => window.__game.teleport(0, 0));
            await page.keyboard.down(key);
            await page.evaluate(() => window.__game.advance(0.5));
            await page.keyboard.up(key);
            const p = await pos();
            expect(p.x * dx + p.z * dz > 1.2, `${key} 方向不對或太慢：${JSON.stringify(p)}`);
            expect(Math.abs(p.x * dz) + Math.abs(p.z * dx) < 0.3, `${key} 走歪了：${JSON.stringify(p)}`);
            await page.evaluate(() => window.__game.advance(0.2));
            const q = await pos();
            expect(Math.hypot(q.x - p.x, q.z - p.z) < 1e-6, `放開 ${key} 後還在動`);
          });
        }
      } else {
        await step(`${vp.name} 搖桿往右推、往上推`, async () => {
          const box = await page.locator('#stick-base').boundingBox();
          expect(box && box.width > 80, `搖桿太小或不見（${vp.name}）：${JSON.stringify(box)}`);
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          for (const [dx, dy, ex, ez] of [[40, 0, 1, 0], [0, -40, 0, -1]]) {
            await page.evaluate(() => window.__game.teleport(0, 0));
            await page.mouse.move(cx, cy);
            await page.mouse.down();
            await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
            await page.evaluate(() => window.__game.advance(0.5));
            const p = await pos();
            await page.mouse.up();
            expect(p.x * ex + p.z * ez > 1.2, `搖桿方向不對或太慢（${vp.name}）：${JSON.stringify(p)}`);
            await page.evaluate(() => window.__game.advance(0.2));
            const q = await pos();
            expect(Math.hypot(q.x - p.x, q.z - p.z) < 1e-6, `放開搖桿後還在動（${vp.name}）：${JSON.stringify({ p, q, d: await page.evaluate(() => ({ s: window.__game.screens, el: window.__game.run.elements.map((e) => [e.kind, +e.x.toFixed(1), +e.z.toFixed(1), e.used]), focus: window.__game.run.focus, py: window.__game.run.py })) })}`);
          }
        });
      }

      await step(`${vp.name} 移動相對鏡頭：轉 90° 以上之後，往前走 = 鏡頭看的方向`, async () => {
        const cx = vp.width * 0.6, cy = vp.height * 0.5;
        await page.evaluate(() => window.__game.teleport(0, 0));
        if (vp.hasTouch) await touchDrag(page, { x: cx, y: cy }, { x: cx - 220, y: cy });
        else await mouseDrag(page, { x: cx, y: cy }, { x: cx - 220, y: cy });
        await page.evaluate(() => window.__game.settle());
        const yaw = (await page.evaluate(() => window.__game.camera)).yaw;
        expect(Math.abs(yaw) > 0.8, `轉得不夠，無法驗證相對鏡頭：yaw ${yaw}`);
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        if (!vp.hasTouch) {
          await page.keyboard.down('KeyW');
          await page.evaluate(() => window.__game.advance(0.5));
          await page.keyboard.up('KeyW');
        } else {
          const box = await page.locator('#stick-base').boundingBox();
          const sx = box.x + box.width / 2, sy = box.y + box.height / 2;
          await page.mouse.move(sx, sy);
          await page.mouse.down();
          await page.mouse.move(sx, sy - 40, { steps: 4 });
          await page.evaluate(() => window.__game.advance(0.5));
          await page.mouse.up();
        }
        const p = await pos();
        const d = Math.hypot(p.x, p.z);
        expect(d > 1.2, `沒有移動（${vp.name}）：${JSON.stringify(p)}`);
        expect((p.x * fx + p.z * fz) / d > 0.97, `往前走的方向不是鏡頭看的方向（${vp.name}）：走 ${JSON.stringify(p)}、鏡頭 yaw ${yaw}`);
      });

      await step(`${vp.name} 跳躍：離地約 1 公尺以上、落回地面`, async () => {
        await page.evaluate(() => { window.__game.teleport(0, 0); window.__game.advance(0.3); });
        const g0 = await page.evaluate(() => window.__game.run);
        expect(g0.grounded === true, `起跳前不在地面（${vp.name}）`);
        if (vp.hasTouch) await press(ctx, '#btn-jump');
        else await page.keyboard.press('Space');
        await page.evaluate(() => window.__game.advance(0.3));
        const up = await page.evaluate(() => window.__game.run);
        expect(up.py - up.groundY > 0.7 && up.grounded === false, `沒有跳起來（${vp.name}）：離地 ${(up.py - up.groundY).toFixed(2)}`);
        await page.evaluate(() => window.__game.advance(1.0));
        const down = await page.evaluate(() => window.__game.run);
        expect(down.grounded === true && Math.abs(down.py - down.groundY) < 1e-3, `沒有落回地面（${vp.name}）`);
      });

      await step(`${vp.name} 暫停：戰鬥停住、繼續後恢復`, async () => {
        await press(ctx, '#btn-pause');
        await page.waitForFunction(() => window.__game.screens.includes('pause') && window.__game.paused);
        const a = await page.evaluate(() => window.__game.simTime);
        // 真實時間過 1.5 秒（無頭瀏覽器 1～2 FPS，仍有數個畫面幀）
        await page.waitForTimeout(1500);
        const b = await page.evaluate(() => window.__game.simTime);
        expect(b === a, `暫停中模擬還在走：${a} → ${b}（${vp.name}）`);
        await press(ctx, '#btn-pause-resume');
        await page.waitForFunction((t0) => window.__game.simTime > t0, a, { timeout: 15000 });
        expect(await page.evaluate(() => window.__game.paused) === false, `按繼續後還是暫停（${vp.name}）`);
      });

      if (!vp.hasTouch) {
        await step(`${vp.name} Esc 開關暫停`, async () => {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => window.__game.screens.includes('pause'));
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !window.__game.screens.includes('pause') && !window.__game.paused);
        });
      }
      reportErrors(ctx);
    } finally {
      await ctx.close();
    }
  }
  return [];
}
