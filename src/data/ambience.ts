/**
 * 場景氣氛（美術第一輪 A，docs/23）：每張地圖一組主題參數——天空與月、霧、環境光、地表細節、草叢、花、遠景樹、飄浮光點。
 * 全是資料：新地圖（竹林、水邊…）只要加一組；沒有對應的就用 highlands。數量是「整張地圖」的總數，手機用 mobileScale 打折。
 */
export interface AmbienceDef {
  sky: {
    /** 地平線、中段、頭頂（頂點色漸層）；地平線要和霧同色，地圖盡頭才接得起來 */
    horizon: string;
    mid: string;
    top: string;
    stars: { count: number; size: number; color: string };
    /** 月亮：方位角與仰角（度）、圓盤與光暈大小（天空球上的公尺） */
    moon: { azimuth: number; elevation: number; size: number; halo: number; color: string; light: number };
  };
  fog: { color: string; near: number; far: number };
  /** 半球光（天空色／地面色）：補月光照不到的暗面，不增減光源數量 */
  hemi: { sky: string; ground: string; intensity: number };
  /** 地表細節貼圖：每張貼圖鋪幾公尺、強度（0 = 沒有）、葉片筆畫數與顏色範圍（亮度） */
  groundDetail: { tile: number; strength: number };
  tufts: { count: number; height: [number, number]; colors: readonly string[] };
  flowers: { clusters: number; perCluster: number; colors: readonly string[] };
  bushes: { count: number; colors: readonly string[] };
  trees: { count: number; canopy: readonly string[]; /** 紅葉的比例 */ autumn: number; autumnColors: readonly string[]; trunk: string };
  motes: { count: number; color: string; size: number; height: [number, number]; range: number };
  /** 手機（觸控裝置）的數量倍率 */
  mobileScale: number;
}

export const AMBIENCE: Record<string, AmbienceDef> = {
  highlands: {
    sky: {
      horizon: '#2d4d5e',
      mid: '#27386e',
      top: '#0f1531',
      stars: { count: 260, size: 2.2, color: '#dfe6ff' },
      moon: { azimuth: 140, elevation: 14, size: 14, halo: 70, color: '#f2f4ff', light: 2.6 },
    },
    fog: { color: '#2d4d5e', near: 45, far: 140 },
    hemi: { sky: '#6a86c8', ground: '#33523f', intensity: 0.55 },
    groundDetail: { tile: 5, strength: 0.55 },
    tufts: { count: 4800, height: [0.28, 0.5], colors: ['#78ad68', '#9bc474', '#5f9a64', '#b0c97a'] },
    flowers: { clusters: 36, perCluster: 14, colors: ['#f6f1e6', '#f6a6bf', '#ffe08a', '#c9b4ff'] },
    bushes: { count: 90, colors: ['#68a86c', '#7ab872', '#5a9a78', '#d08a4a'] },
    trees: { count: 90, canopy: ['#46805c', '#58935f', '#3a7066'], autumn: 0.28, autumnColors: ['#c9503a', '#e0793a', '#d9a23a'], trunk: '#5a4636' },
    motes: { count: 110, color: '#d6f08a', size: 0.36, height: [0.6, 3.2], range: 26 },
    mobileScale: 0.65,
  },
};

export function ambienceFor(mapId: string): AmbienceDef {
  return AMBIENCE[mapId] ?? AMBIENCE.highlands;
}
