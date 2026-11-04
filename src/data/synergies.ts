/**
 * 聯動（D28）：同時擁有指定的兩張卡（任何稀有度），立刻永久獲得額外效果，每局每個聯動只觸發一次。
 * 讓「卡片組合」有意義：玩家會為了湊聯動而選卡。效果欄位都是「加成」，沒寫的欄位視為沒有。數字為佔位，M2 sim 校準。
 */
export interface Synergy {
  id: string;
  /** 需要的卡片 id（全部都要有） */
  requires: readonly [string, string];
  effect: {
    /** 濺射傷害比例增加（加在 0.6 的基礎上） */
    splashRatio?: number;
    /** 濺射半徑倍率 */
    splashMult?: number;
    /** 每顆鬼火額外穿透 */
    pierce?: number;
    /** 額外多發射 */
    volley?: number;
    /** 燈火光圈半徑倍率 */
    auraMult?: number;
  };
}

/** 一張卡跟哪些聯動有關：partner = 另一張卡；ready = 已經有另一張（選了就觸發）；done = 這個聯動已觸發過 */
export interface SynergyHint {
  id: string;
  partner: string;
  ready: boolean;
  done: boolean;
}

export function synergyHints(cardId: string, owned: ReadonlySet<string>, active: readonly string[], list: readonly Synergy[] = SYNERGIES): SynergyHint[] {
  const out: SynergyHint[] = [];
  for (const s of list) {
    if (!s.requires.includes(cardId)) continue;
    const partner = s.requires[0] === cardId ? s.requires[1] : s.requires[0];
    out.push({ id: s.id, partner, ready: owned.has(partner), done: active.includes(s.id) });
  }
  return out;
}

/** 提燈小僧的聯動（其他妖怪的聯動在各自的武器卡做好時加入） */
export const SYNERGIES: readonly Synergy[] = [
  { id: 'chainBlast', requires: ['volley', 'splash'], effect: { splashRatio: 0.4, splashMult: 1.3 } },
  { id: 'piercingFire', requires: ['volley', 'pierce'], effect: { pierce: 2, volley: 1 } },
  { id: 'lanternGlow', requires: ['splash', 'area'], effect: { auraMult: 1.5 } },
];
