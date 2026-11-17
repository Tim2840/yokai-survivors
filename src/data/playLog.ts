/** 試玩紀錄（docs/32 第 ⑤ 節；只有測試頁顯示）：哪些算「值得注意」的門檻 */
export const PLAY_LOG = {
  /** 開局幾秒內的受傷次數（新手會不會一開始就被圍） */
  earlySeconds: 90,
  /** 第幾次選卡之後才開始算「選太久」（前幾次在認卡，不算） */
  slowAfterPicks: 5,
  /** 一次選卡超過幾秒算「選太久」（卡面文字太長或概念太難） */
  slowSeconds: 5,
  /** 化身的兩個等級（紀錄到達的時間） */
  marks: [10, 20] as readonly [number, number],
} as const;
