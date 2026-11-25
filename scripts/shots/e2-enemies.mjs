// E-2 新人類驗收截圖：①四種新人類排一排（看造型）②戰鬥中：僧兵的護法範圍、太鼓兵的鼓舞範圍、陰陽師的紅圈、探子的衝刺預告線、精英詞綴光圈
// 用法：NODE_PATH=node_modules node scripts/shots/e2-enemies.mjs → screenshots/e2-lineup.png、screenshots/e2-fight.png
import { openRun, setCamera, freezeAndShoot } from './helpers.mjs';

{
  const { browser, page } = await openRun('?model=blender&seed=21&q=4');
  await setCamera(page, 0, 16, 7.5);
  await page.evaluate(() => {
    const g = window.__game;
    g.clearEnemies();
    ['sohei', 'shinobi', 'onmyoji', 'taiko'].forEach((id, k) => g.spawnAt(id, (k - 1.5) * 1.3, -2.2));
    g.advance(0.05);
  });
  await freezeAndShoot(page, 'screenshots/e2-lineup.png', { hideUi: true });
  await browser.close();
}
{
  const { browser, page } = await openRun('?model=blender&seed=21&q=4&tod=night');
  await setCamera(page, 0, 42, 15);
  await page.evaluate(() => {
    const g = window.__game;
    g.clearEnemies();
    const s = g.spawnAt('sohei', -4, -5);
    for (const [dx, dz] of [[-5.5, -3.5], [-3, -3.2], [-5, -6.5]]) g.spawnAt('villager', dx, dz);
    g.spawnAt('taiko', 5, -8);
    for (const [dx, dz] of [[4, -5.5], [6.5, -6]]) g.spawnAt('ashigaru', dx, dz);
    g.spawnAt('onmyoji', 0, 10);
    g.spawnAt('shinobi', 5.5, 1);
    const codes = [1, 2, 3, 4];
    codes.forEach((c, k) => g.setAffix(g.spawnAt('villager', -7 + k * 2.2, 5, 1), c));
    void s;
  });
  // 等陰陽師畫出紅圈、紅圈長到一半
  for (let k = 0; k < 80 && !(await page.evaluate(() => window.__game.run.curseZones > 0)); k++) await page.evaluate(() => window.__game.advance(0.1));
  await page.evaluate(() => { for (let k = 0; k < 6; k++) window.__game.advance(0.1); });
  await freezeAndShoot(page, 'screenshots/e2-fight.png');
  await browser.close();
}
console.log('screenshots/e2-lineup.png screenshots/e2-fight.png');
