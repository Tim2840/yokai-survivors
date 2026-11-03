import { zhTW, type I18nKey } from './zh-TW';

/** 目前只有繁體中文；之後加語言時，這裡改成依設定切換（docs/06 第 10 節） */
const tables: Record<string, Record<string, string>> = { 'zh-TW': zhTW };
let lang = 'zh-TW';

export function setLang(next: string): void {
  if (tables[next]) lang = next;
}

export function hasKey(key: string): key is I18nKey {
  return key in tables[lang];
}

/**
 * 取字串，`{name}` 換成 params。
 * 沒有的 key：開發模式丟錯（馬上發現）；正式版回傳 key 本身（不讓玩家當掉）。
 */
export function t(key: I18nKey, params?: Record<string, string | number>): string {
  let s = tables[lang][key];
  if (s === undefined) {
    if (import.meta.env?.DEV) throw new Error(`i18n 缺少 key：${key}`);
    return key;
  }
  if (params) for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  return s;
}
