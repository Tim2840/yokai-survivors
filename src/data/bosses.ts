/**
 * 頭目各自的技能（D95，docs/34；使用者 2026-11-17：「每關頭目是不是太簡單？都要有各自技能吧？」→「可以哦」）。
 * 每個頭目 2 招基本技＋半血時多 1 招（不暫停）。所有招式都先在地上預告（紅色範圍）再出手，可以靠走位、跳躍躲。
 * 數字是起始提案，用 sim（「頭目戰秒數」「頭目在場時被打掉生命」）校準，目標：頭目戰 45～75 秒、被打掉 20～35%、打倒 ≥75%。
 */
export type BossSkillKind = 'charge' | 'seal' | 'summon' | 'net' | 'iai';

export interface BossSkillDef {
  id: string;
  kind: BossSkillKind;
  /** 預告秒數（地上紅色範圍出現到出手） */
  windup: number;
  /** 這一招自己的冷卻（秒） */
  cooldown: number;
  /** 玩家在這個距離內才會用（公尺） */
  useRange: number;
  /** 傷害 = 頭目接觸傷害 × 這個倍率（召喚沒有傷害） */
  damageMult: number;
  /** 衝撞：預告線長度、寬度（公尺）、衝刺速度（公尺/秒）；連續衝幾次 */
  length?: number;
  width?: number;
  dashSpeed?: number;
  repeat?: number;
  /** 圓、扇形：半徑（公尺）；扇形：半角（弧度） */
  radius?: number;
  halfAngle?: number;
  /** 打中後：減速比例與秒數、定身秒數 */
  slow?: number;
  slowSeconds?: number;
  root?: number;
  /** 居合三連：一共幾段、每段之間隔幾秒（下一段重新瞄準） */
  hits?: number;
  hitGap?: number;
  /** 喚眾：在玩家身邊圍幾隻（沿用包圍圈的半徑） */
  count?: number;
  /** 只在半血之後才會用 */
  phase2?: boolean;
}

export interface BossDef {
  /** 敵人種類 id（`ENEMIES`） */
  enemy: string;
  skills: readonly BossSkillDef[];
  /** 招與招之間至少隔幾秒（頭目照常追人） */
  gap: number;
  /** 出場後第一招前等幾秒 */
  firstDelay: number;
  /** 半血變招：生命低於這個比例時進入第二階段；移速倍率、冷卻倍率、閃一下的秒數 */
  phase2: { at: number; speedMult: number; cooldownMult: number; flash: number };
}

export const BOSSES: Record<string, BossDef> = {
  /** 退魔僧（第 1 關）：衝撞＋封魔陣；半血後喚眾 */
  taimasou: {
    enemy: 'taimasou',
    gap: 1.6,
    firstDelay: 2,
    phase2: { at: 0.5, speedMult: 1.25, cooldownMult: 0.8, flash: 0.6 },
    skills: [
      { id: 'charge', kind: 'charge', windup: 0.9, cooldown: 5, useRange: 15, damageMult: 1.8, length: 13, width: 2.4, dashSpeed: 16, repeat: 1 },
      { id: 'seal', kind: 'seal', windup: 1.2, cooldown: 5.5, useRange: 18, damageMult: 1.4, radius: 3, slow: 0.45, slowSeconds: 2 },
      { id: 'summon', kind: 'summon', windup: 0.8, cooldown: 15, useRange: 30, damageMult: 0, count: 12, phase2: true },
    ],
  },
  /** 獵河武士（第 2 關）：投網＋居合三連；半血後疾走（變快、連續衝撞 2 次） */
  kawagari: {
    enemy: 'kawagari',
    gap: 1.4,
    firstDelay: 2,
    phase2: { at: 0.5, speedMult: 1.6, cooldownMult: 0.85, flash: 0.6 },
    skills: [
      { id: 'net', kind: 'net', windup: 0.8, cooldown: 5, useRange: 9, damageMult: 0.8, radius: 8, halfAngle: 0.45, root: 0.8 },
      { id: 'iai', kind: 'iai', windup: 0.7, cooldown: 5.5, useRange: 6, damageMult: 1.4, radius: 5, halfAngle: 0.9, hits: 3, hitGap: 0.3 },
      { id: 'rush', kind: 'charge', windup: 0.8, cooldown: 6, useRange: 16, damageMult: 1.6, length: 12, width: 2.2, dashSpeed: 18, repeat: 2, phase2: true },
    ],
  },
};

/** 每張地圖第幾關（0 起）出哪個頭目；大關多出來的一關沿用最後一個 */
export const BOSS_BY_STAGE: readonly string[] = ['taimasou', 'kawagari'];

export function bossForStage(stageIndex: number): BossDef {
  return BOSSES[BOSS_BY_STAGE[Math.min(stageIndex, BOSS_BY_STAGE.length - 1)]];
}

/** 預告的樣子（畫面與測試用） */
export const BOSS_TELEGRAPH = {
  /** 預告離地高度（公尺） */
  lift: 0.1,
  /** 出手後紅色範圍再留幾秒（看得到打在哪） */
  linger: 0.2,
} as const;
