import type { Run } from './run';
import { cardById, isWeaponCard } from '../systems/cards';
import { armorMult } from '../systems/stats';
import { type Rarity } from '../data/rarity';
import { type StatId } from '../data/stats';
import { STAT_IDS } from '../data/stats';
import { ALTAR_CURSE_IDS, type CurseId } from '../data/altar';
import { tuning } from '../data/tuning';
import { ULT, ULT_RECIPES, recipeProgress } from '../data/ultimates';

/** 暫停畫面「能力」面板的資料（純資料，不含文字；文字由介面層用 i18n 組） */
export interface BuildSummary {
  cards: { id: string; weapon: boolean; stat: string; count: number; byRarity: Record<Rarity, number>; total: number }[];
  /** 屬性：id、目前值（內部單位）、基礎值 */
  stats: { id: StatId; value: number; base: number }[];
  /** 武器：鬼火數量、濺射半徑（公尺）、穿透 */
  weapon: { volley: number; splash: number; pierce: number };
  /** 卡片聯動（已觸發的 id） */
  synergies: string[];
  /** 詛咒：讓敵人變強，> 0 才列 */
  curses: { id: CurseId; v: number }[];
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

export function summarizeBuild(run: Run): BuildSummary {
  const map = new Map<string, BuildSummary['cards'][number]>();
  for (const o of run.picked) {
    const c = cardById(o.cardId);
    let e = map.get(c.id);
    if (!e) {
      e = { id: c.id, weapon: isWeaponCard(c), stat: isWeaponCard(c) ? c.weapon : c.stat, count: 0, byRarity: { common: 0, rare: 0, epic: 0, legend: 0 }, total: 0 };
      map.set(c.id, e);
    }
    e.count++;
    e.byRarity[o.rarity]++;
    e.total += c.values[o.rarity];
  }
  const w = run.yokai.weapon;
  const s = run.stats.value;
  const curses: BuildSummary['curses'] = [];
  for (const id of ALTAR_CURSE_IDS) if (run.curse[id] > 1e-9) curses.push({ id, v: run.curse[id] });
  return {
    cards: [...map.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    stats: STAT_IDS.filter((id) => id !== 'merit').map((id) => ({ id, value: s[id], base: run.stats.baseOf(id) })),
    weapon: {
      volley: (tuning.volley > 0 ? tuning.volley : w.volley) + run.volleyBonus + run.syn.volley,
      splash: ((tuning.splash > 0 ? tuning.splash : w.splashRadius) + run.splashBonus) * run.syn.splashMult,
      pierce: w.pierce + run.pierceBonus + run.syn.pierce,
    },
    synergies: [...run.activeSynergies],
    curses,
    ultimates: ULT_RECIPES.filter((r) => r.yokai === run.yokai.id).map((r) => ({ id: r.id, fused: run.fused.includes(r.id), ingredients: recipeProgress(r, run.cardCounts) })),
    ultCharge: run.ultCharge / ULT.max,
    damageTaken: armorMult(s.armor),
    hp: run.hp,
    maxHp: run.maxHp,
    level: run.level,
    kills: run.kills,
  };
}

