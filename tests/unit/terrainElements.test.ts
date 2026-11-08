import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { ELEVATED, SUMMIT, ELEMENT_RULES } from '../../src/data/elements';
import { PlayerReach } from '../../src/systems/reach';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus() });
  run.god = true;
  return run;
}

describe('山頂神社（E2）', () => {
  it('全掃種子：開局就放一座在地圖高處——比出生點至少高 minRise、離出生點夠遠、玩家用走的到得了、是平地；大多數種子都放得下', () => {
    let placed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const run = make(seed);
      const s = run.elements.summitSlot;
      if (!s) continue;
      placed++;
      const st = run.map.def.playerStart;
      expect(s.y, `seed ${seed} 高度`).toBeGreaterThanOrEqual(run.map.heightAt(st.x, st.z) + SUMMIT.minRise);
      expect(Math.hypot(s.x - st.x, s.z - st.z)).toBeGreaterThanOrEqual(SUMMIT.minFromStart);
      expect(s.life).toBe(Infinity);
      const reach = new PlayerReach(run.map);
      reach.compute(run.px, run.pz);
      expect(reach.ok(s.x, s.z), `seed ${seed} 走不到`).toBe(true);
      expect(run.map.isBlocked(s.x, s.z)).toBe(false);
    }
    expect(placed, '大多數種子要放得下山頂神社').toBeGreaterThanOrEqual(24);
  });

  it('啟動：站上去按住 → 這一關頭目生命 ×bossMult、多掉 extraChests 個寶箱、結果卡寫出來；頭目出現之後就不能啟動（來不及）', () => {
    let seed = 1;
    let run = make(seed);
    while (!run.elements.summitSlot && seed < 40) run = make(++seed);
    const s = run.elements.summitSlot!;
    run.director.active = false;
    run.devTeleport(s.x, s.z);
    run.setMove(0, 0);
    for (let i = 0; i < 60 * (SUMMIT.holdSeconds + 2) && !run.elementResult; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.elementResult, '按住神社後沒有結果卡').toBeTruthy();
    const line = run.elementResult!.lines[0];
    expect(line.t).toBe('summit');
    expect(run.director.summitMult).toBe(SUMMIT.bossMult);
    expect(run.summitChests).toBe(SUMMIT.extraChests);
    run.dismissResult();
  });

  it('頭目真的更強、打倒後真的多掉寶箱；沒啟動的對照組沒有（舊版沒有山頂神社會紅）', () => {
    const boss = (activate: boolean) => {
      let seed = 1;
      let run = make(seed);
      while (!run.elements.summitSlot && seed < 40) run = make(++seed);
      if (activate) {
        run.director.summitMult = SUMMIT.bossMult;
        run.summitChests = SUMMIT.extraChests;
      }
      expect(run.director.summonBoss()).toBe(true);
      let bi = -1;
      for (let k = 0; k < 600 && bi < 0; k++) {
        run.step(DT);
        for (let i = 0; i < run.enemies.capacity; i++) if (run.enemies.alive[i] && run.enemies.variant[i] === 2) bi = i;
      }
      return { run, hp: bi >= 0 ? run.enemies.maxHp[bi] : 0, bi };
    };
    const a = boss(false);
    const b = boss(true);
    expect(a.bi).toBeGreaterThanOrEqual(0);
    expect(b.hp / a.hp, '頭目生命倍率').toBeCloseTo(SUMMIT.bossMult, 1);
    // 打倒頭目：寶箱數 = 1 ＋ extraChests
    const chests = (r: Run) => r.elements.slots.filter((s) => s.active && s.kind === 'chest').length;
    for (const x of [a, b]) {
      const before = chests(x.run);
      x.run.enemies.hp[x.bi] = 1;
      (x.run as unknown as { onKill(i: number): void }).onKill(x.bi);
      x.run.step(DT);
      const gain = chests(x.run) - before;
      expect(gain, x === a ? '沒啟動：只有 1 個寶箱' : '啟動：多 1 個寶箱').toBe(x === a ? 1 : 1 + SUMMIT.extraChests);
    }
  });

  it('頭目已經出現時神社不能啟動（blocked）；每關重新放、啟動的效果不帶到下一關', () => {
    let seed = 1;
    let run = make(seed);
    while (!run.elements.summitSlot && seed < 40) run = make(++seed);
    run.director.active = false;
    run.director.summonBoss();
    const s = run.elements.summitSlot!;
    run.devTeleport(s.x, s.z);
    run.setMove(0, 0);
    for (let i = 0; i < 60 * 4; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.director.summitMult, '頭目出現後不能再啟動').toBe(1);
    expect(s.blocked).toBe(true);
  });
});

describe('高處的要素（E2）', () => {
  it('機率拉到 100%：落下的要素大多放在比玩家高 minRise 以上、而且玩家走得到；機率 0 時比較少（舊版沒有高處規則會紅）', () => {
    const E = ELEVATED as unknown as { chance: number };
    const keep = E.chance;
    const count = (chance: number) => {
      E.chance = chance;
      let high = 0;
      let total = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const run = make(seed);
        for (const s of run.elements.slots) {
          if (!s.active || s.kind === 'summit') continue;
          total++;
          if (s.y >= run.py + ELEVATED.minRise) {
            high++;
            const reach = new PlayerReach(run.map);
            reach.compute(run.px, run.pz);
            if (chance >= 1) expect(reach.ok(s.x, s.z), `seed ${seed} 高處的要素走不到`).toBe(true);
          }
        }
      }
      return { high, total };
    };
    try {
      const all = count(1);
      const none = count(0);
      expect(all.high, '全部機率時應該有高處的要素').toBeGreaterThan(none.high);
    } finally {
      E.chance = keep;
    }
  });
  it('資料合理', () => {
    expect(ELEVATED.chance).toBeGreaterThan(0);
    expect(ELEVATED.chance).toBeLessThan(1);
    expect(ELEVATED.minRise).toBeGreaterThan(1.2); // 比跳躍高度高，不是跳一下就上去
    expect(SUMMIT.bossMult).toBeGreaterThan(1);
    expect(SUMMIT.extraChests).toBeGreaterThanOrEqual(1);
    expect(ELEMENT_RULES.minApart).toBeGreaterThan(0);
  });
});
