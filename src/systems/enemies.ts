import { ENEMIES, ENEMY_IDS } from '../data/enemies';
import { COMBAT } from '../data/combat';
import { tuning } from '../data/tuning';
import { STAGE } from '../data/stage';
import { enemyHpMult, enemyDamageMult, enemySpeedMult } from '../data/waves';
import { SpatialHash } from '../lib/spatialHash';
import type { TerrainMap } from '../world/terrainMap';
import type { FlowField } from './flowField';
import type { EnemyShots } from './enemyShots';

const KIND_HP = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].hp));
/** 每種敵人的每波 HP 成長（NaN = 用 WAVES.hpPerWave，讓 sim 的 --tune w.hpPerWave 還能用） */
const KIND_GROWTH = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].hpPerWave ?? NaN));
const KIND_SPEED = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].speed));
const KIND_CONTACT = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].contact));
const KIND_RADIUS = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].radius));
const KIND_BEHAVIOR = new Uint8Array(ENEMY_IDS.map((id) => (ENEMIES[id].behavior === 'shield' ? 1 : ENEMIES[id].behavior === 'ranged' ? 2 : 0)));
const BEH_SHIELD = 1;
const KIND_SHIELD_REDUCTION = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].shield?.reduction ?? 0));
const KIND_SHIELD_COS = new Float32Array(ENEMY_IDS.map((id) => Math.cos(ENEMIES[id].shield?.halfArc ?? 0)));
const KIND_SHIELD_TURN = new Float32Array(ENEMY_IDS.map((id) => ENEMIES[id].shield?.turn ?? 0));
const FACE_UNSET = 99;
const BEH_RANGED = 2;
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
  /** 盾面朝向（弧度；只有盾兵用，會慢慢轉向玩家） */
  readonly face: Float32Array;
  /** 遠程：預告剩餘秒數（> 0 = 正在瞄準，不動）、下一發的冷卻、預告開始時鎖定的方向 */
  readonly wind: Float32Array;
  readonly shootCd: Float32Array;
  readonly aimX: Float32Array;
  readonly aimZ: Float32Array;
  /** 每種敵人現在活著幾隻（出場配方的同時上限用） */
  readonly kindCount = new Int32Array(ENEMY_IDS.length);
  readonly kind: Uint8Array;
  /** 0 一般、1 精英、2 頭目 */
  readonly variant: Uint8Array;
  /** 老練的人類（Q55）：1 = 是（體型、血量、傷害、魂火都加強；variant 仍是 0 = 算一般敵人） */
  readonly vet: Uint8Array;
  /** 渲染體型倍率 */
  readonly scale: Float32Array;
  /** 擊殺掉的魂火倍率後的點數 */
  readonly pointsLeft: Float32Array;
  readonly alive: Uint8Array;
  /** 定身剩幾秒（> 0 不能移動；河童的水牢、間歇泉；頭目不吃）與減速（slowT 秒內速度 × (1 − slowBy)） */
  readonly hold: Float32Array;
  readonly slowT: Float32Array;
  readonly slowBy: Float32Array;
  /** 用過的最大索引 + 1（渲染與迴圈的上界） */
  high = 0;
  aliveCount = 0;
  /** 減速（取比較強的那個；頭目減半） */
  applySlow(i: number, by: number, seconds: number): void {
    const v = this.variant[i] === 2 ? by * 0.5 : by;
    if (this.slowT[i] <= 0 || v >= this.slowBy[i]) this.slowBy[i] = v;
    this.slowT[i] = Math.max(this.slowT[i], seconds);
  }
  /** 定身（頭目不吃） */
  applyHold(i: number, seconds: number): void {
    if (this.variant[i] !== 2) this.hold[i] = Math.max(this.hold[i], seconds);
  }
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
    this.face = f();
    this.wind = f();
    this.shootCd = f();
    this.aimX = f();
    this.aimZ = f();
    this.kind = new Uint8Array(capacity);
    this.variant = new Uint8Array(capacity);
    this.vet = new Uint8Array(capacity);
    this.scale = new Float32Array(capacity).fill(1);
    this.pointsLeft = new Float32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.hold = new Float32Array(capacity);
    this.slowT = new Float32Array(capacity);
    this.slowBy = new Float32Array(capacity);
    this.free = new Int32Array(capacity);
    this.hash = new SpatialHash(map.minX, map.minZ, map.maxX - map.minX, map.maxZ - map.minZ, COMBAT.hashCell, capacity);
  }

  reset(): void {
    this.alive.fill(0);
    this.high = 0;
    this.aliveCount = 0;
    this.freeTop = 0;
    this.kindCount.fill(0);
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
  spawn(kind: number, x: number, z: number, virtualWave: number, night: number, phase: number, variant = 0, stageMult = 1, vet = 0): number {
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
    const hp = KIND_HP[kind] * (boss ? 1 : enemyHpMult(virtualWave, night, Number.isNaN(KIND_GROWTH[kind]) ? undefined : KIND_GROWTH[kind])) * stageMult * tuning.hpScale * (elite ? STAGE.elite.hp : 1);
    const V = STAGE.veteran;
    const isVet = vet === 1 && variant === 0;
    // 老練：血量倍率隨關卡時間從 hp[0] 漲到 hp[1]（virtualWave 越大越晚）
    const vetHp = isVet ? V.hp[0] + (V.hp[1] - V.hp[0]) * Math.min(1, Math.max(0, (virtualWave - STAGE.virtualStart) / (STAGE.virtualEnd - STAGE.virtualStart))) : 1;
    this.hp[i] = hp * vetHp;
    this.maxHp[i] = hp * vetHp;
    this.damage[i] = KIND_CONTACT[kind] * (boss ? 1 : enemyDamageMult(virtualWave)) * (elite ? STAGE.elite.damage : 1) * (isVet ? V.damage : 1);
    this.variant[i] = variant;
    this.vet[i] = isVet ? 1 : 0;
    this.scale[i] = boss ? 2.4 : elite ? STAGE.elite.scale : isVet ? V.scale : 1;
    this.pointsLeft[i] = KIND_POINTS[kind] * (elite ? STAGE.elite.orbMult : isVet ? V.orbMult : 1);
    this.speed[i] = KIND_SPEED[kind] * enemySpeedMult(night);
    this.flash[i] = 0;
    this.hold[i] = 0;
    this.slowT[i] = 0;
    this.slowBy[i] = 0;
    this.contactCd[i] = 0;
    this.yaw[i] = 0;
    this.phase[i] = phase;
    this.face[i] = FACE_UNSET;
    this.wind[i] = 0;
    // 遠程：每隻的第一發錯開（用 phase 當種子，別一整群同時開火）
    this.shootCd[i] = KIND_BEHAVIOR[kind] === BEH_RANGED ? (ENEMIES[ENEMY_IDS[kind]].ranged?.cooldown ?? 1) * (0.4 + 0.6 * ((phase * 7.13) % 1)) : 0;
    this.aimX[i] = 0;
    this.aimZ[i] = 1;
    this.kindCount[kind]++;
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
    this.kindCount[this.kind[i]]--;
  }

  /** 最近一次 update 時的玩家位置（盾面判斷用：攻擊視為從玩家那邊來） */
  private playerX = 0;
  private playerZ = 0;

  /** 這一隻現在是不是「盾面對著玩家」（沒有盾的敵人回傳 false） */
  shielded(i: number): boolean {
    const k = this.kind[i];
    if (KIND_BEHAVIOR[k] !== BEH_SHIELD || this.face[i] === FACE_UNSET) return false;
    const dx = this.playerX - this.x[i];
    const dz = this.playerZ - this.z[i];
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) return true;
    return (dx * Math.sin(this.face[i]) + dz * Math.cos(this.face[i])) / l >= KIND_SHIELD_COS[k];
  }

  /** 盾擋掉一部分之後的傷害（沒有盾、或玩家在盾面之外就原樣回傳）。武器傷害都要先過這裡再 hurt */
  guard(i: number, dmg: number): number {
    return this.shielded(i) ? dmg * (1 - KIND_SHIELD_REDUCTION[this.kind[i]]) : dmg;
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

  update(dt: number, px: number, pz: number, flow: FlowField, auraRadius: number, auraSlow: number, shots?: EnemyShots): void {
    const map = this.map;
    this.playerX = px;
    this.playerZ = pz;
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
      if (this.slowT[i] > 0) {
        this.slowT[i] -= dt;
        spd *= 1 - this.slowBy[i];
      }
      if (this.hold[i] > 0) {
        this.hold[i] -= dt;
        spd = 0;
      }
      const beh = KIND_BEHAVIOR[this.kind[i]];
      let faceYaw = NaN;
      if (beh === BEH_SHIELD) {
        // 盾面慢慢轉向玩家：繞得比它轉得快，就能繞到側面、背後
        const want = Math.atan2(dx, dz);
        if (this.face[i] === FACE_UNSET) this.face[i] = want;
        else {
          let diff = want - this.face[i];
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          const maxTurn = KIND_SHIELD_TURN[this.kind[i]] * dt;
          this.face[i] += Math.max(-maxTurn, Math.min(maxTurn, diff));
        }
        faceYaw = this.face[i];
      } else if (beh === BEH_RANGED) {
        const rg = ENEMIES[ENEMY_IDS[this.kind[i]]].ranged!;
        const d = Math.sqrt(d2);
        faceYaw = Math.atan2(dx, dz);
        if (this.speedMult <= 0) {
          // 被凍住：不動、不瞄準
          spd = 0;
        } else if (this.wind[i] > 0) {
          // 瞄準中：站定、臉朝鎖定的方向；預告結束就射
          spd = 0;
          faceYaw = Math.atan2(this.aimX[i], this.aimZ[i]);
          this.wind[i] -= dt;
          if (this.wind[i] <= 0) {
            this.wind[i] = 0;
            this.shootCd[i] = rg.cooldown;
            shots?.spawn(ex + this.aimX[i] * 0.5, ez + this.aimZ[i] * 0.5, this.aimX[i], this.aimZ[i], rg.shotSpeed, rg.shotLife, this.damage[i] * rg.damageMult, rg.shotRadius);
          }
        } else {
          this.shootCd[i] -= dt;
          if (this.shootCd[i] <= 0 && d <= rg.range && d > 1e-3) {
            this.wind[i] = rg.windup;
            this.aimX[i] = dx / d;
            this.aimZ[i] = dz / d;
            spd = 0;
          } else if (d < rg.keep * 0.75) {
            // 太近：邊退邊保持距離
            mx = -mx;
            mz = -mz;
            spd *= 0.7;
          } else if (d <= rg.keep) spd = 0;
        }
      }
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
      if (!Number.isNaN(faceYaw)) this.yaw[i] = faceYaw;
      else if (mx !== 0 || mz !== 0) this.yaw[i] = Math.atan2(mx, mz);
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

  /**
   * 範圍內最近的 k 隻（不重複，由近到遠）寫進 out，回傳實際隻數（≤ k、≤ out.length）。
   * 鬼火 +N 時每顆打不同的敵人用（以前全部瞄同一隻，會疊成一顆）。k 很小，用選擇法，不配置記憶體。
   */
  nearestK(x: number, z: number, range: number, k: number, out: Int32Array): number {
    const n = this.hash.queryInto(x, z, range, this.x, this.z, this.near);
    const want = Math.min(k, n, out.length);
    for (let c = 0; c < want; c++) {
      let best = -1;
      let bd = Infinity;
      for (let q = 0; q < n; q++) {
        const j = this.near[q];
        if (j < 0) continue;
        const dx = this.x[j] - x;
        const dz = this.z[j] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      if (best < 0) return c;
      out[c] = this.near[best];
      this.near[best] = -1; // 這一輪選過了
    }
    return want;
  }

  /** 範圍內所有敵人寫進 out，回傳數量（呼叫端提供緩衝） */
  within(x: number, z: number, r: number, out: Int32Array): number {
    return this.hash.queryInto(x, z, r, this.x, this.z, out);
  }
}
