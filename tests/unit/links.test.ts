import { describe, expect, it } from 'vitest';
import { cardLinks } from '../../src/data/links';
import { ITEMS } from '../../src/data/items';
import { TECHS } from '../../src/data/techniques';
import { cardLinkLines } from '../../src/ui/overlays';

describe('法具連結（使用者 2026-11-06：法具影響哪些招式都要寫明；D52 大招不再靠法具融合，只剩技法）', () => {
  it('全掃：每個技法的「適合」道具，反查都找得到那個技法；取捨道具視為它加強的道具', () => {
    for (const t of TECHS) for (const like of t.likes) expect(cardLinks(like, 'chochin-kozo').techs, `${like} 沒列出技法 ${t.id}`).toContain(t.id);
    expect(cardLinks('cursedBlade', 'chochin-kozo').techs).toEqual(cardLinks('power', 'chochin-kozo').techs);
  });

  it('全掃：主武器標示全部、備用獎勵不列、其他法具不是主武器', () => {
    for (const d of ITEMS) {
      const l = cardLinks(d.id, 'chochin-kozo');
      if (d.kind === 'fallback') expect(l).toEqual({ techs: [], weapon: false });
      else if (d.kind === 'weapon') expect(l.weapon).toBe(true);
      else expect(l.weapon).toBe(false);
    }
  });
});

describe('升級卡只顯示「會影響的現有招式」，詳細在暫停頁（使用者 2026-11-06）', () => {
  const Y = 'chochin-kozo';
  it('選卡（給現有技法）：只列有拿到的技法與鬼火；沒有影響的就不顯示（迴避、備用獎勵）', () => {
    expect(cardLinkLines('power', Y, [])).toEqual(['會影響：鬼火']);
    expect(cardLinkLines('power', Y, ['kitsunebi'])).toEqual(['會影響：鬼火、狐火分裂']);
    expect(cardLinkLines('power', Y, ['ring']), '燈籠環不適合力量').toEqual(['會影響：鬼火']);
    expect(cardLinkLines('area', Y, ['ring', 'kitsunebi'])).toEqual(['會影響：燈籠環']);
    expect(cardLinkLines('dodge', Y, ['ring'])).toEqual([]);
    expect(cardLinkLines('heal', Y, ['ring'])).toEqual([]);
    // 沒拿到的技法一個都不會出現
    for (const x of TECHS) expect(cardLinkLines('power', Y, []).join('')).not.toContain(`${x.id}`);
  });
  it('暫停頁（不給現有技法）：詳細列出全部適合的技法；沒有搭配的明講沒有；主武器寫所有技法都靠它', () => {
    const full = cardLinkLines('power', Y)[0];
    expect(full).toMatch(/^適合的技法：鬼火、狐火分裂/);
    expect(cardLinkLines('dodge', Y)).toEqual(['沒有搭配的技法（只提升能力）']);
    expect(cardLinkLines('ghostfire', Y)).toEqual(['所有技法都靠它出手']);
  });
});

