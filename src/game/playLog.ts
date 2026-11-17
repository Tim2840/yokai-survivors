import { PLAY_LOG } from '../data/playLog';

/**
 * 試玩紀錄（docs/32 第 ⑤ 節）：一局裡玩家「實際做了什麼」的幾個客觀數字，結算畫面列出來讓試玩的人複製貼回來。
 * 只有測試頁用（主網址不建立）。純資料、不碰模擬；時間由呼叫端給（局內秒數、選卡用真實秒數）。
 */
export interface PlayLogSummary {
  earlyHurts: number;
  picks: number;
  pickMedian: number;
  pickMax: number;
  slowPicks: number;
  jumps: number;
  evolves: number;
  /** 到 marks 兩個等級的局內秒數（-1 = 沒到） */
  markAt: [number, number];
}

export class PlayLog {
  private earlyHurts = 0;
  private readonly pickSeconds: number[] = [];
  private pickOpenedAt = -1;
  private jumps = 0;
  private evolves = 0;
  private readonly markAt: [number, number] = [-1, -1];

  hurt(runSeconds: number): void {
    if (runSeconds <= PLAY_LOG.earlySeconds) this.earlyHurts++;
  }

  /** 升級選卡跳出來（realSeconds = 真實時間，秒） */
  pickOpened(realSeconds: number): void {
    this.pickOpenedAt = realSeconds;
  }

  /** 選了一張；連續選（一次升好幾級）時下一張從這一刻起算 */
  pickChosen(realSeconds: number): void {
    if (this.pickOpenedAt < 0) return;
    this.pickSeconds.push(Math.max(0, realSeconds - this.pickOpenedAt));
    this.pickOpenedAt = realSeconds;
  }

  pickClosed(): void {
    this.pickOpenedAt = -1;
  }

  jump(): void {
    this.jumps++;
  }

  evolve(): void {
    this.evolves++;
  }

  level(level: number, runSeconds: number): void {
    for (let i = 0; i < 2; i++) if (this.markAt[i] < 0 && level >= PLAY_LOG.marks[i]) this.markAt[i] = runSeconds;
  }

  summary(): PlayLogSummary {
    const s = [...this.pickSeconds].sort((a, b) => a - b);
    const n = s.length;
    const median = n === 0 ? 0 : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    let slow = 0;
    for (let i = PLAY_LOG.slowAfterPicks; i < this.pickSeconds.length; i++) if (this.pickSeconds[i] > PLAY_LOG.slowSeconds) slow++;
    return { earlyHurts: this.earlyHurts, picks: n, pickMedian: median, pickMax: n ? s[n - 1] : 0, slowPicks: slow, jumps: this.jumps, evolves: this.evolves, markAt: [this.markAt[0], this.markAt[1]] };
  }
}
