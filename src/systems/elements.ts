import type { Rng } from '../lib/random';
import type { TerrainMap } from '../world/terrainMap';
import type { FlowField } from './flowField';
import type { Stats } from './stats';
import { pickRarity } from './cards';
import { RARITIES, type Rarity } from '../data/rarity';
import type { StatId } from '../data/stats';
import { ALTAR_BOONS, ALTAR_BOON_PCT, ALTAR_CURSE, ALTAR_CURSE_IDS, ALTAR_EFFECT_COUNT, ALTAR_MAX_EFFECTS, type CurseId } from '../data/altar';
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
  CHEST_HOLD_SECONDS,
  ELEMENT_PER_KIND,
  OFFERING,
  OFFERING_HOLD_SECONDS,
  OMIKUJI_EFFECT,
  OMIKUJI_HOLD_SECONDS,
  OMIKUJI_RESULTS,
  OMIKUJI_WEIGHTS,
  type ElementKind,
  type OmikujiResult,
} from '../data/elements';

/** 給要素系統用的「玩家端」介面：只做它需要的事，不讓它碰整個 Run */
export interface ElementHost {
  stats: Stats;
  /** 立刻回復最大生命的 frac 倍 */
  healFrac(frac: number): void;
  /** 加一項整局有效的詛咒（讓敵人變強），key 用來之後單獨解除 */
  setCurse(key: string, id: CurseId, v: number): void;
  clearCurse(key: string): void;
  /** 賽錢箱：生命夠不夠付（付完至少剩 1 點）、付、開三選一面板（rarity 階的卡、連選 picks 次） */
  canPayHpFrac(frac: number): boolean;
  payHpFrac(frac: number): void;
  openPick(rarity: Rarity, picks: number, kind: 'offering' | 'chest'): void;
  addMerit(n: number): void;
  notifyOmikuji(result: OmikujiResult): void;
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
  /** 付不起代價（賽錢箱生命不夠）：進度不前進，HUD 提示 */
  blocked: boolean;
  /** 被用掉後經過的秒數（< 0 = 還沒用過）；給外觀做消失動畫 */
  usedAge: number;
  /** 詛咒祭壇：抽到的效果（前 effectCount 個有效）。curse = true 是讓敵人變強的詛咒，否則是玩家屬性的好處（v 為相對比例） */
  effects: AltarEffect[];
  effectCount: number;
}

export interface AltarEffect {
  id: StatId | CurseId;
  v: number;
  curse: boolean;
}

const USED_FADE = 0.7;
/** 各要素按住幾秒（結界石不用按住） */
const HOLD: Partial<Record<ElementKind, number>> = { jizo: JIZO_HOLD_SECONDS, altar: ALTAR_HOLD_SECONDS, offering: OFFERING_HOLD_SECONDS, omikuji: OMIKUJI_HOLD_SECONDS, chest: CHEST_HOLD_SECONDS };

