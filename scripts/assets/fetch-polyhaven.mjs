// 從 Poly Haven 抓貼圖候選（docs/36、docs/37；Poly Haven 全站 CC0，仍逐一記下作者與來源）。
// 用法：node scripts/assets/fetch-polyhaven.mjs <素材 id> [...]  → candidates/polyhaven/<id>/<id>_<種類>.jpg（不進版本庫）＋ candidates/manifest.json
// 只抓 1k 的 Diffuse、nor_gl、AO（遊戲裡最多用到 512）。ambientCG 的下載會轉到 acg-download.struffelproductions.com，環境代理擋（2026-11-27），所以先用 Poly Haven。
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = 'candidates';
const getText = (u) => execFileSync('curl', ['-sS', '--fail', '--max-time', '60', u], { maxBuffer: 64 << 20 }).toString('utf8');
const getFile = (u, out) => execFileSync('curl', ['-sS', '--fail', '--max-time', '600', '-o', out, u]);
mkdirSync(ROOT, { recursive: true });
const manPath = join(ROOT, 'manifest.json');
const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : {};

for (const id of process.argv.slice(2)) {
  const info = JSON.parse(getText(`https://api.polyhaven.com/info/${id}`));
  const files = JSON.parse(getText(`https://api.polyhaven.com/files/${id}`));
  const dir = join(ROOT, 'polyhaven', id);
  mkdirSync(dir, { recursive: true });
  const got = [];
  for (const kind of ['Diffuse', 'nor_gl', 'AO']) {
    const f = files[kind]?.['1k']?.jpg ?? files[kind]?.['1k']?.png;
    if (!f) continue;
    const out = join(dir, `${id}_${kind}.${f.url.split('.').pop()}`);
    if (!existsSync(out)) getFile(f.url, out);
    got.push(out);
  }
  const author = Object.keys(info.authors ?? {}).join('、');
  manifest[`polyhaven:${id}`] = { title: info.name, source: `https://polyhaven.com/a/${id}`, author, license: 'CC0', files: got, fetched: new Date().toISOString().slice(0, 10) };
  console.log(`✓ ${id}：${info.name}／${author}／CC0／${got.length} 個檔`);
}
writeFileSync(manPath, JSON.stringify(manifest, null, 2));
