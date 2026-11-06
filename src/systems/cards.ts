import { RARITIES, cardRarityWeights, type Rarity } from '../data/rarity';
import { CARD_CHOICES, PITY_LEVELUPS } from '../data/progression';
import { FALLBACK_ITEMS, ITEM_SLOTS, ITEM_WEIGHT, itemById, milestoneRarity, type ItemDef } from '../data/items';
import type { Rng } from '../lib/random';

/** 一張發給玩家的卡：哪個法具、什麼稀有度（不吃稀有度的法具一律 common） */
export interface CardOffer {
  cardId: string;
  rarity: Rarity;
}

/** 舊名稱保留：卡 = 法具 */
export const cardById = (id: string): ItemDef => itemById(id);

/** 依權重抽一個稀有度（單一次亂數） */
export function pickRarity(rng: Rng, weights: Record<Rarity, number>): Rarity {
  let total = 0;
  for (const r of RARITIES) total += weights[r];
  let t = rng.next() * total;
  for (const r of RARITIES) {
    t -= weights[r];
    if (t < 0) return r;
  }
  return 'common';
}

/** 佔欄位的道具（主武器與備用獎勵不佔） */
export const takesSlot = (d: ItemDef): boolean => d.kind === 'stat' || d.kind === 'mod';

/** 目前用了幾格欄位 */
export function slotsUsed(levels: ReadonlyMap<string, number>): number {
  let n = 0;
  for (const [id, lv] of levels) if (lv > 0 && takesSlot(itemById(id))) n++;
  return n;
}

/**
 * 升級三選一的發牌（D30，docs/15 第 3 節）。
 * - 候選：主武器（沒滿級）、已有但沒滿級的道具、欄位還有空時的新道具；三張不同。都沒有了就給備用獎勵。
 * - 權重：主武器 > 已有道具 > 新道具（ITEM_WEIGHT），讓「練滿」有機會。
 * - 稀有度每張獨立抽；不吃稀有度的道具一律凡。
 * - 里程碑：升到 5／10／15／20+ 級時，第一張會吃稀有度的卡至少是指定稀有度（受已解鎖的稀有度限制）。
 * - 保底：連續 PITY_LEVELUPS 次沒有良以上，下一次第一張會吃稀有度的卡至少是良。
 */
export class CardDealer {
  drought = 0;

  constructor(
    private readonly rng: Rng,
    private readonly pool: readonly string[],
    private readonly unlocked: readonly Rarity[],
  ) {}

  /** 玩家目前等級（道具的 minLevel 用；Run 發牌前設定，沒設 = 不限制） */
  playerLevel = Infinity;

  /** 現在能出現的法具（不含備用） */
  candidates(levels: ReadonlyMap<string, number>): string[] {
    const free = slotsUsed(levels) < ITEM_SLOTS;
    return this.pool.filter((id) => {
      const d = itemById(id);
      const lv = levels.get(id) ?? 0;
      if (lv >= d.maxLevel) return false;
      if (d.minLevel !== undefined && this.playerLevel < d.minLevel) return false;
      if (lv > 0 || d.kind === 'weapon') return true;
      return free;
    });
  }

  private pickIds(levels: ReadonlyMap<string, number>, n: number): string[] {
    const ids = this.candidates(levels);
    const out: string[] = [];
    while (out.length < n && ids.length > 0) {
      const w = ids.map((id) => {
        const d = itemById(id);
        return (d.kind === 'weapon' ? ITEM_WEIGHT.weapon : (levels.get(id) ?? 0) > 0 ? ITEM_WEIGHT.owned : ITEM_WEIGHT.fresh) * (d.weight ?? 1);
      });
      let t = this.rng.next() * w.reduce((a, b) => a + b, 0);
      let k = 0;
      for (; k < ids.length - 1; k++) {
        t -= w[k];
        if (t < 0) break;
      }
      out.push(ids.splice(k, 1)[0]);
    }
    for (const f of FALLBACK_ITEMS) if (out.length < n) out.push(f);
    return out;
  }

  /** 抽一個稀有度（和升級卡同一套權重；技法卡用，D49） */
  rollRarity(level: number, luck: number): Rarity {
    return pickRarity(this.rng, cardRarityWeights(level, luck, [...this.unlocked]));
  }

  /** 固定稀有度的三選一（賽錢箱、寶箱）：會吃稀有度的卡全部是 rarity 階 */
  dealRarity(rarity: Rarity, levels: ReadonlyMap<string, number> = new Map(), n: number = CARD_CHOICES): CardOffer[] {
    return this.pickIds(levels, n).map((id) => ({ cardId: id, rarity: itemById(id).rarityScales ? rarity : 'common' }));
  }

  deal(level: number, luck: number, levels: ReadonlyMap<string, number> = new Map(), n: number = CARD_CHOICES): CardOffer[] {
    const weights = cardRarityWeights(level, luck, [...this.unlocked]);
    const out: CardOffer[] = this.pickIds(levels, n).map((id) => ({ cardId: id, rarity: itemById(id).rarityScales ? pickRarity(this.rng, weights) : 'common' }));
    // 里程碑與保底：只對會吃稀有度的第一張
    const first = out.find((o) => itemById(o.cardId).rarityScales);
    if (first) {
      const top = this.unlocked.length - 1;
      const rank = (r: Rarity) => RARITIES.indexOf(r);
      const ms = milestoneRarity(level);
      let floor = ms ? Math.min(rank(ms), top) : 0;
      if (this.drought >= PITY_LEVELUPS) floor = Math.max(floor, Math.min(1, top));
      if (rank(first.rarity) < floor) first.rarity = RARITIES[floor];
    }
    this.drought = out.some((o) => o.rarity !== 'common') ? 0 : this.drought + 1;
    return out;
  }
}