function blankSlot(): ElementSlot {
  return { active: false, kind: 'jizo', rarity: 'common', x: 0, y: 0, z: 0, age: 0, life: 0, announce: 0, progress: 0, inside: false, blocked: false, usedAge: -1, effects: Array.from({ length: ALTAR_MAX_EFFECTS }, () => ({ id: 'power' as StatId | CurseId, v: 0, curse: false })), effectCount: 0 };
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
  private readonly timed: { key: string; until: number; curse?: boolean }[] = [];
  private luck = 0;
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
    for (const t of this.timed) {
      if (t.curse) this.host.clearCurse(t.key);
      else this.host.stats.clearMod(t.key);
    }
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
    this.luck = luck;
    // 限時效果到期
    for (let i = this.timed.length - 1; i >= 0; i--) {
      if (t >= this.timed[i].until) {
        if (this.timed[i].curse) this.host.clearCurse(this.timed[i].key);
        else this.host.stats.clearMod(this.timed[i].key);
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
      s.blocked = s.kind === 'offering' && !this.host.canPayHpFrac(OFFERING[s.rarity].costFrac);
      if (near && !s.blocked) {
        const hold = HOLD[s.kind] ?? JIZO_HOLD_SECONDS;
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
      if (s.rarity === 'legend' && this.carry.downKeys.length > 0) this.host.clearCurse(this.carry.downKeys.shift()!);
    } else if (s.kind === 'altar') {
      const n = this.carry.serial++;
      const pct: Partial<Record<StatId, number>> = {};
      for (let k = 0; k < s.effectCount; k++) {
        const f = s.effects[k];
        if (f.curse) {
          const key = `altar:${n}:${f.id}`;
          this.host.setCurse(key, f.id as CurseId, f.v);
          this.carry.downKeys.push(key);
        } else pct[f.id as StatId] = f.v;
      }
      st.setMod(`altar:${n}:boons`, { pct });
    }
    else if (s.kind === 'offering') {
      const o = OFFERING[s.rarity];
      this.host.payHpFrac(o.costFrac);
      this.host.openPick(o.reward, o.picks, 'offering');
    } else if (s.kind === 'chest') {
      this.host.openPick(s.rarity, 1, 'chest');
    } else if (s.kind === 'omikuji') this.drawOmikuji(s);
    s.usedAge = 0;
    s.progress = 1;
    this.host.emitUsed(s.kind, s.rarity);
  }

  /** 神籤：依稀有度與幸運抽結果（幸運把凶類權重乘以 1/(1+luck/100)），套用限時效果 */
  private drawOmikuji(s: ElementSlot): void {
    const w = OMIKUJI_WEIGHTS[s.rarity];
    const dampen = 1 / (1 + Math.max(0, this.luck) / 100);
    let total = 0;
    const ws = OMIKUJI_RESULTS.map((r) => {
      const v = w[r] * (r === 'kyo' || r === 'daikyo' ? dampen : 1);
      total += v;
      return v;
    });
    let r = this.rng.next() * total;
    let result: OmikujiResult = OMIKUJI_RESULTS[0];
    for (let i = 0; i < ws.length; i++) {
      r -= ws[i];
      if (r < 0) {
        result = OMIKUJI_RESULTS[i];
        break;
      }
    }
    this.applyOmikuji(result);
  }

  /** 套用神籤結果（測試也直接呼叫） */
  applyOmikuji(result: OmikujiResult): void {
    const f = OMIKUJI_EFFECT[result];
    const key = `omikuji:${this.carry.serial++}`;
    if (f.pct || f.flat) {
      this.host.stats.setMod(key, { pct: f.pct, flat: f.flat });
      this.timed.push({ key, until: this.clock + f.seconds });
    }
    if (f.curse) {
      for (const [id, v] of Object.entries(f.curse)) {
        const k = `${key}:${id}`;
        this.host.setCurse(k, id as CurseId, v);
        this.timed.push({ key: k, until: this.clock + f.seconds, curse: true });
      }
    }
    if (f.merit) this.host.addMerit(f.merit);
    this.host.notifyOmikuji(result);
  }

  // ── 落下 ─────────────────────────────────────────────────────
  private pickKind(): ElementKind | null {
    let total = 0;
    const w: number[] = [];
    for (const k of ELEMENT_KINDS) {
      const ok = this.countKind(k) < (ELEMENT_PER_KIND[k] ?? ELEMENT_RULES.perKind);
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
    s.blocked = false;
    s.usedAge = -1;
    if (kind === 'altar') this.rollAltar(s);
    this.host.emitSpawn(kind, rarity);
  }

  /** 祭壇：隨機抽數個不同的效果，至少 1 個好處、1 個詛咒（D27） */
  private rollAltar(s: ElementSlot): void {
    const n = ALTAR_EFFECT_COUNT[s.rarity];
    const boons = [...ALTAR_BOONS];
    const curses = [...ALTAR_CURSE_IDS];
    const take = <T,>(arr: T[]): T => arr.splice(Math.floor(this.rng.next() * arr.length), 1)[0];
    const picked: AltarEffect[] = [];
    picked.push({ id: take(boons), v: ALTAR_BOON_PCT[s.rarity], curse: false });
    const c0 = take(curses);
    picked.push({ id: c0, v: ALTAR_CURSE[s.rarity][c0], curse: true });
    while (picked.length < n) {
      // 其餘的從剩下的好處與詛咒合併抽，不重複
      const total = boons.length + curses.length;
      if (total === 0) break;
      const k = Math.floor(this.rng.next() * total);
      if (k < boons.length) picked.push({ id: boons.splice(k, 1)[0], v: ALTAR_BOON_PCT[s.rarity], curse: false });
      else {
        const c = curses.splice(k - boons.length, 1)[0];
        picked.push({ id: c, v: ALTAR_CURSE[s.rarity][c], curse: true });
      }
    }
    // 順序打散，不讓玩家永遠看到「好處在前」
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    s.effectCount = picked.length;
    for (let i = 0; i < picked.length; i++) Object.assign(s.effects[i], picked[i]);
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
