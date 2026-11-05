import type { Run } from './run';
import { cardById, slotsUsed } from '../systems/cards';
import { ITEM_SLOTS, WEAPON_LEVELS, itemValue, type ItemKind } from '../data/items';
import { armorMult } from '../systems/stats';
import { type Rarity } from '../data/rarity';
import { type StatId } from '../data/stats';
import { STAT_IDS } from '../data/stats';
import { ALTAR_CURSE_IDS, type CurseId } from '../data/altar';
import { tuning } from '../data/tuning';
import { ULT, ULT_RECIPES, recipeProgress } from '../data/ultimates';

/** 暫停畫面「能力」面板的資料（純資料，不含文字；文字由介面層用 i18n 組） */
export interface BuildSummary {
  /** 已有的法具（主武器在最前面）：等級、各稀有度拿了幾次、累計效果 */
  cards: { id: string; kind: ItemKind; stat: string; level: number; maxLevel: number; byRarity: Record<Rarity, number>; total: number; weaponText: string; down?: { stat: StatId; total: number } }[];
  slotsUsed: number;
  slots: number;
  /** 招式變化 id（還沒選是 null） */
  variant: string | null;
  /** 屬性：id、目前值（內部單位）、基礎值 */
  stats: { id: StatId; value: number; base: number }[];
  /** 武器：鬼火數量、濺射半徑（公尺）、穿透 */
  weapon: { volley: number; splash: number; pierce: number };
  /** 卡片聯動（已觸發的 id） */
  synergies: string[];
  /** 詛咒：讓敵人變強，> 0 才列 */
  curses: { id: CurseId; v: number }[];
  /** 難度 %（關卡、地圖；0.5 = +50%） */
  difficulty: number;
  /** 護甲換算的承受傷害倍率 */
  damageTaken: number;
  /** 這隻妖怪的大招配方與進度 */
  ultimates: { id: string; fused: boolean; ingredients: { card: string; have: number; need: number }[] }[];
  /** 大招量表 0～1 */
  ultCharge: number;
  /** 目前生命與等級 */
  hp: number;
  maxHp: number;
  level: number;
  kills: number;
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
      if (d.down) e.down = { stat: d.down.stat, total: d.down.perLevel * e.level };
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
  }
  // 主武器：列出已經加過的東西
  const wl = run.cardCounts.get(run.weaponItemId) ?? 1;
  const steps = (WEAPON_LEVELS[run.weaponItemId] ?? []).slice(0, wl - 1);
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
    variant: run.variant?.id ?? null,
    slots: ITEM_SLOTS,
    stats: STAT_IDS.filter((id) => id !== 'merit').map((id) => ({ id, value: s[id], base: run.stats.baseOf(id) })),
    weapon: {
      volley: (tuning.volley > 0 ? tuning.volley : w.volley) + run.volleyBonus + run.syn.volley,
      splash: ((tuning.splash > 0 ? tuning.splash : w.splashRadius) + run.splashBonus) * run.syn.splashMult,
      pierce: w.pierce + run.pierceBonus + run.syn.pierce,
    },
    synergies: [...run.activeSynergies],
    curses,
    difficulty: run.difficulty,
    ultimates: ULT_RECIPES.filter((r) => r.yokai === run.yokai.id).map((r) => ({ id: r.id, fused: run.fused.includes(r.id), ingredients: recipeProgress(r, run.cardCounts) })),
    ultCharge: run.ultCharge / ULT.max,
    damageTaken: armorMult(s.armor),
    hp: run.hp,
    maxHp: run.maxHp,
    level: run.level,
    kills: run.kills,
  };
}

