/**
 * 命中回報（給傷害數字、音效用）：環狀緩衝，模擬端 push、渲染端用自己的 tail 讀。
 * 不配置記憶體；寫太快時舊的被蓋掉（只是少幾個數字，不影響模擬）。
 */
export class HitFeed {
  readonly cap: number;
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly dmg: Float32Array;
  readonly crit: Uint8Array;
  /** 累計寫入數（單調遞增） */
  head = 0;

  constructor(cap = 256) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.dmg = new Float32Array(cap);
    this.crit = new Uint8Array(cap);
  }

  push(x: number, z: number, dmg: number, crit: boolean): void {
    const i = this.head % this.cap;
    this.x[i] = x;
    this.z[i] = z;
    this.dmg[i] = dmg;
    this.crit[i] = crit ? 1 : 0;
    this.head++;
  }
}
