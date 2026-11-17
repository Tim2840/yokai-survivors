// 老練的人類（D97）：一般 vs 老練並排（村人、足輕、弓手），近看與遊玩距離各一張
// NODE_PATH=node_modules node scripts/shots/veteran.mjs <標籤>
import { openRun, setCamera, freezeAndShoot, VIEWPORTS } from './helpers.mjs';
const tag = process.argv[2] ?? 'vet';
for (const [vpi, name] of [[2, 'desktop'], [0, 'phone']]) {
  const { browser, page } = await openRun('?model=blender&seed=21', VIEWPORTS[vpi]);
  await page.evaluate(() => {
    const g = window.__game;
    g.clearEnemies();
    const ids = ['villager', 'ashigaru', 'yumi'];
    // 前排一般、後排老練（同一種上下對齊）
    ids.forEach((id, k) => {
      g.spawnAt(id, -2.4 + k * 2.4, -3.2, 0, 0, 1e9);
      g.spawnAt(id, -2.4 + k * 2.4, -5.6, 0, 1, 1e9);
    });
  });
  // 正面（玩家這一側看過去）與背面（從人類後面看，背旗最明顯）
  await setCamera(page, 20, 24, name === 'phone' ? 13 : 10);
  await page.evaluate(() => window.__game.advance(0.05));
  await freezeAndShoot(page, `screenshots/veteran-${tag}-${name}-front.png`, { hideUi: name !== 'phone' });
  await page.evaluate(() => window.__game.freeze(false));
  await setCamera(page, 180, 38, name === 'phone' ? 17 : 14);
  await page.evaluate(() => window.__game.advance(0.05));
  await freezeAndShoot(page, `screenshots/veteran-${tag}-${name}-back.png`, { hideUi: name !== 'phone' });
  await browser.close();
}
