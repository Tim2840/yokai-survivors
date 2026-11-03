import type { TerrainMap } from '../world/terrainMap';
import { WALL_TAN } from '../world/terrainMap';
import { TERRAIN, TERRAIN_IDS } from '../data/terrain';

/**
 * 流場尋路（docs/06 第 6 節，T7、T8）：以玩家所在的格為起點，在「粗格子」（預設 2 公尺）上做一次 Dijkstra（8 方向），
 * 得到每格到玩家的通行距離；敵人只查自己所在的格（O(1)）往距離更小的鄰格走。
 * - 粗格擋路：裡面任何一個細格是擋路格（深水、障礙）。
 * - 邊可不可走：預先沿著兩格中心連線取樣，最大坡度超過牆（35°）的邊不能走（懸崖）。往上往下都算：人類不會跳下懸崖。
 * - 玩家站在上不去的台地時，整個區域不連通：`isolated` = true，呼叫端要讓敵人直線朝玩家擠（在懸崖底聚集）、生成不看連通。
 * 預先配置，重算不 new。
 */
const DIAG = Math.SQRT2;
const NEIGH_DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const NEIGH_DZ = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);

/** 玩家可到的區域小於全部可走區域的這個比例，就視為被困在孤島（台地）上 */
const ISOLATED_RATIO = 0.5;

export class FlowField {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly dist: Float32Array;
  readonly blocked: Uint8Array;
  /** 每格 8 個方向的邊是否能走（索引 = cell × 8 + k） */
  private readonly edgeOk: Uint8Array;
  private readonly cost: Float32Array;
  private readonly heap: Int32Array;
  private heapSize = 0;
  private lastCell = -1;
  targetCell = -1;
  /** 這次重算有幾格走得到玩家 */
  reachableCount = 0;
  /** 全部可走的粗格數 */
  readonly walkableCount: number;

