/** 地形種類（docs/03 第 2 節）。M1 用到草地、淺水、深水、岩地（障礙）。 */
export const TERRAIN_IDS = ['grass', 'shallow', 'deep', 'mud', 'rock', 'bamboo', 'stone', 'spring'] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];

export interface TerrainDef {
  /** 對所有單位的移動速度倍率（docs/03 第 2 節） */
  speed: number;
  /** 人類能不能走 */
  walkable: boolean;
  /** 流場的通行成本（越大越繞開；1 = 平地） */
  cost: number;
  /** 地形頂點色 key（palette） */
  color: string;
}

export const TERRAIN: Record<TerrainId, TerrainDef> = {
  grass: { speed: 1, walkable: true, cost: 1, color: '#4f7a55' },
  shallow: { speed: 0.8, walkable: true, cost: 1.5, color: '#4c7f8f' },
  deep: { speed: 1, walkable: false, cost: 1, color: '#25506b' },
  mud: { speed: 0.7, walkable: true, cost: 2, color: '#5b4a3a' },
  rock: { speed: 1, walkable: true, cost: 1, color: '#7b7d82' },
  bamboo: { speed: 1, walkable: true, cost: 1.2, color: '#5d8a58' },
  stone: { speed: 1.05, walkable: true, cost: 1, color: '#9a9488' },
  spring: { speed: 1, walkable: true, cost: 1, color: '#7fb6b0' },
};

/** 高低差（docs/03 第 4 節）：上坡／下坡的速度倍率、陡坡（視為牆）的角度 */
export const SLOPE = {
  uphill: 0.85,
  downhill: 1.1,
  /** 沿移動方向的高度變化率（公尺/公尺）超過這個才算上／下坡 */
  threshold: 0.08,
  /** 超過這個角度（度）的格子視為牆 */
  wallDeg: 35,
} as const;
