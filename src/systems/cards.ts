import { RARITIES, cardRarityWeights, type Rarity } from '../data/rarity';
import { STAT_CARDS, type StatCard } from '../data/statCards';
import { CARD_CHOICES, PITY_LEVELUPS } from '../data/progression';
import type { Rng } from '../lib/random';

/** 一張發給玩家的卡：哪張、什麼稀有度 */
export interface CardOffer {
  cardId: string;
  rarity: Rarity;
}

const BY_ID = new Map<string, StatCard>(STAT_CARDS.map((c) => [c.id, c]));
export const cardById = (id: string): StatCard => {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`沒有這張卡：${id}`);
  return c;
};

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

/**
 * 升級三選一的發牌（docs/02 第 4.1、5 節）。
 * - 三張是不同的卡；稀有度每張獨立抽。
 * - 保底：連續 PITY_LEVELUPS 次升級都沒出現「靈」以上，下一次第 1 張至少是靈。狀態在這個物件裡（每局一個）。
 */
export class CardDealer {
  /** 目前連續幾次升級沒有靈以上 */
  drought = 0;

  constructor(
    private readonly rng: Rng,
    private readonly pool: readonly string[],
    private readonly unlocked: readonly Rarity[],
  ) {}

  deal(level: number, luck: number, n: number = CARD_CHOICES): CardOffer[] {
    const weights = cardRarityWeights(level, luck, [...this.unlocked]);
    const ids = [...this.pool];
    const out: CardOffer[] = [];
    const guarantee = this.drought >= PITY_LEVELUPS;
    for (let k = 0; k < n && ids.length > 0; k++) {
      const idx = Math.floor(this.rng.next() * ids.length);
      const cardId = ids.splice(idx, 1)[0];
      let rarity = pickRarity(this.rng, weights);
      if (k === 0 && guarantee && rarity === 'common' && this.unlocked.length > 1) rarity = 'rare';
      out.push({ cardId, rarity });
    }
    this.drought = out.some((o) => o.rarity !== 'common') ? 0 : this.drought + 1;
    return out;
  }
}
