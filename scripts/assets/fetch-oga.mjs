// 從 OpenGameArt 抓候選素材（使用者 2026-11-27：自動抓免費素材來試；docs/14 Q74）。
// 用法：node scripts/assets/fetch-oga.mjs <content 名稱> [...]  → candidates/<名稱>/（不進版本庫）＋ candidates/manifest.json
// 只收 CC0、CC-BY、OGA-BY（2026-11-27 放寬；SA／GPL／NC 拒絕）；記下來源網址、作者、授權、檔案、下載時間。真的要放進遊戲的素材另外搬到 src/assets 並寫進 src/assets/LICENSES.json（單元測試守著）。
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = 'candidates';
// 用 curl（走環境的代理；Node 內建 fetch 不走代理，DNS 會失敗）
const getText = (u) => execFileSync('curl', ['-sS', '--fail', '--max-time', '60', u], { maxBuffer: 64 << 20 }).toString('utf8');
const getFile = (u, out) => execFileSync('curl', ['-sS', '--fail', '--max-time', '600', '-o', out, u]);
const BASE = 'https://opengameart.org';
mkdirSync(ROOT, { recursive: true });
const manPath = join(ROOT, 'manifest.json');
const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : {};

for (const slug of process.argv.slice(2)) {
  const url = `${BASE}/content/${slug}`;
  const html = getText(url);
  const licBlock = (html.match(/License\(s\):([\s\S]{0,1500}?)<\/div>\s*<\/div>/) || [])[1] ?? '';
  const lics = [...new Set([...licBlock.matchAll(/>(CC0|CC-BY[^<]*|CC-BY-SA[^<]*|OGA-BY[^<]*|GPL[^<]*|LGPL[^<]*)</g)].map((m) => m[1].trim()))];
  const author = ((html.match(/Author:[\s\S]{0,300}?<a[^>]*>([^<]+)<\/a>/) || [])[1] ?? '').trim();
  const title = ((html.match(/<title>([^|<]+)/) || [])[1] ?? slug).trim();
  // 使用者 2026-11-27 放寬：CC0、CC-BY、OGA-BY 可用（要標示作者）；SA（衍生作品要同授權）、GPL、NC（不能商用）有法律風險，不下載。
  // 多重授權時只要其中一個允許就可以選那個（OpenGameArt 的多重授權是「任選其一」）
  const ok = lics.filter((l) => /^(CC0|CC-BY [34]\.0|OGA-BY [34]\.0)$/.test(l));
  if (ok.length === 0) {
    console.log(`✗ ${slug}：授權（${lics.join('、') || '沒抓到'}）不在允許清單，不下載`);
    continue;
  }
  const license = ok.includes('CC0') ? 'CC0' : ok[0];
  if (license !== 'CC0' && !author) {
    console.log(`✗ ${slug}：要標示作者但沒抓到作者名，不下載`);
    continue;
  }
  const files = [...new Set([...html.matchAll(/(https:\/\/opengameart\.org)?\/sites\/default\/files\/[^"'\s<>]+\.(zip|glb|gltf|fbx|obj|blend|png)/gi)].map((m) => (m[0].startsWith('http') ? m[0] : BASE + m[0])))].filter((f) => !/\/styles\//.test(f));
  const dir = join(ROOT, slug);
  mkdirSync(dir, { recursive: true });
  const got = [];
  for (const f of files) {
    const name = decodeURIComponent(f.split('/').pop());
    const out = join(dir, name);
    if (!existsSync(out)) {
      try {
        getFile(f, out);
      } catch (e) {
        console.log(`  ! ${name}：下載失敗 ${String(e).slice(0, 120)}`);
        continue;
      }
    }
    if (/\.zip$/i.test(name)) execFileSync('unzip', ['-o', '-q', out, '-d', join(dir, name.replace(/\.zip$/i, ''))]);
    got.push(name);
  }
  manifest[slug] = { title, source: url, author, license, files: got, fetched: new Date().toISOString().slice(0, 10) };
  console.log(`✓ ${slug}：${title}／${author || '（作者沒抓到）'}／${license}／${got.join('、')}`);
}
writeFileSync(manPath, JSON.stringify(manifest, null, 2));
