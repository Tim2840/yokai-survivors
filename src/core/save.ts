import { bus } from './bus';

/**
 * 存檔（docs/06 第 8 節）：只存「發生過什麼」。局內狀態、種子不存。
 * 新欄位：補在 defaultSave()，merge() 會自動補給舊存檔；要改既有欄位的意義就升 version 並寫遷移。
 */
export const SAVE_KEY = 'yokai-survivors-save-v1';
export const SAVE_VERSION = 1;

export type Quality = 'auto' | 'low' | 'mid' | 'high';

export interface SaveData {
  version: number;
  /** 功德 */
  merit: number;
  /** 局外修行等級：id → 等級 */
  training: Record<string, number>;
  unlocked: { cards: string[]; elements: string[]; yokai: string[]; maps: string[] };
  /** 大招（D52）：已用功德解鎖的（價格 0 的一開始就有，不存）、各招的升級等級、每隻妖怪出發時裝配的那一招 */
  ult: { unlocked: string[]; levels: Record<string, number>; equipped: Record<string, string> };
  /** 局外多解鎖的技法格子數（D84；0～2） */
  techSlots: number;
  /** 圖鑑：人類 id → 擊敗數 */
  codex: { humans: Record<string, number> };
  maxNightDepth: number;
  settings: { sfx: number; music: number; quality: Quality; lang: string };
  stats: { runs: number; bestStage: number };
  /** 玩家看過的更新紀錄版本（changelog.ts 的 CONTENT_VERSION） */
  seenContentVersion: number;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    merit: 0,
    training: {},
    unlocked: {
      cards: [],
      elements: ['cursed-altar', 'jizo', 'omikuji', 'ward-stone', 'offering-box'],
      yokai: ['chochin-kozo', 'kappa', 'aka-oni'],
      maps: ['village-field'],
    },
    ult: { unlocked: [], levels: {}, equipped: {} },
    techSlots: 0,
    codex: { humans: {} },
    maxNightDepth: 0,
    settings: { sfx: 0.8, music: 0.6, quality: 'auto', lang: 'zh-TW' },
    stats: { runs: 0, bestStage: 0 },
    seenContentVersion: 0,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 把讀到的存檔疊在預設值上：預設有、讀到的沒有 → 用預設；型別不同 → 用預設（壞資料不擴散）。
 * 預設是「空物件」的欄位（如 training、codex.humans）是字典，讀到的鍵全部保留。
 */
export function merge<T>(base: T, loaded: unknown): T {
  if (isPlainObject(base)) {
    if (!isPlainObject(loaded)) return base;
    const out: Record<string, unknown> = { ...base };
    const baseKeys = Object.keys(base);
    if (baseKeys.length === 0) {
      for (const k of Object.keys(loaded)) out[k] = loaded[k];
      return out as T;
    }
    for (const k of baseKeys) {
      if (k in loaded) out[k] = merge((base as Record<string, unknown>)[k], loaded[k]);
    }
    return out as T;
  }
  if (Array.isArray(base)) return (Array.isArray(loaded) ? loaded : base) as T;
  return (typeof loaded === typeof base ? loaded : base) as T;
}

/** 舊版存檔遷移：version → 下一版。現在只有 v1。 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  return raw;
}

export function loadSave(): SaveData {
  let text: string | null = null;
  try {
    text = localStorage.getItem(SAVE_KEY);
  } catch {
    return defaultSave();
  }
  if (!text) return defaultSave();
  try {
    const raw = JSON.parse(text);
    if (!isPlainObject(raw)) return defaultSave();
    const data = merge(defaultSave(), migrate(raw));
    data.version = SAVE_VERSION;
    return data;
  } catch {
    return defaultSave();
  }
}

let warned = false;

/** 回傳是否寫入成功；失敗時遊戲照常進行，只在第一次失敗時發 saveFailed（UI 提示一次） */
export function writeSave(data: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    if (!warned) {
      warned = true;
      bus.emit('saveFailed', { error: String(e) });
    }
    return false;
  }
}

/** 測試用 */
export function resetSaveWarning(): void {
  warned = false;
}
