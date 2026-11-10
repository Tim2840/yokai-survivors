import type { Rng } from '../lib/random';
import { STAGE } from '../data/stage';
import type { TerrainMap } from '../world/terrainMap';
import type { FlowField } from './flowField';
import type { Stats } from './stats';
import { pickRarity } from './cards';
import { RARITIES, type Rarity } from '../data/rarity';
import type { StatId } from '../data/stats';
import type { ElementResult, ResultLine } from './elementResult';
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
  JIZO_HOLD_SECONDS,
  CHEST_HOLD_SECONDS,
  ELEMENT_PER_KIND,
  FOX,
  FUSE,
  DOSOJIN,
  TRIAL,
  trialNeeds,
  ELEVATED,
  SUMMIT,
  OFFERING,
  OFFERING_HOLD_SECONDS,
  OMIKUJI_EFFECT,
  OMIKUJI_HOLD_SECONDS,
  OMIKUJI_RESULTS,
  OMIKUJI_WEIGHTS,
  type ElementKind,
  type OmikujiResult,
} from '../data/elements';

/** 一定要放得下、不會被擠掉的特殊要素 */
const SPECIAL: ReadonlySet<ElementKind> = new Set<ElementKind>(['summon', 'fuse', 'dosojin', 'summit']);

/** 給要素系統用的「玩家端」介面：只做它需要的事，不讓它碰整個 Run */
export interface ElementHost {
  stats: Stats;
  /** 立刻回復最大生命的 frac 倍；回傳實際回了多少 */
  healFrac(frac: number): number;
  /** 加一項整局有效的詛咒（讓敵人變強），key 用來之後單獨解除 */
  setCurse(key: string, id: CurseId, v: number): void;
  clearCurse(key: string): void;
  /** 賽錢箱：生命夠不夠付（付完至少剩 1 點）、付、開三選一面板（rarity 階的卡、連選 picks 次） */
  canPayHpFrac(frac: number): boolean;
  payHpFrac(frac: number): void;
  openPick(rarity: Rarity, picks: number, kind: 'offering' | 'chest' | 'fusion'): void;
  /** 合魂祠：現在有沒有湊齊、還沒融合的大招 */
  canFuse(): boolean;
  /** 玩家用走的到不到得了這裡（E2：高處的要素、山頂神社要走得到） */
  walkable(x: number, z: number): boolean;
  /** 山頂神社（E2）：現在能不能啟動（頭目出現前才行）、啟動：回傳這一關頭目生命倍率與多掉的寶箱數 */
  canSummit(): boolean;
  activateSummit(): { mult: number; chests: number };
  /** 道祖神（D47）：重新跳一次招式變化三選一 */
  rechooseVariant(): void;
  addMerit(n: number): void;
  notifyOmikuji(result: OmikujiResult): void;
  /** 召喚祭壇開了：召喚小頭目（D34）；回傳小頭目的生命倍率（沒召喚成功 = 0） */
  summonBoss(): number;
  /** 要素結果卡（D36）：暫停並顯示拿到了什麼 */
  showResult(r: ElementResult): void;
  /** 狐面商（D38）：現在能收的取捨道具（沒練滿；新的要有空欄位）、能不能收某一件、收下（回傳新等級） */
  foxCandidates(): readonly string[];
  canTakeItem(cardId: string): boolean;
  grantItem(cardId: string, rarity: Rarity): number;
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
  /** 狐面商（D38）：兩個提案（取捨道具 id）、兩個圈的位置、各自的站立進度、玩家站在哪個圈（-1 = 都沒有）、哪個圈收不了 */
  offers: string[];
  ringX: number[];
  ringZ: number[];
  ringProgress: number[];
  ringBlocked: boolean[];
  ring: number;
}

export interface AltarEffect {
  id: StatId | CurseId;
  v: number;
  curse: boolean;
}

const USED_FADE = 0.7;
/** 各要素按住幾秒（結界石不用按住） */
const HOLD: Partial<Record<ElementKind, number>> = { summit: SUMMIT.holdSeconds, trial: TRIAL.holdSeconds, jizo: JIZO_HOLD_SECONDS, altar: ALTAR_HOLD_SECONDS, offering: OFFERING_HOLD_SECONDS, omikuji: OMIKUJI_HOLD_SECONDS, chest: CHEST_HOLD_SECONDS, summon: STAGE.summon.holdSeconds, fuse: FUSE.holdSeconds, dosojin: DOSOJIN.holdSeconds };

