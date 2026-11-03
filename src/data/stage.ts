/**
 * 連續計時關卡（D22，docs/02 第 8.1 節）。起始提案，G1b 試玩後調。
 * 取代原本的 20 波：用「虛擬波數」n(t) 沿用既有的敵人強度公式與威脅點數 T(n)。
 */
export const STAGE = {
  /** 一局幾關（M1.5 先做 2 關驗證流程；首發目標 3 關） */
  count: 2,
  /** 關卡長度（秒，可調） */
  duration: 600,
  /** 第 k 關（從 0 起）的敵人 HP 額外倍率 = 1 + hpPerStage × k */
  hpPerStage: 0.5,
  /** 湧出速率（威脅點數／秒）= (threatBase + threatPerWave × n(t)) ÷ rateBaseSeconds × countScale */
  rateBaseSeconds: 20,
  /** 虛擬波數的範圍：t = 0 時是 virtualStart，t = duration 時是 virtualEnd */
  virtualStart: 1,
  virtualEnd: 20,
  /** 生成：離玩家的距離範圍（公尺）；自由視角沒有「畫面外」所以用距離 */
  spawnRingMin: 18,
  spawnRingMax: 24,
  /** 精英：HP、傷害倍率與體型、魂火倍率（docs/04 第 3.2 節） */
  elite: { hp: 4, damage: 1.5, scale: 1.4, orbMult: 5 },
  /** 定時事件（at = 佔關卡長度的比例） */
  events: [
    { at: 0.25, kind: 'elite', count: 1 },
    { at: 0.5, kind: 'surge', count: 2, surgeSeconds: 30, surgeMult: 2 },
    { at: 0.75, kind: 'elite', count: 3 },
  ] as readonly StageEvent[],
  /** 頭目出現的時間點（比例）；M1.5 是放大的退魔僧佔位 */
  bossAt: 0.8,
  /** 最終蜂群：湧出速率倍率、每幾秒一隻精英 */
  swarm: { rateMult: 3, eliteEvery: 20 },
  /** 傳送門：進入距離（公尺）、垂直容許差（公尺） */
  portalRadius: 1.5,
  portalHeight: 2.5,
} as const;

export interface StageEvent {
  at: number;
  kind: 'elite' | 'surge';
  count: number;
  surgeSeconds?: number;
  surgeMult?: number;
}