  constructor(
    private readonly map: TerrainMap,
    cell = 2,
  ) {
    this.cell = cell;
    this.cols = Math.ceil((map.maxX - map.minX) / cell);
    this.rows = Math.ceil((map.maxZ - map.minZ) / cell);
    const n = this.cols * this.rows;
    this.dist = new Float32Array(n).fill(Infinity);
    this.blocked = new Uint8Array(n);
    this.cost = new Float32Array(n);
    this.edgeOk = new Uint8Array(n * 8);
    this.walkableCount = 0;
    this.heap = new Int32Array(n * 8);
    const step = map.cell;
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const c = j * this.cols + i;
        const x0 = map.minX + i * cell;
        const z0 = map.minZ + j * cell;
        let b = 0;
        for (let z = z0 + step / 2; z < z0 + cell; z += step) for (let x = x0 + step / 2; x < x0 + cell; x += step) if (map.isBlocked(x, z)) b = 1;
        this.blocked[c] = b;
        if (!b) (this as { walkableCount: number }).walkableCount++;
        this.cost[c] = TERRAIN[TERRAIN_IDS[map.typeAt(x0 + cell / 2, z0 + cell / 2)]].cost;
      }
    }
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const c = j * this.cols + i;
        if (this.blocked[c]) continue;
        const cx = map.minX + (i + 0.5) * cell;
        const cz = map.minZ + (j + 0.5) * cell;
        for (let k = 0; k < 8; k++) {
          const ni = i + NEIGH_DX[k];
          const nj = j + NEIGH_DZ[k];
          if (ni < 0 || nj < 0 || ni >= this.cols || nj >= this.rows) continue;
          const nc = nj * this.cols + ni;
          if (this.blocked[nc]) continue;
          // 斜走不能切過阻擋的角落
          if (k >= 4 && (this.blocked[j * this.cols + ni] || this.blocked[nj * this.cols + i])) continue;
          const tx = map.minX + (ni + 0.5) * cell;
          const tz = map.minZ + (nj + 0.5) * cell;
          if (map.maxRiseAlong(cx, cz, tx, tz) <= WALL_TAN) this.edgeOk[c * 8 + k] = 1;
        }
      }
    }
  }

  cellIndex(x: number, z: number): number {
    let i = Math.floor((x - this.map.minX) / this.cell);
    let j = Math.floor((z - this.map.minZ) / this.cell);
    if (i < 0) i = 0;
    else if (i >= this.cols) i = this.cols - 1;
    if (j < 0) j = 0;
    else if (j >= this.rows) j = this.rows - 1;
    return j * this.cols + i;
  }

  /** 玩家換格才重算（呼叫端可每步呼叫）。force = true 一定重算。回傳是否重算了 */
  update(targetX: number, targetZ: number, force = false): boolean {
    const c = this.cellIndex(targetX, targetZ);
    if (!force && c === this.lastCell) return false;
    this.lastCell = c;
    this.targetCell = c;
    this.build(c);
    return true;
  }

  get isolated(): boolean {
    return this.reachableCount < this.walkableCount * ISOLATED_RATIO;
  }

  private less(a: number, b: number): boolean {
    return this.dist[this.heap[a]] < this.dist[this.heap[b]];
  }

  private push(cell: number): void {
    let i = this.heapSize++;
    this.heap[i] = cell;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      const t = this.heap[i];
      this.heap[i] = this.heap[p];
      this.heap[p] = t;
      i = p;
    }
  }

  private pop(): number {
    const top = this.heap[0];
    this.heap[0] = this.heap[--this.heapSize];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.heapSize && this.less(l, m)) m = l;
      if (r < this.heapSize && this.less(r, m)) m = r;
      if (m === i) break;
      const t = this.heap[i];
      this.heap[i] = this.heap[m];
      this.heap[m] = t;
      i = m;
    }
    return top;
  }

  private build(start: number): void {
    const { cols, rows } = this;
    const dist = this.dist;
    dist.fill(Infinity);
    this.heapSize = 0;
    this.reachableCount = 0;
    dist[start] = 0;
    this.push(start);
    while (this.heapSize > 0) {
      const c = this.pop();
      const d0 = dist[c];
      this.reachableCount++;
      const ci = c % cols;
      const cj = (c / cols) | 0;
      for (let k = 0; k < 8; k++) {
        if (!this.edgeOk[c * 8 + k]) continue;
        const ni = ci + NEIGH_DX[k];
        const nj = cj + NEIGH_DZ[k];
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = nj * cols + ni;
        const nd = d0 + (k >= 4 ? DIAG : 1) * this.cost[n];
        if (nd < dist[n]) {
          dist[n] = nd;
          if (this.heapSize < this.heap.length) this.push(n);
        }
      }
    }
  }

  /** 該位置走得到玩家嗎（距離有限） */
  reachable(x: number, z: number): boolean {
    return this.dist[this.cellIndex(x, z)] < Infinity;
  }

  /**
   * 從 (x,z) 往哪走：寫入 out[0]、out[1]（單位向量，世界 X／Z）。
   * 走不到玩家（被懸崖隔開）回傳 false，out 為 0；呼叫端改成直線朝玩家擠。
   */
  dirAt(x: number, z: number, out: Float32Array): boolean {
    const { cols } = this;
    const c = this.cellIndex(x, z);
    const ci = c % cols;
    const cj = (c / cols) | 0;
    let best = this.dist[c];
    if (best === Infinity) {
      out[0] = 0;
      out[1] = 0;
      return false;
    }
    let bx = 0;
    let bz = 0;
    for (let k = 0; k < 8; k++) {
      if (!this.edgeOk[c * 8 + k]) continue;
      const d = this.dist[(cj + NEIGH_DZ[k]) * cols + ci + NEIGH_DX[k]];
      if (d < best) {
        best = d;
        bx = NEIGH_DX[k];
        bz = NEIGH_DZ[k];
      }
    }
    const len = Math.hypot(bx, bz);
    if (len === 0) {
      out[0] = 0;
      out[1] = 0;
      return true;
    }
    out[0] = bx / len;
    out[1] = bz / len;
    return true;
  }
}
