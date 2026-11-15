import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VFX_STYLE } from '../../src/data/vfx';
import { ULTS } from '../../src/data/ultimates';

/**
 * docs/30 第 ⑩ 節：換成新特效風格（不是 ink）的妖怪，特效目錄（scripts/shots/vfx-catalog.mjs）一定要有
 * 命中、打倒（一般／精英）、以及牠自己的每一個大招的格子——目錄是驗收用的（逐格看），沒有格子就等於沒驗收。
 * 「要記得做完整」的規則要有會擋下來的檢查（CLAUDE.md），這就是那個檢查。
 */
describe('特效目錄涵蓋所有事件', () => {
  // VFX_CATALOG 只給「舊版會紅」的自我測試用（指向拿掉一格的複本）
  const src = readFileSync(process.env.VFX_CATALOG ?? 'scripts/shots/vfx-catalog.mjs', 'utf8');
  for (const [yokai, style] of Object.entries(VFX_STYLE)) {
    if (style === 'ink') continue;
    it(`${yokai}（${style}）`, () => {
      const start = src.indexOf(`'${yokai}': [`);
      expect(start, `目錄沒有 ${yokai} 的格子`).toBeGreaterThanOrEqual(0);
      const block = src.slice(start, src.indexOf('\n  ],', start));
      expect(block).toMatch(/kill: true \}/);
      expect(block).toMatch(/kill: true, elite: true/);
      for (const u of ULTS.filter((d) => d.yokai === yokai)) expect(block, `少了大招 ${u.id} 的格子`).toContain(`ult: '${u.id}'`);
    });
  }
});
