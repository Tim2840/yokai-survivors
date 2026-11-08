import type { Rarity } from '../data/rarity';
import type { StatId } from '../data/stats';
import type { CurseId } from '../data/altar';
import type { ElementKind, OmikujiResult } from '../data/elements';

/**
 * 要素結果卡（D36）：要素集滿後暫停，列出「拿到了什麼」。只放資料，文字由介面依 i18n 組。
 * pct 是比例（0.32 = +32%）、flat 是能力值的內部單位；seconds 有值 = 限時效果。
 */
export type ResultLine =
  | { t: 'heal'; v: number }
  | { t: 'stat'; stat: StatId; pct?: number; flat?: number; seconds?: number }
  | { t: 'curse'; id: CurseId; v: number; seconds?: number }
  | { t: 'uncurse'; id: CurseId }
  | { t: 'omikuji'; id: OmikujiResult }
  | { t: 'merit'; v: number }
  | { t: 'summon'; mult: number }
  /** 百鬼試煉碑的成績：打倒幾隻、達到第幾段（-1 = 沒達到，什麼都沒有）、寶箱的稀有度（沒達到時沒有意義） */
  | { t: 'trial'; kills: number; tier: number; reward: Rarity }
  | { t: 'item'; cardId: string; rarity: Rarity; level: number };

export interface ElementResult {
  kind: ElementKind;
  rarity: Rarity;
  lines: ResultLine[];
}

/** 這一行對玩家是好事嗎（介面上色用）：詛咒、召喚頭目算「要注意」 */
export function lineIsGood(l: ResultLine): boolean {
  return l.t !== 'curse' && l.t !== 'summon' && !(l.t === 'trial' && l.tier < 0);
}
