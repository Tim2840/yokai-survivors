// 截圖／驗收腳本共用的小工具（.claude/skills/game-screenshots）。
// 每個函式都對應一個實際踩過的坑，寫在註解裡；新的坑就加在這裡，不要每次重寫。
import { launch, openPage, startRun, VIEWPORTS } from '../regress/lib.mjs';

export { launch, openPage, startRun, VIEWPORTS };

/** 等 Blender 模型載入（測試頁與 ?model=blender 才有；主網址沒有，等不到就算了） */
export async function waitBlender(page, timeout = 30000) {
  return page.waitForFunction(() => window.__game.blenderReady, null, { timeout }).then(() => true).catch(() => false);
}

/**
 * 把畫面上擋住的面板（升級選卡、結果卡、化身提示…）一張一張點掉，最多 max 次。
 * 坑：只找 `.overlay[data-screen="levelup"] .card` 會點到「隱藏中」的卡（化身提示蓋著時），
 * 用 while 迴圈一直點會無窮迴圈、頁面記憶體爆掉、瀏覽器被系統砍掉。所以：只點看得見的按鈕、有上限。
 */
export async function clearOverlays(page, max = 6) {
  for (let i = 0; i < max; i++) {
    const busy = await page.evaluate(() => window.__game.run.awaitingPick || window.__game.screens.some((s) => s !== 'hud'));
    if (!busy) return true;
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.overlay:not(.hidden) button')].find((x) => x.offsetParent !== null);
      if (b) b.click();
      window.__game.advance(0.05);
    });
  }
  return false;
}

/**
 * 升到 level 級（一點一點給經驗，每次都把選卡清掉）。
 * 坑：一次 addXp(5000) 會連升十幾級、排一長串選卡，頁面記憶體爆掉。
 */
export async function levelTo(page, level, xpStep = 40) {
  for (let k = 0; k < level * 6; k++) {
    if ((await page.evaluate(() => window.__game.run.level)) >= level) return true;
    await page.evaluate((x) => { const g = window.__game; g.addXp(x); g.advance(0.05); }, xpStep);
    await clearOverlays(page);
  }
  return false;
}

/**
 * 快進 seconds 秒（模擬時間），途中自動清掉選卡。
 * 坑：不要先呼叫 `clearEnemies()`——它會順便關掉敵人生成（director.active = false），之後一隻都不會出來。
 */
export async function advance(page, seconds, step = 0.05) {
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i += 20) {
    await page.evaluate(([k, s]) => { const g = window.__game; for (let j = 0; j < k; j++) g.advance(s); }, [Math.min(20, n - i), step]);
    await clearOverlays(page, 3);
  }
}

/**
 * 設鏡頭：yaw／pitch（度）、距離（公尺）。
 * 坑：`setCamera` 會跑 `game.frame(1)`，等於時間往前 1 秒——短效果（大火圈 0.95 秒）會整個錯過。
 * 所以鏡頭要在「快進之前」設，凍結之後只呼叫 render。
 */
export async function setCamera(page, yawOffsetDeg = 25, pitchDeg = 30, dist = 9) {
  await page.evaluate(([y, p, d]) => { const g = window.__game; g.setCamera(g.facingDeg + y, p, d); }, [yawOffsetDeg, pitchDeg, dist]);
}

/** 凍結模擬並畫兩次（第二次讓實例、鏡頭都到位），再截圖。headless 只有 1～2 FPS，截圖前一定要自己 render。 */
export async function freezeAndShoot(page, path, { hideUi = false } = {}) {
  await page.evaluate(() => { const g = window.__game; g.freeze(true); g.render(); g.render(); });
  if (hideUi) await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' });
  await page.evaluate(() => window.__game.render());
  await page.screenshot({ path, timeout: 120000 });
}

/** 開一局（手機直式預設）：回傳 { browser, ctx, page } */
export async function openRun(query = '?model=blender&seed=21', vp = VIEWPORTS[0]) {
  const browser = await launch();
  const ctx = await openPage(browser, vp, query);
  await startRun(ctx);
  await waitBlender(ctx.page);
  await ctx.page.evaluate(() => { window.__game.god = true; });
  return { browser, ctx, page: ctx.page };
}
