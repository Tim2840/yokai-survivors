/**
 * 補給品（D39，使用者 2026-11-05：「小／中／大回血、吸大範圍經驗值的東西等等，包裝成符合主題」）。
 * 參考吸血鬼倖存者的地上道具（烤雞、吸塵器（Vacuum）、念珠（全畫面清怪）、懷錶（定住敵人）、金幣），
 * 包裝成和風妖怪：人類退治者身上掉的供品與法器。撿了立刻生效、不暫停（HUD 提示幾秒）；和「寶箱」（三選一卡片）不同。
 * 數字為起始提案，sim 校準（docs/02 第 6.5 節）。
 */
export const PICKUP_KINDS = ['dango', 'onigiri', 'sake', 'bell', 'drum', 'yukiBreath', 'koban'] as const;
export type PickupKind = (typeof PICKUP_KINDS)[number];

export type PickupEffect =
  /** 回復最大生命的比例 */
  | { type: 'heal'; frac: number }
  /** 場上所有魂火飛過來（不管距離） */
  | { type: 'vacuum' }
  /** 以玩家為中心半徑 radius 公尺內：一般人類直接倒下，精英與頭目受到最大生命 bossFrac 的傷害 */
  | { type: 'thunder'; radius: number; bossFrac: number }
  /** 所有人類定住 seconds 秒（不動、不造成接觸傷害） */
  | { type: 'freeze'; seconds: number }
  /** 功德 */
  | { type: 'merit'; amount: number };

export const PICKUPS: Record<PickupKind, PickupEffect> = {
  /** 三色糰子：小回復 */
  dango: { type: 'heal', frac: 0.15 },
  /** 飯糰：中回復 */
  onigiri: { type: 'heal', frac: 0.35 },
  /** 御神酒：大回復 */
  sake: { type: 'heal', frac: 0.7 },
  /** 招魂鈴：搖一下，場上的魂火全部飛過來 */
  bell: { type: 'vacuum' },
  /** 雷鼓（雷神的太鼓）：周圍落雷 */
  drum: { type: 'thunder', radius: 22, bossFrac: 0.1 },
  /** 雪女的吐息：人類全部凍住 */
  yukiBreath: { type: 'freeze', seconds: 6 },
  /** 小判：功德 */
  koban: { type: 'merit', amount: 3 },
};

/** 掉落規則 */
export const PICKUP_RULES = {
  /** 一般人類倒下時掉一個的機率（幸運 L 時 × (1 + L/100)）；精英必掉一個；小頭目／頭目掉 bossDrops 個 */
  normalChance: 0.006,
  bossDrops: 2,
  /** 頭目掉的幾個之間隔多遠（公尺） */
  spread: 1.2,
  /** 同時最多幾個（物件池大小）；放了很久沒撿會消失（秒），最後幾秒閃爍 */
  max: 24,
  lifetime: 90,
  blinkSeconds: 6,
  /** 玩家碰到的距離（公尺）；在拾取範圍內會被吸過來（速度 公尺/秒） */
  touchRadius: 0.9,
  magnetSpeed: 9,
  /** 雪女的吐息的畫面效果：冰藍環擴散到多大（公尺；效果本身是全場） */
  freezeFxRadius: 28,
} as const;

/** 依來源的掉落權重 */
export const PICKUP_WEIGHTS: Record<'normal' | 'elite' | 'boss', Record<PickupKind, number>> = {
  normal: { dango: 40, onigiri: 14, sake: 3, bell: 6, drum: 2, yukiBreath: 3, koban: 32 },
  elite: { dango: 20, onigiri: 25, sake: 8, bell: 15, drum: 8, yukiBreath: 8, koban: 16 },
  boss: { dango: 0, onigiri: 30, sake: 30, bell: 25, drum: 0, yukiBreath: 0, koban: 15 },
};
