import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { resetTuning } from '../../src/data/tuning';
import { WEAPON_AUTO, itemPoolFor } from '../../src/data/items';
import { EVO } from '../../src/data/techniques';
import { xpNeed } from '../../src/data/progression';

// D98（使用者 2026-11-17：「不要再有主武器的設定，它就算一個技法」）：武器和其他技法一樣靠選卡升級；
// 進化前最多 EVO.capBefore 級、進化後才能升到滿級。取代 D93 的「主武器自動升級」。
afterEach(() => resetTuning());

function make(yokaiId?: string) {
  const bus = new EventBus();
  const run = new Run({ seed: 3, bus, yokaiId } as never);
  run.god = true;
  return { run, bus };
}
/** 升一級；選卡時有武器卡就選武器卡，沒有就選第一張 */
function levelUp(run: Run, preferWeapon: boolean): boolean {
  run.addXp(xpNeed(run.level) - run.xp + 0.01);
  let saw = false;
  for (let g = 0; g < 10 && run.awaitingPick; g++) {
    const k = run.offer ? run.offer.findIndex((o) => o.cardId === run.weaponItemId) : -1;
    if (k >= 0) saw = true;
    run.chooseCard(preferWeapon && k >= 0 ? k : 0);
  }
  return saw;
}

describe('武器就是一個技法（D98）', () => {
  it('不再自動升級；武器在選卡池（舊版自動升級會紅）', () => {
    expect(WEAPON_AUTO.on).toBe(false);
    for (const w of ['ghostfire', 'waterdisc', 'kanabo']) expect(itemPoolFor(w)).toContain(w);
  });

  for (const y of ['chochin-kozo', 'kappa', 'aka-oni']) {
    it(`${y}：只升級、不選武器卡 → 武器一直 1 級；選武器卡才升；進化前停在 ${EVO.capBefore} 級、進化後才繼續`, () => {
      const a = make(y).run;
      let sawA = false;
      while (a.level < 24) sawA = levelUp(a, false) || sawA;
      // 只選第一張：武器有出現過，但不一定被選到；等級只會因為選到才變
      expect(sawA, '武器卡要會出現在選卡').toBe(true);
      const b = make(y).run;
      while (b.level < 30) levelUp(b, true);
      expect(b.weaponLevel, '進化前最多 5 級').toBe(EVO.capBefore);
      b.soulGems = 1;
      expect(b.tech.evolve(b.tech.evolvable.find((e) => e.from[1] === b.weaponItemId)!.id)).toBe(true);
      const lv0 = b.weaponLevel;
      while (b.level < 45 && b.weaponLevel === lv0) levelUp(b, true);
      expect(b.weaponLevel, '進化後可以繼續升').toBeGreaterThan(lv0);
    });
  }
});

describe('介面文字不再出現「主武器」（D98）', () => {
  it('全掃 i18n（更新紀錄是歷史，不算）', async () => {
    const { zhTW } = await import('../../src/i18n/zh-TW');
    const bad = Object.entries(zhTW as Record<string, string>).filter(([k, v]) => !k.startsWith('changelog.') && v.includes('主武器'));
    expect(bad).toEqual([]);
  });
});
