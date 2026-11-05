import { describe, expect, it } from 'vitest';
import { RARITIES, RARITY_MULT, cardRarityWeights } from '../../src/data/rarity';
import { ITEMS, ITEM_RARITY_MULT, GHOSTFIRE_LEVELS } from '../../src/data/items';
import { TRAINING, TRAINING_MAX_LEVEL, trainingPrice } from '../../src/data/meta';
import { ALTAR_BOON_PCT, ALTAR_CURSE, ALTAR_CURSE_IDS, ALTAR_EFFECT_COUNT, ALTAR_MAX_EFFECTS } from '../../src/data/altar';

// 資料表「全掃」：docs/02 的數字有沒有互相矛盾（這是結構與單調性檢查，不是平衡驗證）
describe('稀有度', () => {
  it('倍率隨階級遞增', () => {
    for (let i = 1; i < RARITIES.length; i++) expect(RARITY_MULT[RARITIES[i]]).toBeGreaterThan(RARITY_MULT[RARITIES[i - 1]]);
  });
  it('權重：L=10、幸運 0 時 凡77%／良18%／珍5%／極0%（docs/02 4.1）', () => {
    const w = cardRarityWeights(10, 0, [...RARITIES]);
    const sum = RARITIES.reduce((s, r) => s + w[r], 0);
    expect(w.common / sum).toBeCloseTo(0.77, 2);
    expect(w.rare / sum).toBeCloseTo(0.185, 2);
    expect(w.legend).toBe(0);
  });
  it('幸運 100 讓非凡權重加倍', () => {
    const a = cardRarityWeights(12, 0, [...RARITIES]);
    const b = cardRarityWeights(12, 100, [...RARITIES]);
    expect(b.rare).toBeCloseTo(a.rare * 2);
    expect(b.common).toBe(a.common);
  });
  it('沒解鎖的階權重為 0、回給較低階', () => {
    const w = cardRarityWeights(20, 0, ['common', 'rare']);
    expect(w.epic).toBe(0);
    expect(w.legend).toBe(0);
    expect(w.rare).toBeGreaterThan(cardRarityWeights(20, 0, [...RARITIES]).rare);
  });
});

describe('法具（D30）', () => {
  it('id 唯一、每級數值 > 0、最高等級合理（屬性 5 級、多一顆 2 級）', () => {
    expect(new Set(ITEMS.map((c) => c.id)).size).toBe(ITEMS.length);
    for (const c of ITEMS) {
      if (c.kind !== 'weapon') expect(c.perLevel ?? 0, c.id).toBeGreaterThan(0);
      if (c.kind === 'stat') expect(c.maxLevel, c.id).toBe(5);
    }
    expect(ITEMS.find((i) => i.id === 'volley')!.maxLevel).toBe(2);
  });
  it('稀有度倍率溫和、單調遞增，極階 ≤ 凡的 2 倍（docs/15：Megabonk 約 1.0～2.0）', () => {
    for (let i = 1; i < RARITIES.length; i++) expect(ITEM_RARITY_MULT[RARITIES[i]]).toBeGreaterThan(ITEM_RARITY_MULT[RARITIES[i - 1]]);
    expect(ITEM_RARITY_MULT.legend / ITEM_RARITY_MULT.common).toBeLessThanOrEqual(2);
  });
  it('主武器 8 級表：每一級都有加東西，而且不是每級都一樣', () => {
    expect(GHOSTFIRE_LEVELS).toHaveLength(7);
    for (const st of GHOSTFIRE_LEVELS) expect(Object.keys(st).length).toBeGreaterThan(0);
    expect(new Set(GHOSTFIRE_LEVELS.map((s) => JSON.stringify(Object.keys(s).sort()))).size).toBeGreaterThanOrEqual(4);
  });
});

describe('局外修行', () => {
  it('每項滿級總價：基礎價 50 1,434（docs/02 7.1）', () => {
    const t = TRAINING.find((x) => x.basePrice === 50)!;
    let total = 0;
    for (let lv = 0; lv < TRAINING_MAX_LEVEL; lv++) total += trainingPrice(t, lv);
    expect(total).toBe(1434);
  });
  it('價格逐級上升', () => {
    for (const t of TRAINING) for (let lv = 1; lv < TRAINING_MAX_LEVEL; lv++) expect(trainingPrice(t, lv)).toBeGreaterThan(trainingPrice(t, lv - 1));
  });
  it('全部 8 項滿級總價約 12,000', () => {
    let total = 0;
    for (const t of TRAINING) for (let lv = 0; lv < TRAINING_MAX_LEVEL; lv++) total += trainingPrice(t, lv);
    expect(total).toBeGreaterThan(11000);
    expect(total).toBeLessThan(12500);
  });
});

describe('詛咒祭壇（D27）', () => {
  it('好處與每一項詛咒的數字都隨稀有度變大；每階抽的效果數遞增或持平且不超過上限', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      const a = RARITIES[i - 1];
      const b = RARITIES[i];
      expect(ALTAR_BOON_PCT[b]).toBeGreaterThan(ALTAR_BOON_PCT[a]);
      for (const id of ALTAR_CURSE_IDS) expect(ALTAR_CURSE[b][id]).toBeGreaterThan(ALTAR_CURSE[a][id]);
      expect(ALTAR_EFFECT_COUNT[b]).toBeGreaterThanOrEqual(ALTAR_EFFECT_COUNT[a]);
    }
    for (const r of RARITIES) {
      expect(ALTAR_EFFECT_COUNT[r]).toBeGreaterThanOrEqual(2);
      expect(ALTAR_EFFECT_COUNT[r]).toBeLessThanOrEqual(ALTAR_MAX_EFFECTS);
    }
  });
});

describe('局外修行總價（docs/02 7.1／7.4 審查重算）', () => {
  it('8 項滿級共 12,043', () => {
    let total = 0;
    for (const t of TRAINING) for (let lv = 0; lv < TRAINING_MAX_LEVEL; lv++) total += trainingPrice(t, lv);
    expect(total).toBe(12043);
  });
});

