import { ENEMIES, ENEMY_IDS } from '../data/enemies';
import { COMBAT } from '../data/combat';
import { tuning } from '../data/tuning';
import { STAGE } from '../data/stage';
import { enemyHpMult, enemyDamageMult, enemySpeedMult } from '../data/waves';
import { SpatialHash } from '../lib/spatialHash';
import type { TerrainMap } from '../world/terrainMap';
import type { FlowField } from './flowField';

const KIND_HP = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].hp));
const KIND_SPEED = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].speed));
const KIND_CONTACT = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].contact));
const KIND_RADIUS = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].radius));
const KIND_POINTS = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].points));
export const kindIndex = (id: string): number => {
  const i = ENEMY_IDS.indexOf(id);
  if (i < 0) throw new Error(`沒有這種人類：${id}`);
  return i;
};

/**
 * 敵人池（SoA 型別陣列，熱路徑不配置記憶體）。索引在整局不變；死掉的格子進 free 堆疊重用。
 * 渲染層每幀走 0..high，只畫 alive[i] = 1 的。
 */
export class Enemies {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  /** 擊退速度 */
  readonly kx: Float32Array;
  readonly kz: Float32Array;
  readonly hp: Float32Array;
  readonly maxHp: Float32Array;
  readonly damage: Float32Array;
  readonly speed: Float32Array;
  readonly flash: Float32Array;
  readonly contactCd: Float32Array;
  readonly yaw: Float32Array;
  readonly phase: Float32Array;
  readonly kind: Uint8Array;
  /** 0 一般、1 精英、2 頭目 */
  readonly variant: Uint8Array;
  /** 渲染體型倍率 */
  readonly scale: Float32Array;
  /** 擊殺掉的魂火倍率後的點數 */
  readonly pointsLeft: Float32Array;
  readonly alive: Uint8Array;
  /** 用過的最大索引 + 1（渲染與迴圈的上界） */
  high = 0;
  aliveCount = 0;
  private readonly free: Int32Array;
  private freeTop = 0;
  readonly hash: SpatialHash;
  private readonly dir = new Float32Array(2);
  private readonly near = new Int32Array(COMBAT.queryMax);

  constructor(
    private readonly map: TerrainMap,
    capacity: number,
  ) {
    this.capacity = capacity;
    const f = () => new Float32Array(capacity);
    this.x = f();
    this.z = f();
    this.kx = f();
    this.kz = f();
    this.hp = f();
    this.maxHp = f();
    this.damage = f();
    this.speed = f();
    this.flash = f();
    this.contactCd = f();
    this.yaw = f();
    this.phase = f();
    this.kind = new Uint8Array(capacity);
    this.variant = new Uint8Array(capacity);
    this.scale = new Float32Array(capacity).fill(1);
    this.pointsLeft = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.free = new Int32Array(capacity);
    this.hash = new SpatialHash(map.minX, map.minZ, map.maxX - map.minX, map.maxZ - map.minZ, COMBAT.hashCell, capacity);
  }

  reset(): void {
    this.alive.fill(0);
    this.high = 0;
    this.aliveCount = 0;
    this.freeTop = 0;
  }

  radius(i: number): number {
    return KIND_RADIUS[this.kind[i]] * (this.scale[i] > 1.2 && this.variant[i] === 1 ? 1.2 : 1);
  }

  points(i: number): number {
    return this.pointsLeft[i];
  }

  /**
   * 生一隻；滿了回傳 -1。virtualWave = 虛擬波數（docs/02 第 8.1 節）；variant 0 一般／1 精英／2 頭目；stageMult = 第 k 關的 HP 倍率。
   * 頭目不吃「虛擬波數」的 HP 加成（它的 HP 是固定的佔位值）。
   */
  spawn(kind: number, x: number, z: number, virtualWave: number, night: number, phase: number, variant = 0, stageMult = 1): number {
    let i: number;
    if (this.freeTop > 0) i = this.free[--this.freeTop];
    else if (this.high < this.capacity) i = this.high++;
    else return -1;
    this.alive[i] = 1;
    this.kind[i] = kind;
    this.x[i] = x;
    this.z[i] = z;
    this.kx[i] = 0;
    this.kz[i] = 0;
    const elite = variant === 1;
    const boss = variant === 2;
    const hp = KIND_HP[kind] * (boss ? 1 : enemyHpMult(virtualWave, night)) * stageMult * tuning.hpScale * (elite ? STAGE.elite.hp : 1);
    this.hp[i] = hp;
    this.maxHp[i] = hp;
    this.damage[i] = KIND_CONTACT[kind] * (boss ? 1 : enemyDamageMult(virtualWave)) * (elite ? STAGE.elite.damage : 1);
    this.variant[i] = variant;
    this.scale[i] = boss ? 2.4 : elite ? STAGE.elite.scale : 1;
    this.pointsLeft[i] = KIND_POINTS[kind] * (elite ? STAGE.elite.orbMult : 1);
    this.speed[i] = KIND_SPEED[kind] * enemySpeedMult(night);
    this.flash[i] = 0;
    this.contactCd[i] = 0;
    this.yaw[i] = 0;
    this.phase[i] = phase;
    this.aliveCount++;
    return i;
  }

