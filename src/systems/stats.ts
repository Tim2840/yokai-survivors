import { ARMOR, CARD_EFFECT, STAT_BASE, STAT_IDS, STAT_LIMITS, type StatId } from '../data/stats';

/**
 * 玩家屬性（docs/02 第 2、3 節）：基礎值、加算來源（卡片、之後的修行／遺物／要素），
 * 最終值 = (基礎 + Σflat) × (1 + Σpct)，再夾在上下限。來源改動時才重算（recompute），每幀只讀 value。
 */
export class Stats {
  private readonly base: Record<StatId, number>;
  private readonly flat: Record<StatId, number>;
  private readonly pct: Record<StatId, number>;
  /** 具名的加成來源（地圖要素：祭壇、結界石、石地藏護甲…）：可以整組換掉或移除，不會有浮點累積誤差 */
  private readonly mods = new Map<string, { flat?: Partial<Record<StatId, number>>; pct?: Partial<Record<StatId, number>> }>();
  /** 最終值（唯讀使用） */
  readonly value: Record<StatId, number>;

  constructor(baseOverride: Partial<Record<StatId, number>> = {}) {
    this.base = { ...STAT_BASE, ...baseOverride };
    this.flat = Object.fromEntries(STAT_IDS.map((s) => [s, 0])) as Record<StatId, number>;
    this.pct = { ...this.flat };
    this.value = { ...this.base };
    this.recompute();
  }

  /** 加一張屬性卡（value = 卡片上寫的數字） */
  addCard(stat: StatId, cardValue: number): void {
    const e = CARD_EFFECT[stat];
    if (e.target === 'flat') this.flat[stat] += cardValue * e.scale;
    else this.pct[stat] += cardValue * e.scale;
    this.recompute();
  }

  addFlat(stat: StatId, v: number): void {
    this.flat[stat] += v;
    this.recompute();
  }

  addPct(stat: StatId, v: number): void {
    this.pct[stat] += v;
    this.recompute();
  }

  /** 設定（或換掉）一個具名來源；flat 加進基礎、pct 加進百分比 */
  setMod(key: string, mod: { flat?: Partial<Record<StatId, number>>; pct?: Partial<Record<StatId, number>> }): void {
    this.mods.set(key, mod);
    this.recompute();
  }

  clearMod(key: string): boolean {
    const had = this.mods.delete(key);
    if (had) this.recompute();
    return had;
  }

  hasMod(key: string): boolean {
    return this.mods.has(key);
  }

  recompute(): void {
    for (const s of STAT_IDS) {
      const lim = STAT_LIMITS[s];
      let f = this.flat[s];
      let p = this.pct[s];
      for (const m of this.mods.values()) {
        f += m.flat?.[s] ?? 0;
        p += m.pct?.[s] ?? 0;
      }
      const raw = (this.base[s] + f) * (1 + p);
      const lo = lim.rel ? this.base[s] * lim.min : lim.min;
      const hi = lim.rel ? this.base[s] * lim.max : lim.max;
      this.value[s] = Math.min(hi, Math.max(lo, raw));
    }
  }

  baseOf(stat: StatId): number {
    return this.base[stat];
  }
}

/** 護甲換算成「承受傷害倍率」（docs/02 第 3 節） */
export function armorMult(armor: number): number {
  if (armor >= 0) return Math.max(ARMOR.minMult, 1 - armor / (armor + ARMOR.k));
  return Math.min(ARMOR.maxMult, 1 + Math.abs(armor) / ARMOR.k);
}
