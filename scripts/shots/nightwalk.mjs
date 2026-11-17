// 夜行（D93）驗收截圖：主武器自動升級的 HUD 提示、打倒精英拿到魂玉的提示（手機直式）
import { openRun, levelTo, freezeAndShoot, setCamera } from './helpers.mjs';
const { browser, page } = await openRun('?model=blender&seed=21');
await setCamera(page, 25, 32, 10);
await levelTo(page, 3);
await page.evaluate(() => { const g = window.__game; g.advance(0.1); g.render(); });
const w = await page.evaluate(() => document.querySelector('#wave-note')?.textContent);
await freezeAndShoot(page, 'screenshots/nightwalk-weapon-phone-portrait.png');
await page.evaluate(() => { const g = window.__game; g.freeze(false); g.advance(4.5); g.eliteKill(); g.advance(0.1); g.render(); });
const gtext = await page.evaluate(() => document.querySelector('#wave-note')?.textContent);
await freezeAndShoot(page, 'screenshots/nightwalk-gem-phone-portrait.png');
console.log(JSON.stringify({ weaponNote: w, gemNote: gtext, weaponLevel: await page.evaluate(() => window.__game.run.ult?.counts) }));
await browser.close();
