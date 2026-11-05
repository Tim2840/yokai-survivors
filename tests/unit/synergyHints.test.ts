import { describe, it, expect } from 'vitest';
import { SYNERGIES, synergyHints } from '../../src/data/synergies';

const lv = (o: Record<string, number>) => new Map(Object.entries(o));

describe('選卡時的聯動提示（D37：初／極兩段）', () => {
  it('全掃：每個聯動的兩件道具，都看得到下一段的進度；選了剛好到門檻 → completes', () => {
    for (const s of SYNERGIES) {
      const [a, b] = s.items;
      const ha = synergyHints(a, new Map()).find((h) => h.id === s.id)!;
      expect(ha, `${a} 看不到 ${s.id}`).toBeTruthy();
      expect(ha.nextTier).toBe(1);
      expect(ha.completes).toBe(false);
      expect(ha.progress.map((p) => p.card).sort()).toEqual([...s.items].sort());
      // b 已到初的門檻、a 差一級 → 選 a 就觸發初
      const r1 = s.tiers[0].requires;
      const near = synergyHints(a, lv({ [a]: r1[a] - 1, [b]: r1[b] })).find((h) => h.id === s.id)!;
      expect(near.completes, `${s.id} 差一級時選 ${a}`).toBe(true);
      // 已經在初、往極走
      const t1 = synergyHints(a, lv({ [a]: r1[a], [b]: r1[b] })).find((h) => h.id === s.id);
      const r2 = s.tiers[1].requires;
      if (r2[a] > r1[a]) expect(t1?.nextTier).toBe(2);
      // 到極之後不再提示
      expect(synergyHints(a, lv(r2)).find((h) => h.id === s.id)).toBeUndefined();
      void b;
    }
  });
  it('這件道具對下一段已經夠了（例：鬼火增殖已 2 級）就不提示', () => {
    expect(synergyHints('volley', lv({ volley: 2 })).find((h) => h.id === 'chainBlast')).toBeUndefined();
  });
  it('和聯動無關的卡沒有提示', () => {
    expect(synergyHints('hp', lv({ volley: 2 }))).toEqual([]);
  });
  it('一張卡可以同時屬於多個聯動', () => {
    expect(synergyHints('volley', new Map()).length).toBeGreaterThanOrEqual(2);
  });
});
