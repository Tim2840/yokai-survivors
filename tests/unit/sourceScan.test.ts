import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zhTW } from '../../src/i18n/zh-TW';
import { CHANGELOG } from '../../src/game/changelog';

// 原始碼「全掃」（不是清單）：src 底下每一個 .ts 檔都要過。
const SRC = join(__dirname, '../../src');
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}
const files = walk(SRC).map((p) => ({ path: relative(SRC, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }));

/** 把註解拿掉、只留字串字面值（簡單的掃描器：分辨 '…'、"…"、`…`、// 與 /* *​/） */
export function stringLiterals(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      i = src.indexOf('*/', i + 2);
      i = i < 0 ? src.length : i + 2;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') {
          s += src[j + 1];
          j += 2;
          continue;
        }
        s += src[j++];
      }
      out.push(s);
      i = j + 1;
    } else i++;
  }
  return out;
}

const CJK = /[㐀-鿿豈-﫿]/;

describe('原始碼全掃', () => {
  it('掃描器本身：new Error 的訊息放過、其他字串不放過', () => {
    const t = "throw new Error(`沒有：${id}`); const a = '玩家看得到';".replace(/new Error\(\s*(['"`])(?:\\.|(?!\1).)*\1/g, 'new Error(');
    expect(stringLiterals(t).filter((x) => CJK.test(x))).toEqual(['玩家看得到']);
  });

  it('掃描器本身：註解裡的中文不算、字串裡的算', () => {
    const lits = stringLiterals("// 註解\nconst a = '字串'; /* 也是註解 */ const b = \"x\"; const u = 'http://x';");
    expect(lits).toEqual(['字串', 'x', 'http://x']);
  });

  it('玩家看得到的字不寫死：src/i18n 以外的字串字面值不含中文', () => {
    const bad: string[] = [];
    for (const f of files) {
      if (f.path.startsWith('i18n/')) continue;
      // 開發用的錯誤訊息（new Error(...)）允許中文：玩家看不到；其餘字串一律不准
      const text = f.text.replace(/new Error\(\s*(['"`])(?:\\.|(?!\1).)*\1/g, 'new Error(');
      for (const s of stringLiterals(text)) {
        if (CJK.test(s)) bad.push(`${f.path}: ${s}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('不用 Math.random（一律用固定種子的 Rng）', () => {
    const bad = files.filter((f) => /\bMath\.random\b/.test(f.text.replace(/\/\/.*$/gm, ''))).map((f) => f.path);
    expect(bad).toEqual([]);
  });

  it('不用 flatShading（圓潤卡通規則）', () => {
    const bad = files.filter((f) => /\bflatShading\s*:\s*true\b/.test(f.text)).map((f) => f.path);
    expect(bad).toEqual([]);
  });
});

// docs/12 第 3 節禁用清單（大陸用語）。「質量」「文件」在遊戲介面裡幾乎都是誤用，所以不分語境一律禁。
const FORBIDDEN = ['視頻', '質量', '信息', '網絡', '軟件', '硬件', '數據', '屏幕', '鼠標', '打印', '智能', '默認', '設置', '激活', '鏈接', '文件', '加載', '界面', '用戶', '優化',
  '這兒', '那兒', '哪兒', '踏實', '凳子', '歇口氣', '歇歇', '咱', '啥', '咋', '甭', '挺好', '犯困', '外頭', '扔', '胳膊', '瞧'];

describe('用詞（docs/12）', () => {
  it('i18n 每一句都沒有禁用詞', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(zhTW)) for (const w of FORBIDDEN) if (v.includes(w)) bad.push(`${k}: ${w}`);
    expect(bad).toEqual([]);
  });
  it('每句 ≤ 36 字（docs/12 第 2 節）', () => {
    const long = Object.entries(zhTW).filter(([, v]) => [...v].length > 36);
    expect(long).toEqual([]);
  });
  it('程式碼引用的 i18n key 都存在（掃 t(\'…\')）', () => {
    const missing: string[] = [];
    for (const f of files) for (const m of f.text.matchAll(/\bt\('([^']+)'/g)) if (!(m[1] in zhTW)) missing.push(`${f.path}: ${m[1]}`);
    expect(missing).toEqual([]);
  });
});

describe('更新紀錄', () => {
  it('CONTENT_VERSION 等於最新一筆，版本由新到舊連續；文字都在 i18n', async () => {
    const { CONTENT_VERSION } = await import('../../src/game/changelog');
    expect(CHANGELOG[0].version).toBe(CONTENT_VERSION);
    CHANGELOG.forEach((e, i) => {
      expect(e.version).toBe(CONTENT_VERSION - i);
      expect(e.text in zhTW).toBe(true);
    });
  });
});
