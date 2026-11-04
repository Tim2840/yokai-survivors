import type { Rng } from '../lib/random';
import type { TerrainMap } from '../world/terrainMap';
import type { FlowField } from './flowField';
import type { Stats } from './stats';
import { pickRarity } from './cards';
import { RARITIES, type Rarity } from '../data/rarity';
import type { StatId } from '../data/stats';
import {
  ALTAR,
  ALTAR_DOWN_ARMOR,
  ALTAR_DOWN_PCT,
  ALTAR_UP,
} from '../data/altar';
import {
  ALTAR_HOLD_SECONDS,
  BARRIER,
  BARRIER_LIFETIME,
  BARRIER_RADIUS,
  BARRIER_SPAWN_MULT,
  ELEMENT_KINDS,
  ELEMENT_RARITY_BY_WAVE,
  ELEMENT_RULES,
  ELEMENT_WEIGHTS,
  JIZO,
  JIZO_ARMOR_SECONDS,
  JIZO_HOLD_SECONDS,
  type ElementKind,
} from '../data/elements';

/** 給要素系統用的「玩家端」介面：只做它需要的事，不讓它碰整個 Run */
export interface ElementHost {
  stats: Stats;
  /** 立刻回復最大生命的 frac 倍 */
  healFrac(frac: number): void;
  emitSpawn(kind: ElementKind, rarity: Rarity): void;
  emitUsed(kind: ElementKind, rarity: Rarity): void;
}

/** 跨關保留的狀態：祭壇的永久效果在整局都有效，來源編號不能重複 */
export interface ElementCarry {
  serial: number;
  downKeys: string[];
}

export interface ElementSlot {
  active: boolean;
  kind: ElementKind;
  rarity: Rarity;
  x: number;
  y: number;
  z: number;
  /** 落下後經過的秒數 */
  age: number;
  /** 剩餘存在秒數（歸零就消失） */
  life: number;
  /** 預告光柱剩餘秒數（> 0 時還不能用） */
  announce: number;
  /** 按住進度 0..1 */
  progress: number;
  /** 玩家現在在範圍內 */
  inside: boolean;
  /** 被用掉後經過的秒數（< 0 = 還沒用過）；給外觀做消失動畫 */
  usedAge: number;
  /** 詛咒祭壇：提升與降低的屬性與數值（pct 為比例；降低護甲時 downFlat 有值） */
  up: StatId;
  upPct: number;
  down: StatId;
  downPct: number;
  downFlat: number;
}

const USED_FADE = 0.7;

function blankSlot(): ElementSlot {
  return { active: false, kind: 'jizo', rarity: 'common', x: 0, y: 0, z: 0, age: 0, life: 0, announce: 0, progress: 0, inside: false, usedAge: -1, up: 'power', upPct: 0, down: 'maxHp', downPct: 0, downFlat: 0 };
}

/** 依虛擬波數取稀有度權重（幸運乘在非凡權重上） */
export function elementRarityWeights(virtualWave: number, luck: number): Record<Rarity, number> {
  let row = ELEMENT_RARITY_BY_WAVE[0].w;
  for (const r of ELEMENT_RARITY_BY_WAVE) if (virtualWave >= r.from) row = r.w;
  const m = 1 + Math.max(-0.5, luck / 100);
  return { common: row.common, rare: row.rare * m, epic: row.epic * m, legend: row.legend * m };
}

/**
 * 地圖要素（docs/02 第 6 節）：落下（預告光柱）→ 玩家走近按住／站進去 → 效果 → 消失。
 * 純邏輯；渲染層讀 slots。同一個種子、同樣的玩家走位 → 同樣的要素（Rng）。
 */
export class Elements {
  readonly slots: ElementSlot[] = Array.from({ length: ELEMENT_RULES.maxActive }, blankSlot);
  /** 玩家腳邊正在互動／最近的那個（HUD 提示用）；沒有 = null */
  focus: ElementSlot | null = null;
  /** 玩家在結界圈內時，敵人湧出速率的倍率（給 StageDirector） */
  spawnMult = 1;
  private nextDrop = 0;
  private drops = 0;
  private readonly timed: { key: string; until: number }[] = [];
  private clock = 0;

  constructor(
    private readonly rng: Rng,
    private readonly map: TerrainMap,
    private readonly flow: FlowField,
    private readonly host: ElementHost,
    private readonly carry: ElementCarry = { serial: 0, downKeys: [] },
  ) {}

  /** 新的一關開始：清空，先落下 initial 個 */
  start(px: number, pz: number, duration: number, virtualWave: number, luck: number): void {
    for (const s of this.slots) {
      s.active = false;
      s.inside = false;
    }
    this.focus = null;
    this.spawnMult = 1;
    this.drops = 0;
    this.nextDrop = ELEMENT_RULES.everyFrac * duration;
    this.clearAllMods();
    for (let i = 0; i < ELEMENT_RULES.initial; i++) this.drop(px, 0, pz, virtualWave, luck, 0);
  }

