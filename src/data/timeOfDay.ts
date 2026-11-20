import { isBigMap, stagesForMap } from './stage';
import type { TimeOfDay } from './ambience';

/**
 * 時段加成（D96，使用者 2026-11-17「照預設然後開始做吧」＝Q58 照預設；docs/28 第四節）。
 * 一般關卡是夜晚（基準，加成小）；黃昏、白天是「特殊情況」，給明顯不同的玩法。整關都有效、跨關不留。
 * 數字是起始值，sim 校準記在 docs/02。
 */
export interface TodBonus {
  /** 大招量表充能倍率 +（0.15 = +15%） */
  ultCharge: number;
  /** 能力值百分比加成（拾取範圍、移動速度） */
  pct: { pickup?: number; speed?: number };
  /** 每秒回復（實數） */
  regen: number;
  /** 經驗倍率 +（-0.2 = −20%） */
  xp: number;
  /** 寶箱稀有度往上一階的機率 */
  chestUp: number;
  /** 敵人湧出速率 +（-0.2 = −20%） */
  spawn: number;
}

export const TOD_BONUS: Record<TimeOfDay, TodBonus> = {
  night: { ultCharge: 0.15, pct: { pickup: 0.2 }, regen: 0, xp: 0, chestUp: 0, spawn: 0 },
  dusk: { ultCharge: 0, pct: {}, regen: 0, xp: 0.2, chestUp: 0.1, spawn: 0 },
  // 白天經驗 −20% → −10%（sim 2026-11-20：−20% 時過關率比夜晚低最多 20 點，不像「喘息」；−10% 和夜晚同一區間、等級少約 1 級）
  day: { ultCharge: 0, pct: { speed: 0.1 }, regen: 0.5, xp: -0.1, chestUp: 0, spawn: -0.2 },
};

/** 什麼時候是特殊時段：黃昏＝大關（每第 3 張地圖）的中間關；白天＝其他關各 dayChance 機率（用種子決定，可重現） */
export const TOD_RULE = { dayChance: 0.15, seedSalt: 700 } as const;

/** 第 mapNumber 張地圖、第 stageIndex（0 起）關的時段 */
export function todForStage(mapNumber: number, stageIndex: number, runSeed: number): TimeOfDay {
  const n = stagesForMap(mapNumber);
  if (isBigMap(mapNumber) && n >= 3 && stageIndex === Math.floor(n / 2)) return 'dusk';
  // 種子 → [0,1)：同一個種子、同一關永遠一樣
  let h = (runSeed ^ Math.imul(TOD_RULE.seedSalt + mapNumber * 16 + stageIndex, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 10000) / 10000 < TOD_RULE.dayChance ? 'day' : 'night';
}
