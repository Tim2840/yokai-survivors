/** 鏡頭參數（docs/06 第 7 節）：固定俯角、只跟隨 X／Z、不旋轉 */
export const CAMERA = {
  /** 俯角（度） */
  pitchDeg: 50,
  /** 基本垂直視角（度）：橫式畫面用這個 */
  baseFovDeg: 35,
  /** 直式畫面最多放大到的垂直視角（度） */
  maxFovDeg: 70,
  /** 鏡頭到注視點的距離（公尺） */
  distance: 22,
  /** 注視點的水平可視寬度至少幾公尺（直式手機用；docs/06 第 7 節審查發現） */
  minHorizontalView: 14,
  /** 跟隨阻尼（每秒收斂的比例，越大越緊） */
  followDamping: 8,
  near: 0.5,
  far: 200,
} as const;

/**
 * 依畫面寬高比算垂直視角：保證注視點的水平可視寬度 ≥ minHorizontalView，
 * 但不小於 baseFov、不大於 maxFov。純函式（單元測試）。
 */
export function fovForAspect(aspect: number, cam: typeof CAMERA = CAMERA): number {
  const needTan = cam.minHorizontalView / (2 * cam.distance * Math.max(aspect, 0.01));
  const need = (2 * Math.atan(needTan) * 180) / Math.PI;
  return Math.min(cam.maxFovDeg, Math.max(cam.baseFovDeg, need));
}

/** 注視點的水平可視寬度（公尺） */
export function horizontalView(aspect: number, fovDeg: number, distance: number = CAMERA.distance): number {
  return 2 * distance * Math.tan((fovDeg * Math.PI) / 360) * aspect;
}
