// 子彈不追蹤（2026-11-17）：升級選卡出現「彈跳」新說明時拍下來（手機直式）
import { openRun } from './helpers.mjs';
const { browser, page } = await openRun('?model=blender&seed=33');
let found = false;
for (let k = 0; k < 400 && !found; k++) {
  await page.evaluate(() => { const g = window.__game; g.addXp(30); g.advance(0.05); });
  const cards = await page.evaluate(() => [...document.querySelectorAll('.overlay:not(.hidden) .card')].filter((c) => c.offsetParent !== null).map((c) => c.innerText));
  if (cards.some((t) => /每跳傷害剩/.test(t))) {
    await page.evaluate(() => window.__game.render());
    await page.screenshot({ path: 'screenshots/straight-card-phone-portrait.png' });
    console.log(cards.join('\n---\n'));
    found = true;
    break;
  }
  if (cards.length) {
    // 優先點技法卡以外的卡，讓彈跳以新技法卡出現
    await page.evaluate(() => {
      const bs = [...document.querySelectorAll('.overlay:not(.hidden) .card')].filter((c) => c.offsetParent !== null);
      (bs.find((c) => !/技法/.test(c.innerText)) ?? bs[0])?.click();
      window.__game.advance(0.05);
    });
  } else {
    await page.evaluate(() => { const b = [...document.querySelectorAll('.overlay:not(.hidden) button')].find((x) => x.offsetParent !== null); if (b) b.click(); });
  }
}
console.log('found', found, await page.evaluate(() => window.__game.run.level));
await browser.close();
