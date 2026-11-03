// 回歸共用函式（docs/07 第 2 節的規則都在這裡落實）。
// - 三種畫面：手機直式、手機橫式、桌面；手機用觸控（tap），桌面用滑鼠（click）。
// - 每步有 stall 上限；卡住偵測：畫面狀態連續 N 輪沒變且還沒完成 → 失敗並印出最後狀態。
// - 收集 pageerror 與 console.error；任何一個都算失敗。
// - 無頭瀏覽器只有 1～2 FPS：一律用 waitForFunction 或 __game.advance 快進，不用固定等待。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { browserChoice } from '../browser.mjs';

export const BASE = process.env.BASE_URL || 'http://localhost:5173/';
export const SHOTS = 'screenshots';

export const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 'phone-landscape', width: 800, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 'desktop', width: 1280, height: 720, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

export async function launch() {
  return chromium.launch({ ...browserChoice(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
}

/** 開一頁；回傳 { page, errors, close } */
export async function openPage(browser, vp, query = '') {
  const { name, ...opts } = vp;
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, isMobile: opts.isMobile, hasTouch: opts.hasTouch, deviceScaleFactor: opts.deviceScaleFactor });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  await page.goto(BASE + query, { waitUntil: 'load' });
  return { page, errors, vp: { name, ...opts }, close: () => ctx.close() };
}

/** 一步：超過 stall 秒就失敗（步驟接近 45 秒的要在登記時調大 stall） */
export async function step(label, fn, stallSec = 30) {
  let timer;
  const t0 = Date.now();
  try {
    return await Promise.race([
      fn(),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(`步驟「${label}」超過 ${stallSec} 秒（stall）`)), stallSec * 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (process.env.VERBOSE) console.log(`    · ${label}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  }
}

export function expect(cond, msg) {
  if (!cond) throw new Error(`斷言失敗：${msg}`);
}

/** 等到 __game 出現且狀態是 state */
export async function waitState(page, state, timeout = 20000) {
  await page.waitForFunction((s) => window.__game && window.__game.state === s, state, { timeout });
}

/** 用玩家的方式點：手機 tap、桌面 click。目標要看得見、在畫面內、沒被蓋住。 */
export async function press(ctx, selector) {
  const { page, vp } = ctx;
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 10000 });
  const box = await el.boundingBox();
  expect(box, `${selector} 沒有位置`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  expect(x >= 0 && y >= 0 && x <= vp.width && y <= vp.height, `${selector} 在畫面外（${vp.name}）`);
  const top = await page.evaluate(([px, py, sel]) => {
    const hit = document.elementFromPoint(px, py);
    const target = document.querySelector(sel);
    return !!hit && !!target && (hit === target || target.contains(hit));
  }, [x, y, selector]);
  expect(top, `${selector} 被別的東西蓋住（${vp.name}）`);
  if (vp.hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/**
 * 卡住偵測：每輪呼叫 act()，再用 snapshot() 取畫面狀態字串；done(snap) 為真就結束。
 * 連續 maxSame 輪狀態沒變 → 失敗並印出最後狀態。
 */
export async function untilDone({ snapshot, act, done, maxSame = 12, maxRounds = 200 }) {
  let last = '';
  let same = 0;
  for (let i = 0; i < maxRounds; i++) {
    const snap = await snapshot();
    if (done(snap)) return snap;
    same = snap === last ? same + 1 : 0;
    if (same >= maxSame) throw new Error(`卡住：狀態連續 ${maxSame} 輪沒變\n${snap}`);
    last = snap;
    await act(snap);
  }
  throw new Error(`超過 ${maxRounds} 輪還沒完成`);
}

export async function shot(ctx, name) {
  mkdirSync(SHOTS, { recursive: true });
  await ctx.page.evaluate(() => window.__game && window.__game.render());
  const file = join(SHOTS, `${name}-${ctx.vp.name}.png`);
  await ctx.page.screenshot({ path: file });
  return file;
}

export function reportErrors(ctx) {
  expect(ctx.errors.length === 0, `頁面錯誤（${ctx.vp.name}）：\n${ctx.errors.join('\n')}`);
}

/** 進一局：主選單 → 開始 → 選妖怪畫面 → 出發（全用真實點擊），等到 COMBAT。query 預設固定畫質與種子，結果可重現 */
export async function startRun(ctx) {
  await waitState(ctx.page, 'MENU');
  await press(ctx, '#btn-start');
  await ctx.page.waitForFunction(() => window.__game.screens.includes('setup'), null, { timeout: 10000 });
  await press(ctx, '#btn-setup-go');
  await waitState(ctx.page, 'COMBAT');
}

/** 畫面狀態字串（卡住偵測用）：目前看得到的畫面＋這一局的關鍵數字 */
export async function snapshotOf(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const r = g.run;
    return JSON.stringify({ state: g.state, screens: g.screens, paused: g.paused, wave: r && r.wave, phase: r && r.phase, t: r && Math.floor(r.time), level: r && r.level, kills: r && r.kills, hp: r && Math.ceil(r.hp), pending: r && r.pending, picked: r && r.picked });
  });
}
