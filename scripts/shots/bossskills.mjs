// 頭目技能（D95）驗收截圖：退魔僧的封魔陣（紅圈）、衝撞（紅線）；第 2 關獵河武士的投網（扇形）、半血變招的血條（手機直式）
import { openRun, freezeAndShoot, setCamera, clearOverlays } from './helpers.mjs';
const { browser, page } = await openRun('?model=blender&seed=21');
const shots = [];
async function bossUp() {
  await page.evaluate(() => window.__game.summonBoss());
  for (let k = 0; k < 40; k++) {
    if (await page.evaluate(() => window.__game.run.boss)) break;
    await page.evaluate(() => window.__game.advance(0.1));
  }
  await clearOverlays(page);
}
async function cast(id, dx, dz, wait, name) {
  // dx = 往畫面上方（鏡頭前方）幾公尺、dz = 往右幾公尺：頭目和預告都在手機直式的畫面裡
  await page.evaluate(([fwd, side]) => {
    const g = window.__game;
    g.freeze(false);
    const f = (g.facingDeg * Math.PI) / 180;
    g.bossTo(Math.sin(f) * fwd + Math.cos(f) * side, Math.cos(f) * fwd - Math.sin(f) * side);
    g.advance(0.05);
  }, [dx, dz]);
  await page.evaluate((id) => window.__game.bossCast(id), id);
  await page.evaluate((w) => { const g = window.__game; for (let t = 0; t < w; t += 0.05) g.advance(0.05); }, wait);
  const b = await page.evaluate(() => window.__game.run.boss);
  // HUD 只在真的畫一幀時更新（advance 不更新）：等頭目名字換成這一隻再拍
  const want = { taimasou: '退魔僧', kawagari: '獵河武士' }[b.id];
  await page.waitForFunction((w) => document.querySelector('#boss-name')?.textContent === w, want, { timeout: 15000 }).catch(() => {});
  const hud = await page.evaluate(() => document.querySelector('#boss-bar')?.innerText ?? '');
  await freezeAndShoot(page, `screenshots/boss-${name}-phone-portrait.png`);
  shots.push({ name, id: b.id, state: b.state, skill: b.skill, shape: b.tele.shape, progress: +b.tele.progress.toFixed(2), hud });
}
await setCamera(page, 0, 44, 17);
await bossUp();
await cast('seal', -7, 1, 0.6, 'seal');
await cast('charge', -8, 0.5, 0.45, 'charge');
// 半血變招
await page.evaluate(() => { const g = window.__game; g.freeze(false); const r = g.run.boss; g.setBossHp?.(r.maxHp * 0.45); });
// 第 2 關：過關 → 下一關 → 召喚獵河武士
await page.evaluate(() => { const g = window.__game; g.freeze(false); g.clearStage(); g.advance(0.1); });
await page.waitForFunction(() => window.__game.screens.includes('intermission'), null, { timeout: 20000 });
await page.click('#btn-inter-next');
await page.waitForFunction(() => window.__game.state === 'COMBAT', null, { timeout: 20000 });
await page.evaluate(() => { window.__game.god = true; });
await setCamera(page, 0, 44, 17);
await bossUp();
await cast('net', -6, 0.5, 0.5, 'net');
await cast('iai', -3.5, 0, 0.45, 'iai');
console.log(JSON.stringify(shots, null, 1));
await browser.close();
