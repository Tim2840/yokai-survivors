/** 魂火與升級（docs/02 第 3.1 節，起始提案）。 */
export const PROGRESSION = {
  /** 第 L 級升到 L+1 所需魂火 = round(needScale × (L + needOffset)²)（D30：平方曲線，參考 Brotato 的 (L+3)²；後期升級變慢、每一級更有份量） */
  needScale: 0.4, // 2026-11-16：0.35 → 0.4（使用者「成長都太容易」；sim 見 docs/02 變更紀錄）
  needOffset: 3,
  /** 魂火顆的數值 = 威脅點數 × 這個 */
  orbPerPoint: 0.66, // D50：敵人變多、變脆，每隻給的魂火也少一點（數量 ×4.5 × 0.66 ≈ 原本 ×6 × 0.5，升級速度不變）
  /** 魂火被吸向玩家的速度（公尺/秒）與加速度 */
  orbMagnetSpeed: 11,
  orbIdleDrift: 0,
  /** 魂火顆數上限（超過直接加經驗，不再生顆） */
  maxOrbs: 600,
  /** 波次結束時，場上所有魂火自動吸向玩家的速度 */
  orbSweepSpeed: 22,
} as const;

/**
 * 成長預算制（D93、docs/32 A）：先定「一關各時間點該到幾級」，再反推每顆魂火值多少。
 * 每步的經驗預算 = 目標曲線上這一步該增加的經驗；每一點威脅點數的經驗 = 預算速率 ÷ 稍早實際湧出的點數速率（見 lagSeconds）。
 * 敵人數量怎麼調（數量倍率、後段加壓、難度、詛咒、試煉碑）都不改變升級速度；只打倒一部分就只拿一部分。
 * 落後目標 catchUpBehind 級以上時，經驗 × catchUpMult（只補不扣）。on = false 退回舊算法（點數 × orbPerPoint × 後段折減；sim 對照用）。
 */
export const XP_BUDGET = {
  on: true,
  /** 第 1 關：[經過比例, 目標等級]，中間線性內插 */
  targets: [
    [0, 0],
    [0.25, 9], // 內部目標比設計目標（7／13）高一點：前段很多魂火掉在地上沒撿，實際會落在 7／14（sim 2026-11-17）
    [0.5, 14],
    [0.75, 19],
    [1, 24],
  ] as readonly (readonly [number, number])[],
  /** 第 2 關起：每關再升幾級（整關平均分配） */
  laterStageLevels: 10,
  /** 湧出速率用「lagSeconds 秒前、windowSeconds 秒內」的平均：人類生在 18～24 公尺外、走過來要時間，用現在的速率會少給 */
  lagSeconds: 12,
  windowSeconds: 20,
  catchUpBehind: 0.5, // sim（docs/02 2026-11-17）：2／1.25 時第 1 段只到 4 級（目標 7；地上沒撿的魂火多），0.5／2 到 5～6 級
  catchUpMult: 2,
};

/** 這一關（stageIndex 0 起）經過比例 u 時的目標等級（可以是小數） */
export function targetLevel(stageIndex: number, u: number): number {
  const T = XP_BUDGET.targets;
  const end = T[T.length - 1][1];
  const c = Math.min(1, Math.max(0, u));
  if (stageIndex > 0) return end + XP_BUDGET.laterStageLevels * (stageIndex - 1 + c);
  for (let i = 1; i < T.length; i++) {
    if (c <= T[i][0]) {
      const k = (c - T[i - 1][0]) / (T[i][0] - T[i - 1][0] || 1);
      return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * k;
    }
  }
  return end;
}

/** 從 0 級升到（小數）等級 L 總共要多少經驗 */
export function cumXp(L: number): number {
  let s = 0;
  const n = Math.floor(Math.max(0, L));
  for (let i = 0; i < n; i++) s += xpNeed(i);
  return s + (L - n) * xpNeed(n);
}

export const xpNeed = (level: number): number => Math.max(1, Math.round(PROGRESSION.needScale * (level + PROGRESSION.needOffset) ** 2));

/** 升級時能拿到的東西改成「法具」（src/data/items.ts 的 ITEM_POOL）。每次升級給幾張、可用的稀有度 */
export const CARD_CHOICES = 3;
/**
 * 升級卡能出現的稀有度。Q60（使用者 2026-11-15「先開放珍極即可」）：凡、良、珍、極全開
 * （原本珍、極要在局外商店「卡池」解鎖，那兩項還沒做；商店改成之後「提高珍、極的權重」，docs/02 第 7.2 節）。
 * 名稱保留 _M1（sim 與測試都用這個名字）。
 */
export const RARITIES_UNLOCKED_M1 = ['common', 'rare', 'epic', 'legend'] as const;
/** 保底：連續幾次升級（每次 CARD_CHOICES 張）完全沒有「良」以上，下一次的第 1 張保證至少是良 */
export const PITY_LEVELUPS = 5;
