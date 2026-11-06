import type { SaveData } from '../core/save';
import { ULT_SLOTS, ULT_UPGRADE, defaultUltsOf, ultById, ultUpgradePrice, ultsOf } from '../data/ultimates';

/**
 * 大招的局外裝配（D52）：解鎖、升級、裝配都在這裡，純資料運算（神社畫面與測試共用）。
 * 存檔只存「發生過什麼」：用功德解鎖過的、各招升到幾級、每隻妖怪出發時裝配哪一招。價格 0 的大招一開始就有、不存。
 * unlockAll：測試頁一律全開（D40：「我測試時請都保持原樣」）。
 */
export function isUltUnlocked(save: SaveData, id: string, unlockAll = false): boolean {
  return unlockAll || ultById(id).price === 0 || save.ult.unlocked.includes(id);
}

export function ultLevel(save: SaveData, id: string): number {
  return Math.min(ULT_UPGRADE.maxLevel, Math.max(0, save.ult.levels[id] ?? 0));
}

/** 這隻妖怪出發時裝配的大招（沒裝配過、或裝配的還沒解鎖 → 一開始就有的那一招） */
export function equippedUlt(save: SaveData, yokai: string, unlockAll = false): string | null {
  const want = save.ult.equipped[yokai];
  if (want && ultsOf(yokai).some((u) => u.id === want) && isUltUnlocked(save, want, unlockAll)) return want;
  return defaultUltsOf(yokai)[0] ?? null;
}

/** 開局要帶的：裝配的大招與升級等級（給 Run 的選項） */
export function loadoutFor(save: SaveData, yokai: string, unlockAll = false): { ults: string[]; ultLevels: Record<string, number> } {
  const id = equippedUlt(save, yokai, unlockAll);
  const ults = id ? [id].slice(0, ULT_SLOTS) : [];
  return { ults, ultLevels: Object.fromEntries(ults.map((u) => [u, ultLevel(save, u)])) };
}

/** 用功德解鎖。回傳是否成功（已解鎖、功德不夠都不成功） */
export function buyUlt(save: SaveData, id: string): boolean {
  const d = ultById(id);
  if (isUltUnlocked(save, id) || save.merit < d.price) return false;
  save.merit -= d.price;
  save.ult.unlocked.push(id);
  return true;
}

/** 用功德升一級。回傳是否成功（沒解鎖、滿級、功德不夠都不成功） */
export function upgradeUlt(save: SaveData, id: string, unlockAll = false): boolean {
  if (!isUltUnlocked(save, id, unlockAll)) return false;
  const lv = ultLevel(save, id);
  const price = ultUpgradePrice(lv);
  if (!Number.isFinite(price) || save.merit < price) return false;
  save.merit -= price;
  save.ult.levels[id] = lv + 1;
  return true;
}

/** 裝配（只有解鎖了的、而且是這隻妖怪的大招才行） */
export function equipUlt(save: SaveData, yokai: string, id: string, unlockAll = false): boolean {
  if (!ultsOf(yokai).some((u) => u.id === id) || !isUltUnlocked(save, id, unlockAll)) return false;
  save.ult.equipped[yokai] = id;
  return true;
}
