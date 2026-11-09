import { ELEMENT_MARKERS, MINIMAP, type MarkerGroup, type MarkerShape } from '../data/minimap';
import type { Run } from './run';

/** 小地圖的一個標記（用固定大小的陣列重複使用，不在每次更新時配置） */
export interface Marker {
  shape: MarkerShape;
  /** 功能色組；'portal'、'elite' 是特殊的 */
  group: MarkerGroup | 'portal' | 'elite';
  x: number;
  z: number;
  /** 高處（畫外框） */
  high: boolean;
  /** 重要（頭目、傳送門：畫大一點、脈動） */
  big: boolean;
}

const POOL: Marker[] = Array.from({ length: MINIMAP.maxMarkers }, () => ({ shape: 'circle', group: 'boon', x: 0, z: 0, high: false, big: false }));

/**
 * 蒐集這一刻要畫的標記：地圖要素（預告結束、還沒用掉才畫，和 HUD 箭頭一致）、傳送門、頭目、精英。
 * 一般敵人、魂火、補給品不畫（docs/21）。回傳數量；內容在 `markers`。
 */
export function collectMarkers(run: Run, out: Marker[] = POOL): number {
  const { map } = run;
  let hMin = Infinity;
  let hMax = -Infinity;
  for (let i = 0; i < map.heights.length; i += 7) {
    const h = map.heights[i];
    if (h < hMin) hMin = h;
    if (h > hMax) hMax = h;
  }
  const span = Math.max(1e-6, hMax - hMin);
  let n = 0;
  const put = (shape: MarkerShape, group: Marker['group'], x: number, z: number, y: number, big: boolean): void => {
    if (n >= out.length) return;
    const m = out[n++];
    m.shape = shape;
    m.group = group;
    m.x = x;
    m.z = z;
    m.high = (y - hMin) / span >= MINIMAP.highAt;
    m.big = big;
  };
  for (const s of run.elements.slots) {
    if (!s.active || s.announce > 0 || s.usedAge >= 0) continue;
    const st = ELEMENT_MARKERS[s.kind];
    put(st.shape, st.group, s.x, s.z, s.y, false);
  }
  if (run.portal.active) put('circle', 'portal', run.portal.x, run.portal.z, run.portal.y, true);
  const en = run.enemies;
  const b = run.director.bossIndex;
  if (b >= 0 && en.alive[b]) put('triangle', 'boss', en.x[b], en.z[b], map.heightAt(en.x[b], en.z[b]), true);
  for (let i = 0; i < en.capacity && n < out.length; i++) {
    if (!en.alive[i] || en.variant[i] !== 1) continue;
    put('circle', 'elite', en.x[i], en.z[i], hMin, false);
  }
  return n;
}

export const markers = POOL;
