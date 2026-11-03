/**
 * 自由視角鏡頭參數（D23，docs/06 第 7 節）：第三人稱繞著玩家轉的軌道鏡頭。
 * 角度單位：度（yaw 沒有限制，pitch 夾在 minPitchDeg～maxPitchDeg）；距離單位：公尺。
 */
export const CAMERA = {
  /** 預設俯角（度，鏡頭高於玩家的仰角）與上下限 */
  pitchDeg: 38,
  minPitchDeg: 8,
  maxPitchDeg: 75,
  /** 鏡頭到注視點的預設距離、彈簧臂拉到最近的距離 */
  distance: 13,
  minDistance: 3,
  /** 注視點比玩家腳底高多少（看胸口附近） */
  lookHeight: 1.1,
  /** 鏡頭至少高於地形多少（彈簧臂的安全邊界）；最後再硬夾一次（公尺） */
  groundMargin: 0.7,
  hardMargin: 0.35,
  /** 沿彈簧臂取樣的點數 */
  armSamples: 14,
  /** 跟隨阻尼（每秒收斂的比例）：水平、垂直；彈簧臂放開（距離回復）的速度（每秒） */
  followDamping: 14,
  followDampingY: 8,
  armRelease: 5,
  /** 基本垂直視角（度）、直式畫面最多放大到的垂直視角 */
  baseFovDeg: 55,
  maxFovDeg: 75,
  /** 注視點附近的水平可視寬度至少幾公尺（直式手機用） */
  minHorizontalView: 9,
  near: 0.3,
  far: 400,
  /** 轉視角的靈敏度：滑鼠、觸控（弧度/像素）、鍵盤 Q／E（弧度/秒） */
  mouseSens: 0.0045,
  touchSens: 0.006,
  keySpeed: 1.8,
  /** 觸控：從螢幕左邊多少比例以右開始才算轉視角（左邊留給搖桿） */
  touchLookFromX: 0.35,
} as const;

/**
 * 依畫面寬高比算垂直視角：保證水平可視寬度 ≥ minHorizontalView，
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
