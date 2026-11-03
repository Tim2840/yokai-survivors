// 主網址檢查：打包後的檔案（不是原始碼）不能帶測試工具。CLAUDE.md：「分享頁要測打包後的檔案；比對標籤一律加 \b」。
// 用法：npm run build && npm run build:single:main && node scripts/check-main-build.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const targets = [];
if (existsSync('dist-single/index.html')) targets.push('dist-single/index.html');
if (existsSync('dist/assets')) for (const f of readdirSync('dist/assets')) if (f.endsWith('.js')) targets.push(join('dist/assets', f));
if (!targets.length) {
  console.error('找不到打包檔：先跑 npm run build 與 npm run build:single:main');
  process.exit(1);
}
const banned = [/\b__game\b/, /\b__loop\b/, /\binstallDevApi\b/, /\btune-countScale\b/, /\bbtn-tune\b/, /yokai-survivors-tuning/];
let bad = 0;
for (const f of targets) {
  const text = readFileSync(f, 'utf8');
  for (const re of banned) if (re.test(text)) {
    console.error(`✗ ${f} 含有 ${re}`);
    bad++;
  }
  // 頂端介面（#app、#ui）還在：避免打包把入口弄丟
  if (f.endsWith('.html') && !/<div id="app"><\/div>/.test(text)) {
    console.error(`✗ ${f} 少了 #app`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log(`✓ 主網址檢查通過（${targets.length} 個檔案沒有測試工具）`);
