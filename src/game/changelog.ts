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

export const CONTENT_VERSION = 1;

export const CHANGELOG: readonly ChangelogEntry[] = [{ version: 1, date: '2026-11-03', text: 'changelog.v1' }];
