import type { TerrainId } from '../terrain';

/**
 * M1 原型地圖（docs/05 M1：「一塊有高度差的平地」）。M3 換成「夜之村田野」（docs/03 6.1）。
 * 全部資料：高度由幾個「丘」疊加，地形由「圓形區域」規則決定，障礙是幾顆石燈籠／岩石。
 */
export interface Hill {
  x: number;
  z: number;
  /** 高度（公尺）與寬度（高斯 σ，公尺） */
  height: number;
  sigma: number;
}
export interface Zone {
  x: number;
  z: number;
  r: number;
  type: TerrainId;
}
export interface Obstacle {
  x: number;
  z: number;
  r: number;
  /** 視覺：石燈籠或岩石 */
  kind: 'lantern' | 'rock';
}

export interface MapDef {
  id: string;
  /** 地圖大小（公尺），中心在原點 */
  size: { w: number; d: number };
  /** 格子大小（公尺）：地形圖、流場、阻擋圖共用 */
  cell: number;
  /** 細節雜訊的種子與高度（公尺） */
  noiseSeed: number;
  noiseHeight: number;
  hills: Hill[];
  /** 後面的蓋掉前面的 */
  zones: Zone[];
  obstacles: Obstacle[];
  playerStart: { x: number; z: number };
}

export const PROTOTYPE_MAP: MapDef = {
  id: 'prototype',
  size: { w: 50, d: 50 },
  cell: 1,
  noiseSeed: 7,
  noiseHeight: 0.12,
  hills: [
    { x: 10, z: -8, height: 2.2, sigma: 4 },
    { x: -12, z: -12, height: 1.2, sigma: 3.5 },
  ],
  zones: [
    { x: -10, z: 8, r: 6.5, type: 'shallow' },
    { x: -10, z: 8, r: 3, type: 'deep' },
    { x: 12, z: 12, r: 4, type: 'shallow' },
  ],
  obstacles: [
    { x: 6, z: 5, r: 0.9, kind: 'rock' },
    { x: -6, z: -4, r: 0.9, kind: 'rock' },
    { x: 14, z: 0, r: 0.6, kind: 'lantern' },
    { x: -14, z: -2, r: 0.6, kind: 'lantern' },
    { x: 0, z: -12, r: 1.2, kind: 'rock' },
    { x: 3, z: 14, r: 0.6, kind: 'lantern' },
    { x: -3, z: 14, r: 0.6, kind: 'lantern' },
  ],
  playerStart: { x: 0, z: 0 },
};
