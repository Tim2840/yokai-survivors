/**
 * 連續計時關卡（D22，docs/02 第 8.1 節）。起始提案，G1b 試玩後調。
 * 取代原本的 20 波：用「虛擬波數」n(t) 沿用既有的敵人強度公式與威脅點數 T(n)。
 */
export const STAGE = {
  /** 章節制（D26）：一般地圖幾關；每第 everyMaps 張地圖是「大關」，關數增加、最後一關的頭目更強 */
  chapter: {
    normalStages: 3,
    bigStages: 3,
    everyMaps: 3,
    /** 大關最後一關的頭目 HP 倍率（佔位，M2 sim 調；頭目的招式強化等 M7 做完整頭目時再加） */
    bigBossHp: 2.5,
  },
  /** 關卡長度（秒，可調） */
  duration: 600,
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
  /** 大頭目那一關（D26 大關的最後一關）：頭目自動出現的時間點（比例）。其他關改用召喚祭壇（D34） */
  bossAt: 0.8,
  /** 召喚小頭目的祭壇（D34，docs/02 第 8.1.1 節）：顯現時間（比例）、離玩家多遠、按住幾秒、召喚越晚越強（HP ×(1 + hpGrowth × 經過比例)） */
  summon: { appearAt: 0.3, ringMin: 25, ringMax: 40, holdSeconds: 2, hpGrowth: 2 },
  /** 打倒小頭目／精英掉的寶箱：稀有度、精英掉落機率 */
  drops: { bossChest: 'rare' as const, eliteChestChance: 0.15, eliteChest: 'common' as const },
  /** 寶箱、傳送門找「玩家走得到的位置」時，從倒下處往外找的半徑（公尺） */
  /** 小頭目的寶箱離傳送門至少幾公尺（傳送門半徑 + 寶箱互動圈 + 餘裕） */
  chestFromPortal: 4.5,
  /** 找位置時四周多少公尺內也要不擋路（排除岩石圍住的小島） */
  dropClearance: 1.5,
  dropSearchRadii: [0, 1.5, 3, 5, 8, 12, 18, 26] as readonly number[],
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

/** 第 mapNumber 張地圖（從 1 起）是不是大關 */
export function isBigMap(mapNumber: number): boolean {
  return mapNumber >= STAGE.chapter.everyMaps && mapNumber % STAGE.chapter.everyMaps === 0;
}

/** 這張地圖有幾關 */
export function stagesForMap(mapNumber: number): number {
  return isBigMap(mapNumber) ? STAGE.chapter.bigStages : STAGE.chapter.normalStages;
}

/** 這張地圖第 stageIndex（0 起）關的頭目 HP 倍率：只有大關的最後一關加強 */
export function bossHpMult(mapNumber: number, stageIndex: number): number {
  return isBigMap(mapNumber) && stageIndex === stagesForMap(mapNumber) - 1 ? STAGE.chapter.bigBossHp : 1;
}

/** 這一關是不是「大頭目」那一關（大關的最後一關）：頭目自動出現、沒有召喚祭壇 */
export function isBigBossStage(mapNumber: number, stageIndex: number): boolean {
  return isBigMap(mapNumber) && stageIndex === stagesForMap(mapNumber) - 1;
}
