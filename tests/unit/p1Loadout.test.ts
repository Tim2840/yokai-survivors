import { describe, expect, it } from 'vitest';
import { YOKAI } from '../../src/data/yokai';
import { techsFor } from '../../src/data/techniques';
// @ts-expect-error 回歸腳本是 .mjs（沒有型別）
import { TECH_LOADOUT } from '../../scripts/regress/p1-loadout.mjs';

/** p1 的「帶滿技法」清單要涵蓋每隻妖怪，而且用的是牠自己的技法（新妖怪忘了加，效能預算就不會檢查到牠） */
describe('p1 帶滿技法的清單', () => {
  for (const id of Object.keys(YOKAI)) {
    it(id, () => {
      const list = (TECH_LOADOUT as Record<string, string[]>)[id];
      expect(list, `scripts/regress/p1-loadout.mjs 沒有 ${id}`).toBeTruthy();
      const own = techsFor(YOKAI[id].weapon.id).map((t) => t.id);
      for (const t of list) expect(own, `${id} 沒有技法 ${t}`).toContain(t);
    });
  }
});
