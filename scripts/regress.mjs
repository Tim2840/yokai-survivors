// 回歸執行器：NODE_PATH=node_modules node scripts/regress.mjs [--only b1,r1] [--list]
// 要先開著 `npx vite --port 5173`（或設 BASE_URL）。每支回歸登記 meta：id（唯一）、desc、max（總秒數）、stall（單步秒數）。
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, BASE } from './regress/lib.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'regress');
const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const only = onlyArg ? new Set(onlyArg.split(',')) : null;

const suites = [];
for (const f of readdirSync(dir).sort()) {
  if (!f.endsWith('.mjs') || f === 'lib.mjs') continue;
  const mod = await import(pathToFileURL(join(dir, f)).href);
  if (!mod.meta || !mod.run) continue;
  suites.push({ file: f, ...mod });
}
const ids = suites.map((s) => s.meta.id);
const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dup.length) {
  console.error(`回歸 id 重複：${dup.join(', ')}`);
  process.exit(1);
}
if (args.includes('--list')) {
  for (const s of suites) console.log(`${s.meta.id.padEnd(6)} ${s.meta.desc}（max ${s.meta.max} 秒、stall ${s.meta.stall} 秒）`);
  process.exit(0);
}
if (only) for (const id of only) if (!ids.includes(id)) {
  console.error(`沒有這支回歸：${id}`);
  process.exit(1);
}

// 暖機：剛啟動的 Vite 第一次載入很慢，先載一次
try {
  await fetch(BASE);
} catch {
  console.error(`連不到 ${BASE}：先開 npx vite --port 5173`);
  process.exit(1);
}

const browser = await launch();
const rows = [];
let failed = 0;
for (const s of suites) {
  if (only && !only.has(s.meta.id)) continue;
  const t0 = Date.now();
  let status = '✓';
  let note = '';
  try {
    const out = await Promise.race([
      s.run(browser),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`超過 max ${s.meta.max} 秒`)), s.meta.max * 1000)),
    ]);
    if (Array.isArray(out) && out.length) note = `截圖 ${out.length} 張`;
  } catch (e) {
    status = '✗';
    note = String(e && e.message ? e.message : e);
    failed++;
  }
  rows.push({ id: s.meta.id, status, sec: ((Date.now() - t0) / 1000).toFixed(1), note });
  console.log(`${status} ${s.meta.id} ${s.meta.desc}（${rows.at(-1).sec} 秒）${note ? '\n   ' + note : ''}`);
}
await browser.close();
console.log(`\n總表：${rows.length - failed}／${rows.length} 通過`);
process.exit(failed ? 1 : 0);
