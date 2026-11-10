import { describe, it, expect } from 'vitest';
import { PLAYABLE_YOKAI, YOKAI } from '../../src/data/yokai';
import { ITEMS, WEAPON_LEVELS, itemPoolFor } from '../../src/data/items';
import { evosFor, techsFor } from '../../src/data/techniques';
import { defaultUltsOf, ultsOf } from '../../src/data/ultimates';
import { palette } from '../../src/art/palette';
import { zhTW } from '../../src/i18n/zh-TW';

/**
 * 角色完整性全掃（D65）：每隻「可玩」的妖怪都要有完整的一套，否則玩家會在某個畫面看到別人的東西或空白。
 * 之後加赤鬼（或任何新角色）進 PLAYABLE_YOKAI 時，這裡一次把漏掉的全部列出來（舉一反三：不是只檢查我想到的那幾項）。
 */
describe('每隻可玩的妖怪都有完整的一套', () => {
  for (const id of PLAYABLE_YOKAI) {
    it(`${id}：資料、升級表、技法池與進化、大招、特效色、名稱與說明`, () => {
      const y = YOKAI[id];
      expect(y, '沒有 YOKAI 資料').toBeTruthy();
      const w = y.weapon.id;
      expect(ITEMS.some((x) => x.id === w && x.kind === 'weapon'), `沒有主武器道具 ${w}`).toBe(true);
      expect(WEAPON_LEVELS[w]?.length, `${w} 沒有升級表`).toBeGreaterThanOrEqual(7);
      expect(itemPoolFor(w)[0], '選卡池第一個要是自己的主武器').toBe(w);
      const techs = techsFor(w);
      expect(techs.length, `${w} 的技法池太小`).toBeGreaterThanOrEqual(6);
      expect(evosFor(w).map((e) => e.from[1]).sort(), `${w} 的進化要和技法一一對應`).toEqual(techs.map((t) => t.id).sort());
      expect(ultsOf(id).length, '大招至少 2 招').toBeGreaterThanOrEqual(2);
      expect(defaultUltsOf(id).length, '要有一招一開始就有').toBeGreaterThanOrEqual(1);
      expect(palette.fx[id], '沒有特效色組（palette.fx）').toBeTruthy();
      const keys = [`yokai.${id}`, `yokai.${id}.desc`, `card.${w}`, `tech.${w}`, ...techs.flatMap((t) => [`tech.${t.id}`, `tech.${t.id}.desc`]), ...evosFor(w).flatMap((e) => [`evo.${e.id}`, `evo.${e.id}.desc`]), ...ultsOf(id).flatMap((u) => [`ult.${u.id}`, `ult.${u.id}.desc`])];
      const missing = keys.filter((k) => !(k in zhTW));
      expect(missing, `缺少文字：${missing.join('、')}`).toEqual([]);
      // 這隻妖怪的名字不准出現在別隻的畫面字串裡的通用位置，由 genericTerms 全掃
    });
  }
});
