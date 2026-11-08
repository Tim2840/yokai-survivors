import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { AFFIX_COUNT, affixPool, rollAffixes } from '../../src/data/affixes';
import { ITEM_RARITY_MULT, itemValue } from '../../src/data/items';
import { RARITIES } from '../../src/data/rarity';
import { Rng } from '../../src/lib/random';

afterEach(() => resetTuning());

describe('詞條（D53：技法卡也帶隨機的能力值加成，越稀有越好、越多條）', () => {
  it('候選 = 屬性法具（不含取捨道具）；條數 凡 1／良 2／珍 3／極 4，越稀有越多', () => {
    const ids = affixPool().map((d) => d.id);
    expect(ids).toEqual(['power', 'atkSpeed', 'area', 'hp', 'speed', 'armor', 'regen', 'dodge']);
    const counts = RARITIES.map((r) => AFFIX_COUNT[r]);
    expect(counts).toEqual([1, 2, 3, 4]);
  });

  it('全掃：每個稀有度、很多種子——條數正確、同一張不重複、數值 = 法具一級 × 稀有度倍率（越稀有越大）', () => {
    for (const r of RARITIES) {
      for (let seed = 1; seed <= 60; seed++) {
        const a = rollAffixes(new Rng(seed), r);
        expect(a, `${r}／${seed} 條數`).toHaveLength(AFFIX_COUNT[r]);
        expect(new Set(a.map((x) => x.item)).size, `${r}／${seed} 重複`).toBe(a.length);
        for (const x of a) {
          const d = affixPool().find((p) => p.id === x.item)!;
          expect(x.value).toBeCloseTo(itemValue(d, r));
          expect(x.value).toBeCloseTo((d.perLevel ?? 0) * ITEM_RARITY_MULT[r]);
        }
      }
    }
    // 同一件法具：越稀有數值越大
    const v = (r: (typeof RARITIES)[number]) => itemValue(affixPool()[0], r);
    expect(v('rare')).toBeGreaterThan(v('common'));
    expect(v('epic')).toBeGreaterThan(v('rare'));
    expect(v('legend')).toBeGreaterThan(v('epic'));
  });

  it('固定種子可以重現；不同種子不全一樣（「每張卡的加成不一樣」）', () => {
    expect(rollAffixes(new Rng(9), 'epic')).toEqual(rollAffixes(new Rng(9), 'epic'));
    const sets = new Set<string>();
    for (let s = 1; s <= 30; s++) sets.add(rollAffixes(new Rng(s), 'rare').map((x) => x.item).join(','));
    expect(sets.size).toBeGreaterThan(5);
  });

  it('發牌：升級卡裡的每一張技法卡都帶詞條，條數 = 那張卡稀有度的條數（舊版技法卡沒有詞條會紅）', () => {
    tuning.stageSeconds = 600;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) {
      const run = new Run({ seed, bus: new EventBus() });
      run.god = true;
      run.devTechNext();
      for (let g = 0; g < 60 && !run.awaitingPick; g++) run.addXp(10);
      const tech = run.offer?.find((c) => c.cardId.startsWith('tech:'));
      if (!tech) continue;
      expect(tech.affixes, `seed ${seed}`).toBeTruthy();
      expect(tech.affixes).toHaveLength(AFFIX_COUNT[tech.rarity]);
      seen.add(tech.rarity);
    }
    // 玩家等級低時只會抽到凡、良；四種稀有度的條數由上面的全掃守著
    expect(seen.size).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('選了技法卡：詞條的能力值真的加在身上（和直接加同樣的值一樣）；沒有詞條的升級卡不受影響', () => {
    tuning.stageSeconds = 600;
    for (const seed of [3, 4, 5, 6, 7]) {
      const a = new Run({ seed, bus: new EventBus() });
      a.god = true;
      a.devTechNext();
      for (let g = 0; g < 60 && !a.awaitingPick; g++) a.addXp(10);
      const i = a.offer!.findIndex((c) => c.cardId.startsWith('tech:'));
      if (i < 0) continue;
      const card = a.offer![i];
      const b = new Run({ seed, bus: new EventBus() });
      for (const x of card.affixes!) b.stats.addCard(x.stat, x.value);
      a.chooseCard(i);
      const sa = a.stats.value;
      const sb = b.stats.value;
      for (const k of Object.keys(sb) as (keyof typeof sb)[]) if (k !== 'maxHp') expect(sa[k], `${seed}／${String(k)}`).toBeCloseTo(sb[k] as number);
      expect(sa.maxHp).toBeCloseTo(sb.maxHp);
      expect(card.affixes!.length).toBeGreaterThan(0);
    }
  });
});
