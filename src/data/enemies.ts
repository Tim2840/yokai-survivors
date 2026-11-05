/** 人類（docs/04 第 3.1 節）。M1 只有村人。 */
export interface EnemyDef {
  id: string;
  /** 威脅點數（波次預算的成本） */
  points: number;
  hp: number;
  speed: number;
  /** 接觸傷害 */
  contact: number;
  radius: number;
  /** 每個虛擬波的 HP 成長（沒寫就用 WAVES.hpPerWave）；D30：每種敵人可以有自己的成長曲線 */
  hpPerWave?: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  villager: { id: 'villager', points: 1, hp: 10, speed: 2.0, contact: 5, radius: 0.4 },
  /** 退魔僧（頭目佔位，docs/04 第 3.2 節）：M1.5 用放大的村人造型；HP 是 M1.5 手感佔位（docs/04 寫 6000，M1.5 玩家火力還不夠），依試玩調 */
  /** 小頭目（召喚祭壇叫出來的；大頭目那一關同一隻 × 大頭目倍率）。HP 不吃虛擬波數，改吃「召喚時間」（D34） */
  taimasou: { id: 'taimasou', points: 30, hp: 2500, speed: 1.4, contact: 20, radius: 1.0 },
};

export const ENEMY_IDS = Object.keys(ENEMIES);
