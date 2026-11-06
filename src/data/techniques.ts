/**
 * 技法池（D48，使用者：「分三條路有點過於單調」「一局選兩次太少」「可以把技法池變大」；取代 D31 的「3 種變化、整局固定」）。
 * 設計稿 docs/15 第 8.5 節。每隻妖怪一池技法（三個系各幾種），一局最多 TECH_MAX 個：
 *  - 主武器 TECH_PICK_LEVELS 級（戰鬥中，同一個選卡面板）、每關過關畫面各一次，每次從池子隨機抽 TECH_CHOICES 個選 1；
 *  - 拿滿之後，過關畫面改成「加深已有的技法」（技法等級，每級 +TECH_LEVELS.perLevel 的效果）；
 *  - 道祖神（D47）：換掉一個技法。
 * 混搭靠「掛勾」自動發生：
 *  - 出手方式（delivery：燈籠環，取代發射；extra：衛星燈、鬼火柱，額外的）；
 *  - 命中效果（onHit）：任何出手方式「打中人類」都會觸發全部命中效果（每隻人類有冷卻，避免繞身的高頻判定爆量）。
 * 同系拿兩個以上 → 該系加深（TECH_DEEPEN）。互斥（excludes）：燈籠環不再發射，所以不能和要靠飛出去的鬼火的技法一起拿。
 * 數字為起始提案，用 npm run sim -- --techs 全掃組合校準（docs/02 變更紀錄）。
 */
export const TECH_MAX = 4;
/** 主武器到這幾級時跳出技法三選一（戰鬥中） */
export const TECH_PICK_LEVELS: readonly number[] = [4, 7];
export const TECH_CHOICES = 3;

export const TECH_FAMILIES = ['split', 'orbit', 'burn'] as const;
export type TechFamily = (typeof TECH_FAMILIES)[number];

/** delivery：取代原本的發射；extra：照常發射，另外多一種出手方式；onHit：打中人類時多發生的事（出手方式打中也會觸發）；passive：自己運作，不吃也不給掛勾（歸巢、護身火） */
export type TechKind = 'delivery' | 'extra' | 'onHit' | 'passive';
export type TechMechanic = 'kitsunebi' | 'bounce' | 'homing' | 'rain' | 'ring' | 'ward' | 'satellite' | 'lamp' | 'hellfire' | 'seed' | 'pillar' | 'oil';

export interface TechDef {
  id: string;
  /** 屬於哪把主武器（目前只有鬼火） */
  weapon: string;
  family: TechFamily;
  kind: TechKind;
  /** 適合搭配的道具（選卡畫面提示用） */
  likes: readonly string[];
  /** 不能同時拿的技法 */
  excludes: readonly string[];
  /** 狐火分裂：命中時分裂出幾顆小火、小火傷害比例、找下一個目標的範圍（公尺）；atMax：滿級多分裂；
   *  shardBonus：有碎火時每次多 1 片；碎片打中後再分裂 reSplit 片（D43：狐火分裂放大碎火） */
  split?: { children: number; damage: number; range: number; atMaxChildren: number; shardBonus: number; reSplit: number };
  /** 彈跳：打中後跳到範圍內下一隻（不回頭），最多 jumps 次，每次傷害 × damage；atMax：多跳一次 */
  bounce?: { range: number; jumps: number; damage: number; atMaxJumps: number };
  /** 鬼火雨：命中時在命中點 range 公尺內隨機落下 count 顆小火（落點隨機、不追人；每顆在半徑 radius 內傷害 × damage，畫面停留 life 秒）；atMax：多一顆 */
  rain?: { count: number; atMaxCount: number; range: number; radius: number; damage: number; life: number };
  /** 歸巢：鬼火飛到盡頭還沒用完時折返，飛回你身邊（回程也會打人，多穿透 returnPierce 隻）；所有鬼火飛行速度 × speedMult；atMax：穿透 +1 */
  homing?: { returnPierce: number; speedMult: number; atMaxPierce: number };
  /** 燈籠環：不再發射，鬼火繞身（數量 = 鬼火數量 + baseOrbs）；半徑（× 範圍）、角速度（弧度/秒）、命中半徑、
   *  每隔幾秒判定一次（÷ 攻速、× 冷卻）、傷害比例、擊退；atMax：多一顆、半徑倍率；
   *  innerDamage／innerKnockback：環內護身（D46）：鑽進環內（離身體 < 半徑 − 命中半徑）的人類每次判定受「傷害比例 × innerDamage」並被推出去 */
  orbit?: { radius: number; spin: number; hitRadius: number; tick: number; damage: number; knockback: number; baseOrbs: number; atMaxOrbs: number; atMaxRadius: number; innerDamage: number; innerKnockback: number };
  /** 護身火：每 chargeSeconds 秒充一層；被碰到時擋下這次傷害並炸開（半徑、傷害比例）；atMax：充能秒數改成 atMaxChargeSeconds */
  ward?: { chargeSeconds: number; atMaxChargeSeconds: number; burstRadius: number; burstDamage: number };
  /** 衛星燈：照常發射，另有 count 盞大燈籠在半徑 radius（× 範圍）慢慢繞；其餘同燈籠環；atMax：多一盞 */
  satellite?: { count: number; atMaxCount: number; radius: number; spin: number; hitRadius: number; tick: number; damage: number; knockback: number };
  /** 開路燈：count 盞燈籠跑在移動方向前方 ahead 公尺處（不動時留在身前；兩盞時在前方兩側 side 公尺），每 tick 秒判定、命中半徑、傷害比例、擊退；atMax：兩盞 */
  lamp?: { count: number; atMaxCount: number; ahead: number; side: number; hitRadius: number; tick: number; damage: number; knockback: number };
  /** 燈油：命中的人身上沾火，燒 seconds 秒（每 tick 秒燒一次，傷害 = 命中傷害 × damage）；燒死時火傳給 spreadRange 公尺內最多 spread 個人；atMax：燒 atMaxSeconds 秒、傳 atMaxSpread 個 */
  oil?: { seconds: number; atMaxSeconds: number; tick: number; damage: number; spreadRange: number; spread: number; atMaxSpread: number; max: number };
  /** 業火：命中處留下燃燒地（半徑 × 範圍、秒數、每隔幾秒燒一次、每次傷害比例），鬼火本身傷害與冷卻倍率；atMax：燃燒地大小倍率 */
  burn?: { radius: number; seconds: number; tick: number; damage: number; shotDamage: number; interval: number; atMaxScale: number; maxZones: number };
  /** 火種：被鬼火打倒的人留下火種，delay 秒後爆炸（半徑、傷害比例）；最多 max 個；atMax：半徑 atMaxRadius */
  seed?: { delay: number; radius: number; damage: number; atMaxRadius: number; max: number };
  /** 鬼火柱：每 interval 秒（÷ 攻速）在 range 公尺內人最多的地方噴火柱（半徑、傷害比例、畫面停留秒數）；atMax：一次 atMaxCount 根 */
  pillar?: { interval: number; range: number; radius: number; damage: number; atMaxCount: number; life: number; max: number };
}

