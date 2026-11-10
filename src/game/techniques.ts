import { COMBAT } from '../data/combat';
import { EVO, evosFor, mechOf, TECHS, TECH_CHOICES, TECH_LEVELS, TECH_MAX, TECH_OFFER, TECH_RULES, evoById, techById, techsFor, type EvoDef, type TechDef, type TechMechanic } from '../data/techniques';
import type { WeaponDef } from '../data/yokai';
import { emptyAffixes, type Affix, type TechStat } from '../data/affixes';
import type { Rng } from '../lib/random';
import type { Run } from './run';

const ZONES = 32;
/** 沒有這個技法時的詞條（全 0，共用、唯讀） */
const NO_AFFIX: Readonly<Record<TechStat, number>> = Object.freeze(emptyAffixes());
const SEEDS = 16;
const FLASHES = 24;
const PILLARS = 6;
const LAMPS = 4;
/** 同時畫出幾隻燒著的人類 */
const OIL_SHOWN = 24;

/** 畫面上一閃而過的爆炸圈：0 = 火種、1 = 護身火、2 = 鬼火柱落地 */
export const FLASH_KINDS = { seed: 0, ward: 1, pillar: 2, rain: 3 } as const;

/**
 * 技法系統（D48）：這一局拿到的技法、它們的狀態與效果。Run 在固定的幾個地方呼叫它：
 * 每步 update、鬼火射出前（weaponParams）、鬼火命中（hitFx）、人類被武器打倒（onWeaponKill）、被碰到（tryWard）。
 * 每幀不配置記憶體（池與暫存陣列都在建構時開好）。
 */
export class Techniques {
  /** 一局最多幾個技法（預設 TECH_MAX；sim 的組合全掃可以改小，只測指定的幾個） */
  max: number = TECH_MAX;
  /** 擁有的技法（拿到的順序）與各自的技法等級（1～TECH_LEVELS.max） */
  readonly owned: string[] = [];
  readonly levels: number[] = [];
  /** 各技法累積的稀有度倍率（每拿一次加上那張卡的倍率；D77 起不再影響效果，留著給畫面與測試） */
  readonly points: number[] = [];
  /** 各技法累積的詞條（D53 改：只強化這個技法自己）：攻擊力、範圍、攻擊速度、連鎖、暴擊率、暴擊傷害、持續時間、數量（加總）；跟 owned 同一個順序 */
  readonly afx: Record<TechStat, number>[] = [];
  /** 已進化的配方 id（D53）：兩個材料技法併成一個，效果 × EVO.power、參數換成進化後的值 */
  readonly evolved: string[] = [];
  /** 現在作用中的技法（依機制；沒有 = null） */
  readonly act: Record<TechMechanic, TechDef | null> = { kitsunebi: null, bounce: null, homing: null, rain: null, ring: null, ward: null, satellite: null, lamp: null, hellfire: null, seed: null, pillar: null, oil: null };

  // ── 繞身（燈籠環、衛星燈）──
  ringAngle = 0;
  private ringTimer = 0;
  satAngle = 0;
  private satTimer = 0;
  /** 環內護身打到的累計次數（畫面閃一下、測試用） */
  innerHits = 0;

  // ── 護身火 ──
  wardCharge = 0;
  get wardReady(): boolean {
    const w = this.act.ward?.ward;
    return !!w && this.wardCharge >= this.wardNeed(w);
  }
  /** 最近一次護身火炸開的時間（clock；畫面與測試用） */
  wardAt = -1;

  // ── 燃燒地（業火）──
  readonly zoneX = new Float32Array(ZONES);
  readonly zoneZ = new Float32Array(ZONES);
  readonly zoneR = new Float32Array(ZONES);
  readonly zoneLife = new Float32Array(ZONES);
  readonly zoneMaxLife = new Float32Array(ZONES);
  readonly zoneDmg = new Float32Array(ZONES);
  readonly zoneTick = new Float32Array(ZONES);
  private zoneNext = 0;

  // ── 火種 ──
  readonly seedX = new Float32Array(SEEDS);
  readonly seedZ = new Float32Array(SEEDS);
  /** 還有幾秒爆炸；<= 0 = 沒有這顆 */
  readonly seedT = new Float32Array(SEEDS);

  // ── 鬼火柱 ──
  private pillarTimer = 0;
  readonly pillarX = new Float32Array(PILLARS);
  readonly pillarZ = new Float32Array(PILLARS);
  readonly pillarLife = new Float32Array(PILLARS);
  readonly pillarMax = new Float32Array(PILLARS);
  pillarR = 0;

  // ── 開路燈 ──
  readonly lampX = new Float32Array(LAMPS);
  readonly lampZ = new Float32Array(LAMPS);
  lampN = 0;
  private lampTimer = 0;

  // ── 燈油：每隻人類身上的火（下標 = 敵人編號）──
  private readonly oilT: Float32Array;
  private readonly oilTick: Float32Array;
  private readonly oilDmg: Float32Array;
  /** 這一步燒著的人類（畫面用，最多 OIL_SHOWN 個）與數量 */
  readonly oilShow = new Int32Array(OIL_SHOWN);
  oilShown = 0;

  // ── 爆炸圈（只給畫面）──
  readonly flashX = new Float32Array(FLASHES);
  readonly flashZ = new Float32Array(FLASHES);
  readonly flashR = new Float32Array(FLASHES);
  readonly flashLife = new Float32Array(FLASHES);
  readonly flashMax = new Float32Array(FLASHES);
  readonly flashKind = new Uint8Array(FLASHES);
  private flashNext = 0;

  /** 每隻人類下次可以被「繞身／火柱」觸發命中效果的時間（run.clock） */
  private readonly fxUntil: Float32Array;
  private readonly near = new Int32Array(COMBAT.queryMax);
  private readonly pick = new Int32Array(COMBAT.queryMax);
  /** 射出去的鬼火用的武器參數（歸巢加速） */
  weapon: WeaponDef;

