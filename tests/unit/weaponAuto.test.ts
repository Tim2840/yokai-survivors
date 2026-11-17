import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { resetTuning } from '../../src/data/tuning';
import { WEAPON_AUTO, WEAPON_LEVELS, itemPoolFor } from '../../src/data/items';
import { xpNeed } from '../../src/data/progression';

// D93（docs/32 C）：主武器隨玩家等級自動升級，不再出現在選卡
afterEach(() => resetTuning());

function make(yokaiId?: string) {
  const bus = new EventBus();
  const run = new Run({ seed: 3, bus, yokaiId } as never);
  run.god = true;
  return { run, bus };
}
/** 升一級並把選卡選掉（選第一張） */
function levelUp(run: Run): void {
  run.addXp(xpNeed(run.level) - run.xp + 0.01);
  for (let g = 0; g < 10 && run.awaitingPick; g++) run.chooseCard(0);
}

describe('主武器自動升級', () => {
  it('時間表由小到大、每一級一個、化身那兩級（10、20）稀有度最高', () => {
    const lv = WEAPON_AUTO.steps.map((s) => s.level);
    expect([...lv].sort((a, b) => a - b)).toEqual(lv);
    expect(new Set(lv).size).toBe(lv.length);
    const r = (L: number) => WEAPON_AUTO.steps.find((s) => s.level === L)?.rarity;
    expect(r(10)).toBe('epic');
    expect(r(20)).toBe('legend');
  });

  for (const y of ['chochin-kozo', 'kappa']) {
    it(`${y}：玩家升到表上的等級，主武器剛好升到對應的級數；選卡裡從來沒有主武器卡；20 級滿級`, () => {
      const { run, bus } = make(y);
      let ups = 0;
      bus.on('weaponUp', () => ups++);
      let sawWeaponCard = false;
      while (run.level < 22) {
        if (run.offer?.some((o) => o.cardId === run.weaponItemId)) sawWeaponCard = true;
        levelUp(run);
        const want = 1 + WEAPON_AUTO.steps.filter((s) => s.level <= run.level).length;
        expect(run.weaponLevel, `玩家 ${run.level} 級`).toBe(want);
      }
      expect(sawWeaponCard).toBe(false);
      expect(run.weaponLevel).toBe(WEAPON_LEVELS[run.weaponItemId].length + 1);
      expect(ups).toBe(WEAPON_AUTO.steps.length);
      expect(run.weaponNote?.level).toBe(run.weaponLevel);
    });
  }

  it('舊做法（on = false）主武器還在選卡池：確認這個開關真的控制選卡池', () => {
    WEAPON_AUTO.on = false;
    try {
      expect(itemPoolFor('ghostfire')).toContain('ghostfire');
    } finally {
      WEAPON_AUTO.on = true;
    }
    expect(itemPoolFor('ghostfire')).not.toContain('ghostfire');
  });
});
