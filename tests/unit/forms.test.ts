import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { FORMS, PLAYABLE_YOKAI, YOKAI, formAt } from '../../src/data/yokai';
import { TECH_MAX, TECH_SLOTS, TECH_SWAP_PREFIX, techsFor } from '../../src/data/techniques';
import { xpNeed } from '../../src/data/progression';
import { defaultSave, merge } from '../../src/core/save';
import { buyTechSlot, loadoutFor, nextTechSlotPrice } from '../../src/game/ultLoadout';
import { Rng } from '../../src/lib/random';
import { zhTW } from '../../src/i18n/zh-TW';

/** 化身、化身限定技法、局外解鎖技法格子（D83、D84，docs/25） */
afterEach(() => resetTuning());
function make(yokaiId: string, seed = 3, techSlots?: number): Run {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus(), yokaiId, techSlots });
  run.god = true;
  run.director.active = false;
  return run;
}
/** 用真的經驗值升到指定等級（中途跳出的選卡選第一張） */
function levelTo(run: Run, level: number): void {
  for (let g = 0; g < 4000 && run.level < level; g++) {
    if (run.awaitingPick) run.chooseCard(0);
    else run.addXp(xpNeed(run.level));
  }
  while (run.awaitingPick) run.chooseCard(0);
}

describe('化身（妖怪自己進化）', () => {
  it('資料：兩階、等級遞增；每隻可玩的妖怪每一階都有名字；化身限定技法每隻是「第一階 2 招、第二階 1 招」，其餘 6 招一開始就能學', () => {
    expect(FORMS.map((f) => f.level)).toEqual([10, 20]);
    expect(formAt(9)).toBe(0);
    expect(formAt(10)).toBe(1);
    expect(formAt(25)).toBe(2);
    for (const y of PLAYABLE_YOKAI) {
      for (let k = 1; k <= FORMS.length; k++) expect(zhTW[`form.${y}.${k}` as keyof typeof zhTW], `${y} 第 ${k} 階的名字`).toBeTruthy();
      const t = techsFor(YOKAI[y].weapon.id);
      expect(t.filter((x) => !x.form).length, `${y} 一開始能學的`).toBe(6);
      expect(t.filter((x) => x.form === 1).length, `${y} 第一階`).toBe(2);
      expect(t.filter((x) => x.form === 2).length, `${y} 第二階`).toBe(1);
    }
  });

  it('升到 10 級化身：最大生命與攻擊力變高、模型變大、發事件、HUD 有提示；20 級再一次；加成不重複套用', () => {
    for (const y of PLAYABLE_YOKAI) {
      const bus = new EventBus();
      tuning.stageSeconds = 600;
      const run = new Run({ seed: 5, bus, yokaiId: y });
      run.god = true;
      run.director.active = false;
      const seen: number[] = [];
      bus.on('formChange', (e) => seen.push(e.form));
      levelTo(run, 9);
      expect(run.form).toBe(0);
      expect(run.formScale).toBe(1);
      const hp9 = run.stats.baseOf('maxHp');
      const base = run.maxHp;
      void hp9;
      levelTo(run, 10);
      expect(run.form, y).toBe(1);
      expect(seen).toEqual([1]);
      expect(run.formScale).toBe(FORMS[0].scale);
      expect(run.formNote?.form).toBe(1);
      expect(run.maxHp, `${y} 化身後最大生命`).toBeGreaterThan(base);
      const hp10 = run.maxHp;
      levelTo(run, 12);
      // 沒拿到最大生命的卡時不該再變（加成只套一次）；拿到卡會變多，所以只檢查「不是又乘一次化身」
      expect(run.maxHp).toBeLessThan(hp10 * (1 + (FORMS[0].pct.maxHp ?? 0)) + 200);
      levelTo(run, 20);
      expect(run.form).toBe(2);
      expect(seen).toEqual([1, 2]);
      expect(run.formScale).toBe(FORMS[1].scale);
    }
  });

  it('化身限定技法：化身前抽不到（全掃很多次）；第一階之後抽得到第一階的、抽不到第二階的；第二階之後全部抽得到（舊版一開始就抽得到會紅）', () => {
    for (const y of PLAYABLE_YOKAI) {
      const all = techsFor(YOKAI[y].weapon.id);
      const seenAt = (level: number): Set<string> => {
        const run = make(y, 7);
        run.level = level;
        const rng = new Rng(11);
        const s = new Set<string>();
        for (let k = 0; k < 600; k++) s.add(run.tech.pickCard(rng)!);
        return s;
      };
      const s0 = seenAt(8);
      for (const t of all) expect(s0.has(t.id), `${y}／${t.id} 在化身前`).toBe(!t.form);
      const s1 = seenAt(12);
      for (const t of all) expect(s1.has(t.id), `${y}／${t.id} 在第一階`).toBe((t.form ?? 0) <= 1);
      const s2 = seenAt(22);
      for (const t of all) expect(s2.has(t.id), `${y}／${t.id} 在第二階`).toBe(true);
      // 能力面板要列的「還沒解鎖」
      const r = make(y, 7);
      expect(r.tech.lockedByForm().length).toBe(3);
      r.level = 12;
      expect(r.tech.lockedByForm().map((x) => x[1])).toEqual([2]);
      r.level = 20;
      expect(r.tech.lockedByForm()).toEqual([]);
    }
  });

  it('格子滿了：化身後的升級卡會出現「換掉一招」的提案（換掉等級最低的普通技法），選了就換、不選就沒事；沒滿就不出現', () => {
    const run = make('chochin-kozo', 9);
    run.devAddTech('bounce', 'ward', 'lamp');
    run.tech.devSetLevel('bounce', 3);
    run.tech.devSetLevel('lamp', 2);
    run.level = 9;
    expect(run.tech.pickFormSwap(new Rng(1)), '化身前沒有可換的').toBeNull();
    run.level = 12;
    const sw = run.tech.pickFormSwap(new Rng(1))!;
    expect(sw[0], '換掉等級最低的').toBe('ward');
    expect(['kitsunebi', 'ring']).toContain(sw[1]);
    // 真的發牌：很多次升級裡看得到換技法的卡；選了之後技法真的換掉
    let swapped = false;
    for (let g = 0; g < 80 && !swapped; g++) {
      run.devTechNext();
      run.addXp(xpNeed(run.level));
      const i = run.offer!.findIndex((c) => c.cardId.startsWith(TECH_SWAP_PREFIX));
      if (i >= 0) {
        const [from, to] = run.offer![i].cardId.slice(TECH_SWAP_PREFIX.length).split('>');
        run.chooseCard(i);
        expect(run.tech.has(to)).toBe(true);
        expect(run.tech.has(from)).toBe(false);
        swapped = true;
      }
      while (run.awaitingPick) run.chooseCard(run.offer!.findIndex((c) => !c.cardId.startsWith('tech')) >= 0 ? run.offer!.findIndex((c) => !c.cardId.startsWith('tech')) : 0);
    }
    expect(swapped, '80 次升級都沒有出現換技法的卡').toBe(true);
    const free = make('chochin-kozo', 9);
    free.devAddTech('bounce');
    free.level = 12;
    expect(free.tech.pickFormSwap(new Rng(1)), '還有空格就不用換').toBeNull();
  });
});

