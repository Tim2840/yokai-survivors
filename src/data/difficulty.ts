/**
 * 難度 %（D30 第二步，參考 Megabonk 的 Difficulty；docs/15 第 1.3 節）：一個玩家看得到的數字，所有「讓這局變難」的來源加總，
 * 再依比例影響敵人的生命、傷害與數量。來源：第幾關、第幾張地圖（之後：夜深度、貪婪祭壇…）。
 * 時間造成的成長另外算（每種敵人自己的每波成長，src/data/enemies.ts）。
 */
export const DIFFICULTY = {
  /** 每多一關 +50%（取代原本 STAGE.hpPerStage 的 HP 倍率）、每多一張地圖 +15% */
  perStage: 0.5,
  perMap: 0.15,
  /** 難度怎麼分配：敵人生命 ×(1 + D × hp)、傷害 ×(1 + D × damage)、湧出速率 ×(1 + D × spawn) */
  hp: 1,
  damage: 0.5,
  spawn: 0.33,
} as const;
