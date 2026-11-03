import { TERRAIN, TERRAIN_IDS, SLOPE, type TerrainId } from '../data/terrain';
import type { Plateau } from '../data/maps/prototype';
import type { MapDef } from '../data/maps/prototype';
import { fbm } from '../lib/noise';

/**
 * 地形查詢（docs/03 第 7 節、docs/06 第 6 節）：烘焙成高度圖＋地形種類圖＋阻擋圖，O(1) 取值。
 * 純邏輯（不碰 Three.js），模擬、流場、單元測試共用。熱路徑不配置記憶體。
 */
const TYPE_INDEX: Record<TerrainId, number> = Object.fromEntries(TERRAIN_IDS.map((id, i) => [id, i])) as Record<TerrainId, number>;
const SPEED_BY_INDEX = new Float32Array(TERRAIN_IDS.map((id) => TERRAIN[id].speed));
const WALK_BY_INDEX = new Uint8Array(TERRAIN_IDS.map((id) => (TERRAIN[id].walkable ? 1 : 0)));

/** 牆的坡度（高度變化率）：tan(35°) */
export const WALL_TAN = Math.tan((SLOPE.wallDeg * Math.PI) / 180);

const smooth = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * 台地的高度（docs/03 第 4 節）：平台中心高度 height，往外在「邊」的寬度內降到 0。
 * 緩坡方向（rampDir ± 半寬）的邊寬是坡道長度（坡度 ≤ 約 28°），其餘是 cliffEdge（陡到走不上去）。
 */