export const TECHS: readonly TechDef[] = [
  // ── 分裂系 ──
  {
    id: 'kitsunebi',
    weapon: 'ghostfire',
    family: 'split',
    kind: 'onHit',
    likes: ['volley', 'splash', 'atkSpeed', 'power'],
    excludes: [],
    split: { children: 2, damage: 0.55, range: 7, atMaxChildren: 3, shardBonus: 1, reSplit: 1 },
  },
  {
    id: 'bounce',
    weapon: 'ghostfire',
    family: 'split',
    kind: 'onHit',
    likes: ['volley', 'power', 'atkSpeed'],
    excludes: ['ring'],
    bounce: { range: 6, jumps: 2, damage: 0.7, atMaxJumps: 3 },
  },
  {
    id: 'homing',
    weapon: 'ghostfire',
    family: 'split',
    kind: 'passive',
    likes: ['pierce', 'volley', 'atkSpeed'],
    excludes: ['ring'],
    homing: { returnPierce: 2, speedMult: 1.15, atMaxPierce: 1 },
  },
  {
    id: 'rain',
    weapon: 'ghostfire',
    family: 'split',
    kind: 'onHit',
    likes: ['volley', 'atkSpeed', 'power'],
    excludes: [],
    rain: { count: 2, atMaxCount: 3, range: 3, radius: 1.2, damage: 0.5, life: 0.3 },
  },
  // ── 環繞系 ──
  {
    id: 'ring',
    weapon: 'ghostfire',
    family: 'orbit',
    kind: 'delivery',
    likes: ['area', 'hp', 'armor', 'atkSpeed'],
    excludes: ['bounce', 'homing'],
    orbit: { radius: 3.0, spin: 2.6, hitRadius: 1.0, tick: 0.25, damage: 1.3, knockback: 3, baseOrbs: 1, atMaxOrbs: 1, atMaxRadius: 1.25, innerDamage: 0.5, innerKnockback: 6 },
  },
  {
    id: 'ward',
    weapon: 'ghostfire',
    family: 'orbit',
    kind: 'passive',
    likes: ['armor', 'hp', 'regen', 'area'],
    excludes: [],
    ward: { chargeSeconds: 6, atMaxChargeSeconds: 4, burstRadius: 2.5, burstDamage: 2 },
  },
  {
    id: 'satellite',
    weapon: 'ghostfire',
    family: 'orbit',
    kind: 'extra',
    likes: ['area', 'power', 'atkSpeed'],
    excludes: [],
    satellite: { count: 1, atMaxCount: 2, radius: 5.5, spin: 1.2, hitRadius: 1.3, tick: 0.4, damage: 1.5, knockback: 3 },
  },
  {
    id: 'lamp',
    weapon: 'ghostfire',
    family: 'orbit',
    kind: 'extra',
    likes: ['speed', 'area', 'atkSpeed'],
    excludes: [],
    lamp: { count: 1, atMaxCount: 2, ahead: 4, side: 1.6, hitRadius: 1.3, tick: 0.3, damage: 1.2, knockback: 4 },
  },
  // ── 燃燒系 ──
  {
    id: 'hellfire',
    weapon: 'ghostfire',
    family: 'burn',
    kind: 'onHit',
    likes: ['area', 'power', 'atkSpeed'],
    excludes: [],
    burn: { radius: 1.6, seconds: 2.5, tick: 0.5, damage: 0.35, shotDamage: 1.2, interval: 1.25, atMaxScale: 1.3, maxZones: 24 },
  },
  {
    id: 'seed',
    weapon: 'ghostfire',
    family: 'burn',
    kind: 'onHit',
    likes: ['power', 'area', 'volley'],
    excludes: [],
    seed: { delay: 1, radius: 2, damage: 0.6, atMaxRadius: 2.6, max: 12 },
  },
  {
    id: 'pillar',
    weapon: 'ghostfire',
    family: 'burn',
    kind: 'extra',
    likes: ['power', 'area', 'atkSpeed'],
    excludes: [],
    pillar: { interval: 4, range: 10, radius: 1.8, damage: 2.5, atMaxCount: 2, life: 0.5, max: 4 },
  },
  {
    id: 'oil',
    weapon: 'ghostfire',
    family: 'burn',
    kind: 'onHit',
    likes: ['power', 'atkSpeed', 'volley'],
    excludes: [],
    oil: { seconds: 3, atMaxSeconds: 4, tick: 0.5, damage: 0.25, spreadRange: 3, spread: 2, atMaxSpread: 3, max: 24 },
  },
];