  constructor(
    private readonly run: Run,
    capacity: number,
  ) {
    this.fxUntil = new Float32Array(capacity);
    this.oilT = new Float32Array(capacity);
    this.oilTick = new Float32Array(capacity);
    this.oilDmg = new Float32Array(capacity);
    this.weapon = run.yokai.weapon;
  }

  // ── 擁有 ─────────────────────────────────────────────────────
  has(id: string): boolean {
    return this.owned.includes(id);
  }
  levelOf(id: string): number {
    const i = this.owned.indexOf(id);
    return i < 0 ? 0 : this.levels[i];
  }
  /** 技法的效果倍率：技法等級 × 進化（D53） */
  private pw(m: TechMechanic): number {
    const d = this.act[m];
    if (!d) return 1;
    return this.powerAt(this.owned.indexOf(d.id));
  }
  private powerAt(i: number): number {
    // D77（使用者 2026-11-10：拿掉每一級升級強化，留下隨機詞條）：等級本身不再加成，變強只靠詞條（與進化）
    return (this.isEvolved(this.owned[i]) ? EVO.power : 1) * (1 + this.afx[i].power);
  }
  /** 作用中的某個機制的詞條（沒有 = 全 0 的共用物件，不要改它） */
  private afxOf(m: TechMechanic): Record<TechStat, number> {
    const d = this.act[m];
    const i = d ? this.owned.indexOf(d.id) : -1;
    return i < 0 ? NO_AFFIX : this.afx[i];
  }
  /** 數量詞條（整數） */
  private countOf(m: TechMechanic): number {
    return Math.floor(this.afxOf(m).count);
  }
  /**
   * 技法自己擲暴擊（繞身、開路燈、火柱、火種、護身火）：機率 = 全身暴擊率 + 這個技法的暴擊率詞條，倍率 = 全身暴擊傷害 + 暴擊傷害詞條。
   * 回傳傷害倍率（沒暴擊 = 1），lastCrit 記下有沒有暴擊（顯示用）。
   */
  private ownCrit(m: TechMechanic): number {
    const s = this.run.stats.value;
    const a = this.afxOf(m);
    this.lastCrit = this.run.rollCrit(s.crit + a.crit);
    return this.lastCrit ? s.critDmg + a.critDmg : 1;
  }
  lastCrit = false;
  /**
   * 命中效果（分裂、彈跳、落火、燃燒地、燈油）的暴擊：傷害沿用命中的那一下。
   * 那一下暴擊了 → 換成這個技法的暴擊倍率（全身 + 暴擊傷害詞條）；沒暴擊 → 用這個技法的暴擊率詞條再擲一次。
   */
  private fxCrit(m: TechMechanic, srcCrit: boolean): number {
    const s = this.run.stats.value;
    const a = this.afxOf(m);
    if (srcCrit) return (s.critDmg + a.critDmg) / s.critDmg;
    return a.crit > 0 && this.run.rand() < a.crit ? s.critDmg + a.critDmg : 1;
  }
  /** 選了技法卡：卡上的詞條加在這個技法身上，並重算作用中的參數 */
  addAffixes(id: string, list: readonly Affix[]): void {
    const i = this.owned.indexOf(id);
    if (i < 0) return;
    for (const a of list) this.afx[i][a.stat] += a.value;
    this.recompute();
  }
  /** 這個技法現在的詞條加總（畫面、測試用） */
  affixesOf(id: string): Record<TechStat, number> {
    const i = this.owned.indexOf(id);
    return i < 0 ? emptyAffixes() : { ...this.afx[i] };
  }
  /** 連鎖詞條：這次連鎖多幾個（整數部分一定有，小數部分是機率；用戰鬥的固定種子亂數） */
  private chainExtra(m: TechMechanic): number {
    const d = this.act[m];
    if (!d) return 0;
    const c = this.afx[this.owned.indexOf(d.id)]?.chain ?? 0;
    const whole = Math.floor(c);
    return whole + (this.run.rand() < c - whole ? 1 : 0);
  }
  /** 把詞條（範圍、攻擊速度、持續時間）乘進技法的參數，回傳新的定義（沒有詞條就原樣回傳）。攻擊力、連鎖、暴擊、數量在用到的地方另外算 */
  private withAffix(d: TechDef, a: Record<TechStat, number>): TechDef {
    if (a.area === 0 && a.rate === 0 && a.duration === 0) return d;
    const A = 1 + a.area;
    const R = 1 + a.rate;
    const D = 1 + a.duration;
    const out: TechDef = { ...d };
    if (d.split) out.split = { ...d.split, range: d.split.range * A };
    if (d.bounce) out.bounce = { ...d.bounce, range: d.bounce.range * A };
    if (d.rain) out.rain = { ...d.rain, range: d.rain.range * A, radius: d.rain.radius * A };
    if (d.homing) out.homing = { ...d.homing, speedMult: d.homing.speedMult * R };
    if (d.orbit) out.orbit = { ...d.orbit, radius: d.orbit.radius * A, hitRadius: d.orbit.hitRadius * A, tick: d.orbit.tick / R };
    if (d.ward) out.ward = { ...d.ward, burstRadius: d.ward.burstRadius * A, chargeSeconds: d.ward.chargeSeconds / R };
    if (d.satellite) out.satellite = { ...d.satellite, radius: d.satellite.radius * A, hitRadius: d.satellite.hitRadius * A, tick: d.satellite.tick / R };
    if (d.lamp) out.lamp = { ...d.lamp, hitRadius: d.lamp.hitRadius * A, tick: d.lamp.tick / R };
    if (d.oil) out.oil = { ...d.oil, spreadRange: d.oil.spreadRange * A, tick: d.oil.tick / R, seconds: d.oil.seconds * D };
    if (d.burn) out.burn = { ...d.burn, radius: d.burn.radius * A, tick: d.burn.tick / R, seconds: d.burn.seconds * D };
    if (d.seed) out.seed = { ...d.seed, radius: d.seed.radius * A, delay: d.seed.delay / R };
    if (d.pillar) out.pillar = { ...d.pillar, radius: d.pillar.radius * A, range: d.pillar.range * A, interval: d.pillar.interval / R };
    return out;
  }
  /** 效果倍率（畫面、測試用） */
  powerOf(id: string): number {
    const i = this.owned.indexOf(id);
    return i < 0 ? 0 : this.powerAt(i);
  }

