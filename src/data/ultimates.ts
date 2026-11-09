/**
 * 終極技（大招，D29；**D52 起改成局外裝配**，使用者 2026-11-06：「取消用融合的，改成局外解鎖」）：
 * 每隻妖怪先 2 招，依角色特性設計方向（防守、治療、範圍攻擊、單體攻擊…）；出發前在神社裝配 1 招（二選一），
 * 局內不再湊配方、不再融合（拿掉配方、合魂祠、寶箱融合卡）。第 1 招一開始就有，第 2 招用功德解鎖；
 * 每一招各有 ULT_UPGRADE.maxLevel 級的性能升級（用功德）。
 * 發動需要大招量表集滿（殺敵、時間充能）；發動後歸零、進入冷卻。數字為佔位，sim 校準。
 */
import { PRICE_GROWTH } from './meta';

export const ULT = {
  /** 量表滿格 */
  max: 100,
  /** 擊殺一般敵人、精英、頭目各充多少；每秒自然充能 */
  perKill: 1,
  perElite: 3,
  perBoss: 20,
  perSecond: 0.4,
  /** 冷卻（使用者 2026-11-05）：發動後這麼多秒內量表不會充能（殺敵、時間都不算），大招鈕顯示倒數 */
  cooldown: 25,
} as const;

export type UltEffect =
  /** 以玩家為中心的範圍爆發：半徑（公尺，乘範圍屬性）、傷害 = 領頭武器傷害 × 攻擊力 × damageMult、擊退 */
  | { type: 'nova'; radius: number; damageMult: number; knockback: number }
  /** 暫時強化：秒數、攻擊力／攻速的百分比加成、額外鬼火數量 */
  | { type: 'frenzy'; seconds: number; power: number; atkSpeed: number; volley: number }
  /** 護罩：無敵秒數、回復最大生命比例，並把周圍敵人震開（有傷害） */
  | { type: 'bulwark'; seconds: number; healFrac: number; radius: number; damageMult: number; knockback: number }
  /** 貫穿光束：朝最近的敵人（沒有就朝面向）射出，長度、寬度（公尺）、傷害倍率 */
  | { type: 'beam'; length: number; width: number; damageMult: number };

/** 一隻妖怪同時裝配幾招大招（D52：1 格二選一；之後可以用功德解鎖第 2 格） */
export const ULT_SLOTS = 1;

export interface UltDef {
  id: string;
  /** 屬於哪隻妖怪（docs/04）；'-' = 還沒有人用的效果類型（護罩、光束，留給之後的妖怪） */
  yokai: string;
  effect: UltEffect;
  /** 解鎖價（功德）；0 = 一開始就有 */
  price: number;
}

export const ULTS: readonly UltDef[] = [
  { id: 'infernoLantern', yokai: 'chochin-kozo', price: 0, effect: { type: 'nova', radius: 9, damageMult: 12, knockback: 8 } },
  { id: 'ghostfireDance', yokai: 'chochin-kozo', price: 300, effect: { type: 'frenzy', seconds: 6, power: 0.3, atkSpeed: 0.8, volley: 3 } },
  // 河童（D63，草案）：防守／治療的雨乞（護罩類）、範圍攻擊的大波（沿用範圍爆發；docs/17 的「大渦潮把敵人拉進中心」之後再做）
  { id: 'rainPrayer', yokai: 'kappa', price: 0, effect: { type: 'bulwark', seconds: 4, healFrac: 0.5, radius: 7, damageMult: 3, knockback: 10 } },
  { id: 'tidalWave', yokai: 'kappa', price: 300, effect: { type: 'nova', radius: 11, damageMult: 10, knockback: 12 } },
  // 還沒有人用的效果類型：先留著資料與測試，河童（防守／治療）、赤鬼（單體）做的時候直接用
  { id: 'bulwarkLantern', yokai: '-', price: 0, effect: { type: 'bulwark', seconds: 4, healFrac: 0.4, radius: 7, damageMult: 3, knockback: 10 } },
  { id: 'thunderSpear', yokai: '-', price: 0, effect: { type: 'beam', length: 22, width: 2.4, damageMult: 25 } },
];

/** 局外升級（每一招各自）：價格(lv) = round(基礎價 × 成長^lv)；steps[k] = 升到第 k+1 級多給的（累計） */
export const ULT_UPGRADE = {
  maxLevel: 5,
  basePrice: 100,
  priceGrowth: PRICE_GROWTH,
  steps: [
    { power: 0.1 },
    { radius: 0.08 },
    { cooldown: -2 },
    { charge: 0.1 },
    { power: 0.15, radius: 0.08 },
  ] as readonly UltStep[],
} as const;

/** 升級一級多給的：power = 威力（傷害、強化幅度）、radius = 範圍（半徑、長寬、持續秒數）、cooldown = 冷卻秒數（負的 = 縮短）、charge = 量表充能 */
export interface UltStep {
  power?: number;
  radius?: number;
  cooldown?: number;
  charge?: number;
}

export interface UltMods {
  power: number;
  radius: number;
  cooldown: number;
  charge: number;
}

/** 這一級累計的倍率（level 0 = 全部是 1／基礎冷卻） */
export function ultMods(level: number): UltMods {
  const m: UltMods = { power: 1, radius: 1, cooldown: ULT.cooldown, charge: 1 };
  const n = Math.max(0, Math.min(level, ULT_UPGRADE.maxLevel));
  for (let k = 0; k < n; k++) {
    const st = ULT_UPGRADE.steps[k];
    m.power += st.power ?? 0;
    m.radius += st.radius ?? 0;
    m.cooldown += st.cooldown ?? 0;
    m.charge += st.charge ?? 0;
  }
  return m;
}

/** 升到下一級要多少功德（已滿級 = Infinity） */
export function ultUpgradePrice(level: number): number {
  if (level >= ULT_UPGRADE.maxLevel) return Infinity;
  return Math.round(ULT_UPGRADE.basePrice * Math.pow(ULT_UPGRADE.priceGrowth, level));
}

export const ultById = (id: string): UltDef => {
  const r = ULTS.find((x) => x.id === id);
  if (!r) throw new Error(`沒有這個大招：${id}`);
  return r;
};

/** 這隻妖怪的大招（神社列表用） */
export const ultsOf = (yokai: string): UltDef[] => ULTS.filter((u) => u.yokai === yokai);

/** 一開始就有的大招 id（價格 0） */
export const defaultUltsOf = (yokai: string): string[] => ultsOf(yokai).filter((u) => u.price === 0).map((u) => u.id);
