/**
 * 出場配方（docs/22 第 6 節）：第 N 關有哪些人類、從這一關的第幾成開始出現、權重與同時在場的上限。
 * 全是資料：sim 可以用 `--tune` 調，新增敵人只要在這裡加一行。精英與頭目不走配方（精英目前是村人，E-2 加詞綴）。
 */
export interface RecipeEntry {
  id: string;
  /** 這一關經過幾成之後才會出現（0 = 開局就有） */
  from: number;
  weight: number;
  /** 同時在場的上限（遠程與盾兵不要太多；沒寫 = 不限） */
  cap?: number;
}

export const SPAWN_RECIPES: readonly (readonly RecipeEntry[])[] = [
  // 第 1 關：村人為主；足輕 15%、弓手 30% 就出現（D93 夜行 B：第 2 段的壓力靠「要繞背、要閃箭」，不靠更硬；原本 30%／60%）
  [
    { id: 'villager', from: 0, weight: 10 },
    { id: 'ashigaru', from: 0.15, weight: 3, cap: 12 },
    { id: 'yumi', from: 0.3, weight: 2, cap: 6 },
  ],
  // 第 2 關（E-2 專屬配方）：新面孔依序登場——探子開局、僧兵 20%、陰陽師 40%、太鼓兵 55%；村人少一點，讓新敵人看得到
  [
    { id: 'villager', from: 0, weight: 7 },
    { id: 'ashigaru', from: 0.1, weight: 3, cap: 14 },
    { id: 'yumi', from: 0.25, weight: 2, cap: 8 },
    { id: 'shinobi', from: 0, weight: 2, cap: 10 },
    { id: 'sohei', from: 0.2, weight: 1.2, cap: 6 },
    { id: 'onmyoji', from: 0.4, weight: 1, cap: 4 },
    { id: 'taiko', from: 0.55, weight: 0.8, cap: 3 },
  ],
  // 第 3 關起：全部開局就有（大關的中間關、最後一關）
  [
    { id: 'villager', from: 0, weight: 6 },
    { id: 'ashigaru', from: 0, weight: 4, cap: 18 },
    { id: 'yumi', from: 0.1, weight: 3, cap: 12 },
    { id: 'shinobi', from: 0, weight: 2.5, cap: 12 },
    { id: 'sohei', from: 0, weight: 1.5, cap: 8 },
    { id: 'onmyoji', from: 0.1, weight: 1.2, cap: 5 },
    { id: 'taiko', from: 0.2, weight: 1, cap: 4 },
  ],
];

/** 第 stage（0 起）關的配方；超過的用最後一行 */
export function recipeFor(stage: number): readonly RecipeEntry[] {
  return SPAWN_RECIPES[Math.min(Math.max(0, stage), SPAWN_RECIPES.length - 1)];
}
