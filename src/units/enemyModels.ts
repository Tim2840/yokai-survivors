import type * as THREE from 'three';
import { buildVillagerGeometry } from './villager';
import { buildAshigaruGeometry, buildYumiGeometry } from './humans';

/** 每種人類的戰鬥用造型（單一幾何＋頂點色）。新增人類一定要在這裡加一行（單元測試全掃 ENEMY_IDS）。頭目（退魔僧）沿用村人造型放大 */
export const ENEMY_MODELS: Record<string, () => THREE.BufferGeometry> = {
  villager: buildVillagerGeometry,
  ashigaru: buildAshigaruGeometry,
  yumi: buildYumiGeometry,
  taimasou: buildVillagerGeometry,
};
