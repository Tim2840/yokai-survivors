import type { TerrainMap } from '../world/terrainMap';

/**
 * 玩家「用走的」到得了哪些格子（細格 BFS，規則和玩家走路一樣：擋路格不能進、陡坡上不去、往下可以）。
 * 流場是 2 公尺的粗格，窄路與岩石圍住的小島會判錯；寶箱、傳送門這種「一定要走得到」的東西用這個（D34 試算時發現）。
 * 只在低頻事件時算（頭目、精英倒下）；緩衝區建一次重複用。
 */
export class PlayerReach {
  private readonly mark: Uint8Array;
  private readonly queue: Int32Array;

  constructor(private readonly map: TerrainMap) {
    this.mark = new Uint8Array(map.cols * map.rows);
    this.queue = new Int32Array(map.cols * map.rows);
  }

  private center(i: number, out: Float32Array): void {
    const m = this.map;
    out[0] = m.minX + ((i % m.cols) + 0.5) * m.cell;
    out[1] = m.minZ + (Math.floor(i / m.cols) + 0.5) * m.cell;
  }

  private readonly a = new Float32Array(2);
  private readonly b = new Float32Array(2);

  /** 從玩家位置重算 */
  compute(px: number, pz: number): void {
    const m = this.map;
    this.mark.fill(0);
    if (!m.inBounds(px, pz)) return;
    const start = m.cellIndex(px, pz);
    let head = 0;
    let tail = 0;
    this.mark[start] = 1;
    this.queue[tail++] = start;
    const cols = m.cols;
    const rows = m.rows;
    while (head < tail) {
      const i = this.queue[head++];
      const cx = i % cols;
      const cz = (i - cx) / cols;
      this.center(i, this.a);
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const nz = cz + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
        const j = nz * cols + nx;
        if (this.mark[j]) continue;
        this.center(j, this.b);
        if (m.stepBlocked(this.a[0], this.a[1], this.b[0], this.b[1])) continue;
        this.mark[j] = 1;
        this.queue[tail++] = j;
      }
    }
  }

  /** 上一次 compute 時，玩家走得到 (x,z) 嗎 */
  ok(x: number, z: number): boolean {
    const m = this.map;
    return m.inBounds(x, z) && this.mark[m.cellIndex(x, z)] === 1;
  }
}
