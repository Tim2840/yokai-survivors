// 外部素材試用的對照圖：我們的人類（左）＋候選模型（右）排一排，同一個畫面風格、同一個光；手機直式＋桌面各一張。
// 用法：NODE_PATH=node_modules node scripts/shots/candidates.mjs <標籤> <我們的人類 id,…> <候選 glb 路徑,…>
import { openRun, setCamera, freezeAndShoot, VIEWPORTS } from './helpers.mjs';

const [tag = 'now', oursArg = 'villager,ashigaru,shinobi', candArg = ''] = process.argv.slice(2);
const ours = oursArg.split(',').filter(Boolean);
const cands = candArg.split(',').filter(Boolean);
for (const vp of [VIEWPORTS[2], VIEWPORTS[0]]) {
  const { browser, page } = await openRun('?model=blender&seed=21&q=4&tod=night', vp);
  await setCamera(page, 0, 14, vp.name === 'desktop' ? 7.5 : 9);
  const n = ours.length + cands.length;
  const gap = vp.name === 'desktop' ? 1.25 : 0.9;
  const xs = Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * gap);
  await page.evaluate(([ours, xs]) => {
    const g = window.__game;
    g.clearEnemies();
    ours.forEach((id, k) => g.spawnAt(id, xs[k], -2.4));
  }, [ours, xs]);
  const tris = [];
  for (let k = 0; k < cands.length; k++) tris.push(await page.evaluate(([u, x]) => window.__game.previewGlb(u, x, -2.4, 0), ['/' + cands[k], xs[ours.length + k]]));
  await page.evaluate(() => { window.__game.advance(0.05); window.__game.render(); });
  const f = `screenshots/cand-${tag}-${vp.name}.png`;
  await freezeAndShoot(page, f, { hideUi: true });
  console.log(f, '候選三角形', tris.map(Math.round).join('／'));
  await browser.close();
}