  /** 場上滿了：擠掉離 (px,pz) 最遠的一隻「一般」敵人（不動精英與頭目），回傳是否擠掉了 */
  evictFarthest(px: number, pz: number): boolean {
    let best = -1;
    let bd = -1;
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i] || this.variant[i] !== 0) continue;
      const d = (this.x[i] - px) ** 2 + (this.z[i] - pz) ** 2;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return false;
    this.kill(best);
    return true;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free[this.freeTop++] = i;
    this.aliveCount--;
  }

  /** 對一隻造成傷害並擊退；回傳是否死亡 */
  hurt(i: number, dmg: number, dirX: number, dirZ: number, knock: number): boolean {
    this.hp[i] -= dmg;
    this.flash[i] = COMBAT.hitFlash;
    this.kx[i] += dirX * knock;
    this.kz[i] += dirZ * knock;
    return this.hp[i] <= 0;
  }

  /**
   * 每個模擬步：往玩家走（流場）、被光圈減速、擊退衰減、軟推擠、碰撞阻擋。
   * auraRadius／auraSlow：提燈小僧的「燈火」；px、pz：玩家位置。
   */
  /** 敵人移動速度倍率（詛咒；每步由 Run 設） */
  speedMult = 1;

  update(dt: number, px: number, pz: number, flow: FlowField, auraRadius: number, auraSlow: number): void {
    const map = this.map;
    const decay = Math.pow(COMBAT.knockbackDecay, dt);
    const soft = this.aliveCount >= COMBAT.softPushMin;
    const dir = this.dir;
    const auraR2 = auraRadius * auraRadius;
    for (let i = 0; i < this.high; i++) {
      if (!this.alive[i]) continue;
      const ex = this.x[i];
      const ez = this.z[i];
      const dx = px - ex;
      const dz = pz - ez;
      const d2 = dx * dx + dz * dz;
      // 方向：近距離直線，遠距離流場
      let mx: number;
      let mz: number;
      if (d2 < 9 || !flow.dirAt(ex, ez, dir)) {
        // 近距離、或被懸崖隔開（走不到玩家）：直線朝玩家擠
        const inv = 1 / (Math.sqrt(d2) + 1e-6);
        mx = dx * inv;
        mz = dz * inv;
      } else {
        mx = dir[0];
        mz = dir[1];
      }
      let spd = this.speed[i] * this.speedMult * map.speedAt(ex, ez);
      if (d2 < auraR2) spd *= 1 - auraSlow;
      let vx = mx * spd + this.kx[i];
      let vz = mz * spd + this.kz[i];
      this.kx[i] *= decay;
      this.kz[i] *= decay;
      if (soft) {
        const n = this.hash.queryInto(ex, ez, 0.8, this.x, this.z, this.near);
        let sx = 0;
        let sz = 0;
        for (let k = 0; k < n; k++) {
          const j = this.near[k];
          if (j === i) continue;
          const ox = ex - this.x[j];
          const oz = ez - this.z[j];
          const od = ox * ox + oz * oz + 1e-4;
          sx += ox / od;
          sz += oz / od;
        }
        vx += sx * COMBAT.softPushStrength * 0.1;
        vz += sz * COMBAT.softPushStrength * 0.1;
      }
      let nx = ex + vx * dt;
      let nz = ez + vz * dt;
      if (map.stepBlocked(ex, ez, nx, nz)) {
        if (!map.stepBlocked(ex, ez, nx, ez)) nz = ez;
        else if (!map.stepBlocked(ex, ez, ex, nz)) nx = ex;
        else {
          nx = ex;
          nz = ez;
        }
      }
      this.x[i] = nx;
      this.z[i] = nz;
      if (mx !== 0 || mz !== 0) this.yaw[i] = Math.atan2(mx, mz);
      if (this.flash[i] > 0) this.flash[i] -= dt;
      if (this.contactCd[i] > 0) this.contactCd[i] -= dt;
    }
    this.hash.rebuild(this.x, this.z, this.alive, this.high);
  }

  /** 最近的敵人（在 range 內）；沒有回傳 -1 */
  nearest(x: number, z: number, range: number): number {
    const n = this.hash.queryInto(x, z, range, this.x, this.z, this.near);
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < n; k++) {
      const j = this.near[k];
      const dx = this.x[j] - x;
      const dz = this.z[j] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return best;
  }

  /** 範圍內所有敵人寫進 out，回傳數量（呼叫端提供緩衝） */
  within(x: number, z: number, r: number, out: Int32Array): number {
    return this.hash.queryInto(x, z, r, this.x, this.z, out);
  }
}
