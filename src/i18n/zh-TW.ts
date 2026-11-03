/** 繁體中文（台灣）字串表。所有玩家看得到的字都在這裡（docs/06 第 10 節、docs/12）。 */
export const zhTW = {
  'game.title': '百鬼陣',
  'game.subtitle': 'YOKAI SURVIVORS',
  'menu.start': '開始',
  'menu.shrine': '神社',
  'menu.notReady': '還在準備中',
  'menu.version': '版本 {version}',
  'pause.title': '暫停',
  'pause.resume': '繼續',
  'save.failed': '無法存檔：這次的進度可能不會保留',
  'changelog.title': '更新紀錄',
  'changelog.v1': '建立遊戲骨架：主選單與場景可以載入。',
} as const;

export type I18nKey = keyof typeof zhTW;