  // ── 進化（D53）──
  /** 這個技法已經併進某個進化了（鬼火不會被用掉：它可以和不同的技法各進化一次） */
  isEvolved(id: string): boolean {
    if (this.isBase(id)) return false;
    for (const e of this.evolved) if (evoById(e).from.includes(id)) return true;
    return false;
  }
  /** 是不是這隻妖怪的主武器（鬼火、水盤…；D63 起不再寫死鬼火） */
  isBase(id: string): boolean {
    return id === this.run.weaponItemId;
  }
  /** 這個技法（或鬼火）現在幾級（鬼火 = 主武器等級；沒有 = 0） */
  techLevel(id: string): number {
    return this.isBase(id) ? this.run.weaponLevel : this.levelOf(id);
  }
  /** 材料都到 EVO.minLevel 級、還沒進化、而且沒有被別的進化用掉的進化 */
  get evolvable(): EvoDef[] {
    return evosFor(this.run.weaponItemId).filter((e) => !this.evolved.includes(e.id) && e.from.every((m) => !this.isEvolved(m) && this.techLevel(m) >= EVO.minLevel));
  }
  /** 進化：兩個技法併成一個 */
  evolve(id: string): boolean {
    if (!this.evolvable.some((e) => e.id === id)) return false;
    this.evolved.push(id);
    this.recompute();
    return true;
  }
  /** 目前佔幾個技法欄位（進化的兩個技法併成一格；有鬼火的進化不省格） */
  get slotsUsed(): number {
    let n = this.owned.length;
    for (const id of this.evolved) {
      const e = evoById(id);
      if (!e.from.includes(this.run.weaponItemId) && e.from.every((m) => this.has(m))) n--;
    }
    return n;
  }
  /** 進化給主武器的加成（傷害倍率、穿透、發射數） */
  get evoWeaponDamage(): number {
    let m = 1;
    for (const e of this.evolved) m += evoById(e).weapon?.damage ?? 0;
    return m;
  }
  get evoPierce(): number {
    let n = 0;
    for (const e of this.evolved) n += evoById(e).weapon?.pierce ?? 0;
    return n;
  }
  get evoVolley(): number {
    let n = 0;
    for (const e of this.evolved) n += evoById(e).weapon?.volley ?? 0;
    return n;
  }

  /** 學會一個技法（rarityMult = 那張卡的稀有度倍率） */
  add(id: string, rarityMult = 1): boolean {
    if (this.has(id) || this.slotsUsed >= this.max) return false;
    this.owned.push(id);
    this.levels.push(1);
    this.points.push(rarityMult);
    this.afx.push(emptyAffixes());
    this.recompute();
    return true;
  }
  /** 換掉一個（位置不變、等級重來） */
  replace(oldId: string, newId: string): boolean {
    const i = this.owned.indexOf(oldId);
    if (i < 0 || this.has(newId)) return false;
    this.owned[i] = newId;
    this.levels[i] = 1;
    this.points[i] = 1;
    this.afx[i] = emptyAffixes();
    // 換掉進化過的技法：進化跟著拆掉（兩個材料都要在才算）
    for (let k = this.evolved.length - 1; k >= 0; k--) if (evoById(this.evolved[k]).from.includes(oldId)) this.evolved.splice(k, 1);
    this.recompute();
    return true;
  }
  /** 開發與測試：直接把技法（或鬼火）練到指定等級 */
  devSetLevel(id: string, level: number): void {
    if (this.isBase(id)) {
      while (this.run.weaponLevel < level) this.run.give(this.run.weaponItemId, 'common');
      return;
    }
    const i = this.owned.indexOf(id);
    if (i < 0) return;
    this.levels[i] = level;
    this.points[i] = Math.max(this.points[i], level);
    this.recompute();
  }
  levelUp(id: string, rarityMult = 1): boolean {
    const i = this.owned.indexOf(id);
    if (i < 0 || this.levels[i] >= this.capOf(id)) return false;
    this.levels[i]++;
    this.points[i] += rarityMult;
    this.recompute();
    return true;
  }

  /** 重算作用中的技法與進化的參數（技法變動時呼叫） */
  recompute(): void {
    for (const k of Object.keys(this.act) as TechMechanic[]) this.act[k] = null;
    this.owned.forEach((id, i) => {
      const d = techById(id);
      const ed = this.withAffix(this.withEvo(d), this.afx[i]);
      this.act[mechOf(d)] = ed;
      // 進化之後：併進來的舊招式（鬼火雨／衛星燈／燈油）開始作用（D57；D79 起進化當下就作用）
      const u = this.evoOf(id)?.unlock;
      if (u) {
        const blk = (ed as unknown as Record<string, unknown>)[u.mech];
        this.act[u.mech] = { id: d.id, weapon: d.weapon, family: d.family, kind: u.mech === 'satellite' ? 'extra' : 'onHit', likes: d.likes, excludes: d.excludes, [u.mech]: blk } as TechDef;
      }
    });
    // 拿掉的技法留下的東西清掉
    if (!this.act.hellfire) this.zoneLife.fill(0);
    if (!this.act.seed) this.seedT.fill(0);
    if (!this.act.pillar) this.pillarLife.fill(0);
    if (!this.act.ward) this.wardCharge = 0;
    if (!this.act.lamp) this.lampN = 0;
    if (!this.act.oil) {
      this.oilT.fill(0);
      this.oilShown = 0;
    }
    const h = this.act.homing?.homing;
    const base = this.run.yokai.weapon;
    this.weapon = h ? { ...base, projectileSpeed: base.projectileSpeed * h.speedMult } : base;
    this.run.projectiles.homeReturnPierce = h ? h.returnPierce : 0;
    const hi = this.act.homing ? this.owned.indexOf(this.act.homing.id) : -1;
    this.run.projectiles.homeReturnDamage = hi >= 0 ? 1 + this.afx[hi].power : 1;
  }

