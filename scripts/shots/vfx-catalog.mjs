// 特效目錄（docs/30 第 ⑧ 節：驗收用）：每種技法一格、固定鏡頭與時間點，排成一張（3 欄）。
// 每格：開新的一局（同種子）→ 給那招 → 前方放一排打不死的人類 → 跑 N 秒讓技法出手 → 凍結 → 截圖。
// 用法：NODE_PATH=node_modules node scripts/shots/vfx-catalog.mjs <標籤> [yokai] → screenshots/vfx-<標籤>.png
// **回報特效改動前一定要跑，並逐格讀**：火有沒有往上竄、有沒有火星、尖端有沒有分叉；水有沒有漣漪、泡沫、水花。
import { execFileSync } from 'node:child_process';
import { launch, openPage, startRun, waitState, press } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const yokai = process.argv[3] || 'chochin-kozo';
const SETS = {
  'chochin-kozo': [
    ['主武器・鬼火', null],
    ['狐火分裂', 'kitsunebi'],
    ['燈籠環', 'ring'],
    ['業火', 'hellfire'],
    ['鬼火柱', 'pillar'],
    ['火種', 'seed'],
    ['開路燈', 'lamp'],
    ['護身火', 'ward'],
    ['彈跳', 'bounce'],
  ],
};
const cells = SETS[yokai];
const browser = await launch();
const files = [];
for (let k = 0; k < cells.length; k++) {
  const [label, tech] = cells[k];
  const ctx = await openPage(browser, { name: 'desktop', width: 960, height: 640 }, '?q=1&seed=93&model=blender');
  const { page } = ctx;
  if (yokai !== 'chochin-kozo') {
    await waitState(page, 'MENU');
    await press(ctx, '#btn-start');
    await page.waitForFunction(() => window.__game.screens.includes('setup'));
    await press(ctx, `.yokai-card[data-yokai="${yokai}"]`);
    await press(ctx, '#btn-setup-go');
    await waitState(page, 'COMBAT');
  } else await startRun(ctx);
  await page.waitForFunction(() => window.__game.blenderReady, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(({ tech }) => {
    const g = window.__game;
    g.god = true;
    g.clearEnemies();
    if (tech) {
      g.giveTech(tech);
      g.techLevel(tech, 5);
    }
    // 前方一排人類（打不死）：讓技法有東西打
    for (let j = 0; j < 7; j++) g.spawnAt('villager', -3 + j, -4.5 - (j % 2), 0, 0);
    for (let s = 0; s < 40; s++) {
      g.advance(0.05);
      while (document.querySelector('.overlay[data-screen="levelup"] .card')) document.querySelector('.overlay[data-screen="levelup"] .card').click();
    }
    g.freeze(true);
    g.setCamera(g.facingDeg + 25, 30, 9);
    g.render();
    g.render();
  }, { tech });
  await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' });
  await page.evaluate(() => { window.__game.render(); });
  const f = `screenshots/vfx-${tag}-${k + 1}.png`;
  await page.screenshot({ path: f });
  files.push([f, label]);
  await ctx.close();
}
await browser.close();
const py = `
import sys
from PIL import Image, ImageDraw, ImageFont
cells = ${JSON.stringify(files)}
W, H = 480, 400
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 26)
except Exception:
    font = ImageFont.load_default()
rows = (len(cells) + 2) // 3
sheet = Image.new('RGB', (W * 3, H * rows), (20, 20, 28))
for i, (f, label) in enumerate(cells):
    im = Image.open(f).convert('RGB')
    w, h = im.size
    t = im.crop(((w - W) // 2, (h - H) // 2 + 40, (w + W) // 2, (h + H) // 2 + 40))
    d = ImageDraw.Draw(t)
    d.rectangle((0, 0, 20 + 28 * len(label), 40), fill=(0, 0, 0))
    d.text((10, 4), label, fill=(255, 255, 255), font=font)
    sheet.paste(t, ((i % 3) * W, (i // 3) * H))
sheet.save('screenshots/vfx-${tag}.png')
`;
execFileSync('python3', ['-c', py], { stdio: 'inherit' });
console.log(`screenshots/vfx-${tag}.png`);
