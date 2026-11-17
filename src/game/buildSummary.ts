import { FORMS } from '../data/yokai';
import type { Run } from './run';
import { cardById, slotsUsed } from '../systems/cards';
import { ITEM_SLOTS, SHARDS, WEAPON_LEVELS, itemDown, itemValue, scaleWeaponStep, type ItemKind } from '../data/items';
import { armorMult } from '../systems/stats';
import { type Rarity } from '../data/rarity';
import { type StatId } from '../data/stats';
import { STAT_IDS } from '../data/stats';
import { ALTAR_CURSE_IDS, type CurseId } from '../data/altar';
import { tuning } from '../data/tuning';
import { ULT, ULT_UPGRADE } from '../data/ultimates';
import { evoById, evosFor, techById } from '../data/techniques';
import { TECH_DETAIL, type TechDetailKind } from '../data/techDetail';
import type { TechStat } from '../data/affixes';
import { baseLikesOf } from '../data/links';

/** 暫停畫面「能力」面板的資料（純資料，不含文字；文字由介面層用 i18n 組） */
export interface BuildSummary {
  /** 已有的法具（主武器在最前面）：等級、各稀有度拿了幾次、累計效果 */
  cards: { id: string; kind: ItemKind; stat: string; level: number; maxLevel: number; byRarity: Record<Rarity, number>; total: number; weaponText: string; down?: { stat: StatId; total: number } }[];
  slotsUsed: number;
  slots: number;
  /** 這隻妖怪的 id（法具連結要用） */
  yokai: string;
  /** 招式變化 id（還沒選是 null） */
  /** 這一局拿到的技法（D48）與各自的技法等級 */
  techs: { id: string; level: number; evolved: boolean; likes: string[] }[];
  /** 能力面板的「技法」欄位（2026-11-17）：每個技法的實際數值（詞條、進化、全身能力都算進去） */
  techDetails: TechDetail[];
  /** 化身（D84）：現在第幾階、下一次化身的等級（沒有了 = 0）、還沒解鎖的化身限定技法 [id, 第幾階] */
  form: { now: number; nextLevel: number; locked: [string, number][] };
  /** 技法格子：用了幾格／共幾格 */
  techSlots: { used: number; max: number };
  /** 鬼火（主武器）適合的法具（能力面板詳細列出） */
  baseLikes: string[];
  /** 技法進化（D53）：兩個材料都拿到的配方、各自的技法等級（鬼火 = 主武器等級）、是否已進化 */
  /** 手上的魂玉（D93） */
  gems: number;
  evolutions: { id: string; from: { id: string; level: number }[]; done: boolean; ready: boolean; formLevel: number }[];
  /** 屬性：id、目前值（內部單位）、基礎值 */
  stats: { id: StatId; value: number; base: number }[];
  /** 武器：鬼火數量、濺射半徑（公尺）、穿透 */
  weapon: { /** 一發的傷害（不含暴擊）、出手間隔（秒，含攻速與冷卻） */ damage: number; interval: number; volley: number; splash: number; pierce: number; shards: number; shardDamage: number; /** 取代發射的技法在場（穿透、濺射、碎裂已轉換成繞身的效果，Q56） */ converted: boolean };
  /** 詛咒：讓敵人變強，> 0 才列 */
  curses: { id: CurseId; v: number }[];
  /** 難度 %（關卡、地圖；0.5 = +50%） */
  difficulty: number;
  /** 護甲換算的承受傷害倍率 */
  damageTaken: number;
  /** 這一局裝配的大招（D52）與它的局外升級等級、累計的攻擊力／範圍／冷卻／充能 */
  ultimates: { id: string; level: number; maxLevel: number; mods: { power: number; radius: number; cooldown: number; charge: number } }[];
  /** 大招量表 0～1 */
  ultCharge: number;
  /** 目前生命與等級 */
  hp: number;
  maxHp: number;
  level: number;
  kills: number;
}

export interface TechDetail {
  id: string;
  /** 已經併進的進化 id（沒有 = null） */
  evo: string | null;
  level: number;
  max: number;
  /** 效果倍率（攻擊力詞條 × 進化） */
  power: number;
  /** 觸發方式：onHit = 主武器命中時 */
  kind: string;
  rows: { label: string; kind: TechDetailKind; value: number; /** dmg：佔主武器一發的比例 */ ratio?: number }[];
  /** 暴擊率、暴擊傷害（全身 + 這個技法的詞條） */
  crit: number;
  critDmg: number;
  affixes: Record<TechStat, number>;
}

/** 技法欄位：照 TECH_DETAIL 把作用中的定義換算成玩家看的數字 */
function techDetailsOf(run: Run): TechDetail[] {
  const s = run.stats.value;
  const hit = run.shotDamage(false);
  const out: TechDetail[] = [];
  for (let i = 0; i < run.tech.owned.length; i++) {
    const id = run.tech.owned[i];
    const base = techById(id);
    const mech = base.mech ?? (id as keyof typeof TECH_DETAIL);
    const def = run.tech.act[mech] ?? base;
    const power = run.tech.powerOf(id);
    const afx = run.tech.affixesOf(id);
    const rows: TechDetail['rows'] = [];
    for (const [sub, field, kind, label] of TECH_DETAIL[mech] ?? []) {
      const obj = def[sub] as Record<string, number> | undefined;
      const raw = obj?.[field];
      if (raw === undefined) continue;
      let value = raw;
      let ratio: number | undefined;
      if (kind === 'dmg') {
        ratio = raw * power;
        value = hit * ratio;
      } else if (kind === 'secA') value = (raw * run.cooldownMult) / s.atkSpeed;
      else if (kind === 'mA') value = raw * s.area;
      else if (kind === 'n' && field === 'count') value = raw + Math.floor(afx.count);
      rows.push({ label, kind, value, ratio });
    }
    const evo = run.tech.evolved.find((e) => evoById(e).from.includes(id)) ?? null;
    out.push({ id, evo, level: run.tech.levels[i], max: run.tech.capOf(id), power, kind: base.kind, rows, crit: s.crit + afx.crit, critDmg: s.critDmg + afx.critDmg, affixes: afx });
  }
  return out;
}