export function plateauHeight(p: Plateau, x: number, z: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  const d = Math.hypot(dx, dz);
  const ang = Math.abs(((Math.atan2(dz, dx) - p.rampDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const half = Math.atan2(p.rampWidth / 2, p.r);
  const window = p.rampWidth <= 0 ? 0 : 1 - smooth((ang - half) / 0.25);
  const rampRun = p.height * 3.2;
  const w = p.cliffEdge + (rampRun - p.cliffEdge) * window;
  return p.height * smooth((p.r + w / 2 - d) / w);
}

export class TerrainMap {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  /** 頂點高度：(cols+1) × (rows+1) */
  readonly heights: Float32Array;
  /** 每格地形種類（索引到 TERRAIN_IDS） */
  readonly types: Uint8Array;
  /** 每格是否擋路（1 = 擋）：深水、障礙（陡坡不算，見 stepBlocked） */
  readonly blocked: Uint8Array;

  constructor(readonly def: MapDef) {
    this.cell = def.cell;
    this.cols = Math.round(def.size.w / def.cell);
    this.rows = Math.round(def.size.d / def.cell);
    this.minX = -def.size.w / 2;
    this.maxX = def.size.w / 2;
    this.minZ = -def.size.d / 2;
    this.maxZ = def.size.d / 2;
    const vc = this.cols + 1;
    this.heights = new Float32Array(vc * (this.rows + 1));
    this.types = new Uint8Array(this.cols * this.rows);
    this.blocked = new Uint8Array(this.cols * this.rows);

    for (let j = 0; j <= this.rows; j++) {
      for (let i = 0; i <= this.cols; i++) {
        const x = this.minX + i * this.cell;
        const z = this.minZ + j * this.cell;
        let h = (fbm(x * 0.15, z * 0.15, def.noiseSeed, 3) - 0.5) * 2 * def.noiseHeight;
        let big = 0;
        for (const hill of def.hills) {
          const dx = x - hill.x;
          const dz = z - hill.z;
          big += hill.height * Math.exp(-(dx * dx + dz * dz) / (2 * hill.sigma * hill.sigma));
        }
        for (const pl of def.plateaus ?? []) big += plateauHeight(pl, x, z);
        // 出生點周圍保證平坦，之外 12 公尺內漸漸長出起伏
        if (def.flatRadius !== undefined) {
          const d = Math.hypot(x - def.playerStart.x, z - def.playerStart.z);
          big *= smooth((d - def.flatRadius) / 12);
        }
        if (def.edgeFalloff !== undefined) {
          const edge = Math.min(x - this.minX, this.maxX - x, z - this.minZ, this.maxZ - z);
          big *= smooth(edge / def.edgeFalloff);
        }
        // 疊加的高度軟性封頂在約 11.5 公尺（丘與台地重疊時不超過 12）
        if (big > 8) big = 8 + 3.5 * Math.tanh((big - 8) / 3.5);
        h += big;
        for (const zn of def.zones) {
          if (!zn.depth) continue;
          const d = Math.hypot(x - zn.x, z - zn.z);
          if (d < zn.r) {
            const u = 1 - d / zn.r;
            h -= zn.depth * (u * u * (3 - 2 * u));
          }
        }
        this.heights[j * vc + i] = h;
      }
    }
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const cx = this.minX + (i + 0.5) * this.cell;
        const cz = this.minZ + (j + 0.5) * this.cell;
        let t: TerrainId = 'grass';
        for (const z of def.zones) if ((cx - z.x) ** 2 + (cz - z.z) ** 2 <= z.r * z.r) t = z.type;
        const idx = j * this.cols + i;
        this.types[idx] = TYPE_INDEX[t];
        let b = WALK_BY_INDEX[TYPE_INDEX[t]] ? 0 : 1;
        for (const o of def.obstacles) if ((cx - o.x) ** 2 + (cz - o.z) ** 2 <= (o.r + this.cell * 0.35) ** 2) b = 1;
        // 陡坡不再標進 blocked：走得上去與否看移動方向的坡度（stepBlocked），因為玩家可以跳
        this.blocked[idx] = b;
      }
    }
  }

  inBounds(x: number, z: number): boolean {
    return x >= this.minX && x < this.maxX && z >= this.minZ && z < this.maxZ;
  }

  cellIndex(x: number, z: number): number {
    let i = Math.floor((x - this.minX) / this.cell);
    let j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0) i = 0;
    else if (i >= this.cols) i = this.cols - 1;
    if (j < 0) j = 0;
    else if (j >= this.rows) j = this.rows - 1;
    return j * this.cols + i;
  }

  /** 地面高度（雙線性內插） */
  heightAt(x: number, z: number): number {
    const vc = this.cols + 1;
    let fx = (x - this.minX) / this.cell;
    let fz = (z - this.minZ) / this.cell;
    if (fx < 0) fx = 0;
    else if (fx > this.cols - 1e-6) fx = this.cols - 1e-6;
    if (fz < 0) fz = 0;
    else if (fz > this.rows - 1e-6) fz = this.rows - 1e-6;
    const i = fx | 0;
    const j = fz | 0;
    const u = fx - i;
    const v = fz - j;
    const h = this.heights;
    const h00 = h[j * vc + i];
    const h10 = h[j * vc + i + 1];
    const h01 = h[(j + 1) * vc + i];
    const h11 = h[(j + 1) * vc + i + 1];
    return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
  }

  typeAt(x: number, z: number): number {
    return this.types[this.cellIndex(x, z)];
  }

  typeIdAt(x: number, z: number): TerrainId {
    return TERRAIN_IDS[this.types[this.cellIndex(x, z)]];
  }

  isBlocked(x: number, z: number): boolean {
    if (!this.inBounds(x, z)) return true;
    return this.blocked[this.cellIndex(x, z)] === 1;
  }

  /** 該位置的地形速度倍率（對所有單位的基礎效果，docs/03 第 2 節） */
  speedAt(x: number, z: number): number {
    return SPEED_BY_INDEX[this.types[this.cellIndex(x, z)]];
  }

  /**
   * 從 (x0,z0) 走到 (x1,z1) 的坡度倍率（docs/03 第 4 節）：上坡 ×0.85、下坡 ×1.1、其餘 ×1。
   */
  /**
   * 從 (x0,z0) 走到 (x1,z1) 被擋住嗎（地面上的單位用）：目標格是擋路格、或沿路往上的坡度超過牆的角度。
   * 往下走（下坡）不會被擋。玩家與人類共用這條規則（玩家在空中另有規則，見 Run.movePlayer）。
   */
  stepBlocked(x0: number, z0: number, x1: number, z1: number): boolean {
    if (this.isBlocked(x1, z1)) return true;
    const dist = Math.hypot(x1 - x0, z1 - z0);
    if (dist < 1e-6) return false;
    return (this.heightAt(x1, z1) - this.heightAt(x0, z0)) / dist > WALL_TAN;
  }

  /** 沿線段（取樣間隔 0.5 公尺）的最大上坡坡度（高度變化率，往 (x1,z1) 方向）；流場預先算邊用 */
  maxRiseAlong(x0: number, z0: number, x1: number, z1: number): number {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(dist / 0.5));
    let worst = -Infinity;
    let px = x0;
    let pz = z0;
    let ph = this.heightAt(x0, z0);
    for (let k = 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const z = z0 + ((z1 - z0) * k) / n;
      const h = this.heightAt(x, z);
      worst = Math.max(worst, (h - ph) / Math.hypot(x - px, z - pz), (ph - h) / Math.hypot(x - px, z - pz));
      px = x;
      pz = z;
      ph = h;
    }
    return worst;
  }

  slopeMult(x0: number, z0: number, x1: number, z1: number): number {
    const dist = Math.hypot(x1 - x0, z1 - z0);
    if (dist < 1e-6) return 1;
    const rise = (this.heightAt(x1, z1) - this.heightAt(x0, z0)) / dist;
    if (rise > SLOPE.threshold) return SLOPE.uphill;
    if (rise < -SLOPE.threshold) return SLOPE.downhill;
    return 1;
  }
}
