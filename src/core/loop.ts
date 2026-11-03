/**
 * 主迴圈（docs/06 第 5 節）：固定時間步長模擬 + 可變幀率渲染。
 * - 每步 STEP 秒；每幀的真實 dt 夾在 [0, MAX_FRAME_DT]（分頁切回來不暴衝）。
 * - 暫停時模擬停、渲染照畫。
 * - advance(dt) 給測試快進用：只跑模擬、不畫圖（截圖前要自己呼叫 render）。
 * 熱路徑不配置記憶體。
 */
export const STEP = 1 / 60;
export const MAX_FRAME_DT = 0.1;
/** 一幀最多補幾步（避免低幀率時「越補越慢」的死亡螺旋） */
export const MAX_STEPS_PER_FRAME = 6;

export class FixedLoop {
  private acc = 0;
  private lastMs = -1;
  paused = false;
  /** 已模擬的總時間（秒） */
  simTime = 0;
  steps = 0;

  constructor(
    private readonly simulate: (dt: number) => void,
    private readonly draw: (alpha: number) => void,
  ) {}

  /** 每個 requestAnimationFrame 呼叫一次 */
  frame(nowMs: number): void {
    let dt = this.lastMs < 0 ? 0 : (nowMs - this.lastMs) / 1000;
    this.lastMs = nowMs;
    if (!(dt > 0)) dt = 0;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < MAX_STEPS_PER_FRAME) {
        this.step();
        this.acc -= STEP;
        n++;
      }
      if (n === MAX_STEPS_PER_FRAME && this.acc > STEP) this.acc = 0;
    }
    this.draw(this.paused ? 1 : this.acc / STEP);
  }

  /** 測試用：快進 dt 秒的模擬（忽略暫停；不畫圖） */
  advance(dt: number): void {
    const n = Math.max(0, Math.round(dt / STEP));
    for (let i = 0; i < n; i++) this.step();
  }

  render(): void {
    this.draw(1);
  }

  private step(): void {
    this.simulate(STEP);
    this.simTime += STEP;
    this.steps++;
  }
}
