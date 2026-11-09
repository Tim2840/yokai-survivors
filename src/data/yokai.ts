import type { StatId } from './stats';

/** 領頭妖怪（docs/04 第 1 節、docs/02 第 2 節）。M1 只有提燈小僧；河童、赤鬼 M2 加。 */
/**
 * 主武器的出手方式（D61，docs/17 第 6.1 節）：
 * - projectile：自動發射追蹤投射物（鬼火）；預設
 * - boomerang：投射物飛到盡頭折返飛回玩家，來回都打（河童的水盤；用歸巢的飛行機制，`pierce` 要夠大才會來回都穿透）
 * - sweep：以玩家為中心朝最近的敵人揮出扇形（赤鬼的金棒）；`arc`、`reach` 有效，每 `shockEvery` 下變成震波（範圍 × `shockRadius`、傷害 × `shockDamage`）
 */
export type WeaponKind = 'projectile' | 'boomerang' | 'sweep';

export interface WeaponDef {
  id: string;
  /** 出手方式；沒寫 = projectile */
  kind?: WeaponKind;
  /** sweep：扇形角度（弧度，整個扇形的張角）、半徑（公尺，× 範圍）；每 shockEvery 下變震波（0 = 沒有） */
  arc?: number;
  reach?: number;
  shockEvery?: number;
  shockRadius?: number;
  shockDamage?: number;
  /** 基礎傷害 */
  damage: number;
  /** 攻擊間隔（秒） */
  interval: number;
  /** 索敵射程（公尺） */
  range: number;
  /** 一次發射幾顆 */
  volley: number;
  /** 投射物速度（公尺/秒） */
  projectileSpeed: number;
  /** 追蹤轉向速度（弧度/秒） */
  turnRate: number;
  /** 投射物壽命（秒） */
  lifetime: number;
  /** 命中半徑（公尺） */
  hitRadius: number;
  /** 能穿透幾隻（0 = 命中即消失） */
  pierce: number;
  /** 命中時對周圍的濺射半徑（公尺，0 = 無）與濺射傷害比例 */
  splashRadius: number;
  splashRatio: number;
  /** 擊退速度（公尺/秒） */
  knockback: number;
}

export interface YokaiDef {
  id: string;
  /** 基礎屬性的覆寫（沒寫的用 STAT_BASE） */
  base: Partial<Record<StatId, number>>;
  weapon: WeaponDef;
  /** 被動「燈火」：光圈半徑與光圈內人類減速比例 */
  aura: { radius: number; slow: number };
  /** 模型尺寸（公尺） */
  radius: number;
}

export const YOKAI: Record<string, YokaiDef> = {
  'chochin-kozo': {
    id: 'chochin-kozo',
    base: { maxHp: 100, speed: 4.0 },
    weapon: {
      id: 'ghostfire',
      damage: 12,
      interval: 0.7,
      range: 9,
      volley: 1,
      projectileSpeed: 12,
      turnRate: 6,
      lifetime: 1.6,
      hitRadius: 0.5,
      pierce: 0,
      splashRadius: 0,
      splashRatio: 0,
      knockback: 5,
    },
    aura: { radius: 5, slow: 0.1 },
    radius: 0.45,
  },
};

YOKAI.kappa = {
  id: 'kappa',
  // 機動型（docs/17 第 6.2、6.4 節，草案）：血少、跑得快、回血快、會閃
  base: { maxHp: 85, speed: 4.2, regen: 0.5, dodge: 0 },
  weapon: {
    id: 'waterdisc',
    kind: 'boomerang',
    damage: 8,
    interval: 1.1,
    range: 9,
    volley: 1,
    projectileSpeed: 11,
    turnRate: 2,
    lifetime: 0.65,
    hitRadius: 0.6,
    pierce: 30,
    splashRadius: 0,
    splashRatio: 0,
    knockback: 4,
  },
  // 被動「水氣」（草案）：身邊的人類減速。docs/17 的「水痕」（身後留水痕、水中加速）之後再做
  aura: { radius: 3.5, slow: 0.08 },
  radius: 0.5,
};

export const STARTER_YOKAI = ['chochin-kozo', 'kappa', 'aka-oni'] as const;
/** M1 已可玩的領頭妖怪（其餘在選單顯示「製作中」） */
export const PLAYABLE_YOKAI: readonly string[] = ['chochin-kozo', 'kappa'];
