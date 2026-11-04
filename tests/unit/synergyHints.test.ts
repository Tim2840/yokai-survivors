import { describe, it, expect } from 'vitest';
import { SYNERGIES, synergyHints } from '../../src/data/synergies';

describe('選卡時的聯動提示', () => {
  it('全掃：每個聯動的兩張卡，各自都看得到這個聯動；有另一張時 ready、已觸發時 done', () => {
    for (const s of SYNERGIES) {
      const [a, b] = s.requires;
      const ha = synergyHints(a, new Set(), []).find((h) => h.id === s.id);
      const hb = synergyHints(b, new Set(), []).find((h) => h.id === s.id);
      expect(ha, `${a} 看不到 ${s.id}`).toMatchObject({ partner: b, ready: false, done: false });
      expect(hb, `${b} 看不到 ${s.id}`).toMatchObject({ partner: a, ready: false, done: false });
      expect(synergyHints(a, new Set([b]), []).find((h) => h.id === s.id)?.ready).toBe(true);
      expect(synergyHints(a, new Set([b]), [s.id]).find((h) => h.id === s.id)?.done).toBe(true);
    }
  });
  it('和聯動無關的卡沒有提示', () => {
    expect(synergyHints('hp', new Set(['volley']), [])).toEqual([]);
  });
  it('一張卡可以同時屬於多個聯動', () => {
    expect(synergyHints('volley', new Set(), []).length).toBeGreaterThanOrEqual(2);
  });
});
