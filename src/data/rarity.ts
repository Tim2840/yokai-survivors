/** 稀有度（docs/02 第 4 節）：同一個效果的倍率 */
export const RARITIES = ['common', 'rare', 'epic', 'legend'] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_MULT: Record<Rarity, number> = { common: 1.0, rare: 1.6, epic: 2.4, legend: 3.5 };

/** 升級卡片的稀有度權重（docs/02 第 4.1 節）；L = 玩家等級，luck = 幸運 */
export function cardRarityWeights(L: number, luck: number, unlocked: Rarity[] = ['common', 'rare']): Record<Rarity, number> {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const luckMul = 1 + luck / 100;
  const w: Record<Rarity, number> = {
    common: 100,
    rare: Math.min(40, 12 + 1.2 * L) * luckMul,
    epic: clamp((L - 4) * 1.0, 0, 16) * luckMul,
    legend: clamp((L - 10) * 0.4, 0, 5) * luckMul,
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