export const techsFor = (weapon: string): TechDef[] => TECHS.filter((t) => t.weapon === weapon);
export const techById = (id: string): TechDef => {
  const t = TECHS.find((x) => x.id === id);
  if (!t) throw new Error(`沒有這個技法：${id}`);
  return t;
};

/** 同系拿兩個以上：每多一個，該系加深一次（效果各自讀 deep） */
export const TECH_DEEPEN = {
  /** 分裂系：狐火分裂多分 1 顆、彈跳多跳 1 次、歸巢回程多穿透 1 隻 */
  split: { targets: 1, homingPierce: 1 },
  /** 環繞系：繞身的燈籠環與衛星燈半徑 ×、燈籠環多 1 顆、護身火充能時間 × */
  orbit: { radius: 1.15, orbs: 1, wardCharge: 0.8 },
  /** 燃燒系：燃燒地、火種、鬼火柱的傷害 ×（每多一個再乘一次） */
  burn: { damage: 1.25 },
} as const;

/** 技法等級（拿滿 TECH_MAX 之後，過關畫面「加深」）：每級 + perLevel 倍的傷害／持續效果 */
export const TECH_LEVELS = { max: 3, perLevel: 0.25 } as const;

/** 其他規則 */
export const TECH_RULES = {
  /** 繞身／衛星／火柱的命中，同一隻人類兩次觸發「命中效果」至少隔幾秒（鬼火直接命中沒有這個限制） */
  hitFxCooldown: 0.5,
  /** 道祖神換技法時，提案卡的張數（含最後一張「維持現狀」） */
  swapProposals: 2,
} as const;

/** 技法卡在選卡面板裡的 id 前綴（和法具的 id 分開） */
export const TECH_CARD_PREFIX = 'tech:';
/** 加深：tech-up:<id>；道祖神換技法：tech-swap:<舊>><新>；道祖神維持現狀：tech-keep */
export const TECH_UP_PREFIX = 'tech-up:';
export const TECH_SWAP_PREFIX = 'tech-swap:';
export const TECH_KEEP = 'tech-keep';
export const isTechCard = (id: string): boolean => id.startsWith(TECH_CARD_PREFIX) || id.startsWith(TECH_UP_PREFIX) || id.startsWith(TECH_SWAP_PREFIX) || id === TECH_KEEP;

/** 兩個技法放在一起會怎樣（選卡提示用）：命中效果 × 出手方式 → 出手方式打中人類也會觸發命中效果；同系 → 加深 */
export type TechMix = { kind: 'hit'; via: string; hit: string } | { kind: 'family'; family: TechFamily };
export function techMix(candidate: string, owned: readonly string[]): TechMix | null {
  const c = techById(candidate);
  let family: TechMix | null = null;
  for (const id of owned) {
    if (id === candidate) continue;
    const o = techById(id);
    if (c.kind === 'onHit' && (o.kind === 'delivery' || o.kind === 'extra')) return { kind: 'hit', via: o.id, hit: c.id };
    if (o.kind === 'onHit' && (c.kind === 'delivery' || c.kind === 'extra')) return { kind: 'hit', via: c.id, hit: o.id };
    if (!family && o.family === c.family) family = { kind: 'family', family: c.family };
  }
  return family;
}
