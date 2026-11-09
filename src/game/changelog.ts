import type { I18nKey } from '../i18n/zh-TW';

/**
 * 更新紀錄：每一批影響玩家的改動，在最前面加一筆、CONTENT_VERSION +1（單元測試守著）。
 * 文字放 i18n（系統口氣、不劇透、台灣用語）。
 */
export interface ChangelogEntry {
  version: number;
  date: string;
  text: I18nKey;
}

export const CONTENT_VERSION = 39;

export const CHANGELOG: readonly ChangelogEntry[] = [
  { version: 39, date: '2026-11-09', text: 'changelog.v39' },
  { version: 38, date: '2026-11-09', text: 'changelog.v38' },
  { version: 37, date: '2026-11-09', text: 'changelog.v37' },
  { version: 36, date: '2026-11-09', text: 'changelog.v36' },
  { version: 35, date: '2026-11-09', text: 'changelog.v35' },
  { version: 34, date: '2026-11-08', text: 'changelog.v34' },
  { version: 33, date: '2026-11-08', text: 'changelog.v33' },
  { version: 32, date: '2026-11-06', text: 'changelog.v32' },
  { version: 31, date: '2026-11-06', text: 'changelog.v31' },
  { version: 30, date: '2026-11-06', text: 'changelog.v30' },
  { version: 29, date: '2026-11-06', text: 'changelog.v29' },
  { version: 28, date: '2026-11-06', text: 'changelog.v28' },
  { version: 27, date: '2026-11-06', text: 'changelog.v27' },
  { version: 26, date: '2026-11-06', text: 'changelog.v26' },
  { version: 25, date: '2026-11-06', text: 'changelog.v25' },
  { version: 24, date: '2026-11-05', text: 'changelog.v24' },
  { version: 23, date: '2026-11-05', text: 'changelog.v23' },
  { version: 22, date: '2026-11-05', text: 'changelog.v22' },
  { version: 21, date: '2026-11-05', text: 'changelog.v21' },
  { version: 20, date: '2026-11-05', text: 'changelog.v20' },
  { version: 19, date: '2026-11-05', text: 'changelog.v19' },
  { version: 18, date: '2026-11-05', text: 'changelog.v18' },
  { version: 17, date: '2026-11-05', text: 'changelog.v17' },
  { version: 16, date: '2026-11-05', text: 'changelog.v16' },
  { version: 15, date: '2026-11-05', text: 'changelog.v15' },
  { version: 14, date: '2026-11-05', text: 'changelog.v14' },
  { version: 13, date: '2026-11-04', text: 'changelog.v13' },
  { version: 12, date: '2026-11-04', text: 'changelog.v12' },
  { version: 11, date: '2026-11-04', text: 'changelog.v11' },
  { version: 10, date: '2026-11-04', text: 'changelog.v10' },
  { version: 9, date: '2026-11-04', text: 'changelog.v9' },
  { version: 8, date: '2026-11-04', text: 'changelog.v8' },
  { version: 7, date: '2026-11-04', text: 'changelog.v7' },
  { version: 6, date: '2026-11-04', text: 'changelog.v6' },
  { version: 5, date: '2026-11-04', text: 'changelog.v5' },
  { version: 4, date: '2026-11-03', text: 'changelog.v4' },
  { version: 3, date: '2026-11-03', text: 'changelog.v3' },
  { version: 2, date: '2026-11-03', text: 'changelog.v2' },
  { version: 1, date: '2026-11-03', text: 'changelog.v1' },
];