/** 主武器累計加成的文字由介面層注入（避免這裡依賴 i18n） */
let weaponText: (s: { damage: number; volley: number; cooldownPct: number; pierce: number; splash: number }) => string = () => '';
export function setWeaponTextFormatter(f: typeof weaponText): void {
  weaponText = f;
}

export function summarizeBuild(run: Run): BuildSummary {
  const map = new Map<string, BuildSummary['cards'][number]>();
  const ensure = (id: string): BuildSummary['cards'][number] => {
    let e = map.get(id);
    if (!e) {
      const d = cardById(id);
      e = { id, kind: d.kind, stat: d.kind === 'mod' ? d.mod! : d.stat ?? '', level: run.cardCounts.get(id) ?? 0, maxLevel: d.maxLevel, byRarity: { common: 0, rare: 0, epic: 0, legend: 0 }, total: 0, weaponText: '' };
      if (d.down) e.down = { stat: d.down.stat, total: 0 };
      map.set(id, e);
    }
    return e;
  };
  ensure(run.weaponItemId);
  for (const o of run.picked) {
    const d = cardById(o.cardId);
    if (d.kind === 'fallback') continue;
    const e = ensure(d.id);
    if (d.rarityScales) e.byRarity[o.rarity]++;
    e.total += itemValue(d, o.rarity);
    if (e.down) e.down.total += itemDown(d, o.rarity);
  }
  // 主武器：列出已經加過的東西
  const wl = run.cardCounts.get(run.weaponItemId) ?? 1;
  const table = WEAPON_LEVELS[run.weaponItemId] ?? [];
  // 每一級加的東西 × 當時那張卡的稀有度（D53）
  const weaponPicks = run.picked.filter((o) => o.cardId === run.weaponItemId);
  const steps = table.slice(0, wl - 1).map((st, k) => scaleWeaponStep(st, weaponPicks[k]?.rarity ?? 'common'));
  const wsum = { damage: 0, volley: 0, cooldownPct: 0, pierce: 0, splash: 0 };
  let cd = 1;
  for (const st of steps) {
    wsum.damage += st.damage ?? 0;
    wsum.volley += st.volley ?? 0;
    wsum.pierce += st.pierce ?? 0;
    wsum.splash += st.splash ?? 0;
    if (st.cooldownPct) cd *= 1 - st.cooldownPct / 100;
  }
  wsum.cooldownPct = Math.round((1 - cd) * 100);
  ensure(run.weaponItemId).weaponText = weaponText(wsum);
  const w = run.yokai.weapon;
  const s = run.stats.value;
  const curses: BuildSummary['curses'] = [];
  for (const id of ALTAR_CURSE_IDS) if (run.curse[id] > 1e-9) curses.push({ id, v: run.curse[id] });
  return {
    cards: [...map.values()].sort((a, b) => (a.kind === 'weapon' ? -1 : b.kind === 'weapon' ? 1 : b.level - a.level || a.id.localeCompare(b.id))),
    slotsUsed: slotsUsed(run.cardCounts),
    yokai: run.yokai.id,
    techs: run.tech.owned.map((id, i) => ({ id, level: run.tech.levels[i], evolved: run.tech.isEvolved(id), likes: [...techById(id).likes] })),
    baseLikes: baseLikesOf(run.yokai.id),
    form: { now: run.form, nextLevel: FORMS[run.form]?.level ?? 0, locked: run.tech.lockedByForm() },
    techSlots: { used: run.tech.slotsUsed, max: run.tech.max },
    gems: run.soulGems,
    evolutions: evosFor(run.weaponItemId).filter((e) => e.from.every((m) => run.tech.isBase(m) || run.tech.has(m))).map((e) => ({
      id: e.id,
      from: e.from.map((m) => ({ id: m, level: run.tech.techLevel(m) })),
      done: run.tech.evolved.includes(e.id),
      ready: run.tech.evolvable.some((x) => x.id === e.id),
      formLevel: run.tech.levelOf(e.from[1]),
    })),
    slots: ITEM_SLOTS,
    stats: STAT_IDS.filter((id) => id !== 'merit').map((id) => ({ id, value: s[id], base: run.stats.baseOf(id) })),
    techDetails: techDetailsOf(run),
    weapon: {
      damage: run.shotDamage(false),
      interval: (w.interval * run.cooldownMult * run.tech.intervalMult) / s.atkSpeed,
      volley: (tuning.volley > 0 ? tuning.volley : w.volley) + run.volleyBonus,
      splash: ((tuning.splash > 0 ? tuning.splash : w.splashRadius) + run.splashBonus),
      pierce: w.pierce + run.pierceBonus,
      shards: run.shardsExact,
      shardDamage: SHARDS.damage,
      converted: !!run.tech.act.ring,
    },
    curses,
    difficulty: run.difficulty,
    ultimates: run.ults.map((id) => ({ id, level: run.ultLevels.get(id) ?? 0, maxLevel: ULT_UPGRADE.maxLevel, mods: run.ultModsView })),
    ultCharge: run.ultCharge / ULT.max,
    damageTaken: armorMult(s.armor),
    hp: run.hp,
    maxHp: run.maxHp,
    level: run.level,
    kills: run.kills,
  };
}