describe('技法格子：開局 3 格，局外解到 5 格', () => {
  it('開局 3 格；帶 1、2 個局外格子 → 4、5 格；超過上限不算', () => {
    expect(TECH_MAX).toBe(3);
    expect(TECH_SLOTS.extraPrices).toHaveLength(2);
    expect(make('kappa', 3).tech.max).toBe(3);
    expect(make('kappa', 3, 1).tech.max).toBe(4);
    expect(make('kappa', 3, 2).tech.max).toBe(5);
    expect(make('kappa', 3, 9).tech.max).toBe(5);
    const run = make('chochin-kozo', 3, 2);
    run.devAddTech('bounce', 'ward', 'lamp', 'seed', 'homing');
    expect(run.tech.owned).toHaveLength(5);
  });
  it('神社購買：功德不夠買不了；買了扣功德、格子 +1；兩格都買完就沒有下一格；舊存檔（沒有這個欄位）補成 0；開局帶進去', () => {
    const s = defaultSave();
    expect(s.techSlots).toBe(0);
    expect(nextTechSlotPrice(s)).toBe(TECH_SLOTS.extraPrices[0]);
    expect(buyTechSlot(s)).toBe(false);
    s.merit = TECH_SLOTS.extraPrices[0] + 5;
    expect(buyTechSlot(s)).toBe(true);
    expect(s.merit).toBe(5);
    expect(s.techSlots).toBe(1);
    expect(loadoutFor(s, 'kappa').techSlots).toBe(1);
    s.merit = TECH_SLOTS.extraPrices[1];
    expect(buyTechSlot(s)).toBe(true);
    expect(nextTechSlotPrice(s)).toBeNull();
    s.merit = 99999;
    expect(buyTechSlot(s)).toBe(false);
    const old = JSON.parse(JSON.stringify(defaultSave())) as Record<string, unknown>;
    delete old.techSlots;
    expect(merge(defaultSave(), old).techSlots).toBe(0);
    expect(merge(defaultSave(), JSON.parse(JSON.stringify(s))).techSlots).toBe(2);
  });
});
