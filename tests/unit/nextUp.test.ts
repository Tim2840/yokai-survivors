import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 「接下來三項」（使用者 2026-11-17：「以後做好一個項目都要提示接下來的三個進度」）：
 * 回報最後照抄 docs/05 第 1.0 節。這裡守著那一節：剛好 3 項、有工作量、沒有混進已完成的。
 */
describe('docs/05 第 1.0 節：接下來三項', () => {
  const doc = readFileSync('docs/05-schedule.md', 'utf8');
  const start = doc.indexOf('## 1.0 接下來三項');
  it('有這一節，表格剛好 3 項，每項有工作量、沒有標成完成', () => {
    expect(start, '找不到「## 1.0 接下來三項」').toBeGreaterThanOrEqual(0);
    const sec = doc.slice(start, doc.indexOf('\n## ', start + 5));
    const rows = sec.split('\n').filter((l) => /^\| [0-9] \|/.test(l));
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r, `沒寫工作量：${r}`).toMatch(/天|小時/);
      expect(r, `已完成的項目還留在「接下來三項」：${r}`).not.toMatch(/完成|✓/);
    }
  });
});
