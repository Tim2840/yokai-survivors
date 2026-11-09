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
  // 第 1 關：村人為主，中段出現足輕，後段出現弓手（每種敵人第一次出場都有字幕）
  [
    { id: 'villager', from: 0, weight: 10 },
    { id: 'ashigaru', from: 0.3, weight: 3, cap: 12 },
    { id: 'yumi', from: 0.6, weight: 2, cap: 6 },
  ],
  // 第 2 關：足輕更早、弓手更多
  [
    { id: 'villager', from: 0, weight: 8 },
    { id: 'ashigaru', from: 0.1, weight: 4, cap: 16 },
    { id: 'yumi', from: 0.3, weight: 3, cap: 10 },
  ],
  // 第 3 關起：沿用最後一行（E-2 會加新種類）
  [
    { id: 'villager', from: 0, weight: 7 },
    { id: 'ashigaru', from: 0, weight: 5, cap: 20 },
    { id: 'yumi', from: 0.15, weight: 4, cap: 14 },
  ],
];

/** 第 stage（0 起）關的配方；超過的用最後一行 */
export function recipeFor(stage: number): readonly RecipeEntry[] {
  return SPAWN_RECIPES[Math.min(Math.max(0, stage), SPAWN_RECIPES.length - 1)];
}
