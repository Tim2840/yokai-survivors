// 特效目錄（docs/30 第 ⑧ 節：驗收用）：每種技法一格、固定鏡頭與時間點，排成一張（3 欄）。
// 每格：開新的一局（同種子）→ 給那招 → 前方放一排打不死的人類 → 跑 N 秒讓技法出手 → 凍結 → 截圖。
// 用法：NODE_PATH=node_modules node scripts/shots/vfx-catalog.mjs <標籤> [yokai] → screenshots/vfx-<標籤>.png
// **回報特效改動前一定要跑，並逐格讀**：火有沒有往上竄、有沒有火星、尖端有沒有分叉；水有沒有漣漪、泡沫、水花。
import { execFileSync } from 'node:child_process';
import { launch, openPage, startRun, waitState, press } from '../regress/lib.mjs';

const tag = process.argv[2] || 'now';
const yokai = process.argv[3] || 'chochin-kozo';
// 每格：[標籤, { tech, evolve（進化後才有的效果：鬼火雨、燈油）, ult（大招 id）, kill（敵人打得死：看打倒的效果）, elite, minFx（等到畫面上至少這麼多特效）,
//   until（等那一招真的在場上：'sumo'／'pillars'／'seeds'／'wakes'／'domains'；命中的水花很多，只看特效數會提早截到別的東西）, drive（玩家往前走：水痕要移動才有）, far（人類放遠一點：水泡才不會一放下就被碰破）}]
const SETS = {
  'chochin-kozo': [
    ['主武器・鬼火（命中）', {}],
    ['狐火分裂', { tech: 'kitsunebi' }],
    ['燈籠環', { tech: 'ring' }],
    ['業火', { tech: 'hellfire' }],
    ['鬼火柱', { tech: 'pillar', minFx: 70 }],
    ['火種', { tech: 'seed', kill: true }],
    ['開路燈', { tech: 'lamp' }],
    ['護身火', { tech: 'ward' }],
    ['彈跳', { tech: 'bounce' }],
    ['打倒・一般', { kill: true }],
    ['打倒・精英', { kill: true, elite: true }],
    ['燒傷（燈油）', { tech: 'hellfire', evolve: true }],
    ['鬼火雨', { tech: 'kitsunebi', evolve: true }],
    ['大招・大火圈', { ult: 'infernoLantern' }],
    ['大招・狐火之舞', { ult: 'ghostfireDance' }],
    ['大招・火牆護罩', { ult: 'bulwarkLantern' }],
  ],
  kappa: [
    ['主武器・水盤（命中）', {}],
    ['激流盤', { tech: 'torrent' }],
    ['回潮', { tech: 'backwash' }],
    ['渦流', { tech: 'vortex' }],
    ['渦盤', { tech: 'whirl' }],
    ['相撲', { tech: 'sumo', until: 'sumo' }],
    ['滑水', { tech: 'wake', until: 'wakes', drive: true }],
    ['水域', { tech: 'domain', until: 'domains' }],
    ['水牢', { tech: 'prison', until: 'seeds', kill: true }],
    ['間歇泉', { tech: 'geyser', until: 'pillars' }],
    ['打倒・一般', { kill: true }],
    ['打倒・精英', { kill: true, elite: true }],
    ['大招・雨乞', { ult: 'rainPrayer' }],
    ['大招・大波', { ult: 'tidalWave' }],
  ],
  // 赤鬼（docs/35）：揮擊、震波、九種技法、兩招大招
  'aka-oni': [
    ['主武器・金棒（揮擊）', {}],
    ['連擊', { tech: 'combo' }],
    ['鬼門', { tech: 'onimon' }],
    ['鬼雷', { tech: 'kaminari', until: 'pillars' }],
    ['旋風棒', { tech: 'spin' }],
    ['重擊', { tech: 'heavy' }],
    ['咆哮', { tech: 'roar', until: 'sumo' }],
    ['地裂', { tech: 'rift', until: 'sumo' }],
    ['餘震', { tech: 'aftershock', until: 'seeds', kill: true }],
    ['鬼氣護體', { tech: 'oniward' }],
    ['打倒・一般', { kill: true }],
    ['打倒・精英', { kill: true, elite: true }],
    ['大招・鬼神化', { ult: 'oniGod' }],
    ['大招・金棒大震', { ult: 'kanaboQuake' }],
  ],
};
const only = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
const cells = SETS[yokai];
const browser = await launch();
const files = [];
for (let k = 0; k < cells.length; k++) {
  if (only && !only.includes(k + 1)) continue;
  const [label, opt] = cells[k];
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
  await page.evaluate((opt) => {
    const g = window.__game;
    g.god = true;
    g.setCamera(g.facingDeg + 25, 30, opt.ult ? 14 : 9);
    g.clearEnemies();
    if (opt.tech) {
      g.giveTech(opt.tech);
      g.techLevel(opt.tech, 5);
      if (opt.evolve && !g.evolveTech(opt.tech)) throw new Error('evolve failed: ' + opt.tech);
    }
    // 前方一排人類：平常打不死（讓技法有東西打）；看打倒的格子用一下就倒的
    for (let j = 0; j < 7; j++) g.spawnAt('villager', -3 + j, (opt.far ? -9 : -4.5) - (j % 2), opt.elite ? 1 : 0, 0, opt.kill ? 1 : 1e9);
    if (opt.drive) g.driveWorld(0.6, 0.3);
    if (opt.ult) {
      g.setUlt(opt.ult, 0);
      g.chargeUlt();
    }
  }, opt);
  if (opt.ult) {
    await page.keyboard.down('f');
    await page.evaluate(() => window.__game.advance(0.1));
    await page.keyboard.up('f');
  }
  await page.evaluate((opt) => {
    const g = window.__game;
    // 跑到「畫面上真的有夠多特效」為止（最多 8 秒）：固定步數會剛好拍到空檔（第一版就是這樣，一半的格子是空的）
    // 打倒：等到真的有人倒下，再跑 0.12 秒（火團正竄起）；大招：發動後 0.25 秒（火圈擴散到一半）
    let best = 0;
    const k0 = g.run.kills;
    for (let s = 0; s < 160; s++) {
      g.advance(0.05);
      while (document.querySelector('.overlay[data-screen="levelup"] .card')) document.querySelector('.overlay[data-screen="levelup"] .card').click();
      if (opt.ult) {
        if (s >= 4) break;
        continue;
      }
      if (opt.until) {
        const st = g.techState();
        const ok = opt.until === 'sumo' ? st.flashes.includes(4) : st[opt.until] > 0;
        if (ok && s >= 10) {
          g.advance(0.05);
          break;
        }
        continue;
      }
      if (opt.kill) {
        // 火種：倒下的地方才種火種，等它快爆（0.6 秒）
        if (g.run.kills > k0 && opt.tech === 'seed') {
          for (let w = 0; w < 12; w++) g.advance(0.05);
          break;
        }
        if (g.run.kills > k0) {
          g.advance(0.06);
          g.advance(0.06);
          break;
        }
        continue;
      }
      if (s < 30 || s % 5) continue;
      g.render();
      const n = g.fxCount;
      if (n > best) best = n;
      if (n >= (opt.minFx ?? 8) && n >= best * 0.8) break;
    }
    // 凍結後只畫圖：setCamera 會跑 game.frame(1)，等於時間往前 1 秒（大火圈 0.95 秒就結束了，第一次因此拍不到火圈），所以鏡頭在開頭就設好
    g.freeze(true);
    g.render();
    g.render();
  }, opt);
  await page.addStyleTag({ content: 'body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important}' });
  await page.evaluate(() => { window.__game.render(); });
  const f = `screenshots/vfx-${tag}-${k + 1}.png`;
  await page.screenshot({ path: f, timeout: 120000 });
  console.log(`${k + 1}/${cells.length} ${label}：特效實例 ${await page.evaluate(() => window.__game.fxCount)}`);
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
rows = (len(cells) + 3) // 4
sheet = Image.new("RGB", (W * 4, H * rows), (20, 20, 28))
for i, (f, label) in enumerate(cells):
    im = Image.open(f).convert('RGB')
    w, h = im.size
    t = im.crop(((w - W) // 2, (h - H) // 2 - 20, (w + W) // 2, (h + H) // 2 - 20))
    d = ImageDraw.Draw(t)
    d.rectangle((0, 0, 20 + 28 * len(label), 40), fill=(0, 0, 0))
    d.text((10, 4), label, fill=(255, 255, 255), font=font)
    sheet.paste(t, ((i % 4) * W, (i // 4) * H))
sheet.save('screenshots/vfx-${tag}.png')
`;
execFileSync('python3', ['-c', py], { stdio: 'inherit' });
console.log(`screenshots/vfx-${tag}.png`);
