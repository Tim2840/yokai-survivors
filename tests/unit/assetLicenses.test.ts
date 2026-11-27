import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 素材授權（使用者 2026-11-27：可用 CC0、CC-BY、OGA-BY；SA／GPL／NC 有法律風險不用）：src/assets 底下每個檔案都要有紀錄 */
const ALLOWED = new Set(['own', 'CC0', 'CC-BY 3.0', 'CC-BY 4.0', 'OGA-BY 3.0', 'OGA-BY 4.0']);
const ROOT = 'src/assets';
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe('素材授權紀錄', () => {
  const lic = JSON.parse(readFileSync(join(ROOT, 'LICENSES.json'), 'utf8')) as { files: Record<string, { origin: string; license: string; source: string; author: string }> };
  it('每個素材檔都有紀錄；授權在允許清單；外部素材有來源與作者（舊版沒有紀錄會紅）', () => {
    for (const f of walk(ROOT)) {
      const rel = f.slice(ROOT.length + 1);
      if (rel === 'LICENSES.json') continue;
      const r = lic.files[rel];
      expect(r, `${rel} 沒有授權紀錄（src/assets/LICENSES.json）`).toBeTruthy();
      expect(ALLOWED.has(r.license), `${rel} 的授權 ${r.license} 不在允許清單`).toBe(true);
      if (r.origin !== 'own') {
        expect(/^https?:\/\//.test(r.source), `${rel} 沒有來源網址`).toBe(true);
        expect(r.author.length > 0, `${rel} 沒有作者`).toBe(true);
      }
    }
  });
  it('紀錄裡的檔案都真的存在（刪檔要一起刪紀錄）', () => {
    const files = new Set(walk(ROOT).map((f) => f.slice(ROOT.length + 1)));
    for (const k of Object.keys(lic.files)) expect(files.has(k), `${k} 有紀錄但檔案不在`).toBe(true);
  });
});
