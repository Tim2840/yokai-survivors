/**
 * 空間雜湊（docs/06 第 6 節）：格子計數排序，每步重建一次（O(n)），查詢不配置記憶體。
 * 用法：rebuild(xs, zs, n) → queryInto(x, z, r, out) 回傳命中的索引數。
 */
export class SpatialHash {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellStart: Int32Array;
  private readonly sorted: Int32Array;
  private readonly cellOf: Int32Array;
  private readonly fill: Int32Array;
  private readonly inv: number;

  constructor(
    private readonly minX: number,
    private readonly minZ: number,
    width: number,
    depth: number,
    cell: number,
    capacity: number,
  ) {
    this.inv = 1 / cell;
    this.cols = Math.ceil(width / cell) + 1;
    this.rows = Math.ceil(depth / cell) + 1;
    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    this.sorted = new Int32Array(capacity);
    this.cellOf = new Int32Array(capacity);
    this.fill = new Int32Array(this.cols * this.rows + 1);
  }

  private cellIndex(x: number, z: number): number {
    let i = ((x - this.minX) * this.inv) | 0;
    let j = ((z - this.minZ) * this.inv) | 0;
    if (i < 0) i = 0;
    else if (i >= this.cols) i = this.cols - 1;
    if (j < 0) j = 0;
    else if (j >= this.rows) j = this.rows - 1;
    return j * this.cols + i;
  }

  /** alive[i] = 1 的才放進去 */
  rebuild(xs: Float32Array, zs: Float32Array, alive: Uint8Array, n: number): void {
    const cs = this.cellStart;
    cs.fill(0);
    for (let i = 0; i < n; i++) {
      if (!alive[i]) {
        this.cellOf[i] = -1;
        continue;
      }
      const c = this.cellIndex(xs[i], zs[i]);
      this.cellOf[i] = c;
      cs[c + 1]++;
    }
    for (let c = 0; c < cs.length - 1; c++) cs[c + 1] += cs[c];
    const fill = this.fill;
    fill.set(cs);
    for (let i = 0; i < n; i++) {
      const c = this.cellOf[i];
      if (c < 0) continue;
      this.sorted[fill[c]++] = i;
    }
  }

  /** 找出離 (x,z) 距離 ≤ r 的索引，寫進 out，回傳數量（超過 out 長度就截斷） */
  queryInto(x: number, z: number, r: number, xs: Float32Array, zs: Float32Array, out: Int32Array): number {
    const i0 = Math.max(0, ((x - r - this.minX) * this.inv) | 0);
    const i1 = Math.min(this.cols - 1, ((x + r - this.minX) * this.inv) | 0);
    const j0 = Math.max(0, ((z - r - this.minZ) * this.inv) | 0);
    const j1 = Math.min(this.rows - 1, ((z + r - this.minZ) * this.inv) | 0);
    const r2 = r * r;
    let n = 0;
    const max = out.length;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = j * this.cols + i;
        for (let k = this.cellStart[c], e = this.cellStart[c + 1]; k < e; k++) {
          const id = this.sorted[k];
          const dx = xs[id] - x;
          const dz = zs[id] - z;
          if (dx * dx + dz * dz <= r2) {
            if (n >= max) return n;
            out[n++] = id;
          }
        }
      }
    }
    return n;
  }
}
