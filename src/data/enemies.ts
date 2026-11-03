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
}

export const ENEMIES: Record<string, EnemyDef> = {
  villager: { id: 'villager', points: 1, hp: 10, speed: 2.0, contact: 5, radius: 0.4 },
};

export const ENEMY_IDS = Object.keys(ENEMIES);
