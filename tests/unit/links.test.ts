import { describe, expect, it } from 'vitest';
import { cardLinks } from '../../src/data/links';
import { ITEMS } from '../../src/data/items';
import { TECHS } from '../../src/data/techniques';

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