  /** 套用進化：把進化指定的區塊欄位換成新值（回傳新的定義；沒有進化就回原本的） */
  private withEvo(d: TechDef): TechDef {
    let out: TechDef | null = null;
    for (const eid of this.evolved) {
      const e = evoById(eid);
      const blocks = e.set[d.id];
      if (!blocks) continue;
      const o = (out ??= { ...d }) as unknown as Record<string, Record<string, number>>;
      for (const [name, vals] of Object.entries(blocks)) o[name] = { ...o[name], ...vals };
    }
    return out ?? d;
  }
  /** 這個技法已經進化成哪一個（沒有 = undefined；鬼火不算） */
  evoOf(id: string): EvoDef | undefined {
    for (const e of this.evolved) {
      const ev = evoById(e);
      if (ev.from[1] === id) return ev;
    }
    return undefined;
  }
  /** 這個技法現在最高幾級：進化前 EVO.minLevel（5）級，進化後 TECH_LEVELS.max（8）級（D57） */
  capOf(id: string): number {
    return this.isEvolved(id) ? TECH_LEVELS.max : EVO.minLevel;
  }

  /** 這個技法現在能不能被抽到（沒拿過、沒和已有的互斥、拿掉 skip 之後） */
  canOffer(id: string, skip?: string): boolean {
    if (this.has(id) && id !== skip) return false;
    const d = techById(id);
    for (const o of this.owned) {
      if (o === skip) continue;
      if (d.excludes.includes(o) || techById(o).excludes.includes(id)) return false;
    }
    return true;
  }

