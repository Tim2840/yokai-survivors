import { describe, it, expect } from 'vitest';
import { zhTW } from '../../src/i18n/zh-TW';

/**
 * 通用的字不帶角色專屬字（使用者 2026-11-09：「技法類別弄中性的名詞，不要包含燃燒系之類有屬性的…日後有這種需要所有角色都通用的分類邏輯，千萬要記得弄通用名詞，也要舉一反三」）。
 * 全掃：所有「每隻妖怪都會看到」的字串（分類、混搭提示、介面、HUD、神壇、法具與屬性），不准出現某隻妖怪專屬的字。
 * 專屬字只准出現在：主武器（card.<武器>）、技法（tech.<id>）、進化（evo.*、evoUp.*）、大招（ult.*）、妖怪（yokai.*）、更新紀錄。
 */
const GENERIC_PREFIXES = [
  'tech.family.', 'tech.mix.', 'tech.up.', 'tech.swap.', 'tech.keep', 'item.w.', 'pause.', 'levelup.', 'sum.', 'stat.', 'hud.', 'element.', 'card.fmt.',
  'card.link', 'card.weaponTag', 'card.techTag', 'card.evo', 'card.affix', 'card.down', 'card.new', 'card.levelUp', 'setup.', 'menu.', 'result.', 'tuning.',
];
/** 角色專屬字（鬼火＝提燈小僧、水盤＝河童…）；「魂火」是世界裡的貨幣、不算 */
const FORBIDDEN = ['鬼火', '狐火', '燈籠', '提燈', '燃燒', '水盤', '水花', '金棒', '河童', '赤鬼'];
/** 通用名詞白名單：這些 key 的字不受限（本來就是在講某個東西的名字） */
const ALLOW = new Set<string>([]);

describe('通用字串不帶角色專屬字', () => {
  it('全掃：分類、混搭、介面、HUD、神壇、屬性的字串都沒有專屬字（舊版「燃燒系」「鬼火 +N 顆」會紅）', () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(zhTW)) {
      if (!GENERIC_PREFIXES.some((p) => k.startsWith(p)) || ALLOW.has(k)) continue;
      const text = String(v).replaceAll('魂火', '');
      for (const w of FORBIDDEN) if (text.includes(w)) bad.push(`${k}：「${v}」含「${w}」`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
  it('技法分類只有三個、名稱是中性名詞', () => {
    expect(['chain', 'near', 'field'].map((f) => zhTW[`tech.family.${f}` as keyof typeof zhTW])).toEqual(['連鎖系', '近身系', '佈置系']);
  });
});
