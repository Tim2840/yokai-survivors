// 能力面板技法欄位（2026-11-17）：提燈小僧帶兩個技法＋詞條、河童帶兩個技法，手機直式與桌面。D98：武器排第一個、第一個技法進化過（換成進化版的名字）
import { launch, openPage, waitBlender, levelTo, VIEWPORTS } from './helpers.mjs';
import { press, waitState } from '../regress/lib.mjs';
for (const [yk, techs, vpi] of [['chochin-kozo', ['bounce', 'pillar'], 0], ['kappa', ['vortex', 'sumo'], 0], ['chochin-kozo', ['bounce', 'pillar'], 2]]) {
  const vp = VIEWPORTS[vpi];
  const browser = await launch();
  const ctx = await openPage(browser, vp, '?model=blender&seed=21');
  const { page } = ctx;
  await waitState(page, 'MENU');
  await press(ctx, '#btn-start');
  await page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
  await press(ctx, `.yokai-card[data-yokai="${yk}"]`);
  await press(ctx, '#btn-setup-go');
  await waitState(page, 'COMBAT');
  await waitBlender(page);
  await page.evaluate(() => { window.__game.god = true; });
  await levelTo(page, 3);
  await page.evaluate((ts) => { const g = window.__game; g.giveTech(...ts); g.evolveTech(ts[0]); }, techs);
  await page.click('#btn-abilities');
  await page.evaluate(() => window.__game.render());
  // 捲到技法欄位
  await page.evaluate(() => document.querySelector('#sum-techs')?.scrollIntoView({ block: 'start' }));
  const txt = await page.evaluate(() => document.querySelector('#sum-techs')?.innerText ?? '');
  const name = `screenshots/techpanel-${yk}-${vp.name}.png`;
  await page.screenshot({ path: name });
  console.log(name, '\n' + txt + '\n');
  if (vpi === 0 && yk === 'chochin-kozo') {
    await page.evaluate(() => document.querySelector('[data-stat="weaponDamage"]')?.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `screenshots/techpanel-weapon-${vp.name}.png` });
  }
  await browser.close();
}