  /** 技法三選一的候選（隨機 n 個；固定種子） */
  offerNew(rng: Rng, n: number = TECH_CHOICES): string[] {
    const pool = techsFor(this.run.weaponItemId).map((t) => t.id).filter((id) => !this.has(id) && this.canOffer(id));
    const out: string[] = [];
    while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
    return out;
  }
  /**
   * 升級卡裡的那一張技法卡（D49）：沒拿過的（還有空位、不互斥）權重 fresh，已有的下一級（沒到上限）權重 owned。
   * 回傳 id；沒有可以出的 = null。
   */
  pickCard(rng: Rng): string | null {
    const ids: string[] = [];
    const w: number[] = [];
    if (this.slotsUsed < this.max) {
      for (const t of techsFor(this.run.weaponItemId)) {
        if (this.has(t.id) || !this.canOffer(t.id)) continue;
        ids.push(t.id);
        w.push(TECH_OFFER.fresh);
      }
    }
    this.owned.forEach((id, i) => {
      if (this.levels[i] >= this.capOf(id)) return;
      // 養成門檻（D50）：下一級要玩家等級 ≥ minLevel + levelGap × 目前技法等級
      if (this.run.level < TECH_OFFER.minLevel + TECH_OFFER.levelGap * this.levels[i]) return;
      ids.push(id);
      w.push(TECH_OFFER.owned + TECH_OFFER.levelBias * (this.levels[i] - 1));
    });
    if (ids.length === 0) return null;
    let t = rng.next() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < ids.length; k++) {
      t -= w[k];
      if (t < 0) return ids[k];
    }
    return ids[ids.length - 1];
  }

  /** 加深的候選（還沒到技法等級上限的，最多 n 個） */
  offerUp(rng: Rng, n: number = TECH_CHOICES): string[] {
    const pool = this.owned.filter((id, i) => this.levels[i] < this.capOf(id));
    const out: string[] = [];
    while (out.length < n && pool.length > 0) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
    return out;
  }
  /** 道祖神的換法提案：[舊, 新]（舊的是現有的、新的是拿掉舊的之後抽得到的；不同提案的新技法不同） */
  offerSwap(rng: Rng, n: number = TECH_RULES.swapProposals): [string, string][] {
    const out: [string, string][] = [];
    const olds = [...this.owned];
    const usedNew = new Set<string>();
    for (let k = 0; k < n && olds.length > 0; k++) {
      const old = olds.splice(Math.floor(rng.next() * olds.length), 1)[0];
      const pool = techsFor(this.run.weaponItemId).map((t) => t.id).filter((id) => !this.has(id) && !usedNew.has(id) && this.canOffer(id, old));
      if (pool.length === 0) continue;
      const nw = pool[Math.floor(rng.next() * pool.length)];
      usedNew.add(nw);
      out.push([old, nw]);
    }
    return out;
  }

  // ── 出手 ─────────────────────────────────────────────────────
  /** 取代原本的發射（燈籠環） */
  get replacesFire(): boolean {
    return !!this.act.ring;
  }
  /** 鬼火射出時的傷害倍率、冷卻倍率（業火） */
  get shotMult(): number {
    return (this.act.hellfire?.burn?.shotDamage ?? 1);
  }
  get intervalMult(): number {
    return (this.act.hellfire?.burn?.interval ?? 1);
  }
  /** 歸巢：射出的主鬼火記號（回頭追） */
  get homingFlag(): number {
    return this.act.homing ? 1 : 0;
  }

  /** 燈籠環：繞身鬼火幾顆、半徑（公尺）；沒有燈籠環 = 0 */
  get ringCount(): number {
    const o = this.act.ring?.orbit;
    if (!o) return 0;
    return Math.max(1, Math.floor(this.run.volleyExact) + o.baseOrbs + 0 + this.countOf('ring'));
  }
  get ringRadius(): number {
    const o = this.act.ring?.orbit;
    if (!o) return 0;
    return o.radius * this.run.stats.value.area * 1;
  }
  /** 衛星燈：幾盞、半徑（公尺） */
  get satCount(): number {
    const o = this.act.satellite?.satellite;
    return o ? o.count + this.countOf('satellite') : 0;
  }
  get satRadius(): number {
    const o = this.act.satellite?.satellite;
    return o ? o.radius * this.run.stats.value.area : 0;
  }

  private wardNeed(w: NonNullable<TechDef['ward']>): number {
    return w.chargeSeconds;
  }
  /** 護身火充能進度 0～1（HUD、畫面用） */
  get wardProgress(): number {
    const w = this.act.ward?.ward;
    return w ? Math.min(1, this.wardCharge / this.wardNeed(w)) : 0;
  }

  // ── 每步 ─────────────────────────────────────────────────────
  update(dt: number): void {
    const run = this.run;
    const s = run.stats.value;
    const a = this.act;
    if (a.ring?.orbit) {
      const o = a.ring.orbit;
      this.ringAngle = (this.ringAngle + o.spin * dt) % (Math.PI * 2);
      this.ringTimer -= dt;
      if (this.ringTimer <= 0) {
        this.ringTimer += (o.tick * run.cooldownMult) / s.atkSpeed;
        this.sweepRing(o, this.pw('ring'));
      }
    }
    if (a.satellite?.satellite) {
      const o = a.satellite.satellite;
      this.satAngle = (this.satAngle + o.spin * dt) % (Math.PI * 2);
      this.satTimer -= dt;
      if (this.satTimer <= 0) {
        this.satTimer += (o.tick * run.cooldownMult) / s.atkSpeed;
        this.sweepSatellites(o, this.pw('satellite'));
      }
    }
    if (a.lamp?.lamp) this.lampStep(dt, a.lamp.lamp);
    if (a.oil?.oil) this.oilStep(dt, a.oil.oil);
    if (a.pillar?.pillar) this.pillarStep(dt, a.pillar.pillar);
    if (a.ward?.ward && !this.wardReady) this.wardCharge += dt;
    if (a.hellfire?.burn) this.zonesStep(dt, a.hellfire.burn);
    if (a.seed?.seed) this.seedsStep(dt, a.seed.seed);
    for (let i = 0; i < PILLARS; i++) if (this.pillarLife[i] > 0) this.pillarLife[i] -= dt;
    for (let i = 0; i < FLASHES; i++) if (this.flashLife[i] > 0) this.flashLife[i] -= dt;
  }

  /** 換關：地上的東西全部消失 */
  endStage(): void {
    this.zoneLife.fill(0);
    this.seedT.fill(0);
    this.pillarLife.fill(0);
    this.flashLife.fill(0);
    this.oilT.fill(0);
    this.oilShown = 0;
  }

  // ── 繞身 ─────────────────────────────────────────────────────
  private sweepRing(o: NonNullable<TechDef['orbit']>, power: number): void {
    const run = this.run;
    const en = run.enemies;
    const n = this.ringCount;
    const R = this.ringRadius;
    // 環內護身（D46）：鑽進環內的人類受傷並被推出去（以前貼身的打不到，被包圍就只能挨打）
    const inner = R - o.hitRadius;
    if (inner > 0) {
      const m0 = en.within(run.px, run.pz, inner, this.near);
      for (let j = 0; j < m0; j++) {
        const e = this.near[j];
        if (!en.alive[e]) continue;
        const ex = en.x[e] - run.px;
        const ez = en.z[e] - run.pz;
        if (ex * ex + ez * ez > inner * inner) continue;
        const d = Math.hypot(ex, ez) || 1;
        const dmg = run.shotDamage(false) * o.damage * o.innerDamage * power * this.ownCrit('ring');
        this.innerHits++;
        run.weaponHit(e, dmg, ex / d, ez / d, o.innerKnockback, this.lastCrit);
      }
    }
    for (let k = 0; k < n; k++) {
      const a = this.ringAngle + (k / n) * Math.PI * 2;
      this.sweepAt(run.px + Math.cos(a) * R, run.pz + Math.sin(a) * R, o.hitRadius, o.damage * power, o.knockback, 'ring');
    }
  }

  private sweepSatellites(o: NonNullable<TechDef['satellite']>, power: number): void {
    const run = this.run;
    const n = this.satCount;
    const R = this.satRadius;
    for (let k = 0; k < n; k++) {
      const a = this.satAngle + (k / n) * Math.PI * 2;
      this.sweepAt(run.px + Math.cos(a) * R, run.pz + Math.sin(a) * R, o.hitRadius, o.damage * power, o.knockback, 'satellite');
    }
  }

  /** 在 (ox, oz) 半徑 hit 內的人類各受一次傷害（可暴擊），並觸發命中效果 */
  private sweepAt(ox: number, oz: number, hit: number, dmgRatio: number, knock: number, mech: TechMechanic): void {
    const run = this.run;
    const en = run.enemies;
    const m = en.within(ox, oz, hit + 0.5, this.near);
    for (let j = 0; j < m; j++) {
      const e = this.near[j];
      if (!en.alive[e]) continue;
      const dx = en.x[e] - ox;
      const dz = en.z[e] - oz;
      const rr = hit + en.radius(e);
      if (dx * dx + dz * dz > rr * rr) continue;
      const dmg = run.shotDamage(false) * dmgRatio * this.ownCrit(mech);
      const crit = this.lastCrit;
      const ex = en.x[e] - run.px;
      const ez = en.z[e] - run.pz;
      const d = Math.hypot(ex, ez) || 1;
      const x = en.x[e];
      const z = en.z[e];
      run.weaponHit(e, dmg, ex / d, ez / d, knock, crit);
      this.hitFx(e, x, z, dmg, false, crit);
    }
  }

  // ── 命中效果（任何出手方式打中人類都會觸發）────────────────────
  /**
   * 打中 e（在 x, z）造成 dmg：觸發全部「命中效果」。鬼火直接命中（direct）每次都觸發；
   * 繞身、火柱的命中每隻人類 TECH_RULES.hitFxCooldown 秒內只觸發一次（高頻判定不爆量）。
   */
  hitFx(e: number, x: number, z: number, dmg: number, direct: boolean, crit = false): void {
    const a = this.act;
    if (!a.kitsunebi && !a.bounce && !a.hellfire && !a.rain && !a.oil) return;
    if (!direct) {
      const now = this.run.clock;
      if (now < this.fxUntil[e]) return;
      this.fxUntil[e] = now + TECH_RULES.hitFxCooldown;
    }
    // 每個命中效果各自套上自己的暴擊詞條（fxCrit）
    if (a.kitsunebi?.split) this.splitFrom(a.kitsunebi.split, x, z, e, dmg * this.pw('kitsunebi') * this.fxCrit('kitsunebi', crit));
    if (a.bounce?.bounce) {
      const b = a.bounce.bounce;
      const jumps = b.jumps + this.chainExtra('bounce');
      this.bounceFrom(b, x, z, e, dmg * b.damage * this.pw('bounce') * this.fxCrit('bounce', crit), jumps);
    }
    if (a.hellfire?.burn) this.addZone(a.hellfire.burn, x, z, dmg * a.hellfire.burn.damage * this.pw('hellfire') * this.fxCrit('hellfire', crit));
    if (a.rain?.rain) this.rainFrom(a.rain.rain, x, z, dmg * this.pw('rain') * this.fxCrit('rain', crit));
    if (a.oil?.oil) this.ignite(a.oil.oil, e, dmg * a.oil.oil.damage * this.pw('oil') * this.fxCrit('oil', crit));
  }

  /** 鬼火雨：在命中點 range 公尺內隨機落下幾顆小火，各自炸到半徑內的人（不追人，落點隨機） */
  private rainFrom(r: NonNullable<TechDef['rain']>, x: number, z: number, dmg: number): void {
    const run = this.run;
    const en = run.enemies;
    const n = r.count + this.chainExtra('rain');
    for (let k = 0; k < n; k++) {
      const a = run.rand() * Math.PI * 2;
      const d = Math.sqrt(run.rand()) * r.range;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      this.addFlash(px, pz, r.radius, r.life, FLASH_KINDS.rain);
      const m = en.within(px, pz, r.radius, this.pick);
      for (let j = 0; j < m; j++) {
        const o = this.pick[j];
        if (en.alive[o]) run.weaponHit(o, dmg * r.damage, en.x[o] - px, en.z[o] - pz, 1, false);
      }
    }
  }

  // ── 燈油 ─────────────────────────────────────────────────────
  /** 讓 e 身上沾火（已經在燒就重新計時、傷害取大的）；同時燒著的人類有上限 */
  private ignite(o: NonNullable<TechDef['oil']>, e: number, tickDamage: number): void {
    const burning = this.oilT[e] > 0;
    if (!burning) {
      let live = 0;
      for (let i = 0; i < this.oilT.length && live < o.max; i++) if (this.oilT[i] > 0) live++;
      if (live >= o.max) return;
      this.oilTick[e] = o.tick;
    }
    this.oilT[e] = o.seconds;
    this.oilDmg[e] = burning ? Math.max(this.oilDmg[e], tickDamage) : tickDamage;
  }
  private oilStep(dt: number, o: NonNullable<TechDef['oil']>): void {
    const run = this.run;
    const en = run.enemies;
    let shown = 0;
    for (let e = 0; e < this.oilT.length; e++) {
      if (this.oilT[e] <= 0) continue;
      if (!en.alive[e]) {
        this.oilT[e] = 0;
        continue;
      }
      this.oilT[e] -= dt;
      this.oilTick[e] -= dt;
      if (shown < OIL_SHOWN) this.oilShow[shown++] = e;
      if (this.oilTick[e] > 0) continue;
      this.oilTick[e] += o.tick;
      const x = en.x[e];
      const z = en.z[e];
      run.weaponHit(e, this.oilDmg[e], 0, 0, 0, false);
      if (!en.alive[e]) {
        this.oilT[e] = 0;
        this.spreadOil(o, x, z, e, this.oilDmg[e]);
      }
    }
    this.oilShown = shown;
  }
  /** 燒死的人把火傳給 spreadRange 公尺內最近的幾個還沒著火的人 */
  private spreadOil(o: NonNullable<TechDef['oil']>, x: number, z: number, from: number, tickDamage: number): void {
    const en = this.run.enemies;
    const want = o.spread;
    const m = en.within(x, z, o.spreadRange, this.pick);
    for (let made = 0; made < want; made++) {
      let best = -1;
      let bd = Infinity;
      for (let j = 0; j < m; j++) {
        const t = this.pick[j];
        if (t < 0 || t === from || !en.alive[t] || this.oilT[t] > 0) continue;
        const d = (en.x[t] - x) ** 2 + (en.z[t] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (best < 0) return;
      const t = this.pick[best];
      this.pick[best] = -1;
      this.oilT[t] = 0;
      this.ignite(o, t, tickDamage);
    }
  }

  // ── 開路燈 ───────────────────────────────────────────────────
  /** 開路燈幾盞（含數量詞條，上限 LAMPS） */
  get lampCount(): number {
    const o = this.act.lamp?.lamp;
    return o ? Math.min(LAMPS, o.count + this.countOf('lamp')) : 0;
  }
  /** 鬼火柱一次噴幾根（含數量詞條） */
  get pillarCount(): number {
    const p = this.act.pillar?.pillar;
    return p ? 1 + this.countOf('pillar') : 0;
  }
  private lampStep(dt: number, o: NonNullable<TechDef['lamp']>): void {
    const run = this.run;
    const s = run.stats.value;
    this.lampN = this.lampCount;
    const dx = Math.sin(run.facing);
    const dz = Math.cos(run.facing);
    const A = o.ahead * s.area;
    for (let i = 0; i < this.lampN; i++) {
      // 1 盞在正前方；2 盞在兩側；更多盞時排成往兩側展開、越外側越靠後的弧
      const off = this.lampN === 1 ? 0 : (i / (this.lampN - 1) - 0.5) * 2 * o.side * Math.max(1, (this.lampN - 1) / 1.5);
      const back = this.lampN <= 2 ? 0 : Math.abs(off) * 0.35;
      this.lampX[i] = run.px + dx * (A - back) - dz * off;
      this.lampZ[i] = run.pz + dz * (A - back) + dx * off;
    }
    this.lampTimer -= dt;
    if (this.lampTimer > 0) return;
    this.lampTimer += (o.tick * run.cooldownMult) / s.atkSpeed;
    for (let i = 0; i < this.lampN; i++) this.sweepAt(this.lampX[i], this.lampZ[i], o.hitRadius, o.damage * this.pw('lamp'), o.knockback, 'lamp');
  }

  /** 狐火分裂：從命中處朝其他敵人分裂出小火（小火不會再分裂；有碎火時另見 Run.emitShards） */
  private splitFrom(sp: NonNullable<TechDef['split']>, x: number, z: number, e: number, dmg: number): void {
    const run = this.run;
    const en = run.enemies;
    const want = sp.children + this.chainExtra('kitsunebi');
    const m = en.within(x, z, sp.range, this.pick);
    let made = 0;
    while (made < want) {
      // 找還沒選過的最近敵人（n 很小，重複掃描即可，不配置記憶體）
      let best = -1;
      let bd = Infinity;
      for (let j = 0; j < m; j++) {
        const o = this.pick[j];
        if (o === e || o < 0 || !en.alive[o]) continue;
        const d = (en.x[o] - x) ** 2 + (en.z[o] - z) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (best < 0) break;
      const t = this.pick[best];
      this.pick[best] = -1;
      const d = Math.sqrt(bd) || 1;
      const ci = run.projectiles.spawn(x, z, (en.x[t] - x) / d, (en.z[t] - z) / d, this.weapon, dmg * sp.damage, false, t, 0, 1);
      // 小火從被打中的那隻身上出發：不要馬上又打回同一隻
      if (ci >= 0) run.projectiles.lastHit[ci] = e;
      made++;
    }
  }

  /** 彈跳：從 (x, z) 朝範圍內最近的另一隻跳過去（dmg = 這一跳的傷害）；jumps = 還能跳幾次（含這一跳） */
  bounceFrom(b: NonNullable<TechDef['bounce']>, x: number, z: number, e: number, dmg: number, jumps: number): void {
    if (jumps <= 0) return;
    const run = this.run;
    const en = run.enemies;
    const m = en.within(x, z, b.range, this.pick);
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < m; j++) {
      const o = this.pick[j];
      if (o === e || !en.alive[o]) continue;
      const d = (en.x[o] - x) ** 2 + (en.z[o] - z) ** 2;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best < 0) return;
    const d = Math.sqrt(bd) || 1;
    const ci = run.projectiles.spawn(x, z, (en.x[best] - x) / d, (en.z[best] - z) / d, this.weapon, dmg, false, best, 0, 3);
    if (ci >= 0) {
      run.projectiles.lastHit[ci] = e;
      run.projectiles.chain[ci] = jumps - 1;
    }
  }

  /** 彈跳的小火打中後：還有次數就再跳（傷害 × b.damage；等級倍率只在第一跳乘） */
  onBounceHit(e: number, x: number, z: number, dmg: number, chainLeft: number): void {
    const b = this.act.bounce?.bounce;
    if (!b || chainLeft <= 0) return;
    this.bounceFrom(b, x, z, e, dmg * b.damage, chainLeft);
  }

  // ── 燃燒地（業火）────────────────────────────────────────────
  addZone(b: NonNullable<TechDef['burn']>, x: number, z: number, tickDamage: number): void {
    const i = this.zoneNext;
    this.zoneNext = (this.zoneNext + 1) % Math.min(b.maxZones, ZONES);
    this.zoneX[i] = x;
    this.zoneZ[i] = z;
    this.zoneR[i] = b.radius * this.run.stats.value.area * 1;
    this.zoneLife[i] = b.seconds;
    this.zoneMaxLife[i] = b.seconds;
    this.zoneDmg[i] = tickDamage;
    this.zoneTick[i] = 0;
  }
  get zoneCount(): number {
    let n = 0;
    for (let i = 0; i < ZONES; i++) if (this.zoneLife[i] > 0) n++;
    return n;
  }
  private zonesStep(dt: number, b: NonNullable<TechDef['burn']>): void {
    const run = this.run;
    const en = run.enemies;
    for (let i = 0; i < ZONES; i++) {
      if (this.zoneLife[i] <= 0) continue;
      this.zoneLife[i] -= dt;
      this.zoneTick[i] -= dt;
      if (this.zoneTick[i] > 0) continue;
      this.zoneTick[i] += b.tick;
      const m = en.within(this.zoneX[i], this.zoneZ[i], this.zoneR[i], this.near);
      for (let j = 0; j < m; j++) {
        const e = this.near[j];
        if (en.alive[e]) run.weaponHit(e, this.zoneDmg[i], 0, 0, 0, false);
      }
    }
  }

  // ── 火種 ─────────────────────────────────────────────────────
  /** 人類被武器打倒：有火種技法就在那裡留一顆 */
  onWeaponKill(x: number, z: number): void {
    const sd = this.act.seed?.seed;
    if (!sd) return;
    let live = 0;
    let free = -1;
    for (let i = 0; i < SEEDS; i++) {
      if (this.seedT[i] > 0) live++;
      else if (free < 0) free = i;
    }
    if (free < 0 || live >= sd.max) return;
    this.seedX[free] = x;
    this.seedZ[free] = z;
    this.seedT[free] = sd.delay;
  }
  get seedCount(): number {
    let n = 0;
    for (let i = 0; i < SEEDS; i++) if (this.seedT[i] > 0) n++;
    return n;
  }
  private seedsStep(dt: number, sd: NonNullable<TechDef['seed']>): void {
    const run = this.run;
    const en = run.enemies;
    for (let i = 0; i < SEEDS; i++) {
      if (this.seedT[i] <= 0) continue;
      this.seedT[i] -= dt;
      if (this.seedT[i] > 0) continue;
      const R = sd.radius * run.stats.value.area;
      const x = this.seedX[i];
      const z = this.seedZ[i];
      this.addFlash(x, z, R, 0.35, FLASH_KINDS.seed);
      const dmg = run.shotDamage(false) * sd.damage * this.pw('seed');
      const m = en.within(x, z, R, this.near);
      for (let j = 0; j < m; j++) {
        const e = this.near[j];
        if (!en.alive[e]) continue;
        const k = this.ownCrit('seed');
        run.weaponHit(e, dmg * k, en.x[e] - x, en.z[e] - z, 2, this.lastCrit);
      }
    }
  }

  // ── 鬼火柱 ───────────────────────────────────────────────────
  private pillarStep(dt: number, p: NonNullable<TechDef['pillar']>): void {
    const run = this.run;
    this.pillarTimer -= dt;
    if (this.pillarTimer > 0) return;
    const en = run.enemies;
    const R = p.radius * run.stats.value.area;
    const m = en.within(run.px, run.pz, p.range, this.near);
    if (m <= 0) {
      this.pillarTimer = 0; // 沒有人：等有人出現馬上噴
      return;
    }
    this.pillarTimer += (p.interval * run.cooldownMult) / run.stats.value.atkSpeed;
    this.pillarR = R;
    const count = this.pillarCount;
    let fx = NaN;
    let fz = NaN;
    for (let c = 0; c < count; c++) {
      // 周圍（半徑 R）人最多的那隻；第二根要離第一根夠遠
      let best = -1;
      let bestN = -1;
      for (let j = 0; j < Math.min(m, 24); j++) {
        const cand = this.near[j];
        if (!en.alive[cand]) continue;
        const cx = en.x[cand];
        const cz = en.z[cand];
        if (c > 0 && (cx - fx) ** 2 + (cz - fz) ** 2 < (R * 1.6) ** 2) continue;
        const n = en.within(cx, cz, R, this.pick);
        if (n > bestN) {
          bestN = n;
          best = cand;
        }
      }
      if (best < 0) break;
      const x = en.x[best];
      const z = en.z[best];
      fx = x;
      fz = z;
      this.dropPillar(p, x, z, R);
    }
  }
  private dropPillar(p: NonNullable<TechDef['pillar']>, x: number, z: number, R: number): void {
    const run = this.run;
    const en = run.enemies;
    let slot = 0;
    for (let i = 0; i < Math.min(Math.max(p.max, this.pillarCount * 2), PILLARS); i++) if (this.pillarLife[i] <= this.pillarLife[slot]) slot = i;
    this.pillarX[slot] = x;
    this.pillarZ[slot] = z;
    this.pillarLife[slot] = p.life;
    this.pillarMax[slot] = p.life;
    this.addFlash(x, z, R, p.life, FLASH_KINDS.pillar);
    const base = p.damage * this.pw('pillar');
    // 先收齊這一根打到的人（hitFx 會生出新的投射物，不能在迴圈裡改陣列）
    const m = en.within(x, z, R, this.near);
    for (let j = 0; j < m; j++) {
      const e = this.near[j];
      if (!en.alive[e]) continue;
      const dmg = run.shotDamage(false) * base * this.ownCrit('pillar');
      const crit = this.lastCrit;
      const ex = en.x[e];
      const ez = en.z[e];
      run.weaponHit(e, dmg, ex - x, ez - z, 0, crit);
      this.hitFx(e, ex, ez, dmg, false, crit);
    }
  }

  // ── 護身火 ───────────────────────────────────────────────────
  /** 被碰到：護身火充好了就擋下這次傷害並炸開，回傳 true */
  tryWard(): boolean {
    const w = this.act.ward?.ward;
    if (!w || !this.wardReady) return false;
    const run = this.run;
    this.wardCharge = 0;
    this.wardAt = run.clock;
    const R = w.burstRadius * run.stats.value.area;
    this.addFlash(run.px, run.pz, R, 0.4, FLASH_KINDS.ward);
    const en = run.enemies;
    const m = en.within(run.px, run.pz, R, this.near);
    const dmg = run.shotDamage(false) * w.burstDamage * this.pw('ward');
    for (let j = 0; j < m; j++) {
      const e = this.near[j];
      if (en.alive[e]) {
        const k = this.ownCrit('ward');
        run.weaponHit(e, dmg * k, en.x[e] - run.px, en.z[e] - run.pz, 5, this.lastCrit);
      }
    }
    return true;
  }

  // ── 畫面用 ───────────────────────────────────────────────────
  private addFlash(x: number, z: number, r: number, life: number, kind: number): void {
    const i = this.flashNext;
    this.flashNext = (this.flashNext + 1) % FLASHES;
    this.flashX[i] = x;
    this.flashZ[i] = z;
    this.flashR[i] = r;
    this.flashLife[i] = life;
    this.flashMax[i] = life;
    this.flashKind[i] = kind;
  }
}

/** 全部技法（資料全掃用） */
export const ALL_TECH_IDS: readonly string[] = TECHS.map((t) => t.id);