  /** 這一關結束：限時與結界的效果收掉，祭壇的永久效果留著 */
  endStage(): void {
    this.clearAllMods();
    for (const s of this.slots) s.active = false;
    this.spawnMult = 1;
    this.focus = null;
  }

  private clearAllMods(): void {
    for (const t of this.timed) this.host.stats.clearMod(t.key);
    this.timed.length = 0;
    for (const s of this.slots) this.host.stats.clearMod(`barrier:${this.slots.indexOf(s)}`);
  }

  get activeCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.active) n++;
    return n;
  }

  /** 場上有幾個這種要素 */
  countKind(kind: ElementKind): number {
    let n = 0;
    for (const s of this.slots) if (s.active && s.usedAge < 0 && s.kind === kind) n++;
    return n;
  }

  update(dt: number, t: number, duration: number, virtualWave: number, luck: number, px: number, py: number, pz: number): void {
    this.clock = t;
    // 限時效果到期
    for (let i = this.timed.length - 1; i >= 0; i--) {
      if (t >= this.timed[i].until) {
        this.host.stats.clearMod(this.timed[i].key);
        this.timed.splice(i, 1);
      }
    }
    // 定時落下
    while (t >= this.nextDrop && this.nextDrop < duration) {
      this.drop(px, ELEMENT_RULES.announce, pz, virtualWave, luck, ELEMENT_RULES.announce);
      this.drops++;
      this.nextDrop += ELEMENT_RULES.everyFrac * duration;
    }
    let focusSlot: ElementSlot | null = null;
    let focusD = Infinity;
    let mult = 1;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (!s.active) continue;
      s.age += dt;
      if (s.usedAge >= 0) {
        s.usedAge += dt;
        if (s.usedAge >= USED_FADE) this.free(i);
        continue;
      }
      if (s.announce > 0) {
        s.announce -= dt;
        continue;
      }
      s.life -= dt;
      if (s.life <= 0) {
        this.free(i);
        continue;
      }
      const dx = px - s.x;
      const dz = pz - s.z;
      const dist = Math.hypot(dx, dz);
      const vertical = Math.abs(py - s.y) <= ELEMENT_RULES.useHeight;
      if (s.kind === 'barrier') {
        const inside = dist <= BARRIER_RADIUS && vertical;
        if (inside !== s.inside) {
          s.inside = inside;
          const key = `barrier:${i}`;
          if (inside) {
            const v = BARRIER[s.rarity].bonus;
            this.host.stats.setMod(key, { pct: { power: v, atkSpeed: v } });
          } else this.host.stats.clearMod(key);
        }
        if (inside) mult = BARRIER_SPAWN_MULT;
        if (dist < focusD && dist <= BARRIER_RADIUS + 2) {
          focusD = dist;
          focusSlot = s;
        }
        continue;
      }
      const near = dist <= ELEMENT_RULES.useRadius && vertical;
      s.inside = near;
      if (near) {
        const hold = s.kind === 'altar' ? ALTAR_HOLD_SECONDS : JIZO_HOLD_SECONDS;
        s.progress = Math.min(1, s.progress + dt / hold);
        if (s.progress >= 1) {
          this.use(i);
          continue;
        }
      } else s.progress = Math.max(0, s.progress - dt * 3);
      if (dist < focusD && dist <= ELEMENT_RULES.useRadius + 4) {
        focusD = dist;
        focusSlot = s;
      }
    }
    this.focus = focusSlot;
    this.spawnMult = mult;
  }

  private free(i: number): void {
    const s = this.slots[i];
    if (s.kind === 'barrier') this.host.stats.clearMod(`barrier:${i}`);
    s.active = false;
    s.inside = false;
  }

  private use(i: number): void {
    const s = this.slots[i];
    const st = this.host.stats;
    if (s.kind === 'jizo') {
      const j = JIZO[s.rarity];
      this.host.healFrac(j.healFrac);
      const key = `jizo:${this.carry.serial++}`;
      st.setMod(key, { flat: { armor: j.armor } });
      this.timed.push({ key, until: this.clock + JIZO_ARMOR_SECONDS });
      if (s.rarity === 'legend' && this.carry.downKeys.length > 0) st.clearMod(this.carry.downKeys.shift()!);
    } else if (s.kind === 'altar') {
      const n = this.carry.serial++;
      st.setMod(`altar:${n}:up`, { pct: { [s.up]: s.upPct } });
      const downKey = `altar:${n}:down`;
      st.setMod(downKey, s.downFlat !== 0 ? { flat: { [s.down]: -s.downFlat } } : { pct: { [s.down]: -s.downPct } });
      this.carry.downKeys.push(downKey);
    }
    s.usedAge = 0;
    s.progress = 1;
    this.host.emitUsed(s.kind, s.rarity);
  }

  // ── 落下 ─────────────────────────────────────────────────────
  private pickKind(): ElementKind | null {
    let total = 0;
    const w: number[] = [];
    for (const k of ELEMENT_KINDS) {
      const ok = this.countKind(k) < ELEMENT_RULES.perKind;
      const v = ok ? ELEMENT_WEIGHTS[k] : 0;
      w.push(v);
      total += v;
    }
    if (total <= 0) return null;
    let r = this.rng.next() * total;
    for (let i = 0; i < ELEMENT_KINDS.length; i++) {
      r -= w[i];
      if (r < 0) return ELEMENT_KINDS[i];
    }
    return ELEMENT_KINDS[0];
  }

  private findSpot(px: number, pz: number, out: { x: number; z: number }): boolean {
    const m = this.map;
    const R = ELEMENT_RULES;
    const start = m.def.playerStart;
    for (let tr = 0; tr < R.tries; tr++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(10, 40);
      const x = px + Math.cos(a) * d;
      const z = pz + Math.sin(a) * d;
      if (x < m.minX + R.edgeMargin || x > m.maxX - R.edgeMargin || z < m.minZ + R.edgeMargin || z > m.maxZ - R.edgeMargin) continue;
      if (Math.hypot(x - start.x, z - start.z) < R.minFromStart) continue;
      if (!this.spotOk(x, z)) continue;
      out.x = x;
      out.z = z;
      return true;
    }
    return false;
  }

  /** 這個位置能放要素嗎：不擋路、平坦、玩家走得到、離別的要素夠遠 */
  spotOk(x: number, z: number): boolean {
    const m = this.map;
    const R = ELEMENT_RULES;
    if (m.isBlocked(x, z)) return false;
    const h = m.heightAt(x, z);
    for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]] as const) {
      if (m.isBlocked(x + ox, z + oz) || Math.abs(m.heightAt(x + ox, z + oz) - h) > R.flatTolerance) return false;
    }
    if (!this.flow.isolated && !this.flow.reachable(x, z)) return false;
    for (const s of this.slots) if (s.active && Math.hypot(s.x - x, s.z - z) < R.minApart) return false;
    return true;
  }

  private freeSlot(): number {
    for (let i = 0; i < this.slots.length; i++) if (!this.slots[i].active) return i;
    return -1;
  }

  private drop(px: number, _unused: number, pz: number, virtualWave: number, luck: number, announce: number): boolean {
    const i = this.freeSlot();
    if (i < 0) return false;
    const kind = this.pickKind();
    if (!kind) return false;
    const spot = { x: 0, z: 0 };
    if (!this.findSpot(px, pz, spot)) return false;
    const rarity = pickRarity(this.rng, elementRarityWeights(virtualWave, luck));
    this.place(i, kind, rarity, spot.x, spot.z, announce);
    return true;
  }

  private place(i: number, kind: ElementKind, rarity: Rarity, x: number, z: number, announce: number): void {
    const s = this.slots[i];
    s.active = true;
    s.kind = kind;
    s.rarity = rarity;
    s.x = x;
    s.z = z;
    s.y = this.map.heightAt(x, z);
    s.age = 0;
    s.life = (kind === 'barrier' ? BARRIER_LIFETIME : ELEMENT_RULES.lifetime) + announce;
    s.announce = announce;
    s.progress = 0;
    s.inside = false;
    s.usedAge = -1;
    if (kind === 'altar') this.rollAltar(s);
    this.host.emitSpawn(kind, rarity);
  }

  /** 祭壇的「升＋降」：一組合法組合（升 ≠ 降） */
  private rollAltar(s: ElementSlot): void {
    const a = ALTAR[s.rarity];
    s.up = this.rng.pick(ALTAR_UP);
    s.upPct = a.up / 100;
    // 降低：護甲改成固定值，其餘是百分比
    const downs: StatId[] = [...ALTAR_DOWN_PCT.filter((d) => d !== s.up), 'armor'];
    s.down = this.rng.pick(downs);
    if (s.down === 'armor') {
      s.downFlat = ALTAR_DOWN_ARMOR[s.rarity];
      s.downPct = 0;
    } else {
      s.downFlat = 0;
      s.downPct = a.down / 100;
    }
  }

  /** 開發與測試：在 (x,z) 或玩家身邊 3 公尺的平地，立刻放一個（可選指定稀有度） */
  devForce(kind: ElementKind, rarity: Rarity, px: number, pz: number): ElementSlot | null {
    if (!RARITIES.includes(rarity)) return null;
    let i = this.freeSlot();
    if (i < 0) {
      // 擠掉最舊的
      let oldest = 0;
      for (let k = 1; k < this.slots.length; k++) if (this.slots[k].age > this.slots[oldest].age) oldest = k;
      this.free(oldest);
      i = oldest;
    }
    for (const r of [3, 4, 5, 6, 8, 10, 12, 16]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = px + Math.cos(a) * r;
        const z = pz + Math.sin(a) * r;
        const m = this.map;
        if (m.isBlocked(x, z)) continue;
        const h = m.heightAt(x, z);
        let flat = true;
        for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]] as const) if (m.isBlocked(x + ox, z + oz) || Math.abs(m.heightAt(x + ox, z + oz) - h) > ELEMENT_RULES.flatTolerance) flat = false;
        if (!flat) continue;
        this.place(i, kind, rarity, x, z, 0);
        return this.slots[i];
      }
    }
    return null;
  }

  get dropCount(): number {
    return this.drops;
  }
}
