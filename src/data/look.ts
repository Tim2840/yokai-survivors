/**
 * 畫面風格（美術方向評估，docs/23 第 8 節）：
 * - classic：現在的樣子（夜晚、平滑的 3D 卡通）。
 * - jrpg：日系 RPG 樣張——整個畫面先畫在低解析度再放大（像素風）、物件邊緣描線、上下移軸景深（模型屋感）、白天的光。
 * D72 起預設是 jrpg；開發版可用 ?look=classic 看舊的樣子（打包時也可用 VITE_LOOK）。
 */
export interface LookDef {
  id: string;
  /** 像素化：低解析度畫面的「短邊」有幾個像素（0 = 不像素化）。依畫面大小換算放大倍率（可以不是整數），桌面與手機的像素粗細感一致 */
  pixelShort: number;
  /** 調色盤量化：每個色頻分幾階（0 = 不量化）、抖動強度（0～1；用 4×4 Bayer 矩陣，在低解析度像素上抖） */
  levels: number;
  dither: number;
  /** 描線：深色線的強度（0～1）、相對深度差從多少開始到多少算滿（越小越容易描到） */
  edge: number;
  edgeFrom: number;
  edgeTo: number;
  /** 移軸景深：模糊強度（0 = 不用）、清楚帶的位置（畫面高度比例，0 = 下緣） */
  tiltShift: number;
  tiltFocus: number;
  /** 卡通著色：光影分成幾階（0 = 平滑的一般著色）。像素畫的光影是一塊一塊的色階，不是平滑漸層 */
  toonSteps: number;
  /** 真陰影（太陽／月光投出來的影子，只有玩家、地圖上的物件、樹會投；敵人用腳下的圓影） */
  shadows: boolean;
  /** 真陰影的設定：覆蓋範圍（公尺，以玩家為中心的方形邊長的一半）、陰影圖邊長（像素；手機用 mobile）、偏移（避免自己的影子畫在自己身上） */
  shadow: { extent: number; size: number; sizeTouch: number; bias: number; normalBias: number };
  /** 依關卡換時段（白天→黃昏→夜晚，D72）；false = 永遠是基本主題（夜晚） */
  timeOfDay: boolean;
  /** 調色 */
  contrast: number;
  saturation: number;
  vignette: number;
  /** 真陰影的濃度（0～1；1 = 全黑）：太濃會變成一塊塊黑影 */
  shadowStrength: number;
  /** 卡通著色最暗那一階的亮度（0～1）：太低背光面會變黑塊 */
  rampMin: number;
  /** 邊緣光強度（0 = 沒有）：角色、樹、建物的側面輪廓亮一圈，做出立體感（只有卡通著色有） */
  rim: number;
  /** 描線的顏色（乘上去的；冷色的深藍紫，不是純黑） */
  edgeTint: [number, number, number];
  /**
   * 光暈（Bloom）：強度、半徑、門檻（亮度超過門檻的才發光）。
   * 2026-11-10 使用者：「這個光太炫光」——白天主光變亮（D76）之後，一般受光的角色、地面也超過舊門檻 1.05，整個畫面起霧、人類發橘光；
   * 門檻提高到只有發光材質（glow()，亮度 2.5～3.2 倍）會超過，強度與半徑也降。
   */
  bloom: { strength: number; radius: number; threshold: number };
}

/** 預設風格（D72：使用者「照你的，開始做」＝日系 RPG 像素風）。舊的樣子用 ?look=classic */
export const DEFAULT_LOOK = 'jrpg';

export const LOOKS: Record<string, LookDef> = {
  classic: { id: 'classic', toonSteps: 0, shadows: false, shadow: { extent: 24, size: 1024, sizeTouch: 1024, bias: -0.0005, normalBias: 0.05 }, pixelShort: 0, levels: 0, dither: 0, edge: 0, edgeFrom: 0.05, edgeTo: 0.1, tiltShift: 0, tiltFocus: 0.5, timeOfDay: false, contrast: 1.06, saturation: 1.1, vignette: 0.28, shadowStrength: 1, rampMin: 0.38, rim: 0, edgeTint: [0, 0, 0], bloom: { strength: 0.5, radius: 0.3, threshold: 1.05 } },
  jrpg: { id: 'jrpg', toonSteps: 3, shadows: true, shadow: { extent: 24, size: 2048, sizeTouch: 1024, bias: -0.0005, normalBias: 0.06 }, pixelShort: 520, levels: 20, dither: 0.25, edge: 0.55, edgeFrom: 0.08, edgeTo: 0.2, tiltShift: 0, tiltFocus: 0.5, timeOfDay: true, contrast: 1.1, saturation: 1.15, vignette: 0.16, shadowStrength: 0.8, rampMin: 0.4, rim: 0.8, edgeTint: [0.32, 0.36, 0.55], bloom: { strength: 0.28, radius: 0.15, threshold: 1.9 } },
  /** 樣張（Q57）：參考妖怪手錶那種乾淨、高飽和、暖色暗部的卡通渲染；不像素化、描線偏暖。只有 ?look=cel 才用 */
  cel: { id: 'cel', toonSteps: 3, shadows: true, shadow: { extent: 24, size: 2048, sizeTouch: 1024, bias: -0.0005, normalBias: 0.06 }, pixelShort: 1100, levels: 0, dither: 0, edge: 0.7, edgeFrom: 0.08, edgeTo: 0.2, tiltShift: 0, tiltFocus: 0.5, timeOfDay: true, contrast: 1.06, saturation: 1.45, vignette: 0.06, shadowStrength: 0.8, rampMin: 0.62, rim: 0.8, edgeTint: [0.3, 0.16, 0.2], bloom: { strength: 0.28, radius: 0.15, threshold: 1.9 } },
};

/** 目前的畫面風格：網址 ?look= 優先（開發），其次打包時的 VITE_LOOK，都沒有就用 DEFAULT_LOOK */
export function currentLook(): LookDef {
  let id = '';
  try {
    id = new URLSearchParams(location.search).get('look') ?? '';
  } catch {
    /* 非瀏覽器環境（sim、單元測試） */
  }
  // 一定要寫成 import.meta.env.VITE_LOOK（Vite 打包時只認得這個寫法，才會換成字串）
  if (!id) id = (import.meta.env.VITE_LOOK as string | undefined) ?? '';
  return LOOKS[id] ?? LOOKS[DEFAULT_LOOK];
}

/**
 * 地面的層次（2026-11-10 使用者：「不夠立體，太平了」）：
 * bigPatch = 大片明暗色塊的幅度（亮處偏暖、暗處偏冷）；cavity = 比周圍低多少公尺就暗多少（每公尺）、上限 cavityMax、看周圍幾格（cavityRadius）。
 */
export const GROUND_LAYERS = { bigPatch: 0.26, cavity: 0.22, cavityMax: 0.3, cavityRadius: 2 };
