import { describe, expect, it } from 'vitest';
import { cardLinks } from '../../src/data/links';
import { ITEMS } from '../../src/data/items';
import { ULT_RECIPES } from '../../src/data/ultimates';
import { TECHS } from '../../src/data/techniques';

describe('法具連結（使用者 2026-11-06：所有法具能輔助融合成什麼、影響哪些招式都要寫明）', () => {
  it('全掃：每個大招配方的材料，反查都找得到那個大招（含取捨道具視為它加強的道具）', () => {
    for (const r of ULT_RECIPES) {
      for (const [card, lv] of Object.entries(r.requires)) {
        const l = cardLinks(card, r.yokai);
        expect(l.ults, `${card} 沒列出大招 ${r.id}`).toContainEqual({ id: r.id, level: lv });
      }
    }
    expect(cardLinks('cursedBlade', 'chochin-kozo').ults.map((u) => u.id)).toEqual(cardLinks('power', 'chochin-kozo').ults.map((u) => u.id));
  });

  it('全掃：每個技法的「適合」道具，反查都找得到那個技法', () => {
    for (const t of TECHS) for (const like of t.likes) expect(cardLinks(like, 'chochin-kozo').techs, `${like} 沒列出技法 ${t.id}`).toContain(t.id);
  });

  it('全掃：每個法具都有明確的連結——不是有大招／技法，就是明確標示沒有；主武器標示全部；備用獎勵不列', () => {
    for (const d of ITEMS) {
      const l = cardLinks(d.id, 'chochin-kozo');
      if (d.kind === 'fallback') expect(l).toEqual({ ults: [], techs: [], weapon: false });
      else if (d.kind === 'weapon') expect(l.weapon).toBe(true);
      else expect(l.weapon).toBe(false);
    }
  });
});
