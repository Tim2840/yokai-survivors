import type { TerrainMap } from '../world/terrainMap';
import { TERRAIN, TERRAIN_IDS } from '../data/terrain';

/**
 * 流場尋路（docs/06 第 6 節，T7）：以玩家所在格為起點，在格子圖上做一次 Dijkstra（8 方向），
 * 得到每格到玩家的「通行距離」；每隻敵人只查自己的格（O(1)）往距離更小的鄰格走。
 * 阻擋格（深水、障礙、陡坡）不可通行；泥濘、淺水成本較高。預先配置，重算不 new。
 */
const COST_BY_INDEX = new Float32Array(TERRAIN_IDS.map((id) => TERRAIN[id].cost));
const DIAG = Math.SQRT2;
const NEIGH_DX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const NEIGH_DZ = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);

export class FlowField {
  readonly dist: Float32Array;
  private readonly heap: Int32Array;
  private heapSize = 0;
  private lastCell = -1;
  /** 目前的目標格 */
  targetCell = -1;

  constructor(private readonly map: TerrainMap) {
    const n = map.cols * map.rows;
    this.dist = new Float32Array(n).fill(Infinity);
    // 二元堆：存格子索引；同一格可能多次進堆（惰性刪除），容量給 8 倍
    this.heap = new Int32Array(n * 8);
  }

  /** 玩家換格才重算（呼叫端可每步呼叫，這裡自己判斷）。force = true 一定重算。回傳是否重算了 */
  update(targetX: number, targetZ: number, force = false): boolean {
    const c = this.map.cellIndex(targetX, targetZ);
    if (!force && c === this.lastCell) return false;
    this.lastCell = c;
    this.targetCell = c;
    this.build(c);
    return true;
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
    const { cols, rows, blocked, types } = this.map;
    const dist = this.dist;
    dist.fill(Infinity);
    this.heapSize = 0;
    // 目標格本身就算站得上去（玩家可能站在阻擋格邊緣）
    dist[start] = 0;
    this.push(start);
    while (this.heapSize > 0) {
      const c = this.pop();
      const d0 = dist[c];
      const ci = c % cols;
      const cj = (c / cols) | 0;
      for (let k = 0; k < 8; k++) {
        const ni = ci + NEIGH_DX[k];
        const nj = cj + NEIGH_DZ[k];
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = nj * cols + ni;
        if (blocked[n]) continue;
        // 斜走不能切過阻擋的角落
        if (k >= 4 && (blocked[cj * cols + ni] || blocked[nj * cols + ci])) continue;
        const nd = d0 + (k >= 4 ? DIAG : 1) * COST_BY_INDEX[types[n]];
        if (nd < dist[n]) {
          dist[n] = nd;
          if (this.heapSize < this.heap.length) this.push(n);
        }
      }
    }
  }

  /** 該位置走得到玩家嗎（距離有限） */
  reachable(x: number, z: number): boolean {
    return this.dist[this.map.cellIndex(x, z)] < Infinity;
  }

  /**
   * 從 (x,z) 往哪走：寫入 out[0]、out[1]（單位向量，世界 X／Z）。
   * 無路可走（被困在不可達區域）回傳 false，out 為 0。
   */
  dirAt(x: number, z: number, out: Float32Array): boolean {
    const { cols, rows, blocked } = this.map;
    const c = this.map.cellIndex(x, z);
    const ci = c % cols;
    const cj = (c / cols) | 0;
    let best = this.dist[c];
    let bx = 0;
    let bz = 0;
    if (best === Infinity) {
      out[0] = 0;
      out[1] = 0;
      return false;
    }
    for (let k = 0; k < 8; k++) {
      const ni = ci + NEIGH_DX[k];
      const nj = cj + NEIGH_DZ[k];
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      if (k >= 4 && (blocked[cj * cols + ni] || blocked[nj * cols + ci])) continue;
      const d = this.dist[nj * cols + ni];
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
