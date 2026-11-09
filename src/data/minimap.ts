import type { ElementKind } from './elements';

/**
 * 小地圖（D66，docs/21；使用者 2026-11-09：「我需要一個小地圖，讓玩家可以看什麼項目在哪邊」→「看你自己排程吧」，預設做法照 docs/21）。
 * 符號依**功能**分組、不依屬性（docs/19）；每種要素 = 一個形狀 + 一個功能色，雙重編碼（色盲也分得出來）。
 */
export type MarkerShape = 'circle' | 'square' | 'diamond' | 'triangle' | 'star';
export type MarkerGroup = 'boon' | 'risk' | 'trade' | 'reward' | 'luck' | 'boss' | 'upgrade' | 'swap' | 'challenge';

export const MINIMAP = {
  /** 邊長（CSS 像素）：手機直式、手機橫式、桌面；點一下放大 bigScale 倍 */
  size: { portrait: 112, landscape: 96, desktop: 160 },
  bigScale: 1.6,
  /** 動態層重畫頻率（Hz） */
  hz: 10,
  /** 符號大小（CSS 像素，小圖時） */
  markerSize: 7,
  bigMarkerSize: 6,
  /** 底圖 canvas 的最大邊（像素）：地圖格數更多時等比縮小 */
  baseMax: 256,
  /** 高度明暗的幅度（0～1） */
  shade: 0.35,
  /** 高處：高度比例 ≥ 這個就畫外框（山頂神社那類） */
  highAt: 0.6,
  /** 最多畫幾個標記（要素＋精英＋頭目＋傳送門） */
  maxMarkers: 64,
} as const;

export interface MarkerStyle {
  shape: MarkerShape;
  group: MarkerGroup;
}

/** 每種地圖要素的符號（新增要素一定要補，單元測試全掃） */
export const ELEMENT_MARKERS: Record<ElementKind, MarkerStyle> = {
  jizo: { shape: 'circle', group: 'boon' },
  barrier: { shape: 'square', group: 'boon' },
  altar: { shape: 'diamond', group: 'risk' },
  offering: { shape: 'circle', group: 'trade' },
  omikuji: { shape: 'star', group: 'luck' },
  chest: { shape: 'square', group: 'reward' },
  summon: { shape: 'triangle', group: 'boss' },
  fox: { shape: 'diamond', group: 'trade' },
  fuse: { shape: 'star', group: 'upgrade' },
  dosojin: { shape: 'circle', group: 'swap' },
  trial: { shape: 'triangle', group: 'challenge' },
  summit: { shape: 'star', group: 'challenge' },
};
