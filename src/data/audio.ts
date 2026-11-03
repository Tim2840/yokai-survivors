/** 音效設定（docs/08 第 3 節） */
export const AUDIO = {
  /** 同一種音效同時最多幾個 */
  maxConcurrent: 4,
  /** 高頻音效（命中、倒下、拾取）的最短間隔（毫秒） */
  minIntervalMs: 50,
  /** 噪音緩衝的固定種子 */
  noiseSeed: 0x5eed,
} as const;