function blankSlot(): ElementSlot {
  const n = FOX.offers;
  return {
    active: false, kind: 'jizo', rarity: 'common', x: 0, y: 0, z: 0, age: 0, life: 0, announce: 0, progress: 0, inside: false, blocked: false, usedAge: -1,
    effects: Array.from({ length: ALTAR_MAX_EFFECTS }, () => ({ id: 'power' as StatId | CurseId, v: 0, curse: false })), effectCount: 0,
    offers: [], ringX: new Array<number>(n).fill(0), ringZ: new Array<number>(n).fill(0), ringProgress: new Array<number>(n).fill(0), ringBlocked: new Array<boolean>(n).fill(false), ring: -1,
  };
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
  /** 百鬼試煉碑（E1）：進行中的試煉（一次只有一場）。kills 只算倒在圈內的 */
  readonly trial = { active: false, slot: -1, x: 0, z: 0, left: 0, kills: 0, tier: -1, needs: [0, 0, 0] as number[], rewards: ['common', 'rare', 'epic'] as Rarity[] };
  private nextDrop = 0;
  private drops = 0;
  private readonly timed: { key: string; until: number; total: number; label: string; curse?: boolean }[] = [];
  private luck = 0;
  private clock = 0;
  /** 關卡經過比例 0～1（試煉門檻用） */
  private progress = 0;
  /** 玩家現在的腳高（高處的要素要比這個高） */
  private playerY = 0;

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
    this.trial.active = false;
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
    this.trial.active = false;
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

  /**
   * 畫面上要倒數的限時效果（D78：「如若有時間限制，加成要顯示給使用者看」）：神籤的限時結果、站在裡面的結界石。
   * fn(說明的 i18n key, 剩幾秒, 總秒數, 是不是壞事)。同一個神籤的多條詛咒只報一次。
   */
  visitTimed(fn: (label: string, left: number, total: number, bad: boolean) => void): void {
    let last = '';
    for (const t of this.timed) {
      const id = t.key.split(':').slice(0, 2).join(':');
      if (id === last) continue;
      last = id;
      fn(t.label, Math.max(0, t.until - this.clock), t.total, !!t.curse);
    }
    for (const s of this.slots) if (s.active && s.kind === 'barrier' && s.inside && s.usedAge < 0) fn('element.barrier', Math.max(0, s.life), BARRIER_LIFETIME, false);
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
    this.progress = duration > 0 ? t / duration : 0;
    this.playerY = py;
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
      if (s.kind === 'trial' && this.trial.active && this.trial.slot === i) {
        // 試煉進行中：計時、不會被收掉；時間到結算
        this.updateTrial(i, dt);
        if (this.trial.active) mult = Math.max(mult, TRIAL.spawnMult);
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
      if (s.kind === 'fox') {
        this.updateFox(i, dt, px, py, pz);
        if (!s.active || s.usedAge >= 0) continue;
        if (dist < focusD && (dist <= ELEMENT_RULES.useRadius + FOX.ringOffset + 4 || s.ring >= 0)) {
          focusD = Math.min(dist, s.ring >= 0 ? 0 : dist);
          focusSlot = s;
        }
        continue;
      }
      const near = dist <= ELEMENT_RULES.useRadius && vertical;
      s.inside = near;
      s.blocked = (s.kind === 'offering' && !this.host.canPayHpFrac(OFFERING[s.rarity].costFrac)) || (s.kind === 'fuse' && !this.host.canFuse()) || (s.kind === 'summit' && !this.host.canSummit());
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

  /** 狐面商：玩家站在哪個圈、累積進度；滿了就收下那一個提案 */
  private updateFox(i: number, dt: number, px: number, py: number, pz: number): void {
    const s = this.slots[i];
    s.ring = -1;
    for (let k = 0; k < s.offers.length; k++) {
      s.ringBlocked[k] = !this.host.canTakeItem(s.offers[k]);
      const inRing = Math.hypot(px - s.ringX[k], pz - s.ringZ[k]) <= FOX.ringRadius && Math.abs(py - this.map.heightAt(s.ringX[k], s.ringZ[k])) <= ELEMENT_RULES.useHeight;
      if (inRing) s.ring = k;
      if (inRing && !s.ringBlocked[k]) {
        s.ringProgress[k] = Math.min(1, s.ringProgress[k] + dt / FOX.acceptSeconds);
        if (s.ringProgress[k] >= 1) {
          this.acceptFox(i, k);
          return;
        }
      } else s.ringProgress[k] = Math.max(0, s.ringProgress[k] - dt * 3);
    }
    s.inside = s.ring >= 0;
    let best = 0;
    for (let k = 0; k < s.offers.length; k++) if (s.ringProgress[k] > best) best = s.ringProgress[k];
    s.progress = best;
  }

  private acceptFox(i: number, k: number): void {
    const s = this.slots[i];
    const cardId = s.offers[k];
    const level = this.host.grantItem(cardId, s.rarity);
    s.usedAge = 0;
    s.progress = 1;
    this.host.emitUsed(s.kind, s.rarity);
    this.host.showResult({ kind: 'fox', rarity: s.rarity, lines: [{ t: 'item', cardId, rarity: s.rarity, level }] });
  }

  /** 狐面商兩個圈的位置：在商人面向玩家那一側，左右各一個 */
  private placeRings(s: ElementSlot, px: number, pz: number): void {
    const f = Math.atan2(pz - s.z, px - s.x);
    const fx = Math.cos(f);
    const fz = Math.sin(f);
    const n = s.offers.length;
    for (let k = 0; k < n; k++) {
      const side = n === 1 ? 0 : k === 0 ? -1 : 1;
      s.ringX[k] = s.x + fx * FOX.ringOffset * 0.75 - fz * side * FOX.ringOffset * 0.6;
      s.ringZ[k] = s.z + fz * FOX.ringOffset * 0.75 + fx * side * FOX.ringOffset * 0.6;
      s.ringProgress[k] = 0;
      s.ringBlocked[k] = false;
    }
  }

  /** 狐面商放在 (x,z)、面向 (px,pz) 時，兩個圈都在平地、不擋路、走得到嗎 */
  private foxRingsOk(x: number, z: number, px: number, pz: number): boolean {
    const m = this.map;
    const h = m.heightAt(x, z);
    const f = Math.atan2(pz - z, px - x);
    for (const side of [-1, 1]) {
      const rx = x + Math.cos(f) * FOX.ringOffset * 0.75 - Math.sin(f) * side * FOX.ringOffset * 0.6;
      const rz = z + Math.sin(f) * FOX.ringOffset * 0.75 + Math.cos(f) * side * FOX.ringOffset * 0.6;
      if (m.isBlocked(rx, rz) || Math.abs(m.heightAt(rx, rz) - h) > ELEMENT_RULES.flatTolerance * 2) return false;
      if (!this.flow.isolated && !this.flow.reachable(rx, rz)) return false;
    }
    return true;
  }

  /** 狐面商的提案：從現在能收的取捨道具裡不重複抽 FOX.offers 個 */
  private rollFox(s: ElementSlot): void {
    const pool = [...this.host.foxCandidates()];
    s.offers = [];
    while (s.offers.length < FOX.offers && pool.length > 0) s.offers.push(pool.splice(Math.floor(this.rng.next() * pool.length), 1)[0]);
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
    // 結果卡要列的東西（D36）；賽錢箱、寶箱本來就開三選一面板，不另外跳
    const lines: ResultLine[] = [];
    if (s.kind === 'jizo') {
      const j = JIZO[s.rarity];
      lines.push({ t: 'heal', v: this.host.healFrac(j.healFrac) });
      const key = `jizo:${this.carry.serial++}`;
      // D78：護甲是整場的（不放進 timed，換關也不清）
      st.setMod(key, { flat: { armor: j.armor } });
      lines.push({ t: 'stat', stat: 'armor', flat: j.armor });
      if (s.rarity === 'legend' && this.carry.downKeys.length > 0) {
        const k = this.carry.downKeys.shift()!;
        this.host.clearCurse(k);
        lines.push({ t: 'uncurse', id: k.slice(k.lastIndexOf(':') + 1) as CurseId });
      }
    } else if (s.kind === 'altar') {
      const n = this.carry.serial++;
      const pct: Partial<Record<StatId, number>> = {};
      for (let k = 0; k < s.effectCount; k++) {
        const f = s.effects[k];
        if (f.curse) {
          const key = `altar:${n}:${f.id}`;
          this.host.setCurse(key, f.id as CurseId, f.v);
          this.carry.downKeys.push(key);
          lines.push({ t: 'curse', id: f.id as CurseId, v: f.v });
        } else {
          pct[f.id as StatId] = f.v;
          lines.push({ t: 'stat', stat: f.id as StatId, pct: f.v });
        }
      }
      st.setMod(`altar:${n}:boons`, { pct });
    }
    else if (s.kind === 'offering') {
      const o = OFFERING[s.rarity];
      this.host.payHpFrac(o.costFrac);
      this.host.openPick(o.reward, o.picks, 'offering');
    } else if (s.kind === 'chest') {
      this.host.openPick(s.rarity, 1, 'chest');
    } else if (s.kind === 'fuse') {
      this.host.openPick(s.rarity, 1, 'fusion');
    } else if (s.kind === 'summit') {
      const r = this.host.activateSummit();
      lines.push({ t: 'summit', mult: r.mult, chests: r.chests });
    } else if (s.kind === 'trial') {
      this.startTrial(i);
      return; // 碑留在原地到試煉結束才收掉
    } else if (s.kind === 'dosojin') {
      this.host.rechooseVariant();
    } else if (s.kind === 'omikuji') lines.push(...this.drawOmikuji(s));
    else if (s.kind === 'summon') {
      const mult = this.host.summonBoss();
      if (mult > 0) lines.push({ t: 'summon', mult });
    }
    s.usedAge = 0;
    s.progress = 1;
    this.host.emitUsed(s.kind, s.rarity);
    if (lines.length > 0) this.host.showResult({ kind: s.kind, rarity: s.rarity, lines });
  }

  /** 百鬼試煉碑：開始一場試煉 */
  private startTrial(i: number): void {
    const s = this.slots[i];
    const t = this.trial;
    t.active = true;
    t.slot = i;
    t.x = s.x;
    t.z = s.z;
    t.left = TRIAL.seconds;
    t.kills = 0;
    t.tier = -1;
    t.needs = trialNeeds(s.rarity, this.progress);
    t.rewards = [...TRIAL.rewards[s.rarity]];
    s.life = Infinity;
    s.progress = 1;
    this.host.emitUsed('trial', s.rarity);
  }

  /** 試煉計時；時間到：依打倒的數量給寶箱（沒達到第 1 段什麼都沒有），顯示結果卡，碑消失 */
  private updateTrial(i: number, dt: number): void {
    const t = this.trial;
    const s = this.slots[i];
    t.left -= dt;
    let tier = -1;
    for (let k = 0; k < 3; k++) if (t.kills >= t.needs[k]) tier = k;
    t.tier = tier;
    if (t.left > 0) return;
    t.active = false;
    t.left = 0;
    const reward = t.rewards[Math.max(0, tier)];
    if (tier >= 0) this.dropChest(t.x, t.z, reward);
    s.usedAge = 0;
    s.progress = 1;
    this.host.showResult({ kind: 'trial', rarity: s.rarity, lines: [{ t: 'trial', kills: t.kills, tier, reward }] });
  }

  /** 人類被打倒（Run.onKill 呼叫）：倒在試煉圈內的才算 */
  noteKill(x: number, z: number): void {
    const t = this.trial;
    if (!t.active) return;
    if (Math.hypot(x - t.x, z - t.z) <= TRIAL.radius) t.kills++;
  }

  /** 神籤：依稀有度與幸運抽結果（幸運把凶類權重乘以 1/(1+luck/100)），套用限時效果 */
  private drawOmikuji(s: ElementSlot): ResultLine[] {
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
    return this.applyOmikuji(result);
  }

  /** 套用神籤結果（測試也直接呼叫）；回傳結果卡的內容 */
  applyOmikuji(result: OmikujiResult): ResultLine[] {
    const f = OMIKUJI_EFFECT[result];
    const lines: ResultLine[] = [{ t: 'omikuji', id: result }];
    const sec = f.seconds > 0 ? f.seconds : undefined;
    for (const [id, v] of Object.entries(f.pct ?? {})) lines.push({ t: 'stat', stat: id as StatId, pct: v, seconds: sec });
    for (const [id, v] of Object.entries(f.flat ?? {})) lines.push({ t: 'stat', stat: id as StatId, flat: v, seconds: sec });
    for (const [id, v] of Object.entries(f.curse ?? {})) lines.push({ t: 'curse', id: id as CurseId, v, seconds: sec });
    if (f.merit) lines.push({ t: 'merit', v: f.merit });
    const key = `omikuji:${this.carry.serial++}`;
    if (f.pct || f.flat) {
      this.host.stats.setMod(key, { pct: f.pct, flat: f.flat });
      // D78：seconds 0 = 整場（不放進 timed）
      if (f.seconds > 0) this.timed.push({ key, until: this.clock + f.seconds, total: f.seconds, label: `omikuji.${result}` });
    }
    if (f.curse) {
      for (const [id, v] of Object.entries(f.curse)) {
        const k = `${key}:${id}`;
        this.host.setCurse(k, id as CurseId, v);
        this.timed.push({ key: k, until: this.clock + f.seconds, total: f.seconds, label: `omikuji.${result}`, curse: true });
      }
    }
    if (f.merit) this.host.addMerit(f.merit);
    this.host.notifyOmikuji(result);
    return lines;
  }

  // ── 落下 ─────────────────────────────────────────────────────
  private pickKind(): ElementKind | null {
    let total = 0;
    const w: number[] = [];
    for (const k of ELEMENT_KINDS) {
      const ok = this.countKind(k) < (ELEMENT_PER_KIND[k] ?? ELEMENT_RULES.perKind) && (k !== 'fox' || this.host.foxCandidates().length > 0);
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

  private findSpot(px: number, pz: number, out: { x: number; z: number }, kind: ElementKind = 'jizo', minY = -Infinity): boolean {
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
      if (minY > -Infinity && (m.heightAt(x, z) < minY || !this.host.walkable(x, z))) continue;
      if (kind === 'fox' && !this.foxRingsOk(x, z, px, pz)) continue;
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
    // 高處（E2）：一部分要素放在比玩家高的、走得到的地方（狐面商要兩個平地圈，不放高處）；找不到就放一般的地方
    const high = kind !== 'fox' && this.rng.next() < ELEVATED.chance && this.findSpot(px, pz, spot, kind, this.playerY + ELEVATED.minRise);
    if (!high && !this.findSpot(px, pz, spot, kind)) return false;
    const rarity = pickRarity(this.rng, elementRarityWeights(virtualWave, luck));
    this.place(i, kind, rarity, spot.x, spot.z, announce, px, pz);
    return true;
  }

  private place(i: number, kind: ElementKind, rarity: Rarity, x: number, z: number, announce: number, px = x + 1, pz = z): void {
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
    s.ring = -1;
    if (kind === 'altar') this.rollAltar(s);
    if (kind === 'fox') {
      this.rollFox(s);
      this.placeRings(s, px, pz);
    }
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

  /** 召喚祭壇（D34）：離玩家 ringMin～ringMax 公尺、平地、走得到；找不到就放寬距離。不會過期 */
  placeSummon(px: number, pz: number): ElementSlot | null {
    return this.placeSpecial('summon', px, pz, STAGE.summon.ringMin, STAGE.summon.ringMax);
  }

  /** 合魂祠（大招材料齊了才出現）：離玩家 ringMin～ringMax 公尺；不會過期，沒有可以融合的大招時由 Run 收掉 */
  placeFuse(px: number, pz: number): ElementSlot | null {
    return this.placeSpecial('fuse', px, pz, FUSE.ringMin, FUSE.ringMax);
  }

  /** 道祖神（D47，選了招式變化之後每關一座）：離玩家 ringMin～ringMax 公尺；不會過期 */
  placeDosojin(px: number, pz: number): ElementSlot | null {
    return this.placeSpecial('dosojin', px, pz, DOSOJIN.ringMin, DOSOJIN.ringMax);
  }

  /** 特殊要素（召喚祭壇、合魂祠、道祖神）：一定要放得下（池滿了擠掉最舊的一般要素），找不到位置就放寬距離 */
  private placeSpecial(kind: 'summon' | 'fuse' | 'dosojin', px: number, pz: number, ringMin: number, ringMax: number): ElementSlot | null {
    let i = this.freeSlot();
    if (i < 0) {
      let oldest = -1;
      for (let k = 0; k < this.slots.length; k++) if (!SPECIAL.has(this.slots[k].kind) && (oldest < 0 || this.slots[k].age > this.slots[oldest].age)) oldest = k;
      if (oldest < 0) return null;
      this.free(oldest);
      i = oldest;
    }
    for (const [lo, hi] of [[ringMin, ringMax], [ringMin * 0.6, ringMax * 1.4], [6, 60]] as const) {
      for (let tr = 0; tr < ELEMENT_RULES.tries; tr++) {
        const a = this.rng.range(0, Math.PI * 2);
        const d = this.rng.range(lo, hi);
        const x = px + Math.cos(a) * d;
        const z = pz + Math.sin(a) * d;
        const m = this.map;
        if (x < m.minX + ELEMENT_RULES.edgeMargin || x > m.maxX - ELEMENT_RULES.edgeMargin || z < m.minZ + ELEMENT_RULES.edgeMargin || z > m.maxZ - ELEMENT_RULES.edgeMargin) continue;
        if (!this.spotOk(x, z)) continue;
        this.place(i, kind, 'legend', x, z, ELEMENT_RULES.announce);
        this.slots[i].life = Infinity;
        return this.slots[i];
      }
    }
    return null;
  }

  /** 收掉還沒用的某種要素（合魂祠：沒有可以融合的大招了） */
  removeKind(kind: ElementKind): void {
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i].active && this.slots[i].kind === kind && this.slots[i].usedAge < 0) this.free(i);
  }

  /** 道祖神還在、還沒用（HUD 箭頭用） */
  get dosojinSlot(): ElementSlot | null {
    for (const s of this.slots) if (s.active && s.kind === 'dosojin' && s.usedAge < 0) return s;
    return null;
  }

  /** 合魂祠還在、還沒用（HUD 箭頭用） */
  get fuseSlot(): ElementSlot | null {
    for (const s of this.slots) if (s.active && s.kind === 'fuse' && s.usedAge < 0) return s;
    return null;
  }

  /** 打倒小頭目／精英掉寶箱：放在 (x,z)（呼叫端挑好走得到的位置；擋路就往外找），池滿了擠掉最舊的一般要素 */
  dropChest(x: number, z: number, rarity: Rarity): ElementSlot | null {
    let i = this.freeSlot();
    if (i < 0) {
      let oldest = -1;
      for (let k = 0; k < this.slots.length; k++) if (!SPECIAL.has(this.slots[k].kind) && (oldest < 0 || this.slots[k].age > this.slots[oldest].age)) oldest = k;
      if (oldest < 0) return null;
      this.free(oldest);
      i = oldest;
    }
    for (const r of [0, 1.5, 3, 5, 8]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        if (this.map.isBlocked(cx, cz)) continue; // 呼叫端（Run.reachableNear）已挑好玩家走得到的位置
        this.place(i, 'chest', rarity, cx, cz, 0);
        return this.slots[i];
      }
    }
    return null;
  }

  /**
   * 山頂神社（E2）：這一關放一座在地圖最高的、走得到的平地（比出生點至少高 minRise 公尺、離出生點夠遠）；沒有這種地方就不放。
   * 每關開局呼叫一次。回傳放下的那一格（沒放 = null）
   */
  placeSummit(): ElementSlot | null {
    const m = this.map;
    const st = m.def.playerStart;
    const base = m.heightAt(st.x, st.z);
    let best: { x: number; z: number; y: number } | null = null;
    for (let z = m.minZ + ELEMENT_RULES.edgeMargin; z <= m.maxZ - ELEMENT_RULES.edgeMargin; z += 3) {
      for (let x = m.minX + ELEMENT_RULES.edgeMargin; x <= m.maxX - ELEMENT_RULES.edgeMargin; x += 3) {
        const y = m.heightAt(x, z);
        if (y < base + SUMMIT.minRise || (best && y <= best.y)) continue;
        if (Math.hypot(x - st.x, z - st.z) < SUMMIT.minFromStart) continue;
        if (!this.spotOk(x, z) || !this.host.walkable(x, z)) continue;
        best = { x, z, y };
      }
    }
    if (!best) return null;
    let i = this.freeSlot();
    if (i < 0) {
      let oldest = -1;
      for (let k = 0; k < this.slots.length; k++) if (!SPECIAL.has(this.slots[k].kind) && (oldest < 0 || this.slots[k].age > this.slots[oldest].age)) oldest = k;
      if (oldest < 0) return null;
      this.free(oldest);
      i = oldest;
    }
    this.place(i, 'summit', 'legend', best.x, best.z, 0);
    this.slots[i].life = Infinity;
    return this.slots[i];
  }

  /** 山頂神社還在、還沒用（HUD 箭頭用） */
  get summitSlot(): ElementSlot | null {
    for (const s of this.slots) if (s.active && s.kind === 'summit' && s.usedAge < 0) return s;
    return null;
  }

  /** 召喚祭壇還在、還沒開（HUD 箭頭用） */
  get summonSlot(): ElementSlot | null {
    for (const s of this.slots) if (s.active && s.kind === 'summon' && s.usedAge < 0) return s;
    return null;
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
        if (kind === 'fox' && !this.foxRingsOk(x, z, px, pz)) continue;
        this.place(i, kind, rarity, x, z, 0, px, pz);
        return this.slots[i];
      }
    }
    return null;
  }

  get dropCount(): number {
    return this.drops;
  }
}
