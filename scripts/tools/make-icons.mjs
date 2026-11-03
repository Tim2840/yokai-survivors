// 產生 PWA 圖示（public/icons/*.png）：程式畫一盞紙燈籠（和風、圓潤）。改圖示就改這裡再跑一次。
// 用法：NODE_PATH=node_modules node scripts/tools/make-icons.mjs
import { chromium } from 'playwright';
import { browserChoice } from '../browser.mjs';

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1b2040"/>
  <g transform="translate(256 270) scale(${1 - pad})">
    <circle r="230" fill="#ffb35c" opacity="0.18"/>
    <rect x="-70" y="-205" width="140" height="34" rx="14" fill="#2b2b30"/>
    <rect x="-70" y="171" width="140" height="34" rx="14" fill="#2b2b30"/>
    <ellipse rx="150" ry="180" fill="#ffd27a"/>
    <ellipse rx="150" ry="180" fill="none" stroke="#d88a3a" stroke-width="10"/>
    <path d="M-148 -60 Q0 -40 148 -60 M-150 0 Q0 20 150 0 M-148 60 Q0 80 148 60" fill="none" stroke="#d88a3a" stroke-width="8" stroke-linecap="round"/>
    <circle cx="-48" cy="-20" r="16" fill="#2b2b30"/><circle cx="48" cy="-20" r="16" fill="#2b2b30"/>
    <path d="M-40 50 Q0 85 40 50" fill="none" stroke="#d9503f" stroke-width="14" stroke-linecap="round"/>
  </g>
</svg>`;

const out = [
  ['public/icons/icon-192.png', 192, 0],
  ['public/icons/icon-512.png', 512, 0],
  ['public/icons/apple-touch-icon.png', 180, 0],
  ['public/icons/icon-maskable-512.png', 512, 0.2],
];
const browser = await chromium.launch(browserChoice());
for (const [file, size, pad] of out) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}</style><img src="data:image/svg+xml,${encodeURIComponent(svg(pad))}" width="${size}" height="${size}">`);
  await page.waitForFunction(() => document.images[0].complete);
  await page.screenshot({ path: file });
  await page.close();
  console.log('✓', file);
}
await browser.close();
