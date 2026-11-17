// 百鬼試煉碑（D97）：走近的提示（含圈內加成）、試煉中人類從碑周圍湧進來
// NODE_PATH=node_modules node scripts/shots/trial.mjs <標籤>
import { openRun, setCamera, freezeAndShoot } from './helpers.mjs';
const tag = process.argv[2] ?? 'trial';
const { browser, page } = await openRun('?model=blender&seed=21');
await page.evaluate(() => { const g = window.__game; g.setTime(240); g.forceElement('trial', 'rare'); g.advance(3); });
// 走到碑上（提示）
const el = await page.evaluate(() => window.__game.run.elements.find((e) => e.kind === 'trial'));
await page.evaluate(([x, z]) => { const g = window.__game; g.teleport(x + 0.3, z); g.advance(0.3); g.render(); }, [el.x, el.z]);
await setCamera(page, 0, 40, 14);
await freezeAndShoot(page, `screenshots/trial-${tag}-hint.png`);
await page.evaluate(() => window.__game.freeze(false));
for (let i = 0; i < 12 && !(await page.evaluate(() => window.__game.run.trial.active)); i++) await page.evaluate(() => window.__game.advance(0.25));
await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 40; i++) { g.advance(0.1); while (g.run.awaitingPick) document.querySelector('.overlay[data-screen="levelup"] .card')?.click(); } });
await setCamera(page, 0, 55, 22);
await freezeAndShoot(page, `screenshots/trial-${tag}-active.png`);
console.log(await page.locator('#element-desc').innerText().catch(() => ''));
await browser.close();
