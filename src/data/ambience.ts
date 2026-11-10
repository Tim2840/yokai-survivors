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
    /** 主光（月光／日光）真正照過來的方位角（度）。和月亮圓盤分開：預設鏡頭從 +z 看，光從鏡頭這一側來，角色的臉才不會背光（D72） */
    lightAzimuth: number;
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
  /** 地形顏色的倍率（白天要更亮、更飽和；沒寫 = 不變） */
  terrainTint?: string;
  /** 玩家身上那盞光的強度倍率（白天不需要那麼亮；沒寫 = 1） */
  playerLight?: number;
  /** 邊緣光強度倍率（look.rim × 這個；沒寫 = 1）：夜晚的月光邊緣光可以重一點 */
  rim?: number;
}

export const AMBIENCE: Record<string, AmbienceDef> = {
  highlands: {
    sky: {
      horizon: '#2d4d5e',
      mid: '#27386e',
      top: '#0f1531',
      stars: { count: 260, size: 2.2, color: '#dfe6ff' },
      moon: { azimuth: 140, elevation: 14, size: 14, halo: 70, color: '#f2f4ff', light: 2.6 },
      lightAzimuth: 65,
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

/** 白天版（日系 RPG 樣張用，docs/23 第 8 節）：亮藍天空、暖白日光、明亮飽和的草地 */
AMBIENCE['highlands@day'] = {
  ...AMBIENCE.highlands,
  sky: {
    horizon: '#cfe6f2',
    mid: '#8cc4ec',
    top: '#4f93d8',
    stars: { count: 0, size: 2, color: '#ffffff' },
    moon: { azimuth: 140, elevation: 22, size: 9, halo: 60, color: '#fff2d6', light: 3.9 },
    lightAzimuth: 65,
  },
  fog: { color: '#cfe6f2', near: 40, far: 150 },
  hemi: { sky: '#a9c6f0', ground: '#6c8a4a', intensity: 1.2 },
  groundDetail: { tile: 5, strength: 0.3 },
  tufts: { count: 1700, height: [0.32, 0.55], colors: ['#5fae54', '#74be5c', '#4c9a54', '#86c264'] },
  flowers: { clusters: 22, perCluster: 12, colors: ['#ffffff', '#ff9cc0', '#ffe066', '#b9a4ff'] },
  bushes: { count: 90, colors: ['#5fb55a', '#78c562', '#4aa36a', '#e09a4a'] },
  trees: { count: 90, canopy: ['#4f9a4e', '#63ad55', '#3f8a5a'], autumn: 0.2, autumnColors: ['#e0663a', '#f0943a', '#e8c14a'], trunk: '#7a5a3e' },
  // 白天沒有螢火（以前這裡的亮點在白天看起來像灰塵）
  motes: { count: 0, color: '#fff6c0', size: 0.25, height: [0.8, 3.0], range: 24 },
  terrainTint: '#dcf8bc',
  playerLight: 0.12, // 2026-11-10「太炫光」：白天身上那盞光只留一點點（照在地上會亮成一圈）
};

/** 黃昏版：橘紅的天、低斜的暖光、偏紫的影子 */
AMBIENCE['highlands@dusk'] = {
  ...AMBIENCE['highlands@day'],
  sky: {
    horizon: '#f2b483',
    mid: '#c9789a',
    top: '#4a4f8f',
    stars: { count: 60, size: 2, color: '#ffe9d6' },
    moon: { azimuth: 140, elevation: 9, size: 16, halo: 90, color: '#ffd09a', light: 3.6 },
    lightAzimuth: 75,
  },
  fog: { color: '#f2b483', near: 40, far: 150 },
  hemi: { sky: '#c4a8d8', ground: '#7a7090', intensity: 1.35 },
  terrainTint: '#f2e0b4',
  motes: { count: 60, color: '#ffe08a', size: 0.3, height: [0.8, 3.0], range: 24 },
  tufts: { count: 1700, height: [0.32, 0.55], colors: ['#8aa850', '#a0b45a', '#7a9a50', '#b8b866'] },
  playerLight: 0.3,
};

/**
 * 依關卡換時段（D72，使用者照預設）：每張地圖的第 1 關白天、第 2 關黃昏、大頭目那一關夜晚（妖怪感最強）。
 * 回傳 ambienceFor 用的後綴；夜晚就是沒有後綴的基本主題。
 */
export const TIME_OF_DAY = ['@day', '@dusk'] as const;
export function timeOfDaySuffix(stageIndex: number, bossStage: boolean): string {
  if (bossStage) return '';
  return TIME_OF_DAY[Math.min(stageIndex, TIME_OF_DAY.length - 1)];
}

/** mapId 的主題；suffix（例 '@day'）有對應的就用，沒有就退回 mapId、再退回 highlands */
export function ambienceFor(mapId: string, suffix = ''): AmbienceDef {
  return AMBIENCE[mapId + suffix] ?? (suffix ? AMBIENCE['highlands' + suffix] : undefined) ?? AMBIENCE[mapId] ?? AMBIENCE.highlands;
}
