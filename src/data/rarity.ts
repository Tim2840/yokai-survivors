/** 稀有度（docs/02 第 4 節）：同一個效果的倍率 */
export const RARITIES = ['common', 'rare', 'epic', 'legend'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_MULT: Record<Rarity, number> = { common: 1.0, rare: 1.6, epic: 2.4, legend: 3.5 };

/**
 * 升級卡片的稀有度權重（docs/02 第 4.1 節）：凡固定 common；其他階 = clamp((L − from) × perLevel + base, 0, max) × (1 + 幸運/100)。
 * 數字放這裡（平衡模擬可用 --tune rarity.rare.max=50 之類臨時改）。
 */
export const CARD_RARITY = {
  common: 100,
  rare: { from: 0, base: 12, perLevel: 1.2, max: 40 },
  // Q60（使用者 2026-11-15「先開放珍極即可」）：珍、極在升級卡出現。
  // 2026-11-16（使用者「成長都太容易」）：Q60 時我另外調高的權重退回 docs/02 原本設計的公式（解鎖照舊）
  epic: { from: 4, base: 0, perLevel: 1.0, max: 16 },
  legend: { from: 10, base: 0, perLevel: 0.4, max: 5 },
};

/** 升級卡片的稀有度權重；L = 玩家等級，luck = 幸運 */
export function cardRarityWeights(L: number, luck: number, unlocked: Rarity[] = ['common', 'rare']): Record<Rarity, number> {
  const luckMul = 1 + luck / 100;
  const tier = (t: { from: number; base: number; perLevel: number; max: number }) => Math.min(t.max, Math.max(0, (L - t.from) * t.perLevel + t.base)) * luckMul;
  const w: Record<Rarity, number> = {
    common: CARD_RARITY.common,
    rare: tier(CARD_RARITY.rare),
    epic: tier(CARD_RARITY.epic),
    legend: tier(CARD_RARITY.legend),
  };
  // 沒解鎖的階：權重回給下一個較低的已解鎖階
  for (let i = RARITIES.length - 1; i > 0; i--) {
    const r = RARITIES[i];
    if (!unlocked.includes(r)) {
      w[RARITIES[i - 1]] += w[r];
      w[r] = 0;
    }
  }
  return w;
}
