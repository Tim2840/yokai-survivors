import { describe, it, expect } from 'vitest';
import { defaultSave, merge } from '../../src/core/save';
import { ULT_UPGRADE, ULTS, ultUpgradePrice } from '../../src/data/ultimates';
import { buyUlt, equipUlt, equippedUlt, isUltUnlocked, loadoutFor, ultLevel, upgradeUlt } from '../../src/game/ultLoadout';

const Y = 'chochin-kozo';
const second = ULTS.find((u) => u.yokai === Y && u.price > 0)!;
const first = ULTS.find((u) => u.yokai === Y && u.price === 0)!;

describe('大招局外裝配（D52）：解鎖、升級、裝配', () => {
  it('新存檔：只有價格 0 的大招解鎖；預設裝配它；等級 0', () => {
    const s = defaultSave();
    expect(isUltUnlocked(s, first.id)).toBe(true);
    expect(isUltUnlocked(s, second.id)).toBe(false);
    expect(equippedUlt(s, Y)).toBe(first.id);
    expect(loadoutFor(s, Y)).toEqual({ ults: [first.id], ultLevels: { [first.id]: 0 } });
  });

  it('解鎖：功德不夠不能買、夠了扣功德、買過不能再買；沒解鎖的不能裝配', () => {
    const s = defaultSave();
    expect(equipUlt(s, Y, second.id), '沒解鎖不能裝配').toBe(false);
    expect(buyUlt(s, second.id), '功德不夠').toBe(false);
    s.merit = second.price + 5;
    expect(buyUlt(s, second.id)).toBe(true);
    expect(s.merit).toBe(5);
    expect(buyUlt(s, second.id), '買過了').toBe(false);
    expect(s.merit).toBe(5);
    expect(equipUlt(s, Y, second.id)).toBe(true);
    expect(equippedUlt(s, Y)).toBe(second.id);
  });

  it('升級：沒解鎖不能升；功德不夠不能升；每級價格照 ultUpgradePrice；滿級不能再升', () => {
    const s = defaultSave();
    expect(upgradeUlt(s, second.id), '沒解鎖').toBe(false);
    expect(upgradeUlt(s, first.id), '沒功德').toBe(false);
    s.merit = 1e6;
    let spent = 0;
    for (let lv = 0; lv < ULT_UPGRADE.maxLevel; lv++) {
      const p = ultUpgradePrice(lv);
      expect(upgradeUlt(s, first.id)).toBe(true);
      spent += p;
      expect(ultLevel(s, first.id)).toBe(lv + 1);
    }
    expect(1e6 - s.merit).toBe(spent);
    expect(upgradeUlt(s, first.id), '滿級').toBe(false);
    expect(loadoutFor(s, Y).ultLevels[first.id]).toBe(ULT_UPGRADE.maxLevel);
  });

  it('裝配的大招沒解鎖（例如存檔被改）→ 退回一開始就有的那一招；測試頁 unlockAll 全開', () => {
    const s = defaultSave();
    s.ult.equipped[Y] = second.id;
    expect(equippedUlt(s, Y)).toBe(first.id);
    expect(isUltUnlocked(s, second.id, true)).toBe(true);
    expect(equippedUlt(s, Y, true)).toBe(second.id);
    expect(equipUlt(s, Y, second.id, true)).toBe(true);
  });

  it('存檔：新欄位補在預設值；舊存檔（沒有 ult）讀進來補預設；有的原樣保留（存檔 → 讀回）', () => {
    const old = JSON.parse(JSON.stringify(defaultSave())) as Record<string, unknown>;
    delete old.ult;
    expect(merge(defaultSave(), old).ult).toEqual({ unlocked: [], levels: {}, equipped: {} });
    const s = defaultSave();
    s.merit = 999;
    buyUlt(s, second.id) || (s.merit = second.price + 1, buyUlt(s, second.id));
    equipUlt(s, Y, second.id);
    s.ult.levels[second.id] = 2;
    const back = merge(defaultSave(), JSON.parse(JSON.stringify(s)));
    expect(back.ult).toEqual(s.ult);
    expect(equippedUlt(back, Y)).toBe(second.id);
    expect(ultLevel(back, second.id)).toBe(2);
  });
});
