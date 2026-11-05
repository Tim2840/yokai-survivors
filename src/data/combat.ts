/** 戰鬥通用數字（docs/04 第 3.1 節接觸傷害規則、docs/06 第 6 節效能預算）。 */
export const COMBAT = {
  /** 同一隻對玩家的接觸傷害冷卻（秒）、玩家受傷後無敵（秒） */
  contactCooldown: 0.8,
  invulnerable: 0.3,
  /** 擊退速度衰減（每秒保留比例的指數底，越小停得越快） */
  knockbackDecay: 0.0005,
  /** 命中閃白持續（秒） */
  hitFlash: 0.12,
  /** 軟推擠：敵人數 ≥ 這個才做，只算鄰格 */
  softPushMin: 250,
  softPushStrength: 3,
  /** 空間雜湊格子（公尺） */
  hashCell: 2,
  /** 玩家身體半徑（接觸判定用） */
  playerRadius: 0.5,
  /** 單次查詢最多回傳幾個（預先配置的緩衝大小） */
  queryMax: 512,
  /** 一發最多幾顆鬼火（瞄準緩衝大小）；同一個目標多顆時，出手錯開的角度（弧度） */
  maxVolley: 16,
  volleySpread: 0.35,
  /** 歸巢（技法）：回程多給的飛行秒數、離玩家多近算「飛回來了」（公尺） */
  homingSlack: 1,
  homingArrive: 1.2,
  /** 傷害數字：同時最多、停留（秒）、上飄速度 */
  damageNumbers: { max: 48, life: 0.6, rise: 1.2 },
  /** 暫停、死亡時的小延遲（秒），讓玩家看見最後一擊 */
  deathDelay: 0.8,
} as const;
