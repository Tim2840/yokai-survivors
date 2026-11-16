// 打包檔冒煙檢查：主選單 → 開局 → Blender 模型真的載入（不准 fetch 的環境下）→ 截兩張圖、沒有錯誤。
// 用法：BASE_URL=http://localhost:5181/yokai-test.html NODE_PATH=node_modules node scripts/packed/check.mjs
import { launch, openPage, startRun, waitState, reportErrors, VIEWPORTS } from '../regress/lib.mjs';
const b = await launch();
const ctx = await openPage(b, VIEWPORTS[0], '');
const { page } = ctx;
let ok = true;
try {
  await waitState(page, 'MENU');
  await page.screenshot({ path: 'screenshots/packed-menu.png' });
  await startRun(ctx);
  const ready = await page.waitForFunction(() => window.__game.blenderReady, null, { timeout: 15000 }).then(() => true).catch(() => false);
  console.log(`Blender 模型：${ready ? '有載入' : '沒有載入（退回程式建的舊模型！）'}`);
  ok = ready;
  await page.evaluate(() => { const g = window.__game; g.god = true; for (let i = 0; i < 20; i++) g.advance(0.1); g.render(); g.render(); });
  await page.screenshot({ path: 'screenshots/packed-play.png' });
  reportErrors(ctx);
} catch (e) {
  console.log('失敗：', e.message);
  ok = false;
} finally {
  await b.close();
}
console.log(ok ? '打包檔檢查通過（screenshots/packed-menu.png、packed-play.png）' : '打包檔檢查失敗');
process.exit(ok ? 0 : 1);
