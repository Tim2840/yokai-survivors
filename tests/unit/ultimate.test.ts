import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { ULT, ULTS, ULT_SLOTS, ULT_UPGRADE, defaultUltsOf, ultMods, ultUpgradePrice, ultsOf } from '../../src/data/ultimates';
import { kindIndex } from '../../src/systems/enemies';
import { PLAYABLE_YOKAI } from '../../src/data/yokai';

const DT = 1 / 60;
afterEach(() => resetTuning());
function make(seed = 3, opts: { ults?: string[]; ultLevels?: Record<string, number> } = {}) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed, bus, ...opts });
  run.god = false;
  return { run, bus };
}
/** 在玩家身邊指定位置放一隻村人（回傳編號）；把玩家放在原點附近的平地 */
function placeEnemy(run: Run, dx: number, dz: number): number {
  const i = run.enemies.spawn(kindIndex('villager'), run.px + dx, run.pz + dz, 1, 0, 0);
  expect(i).toBeGreaterThanOrEqual(0);
  run.enemies.hp[i] = run.enemies.maxHp[i] = 1; // 一擊就死，只看有沒有被打到
  return i;
}
/** 空間雜湊要更新過才查得到剛放的敵人（遊戲裡每步 enemies.update 會做） */
function settle(run: Run) {
  run.enemies.update(0, run.px, run.pz, run.flow, 0, 0);
}


describe('大招資料（D52：局外裝配）', () => {
  it('全掃：id 不重複；每隻可玩妖怪至少 2 招、至少 1 招一開始就有；其餘的有解鎖價；效果類型合法', () => {
    expect(new Set(ULTS.map((u) => u.id)).size).toBe(ULTS.length);
    for (const y of PLAYABLE_YOKAI) {
      if (y !== 'chochin-kozo') continue; // 河童、赤鬼的大招等做到那兩隻再加
      expect(ultsOf(y).length, `${y} 的大招數`).toBeGreaterThanOrEqual(2);
      expect(defaultUltsOf(y).length, `${y} 一開始就有的`).toBeGreaterThanOrEqual(1);
    }
    for (const u of ULTS) {
      expect(['nova', 'frenzy', 'bulwark', 'beam']).toContain(u.effect.type);
      expect(u.price).toBeGreaterThanOrEqual(0);
    }
  });
  it('局外升級：每級一個步驟、累計單調（威力／範圍／充能只增、冷卻只減）、價格遞增、滿級沒有下一級價格', () => {
    expect(ULT_UPGRADE.steps).toHaveLength(ULT_UPGRADE.maxLevel);
    let prev = ultMods(0);
    expect(prev).toEqual({ power: 1, radius: 1, cooldown: ULT.cooldown, charge: 1 });
    for (let lv = 1; lv <= ULT_UPGRADE.maxLevel; lv++) {
      const m = ultMods(lv);
      expect(m.power).toBeGreaterThanOrEqual(prev.power);
      expect(m.radius).toBeGreaterThanOrEqual(prev.radius);
      expect(m.charge).toBeGreaterThanOrEqual(prev.charge);
      expect(m.cooldown).toBeLessThanOrEqual(prev.cooldown);
      expect(m.cooldown, '冷卻不能縮到沒有').toBeGreaterThan(5);
      if (lv < ULT_UPGRADE.maxLevel) expect(ultUpgradePrice(lv)).toBeGreaterThan(ultUpgradePrice(lv - 1));
      prev = m;
    }
    expect(ultUpgradePrice(ULT_UPGRADE.maxLevel)).toBe(Infinity);
    expect(ultMods(99)).toEqual(ultMods(ULT_UPGRADE.maxLevel));
  });
});

describe('局外裝配進到一局', () => {
  it('沒指定 → 帶這隻妖怪一開始就有的那一招；指定的才帶；最多 ULT_SLOTS 招；舊版（要融合才有大招）會紅', () => {
    const a = make(1).run;
    expect(a.ults).toEqual(defaultUltsOf('chochin-kozo').slice(0, ULT_SLOTS));
    const b = make(1, { ults: ['ghostfireDance'], ultLevels: { ghostfireDance: 3 } }).run;
    expect(b.ults).toEqual(['ghostfireDance']);
    expect(b.ultLevels.get('ghostfireDance')).toBe(3);
    expect(b.ultModsView).toEqual(ultMods(3));
    const c = make(1, { ults: ['infernoLantern', 'ghostfireDance'] }).run;
    expect(c.ults).toHaveLength(ULT_SLOTS);
  });
});

describe('充能與發動', () => {
  it('擊殺與時間充能；量表沒滿不能發動；發動後歸零', () => {
    const { run } = make(7);
    run.ultCharge = 0;
    for (let i = 0; i < 60; i++) run.step(DT);
    expect(run.ultCharge).toBeGreaterThan(ULT.perSecond * 0.9);
    expect(run.castUltimate(), '量表沒滿').toBe(false);
    run.devChargeUlt();
    expect(run.castUltimate()).toBe(true);
    expect(run.ultCharge).toBe(0);
    expect(run.lastCast?.ids).toContain('infernoLantern');
  });
  it('沒有裝配大招就不能發動', () => {
    const { run } = make(7, { ults: [] });
    run.devChargeUlt();
    expect(run.ultReady).toBe(false);
    expect(run.castUltimate()).toBe(false);
  });
  it('擊殺敵人會充能：充能量 = 擊殺數 × perKill + 時間 × perSecond', () => {
    const { run } = make(8);
    run.god = true;
    run.ultCharge = 0;
    placeEnemy(run, 3, 0);
    settle(run);
    let t = 0;
    for (let i = 0; i < 60 * 5 && run.kills === 0; i++) {
      run.step(DT);
      t += DT;
    }
    expect(run.kills).toBeGreaterThan(0);
    expect(run.ultCharge).toBeGreaterThanOrEqual(ULT.perKill * run.kills - 1e-9);
    expect(run.ultCharge).toBeLessThanOrEqual(ULT.perElite * run.kills + ULT.perSecond * t + 1e-6);
  });
  it('發動後 cooldown 秒內量表不充能、不能再放；冷卻結束後恢復充能；升級把冷卻縮短、充能加快（舊版沒有升級會紅）', () => {
    const run0 = make(21).run;
    run0.god = true;
    run0.devChargeUlt();
    expect(run0.castUltimate()).toBe(true);
    expect(run0.ultCooling).toBe(true);
    expect(run0.ultCooldownLeft).toBeCloseTo(ULT.cooldown, 5);
    run0.ultCharge = 0;
    for (let i = 0; i < 60 * 3; i++) {
      if (run0.awaitingPick) run0.chooseCard(0);
      run0.step(DT);
    }
    expect(run0.ultCharge, '冷卻中不充能').toBe(0);

    const run5 = make(21, { ultLevels: { infernoLantern: ULT_UPGRADE.maxLevel } }).run;
    run5.god = true;
    run5.devChargeUlt();
    run5.castUltimate();
    expect(run5.ultCooldownLeft).toBeCloseTo(ultMods(ULT_UPGRADE.maxLevel).cooldown, 5);
    expect(run5.ultCooldownLeft).toBeLessThan(ULT.cooldown);
    // 充能：同樣 1 秒，升級過的多
    const g0 = make(22).run;
    const g5 = make(22, { ultLevels: { infernoLantern: ULT_UPGRADE.maxLevel } }).run;
    g0.ultCharge = g5.ultCharge = 0;
    g0.god = g5.god = true;
    for (let i = 0; i < 60; i++) {
      g0.step(DT);
      g5.step(DT);
    }
    expect(g5.ultCharge).toBeGreaterThan(g0.ultCharge);
  });
});

describe('各大招的效果（升級會放大）', () => {
  it('炎獄燈（範圍爆發）：範圍內的敵人被打死、範圍外的沒事；範圍隨局外升級變大', () => {
    const { run } = make(9);
    const near = placeEnemy(run, 4, 0);
    const far = placeEnemy(run, 20, 0);
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    expect(run.enemies.alive[near]).toBe(0);
    expect(run.enemies.alive[far]).toBe(1);
    // 剛好在 Lv0 範圍外、Lv5 範圍內的位置
    const e = ULTS.find((u) => u.id === 'infernoLantern')!.effect;
    if (e.type !== 'nova') throw new Error('炎獄燈應該是範圍爆發');
    const edge = e.radius * 1.15 * run.stats.value.area;
    const r0 = make(9).run;
    const r5 = make(9, { ultLevels: { infernoLantern: ULT_UPGRADE.maxLevel } }).run;
    const x0 = placeEnemy(r0, edge, 0);
    const x5 = placeEnemy(r5, edge, 0);
    settle(r0);
    settle(r5);
    r0.devChargeUlt();
    r5.devChargeUlt();
    r0.castUltimate();
    r5.castUltimate();
    expect(r0.enemies.alive[x0], 'Lv0 打不到').toBe(1);
    expect(r5.enemies.alive[x5], 'Lv5 打得到').toBe(0);
  });
  it('雷火槍（貫穿光束，還沒有人用的效果類型）：射線上的全部被打到（含遠處），線外的沒事', () => {
    const { run } = make(10);
    run.devSetUlt('thunderSpear');
    const a = placeEnemy(run, 3, 0);
    const b = placeEnemy(run, 12, 0.3);
    const c = placeEnemy(run, 18, -0.4);
    const off = placeEnemy(run, 8, 6);
    const behind = placeEnemy(run, -5, 0);
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    for (const i of [a, b, c]) expect(run.enemies.alive[i], '射線上').toBe(0);
    expect(run.enemies.alive[off], '射線外').toBe(1);
    expect(run.enemies.alive[behind], '身後').toBe(1);
  });
  it('鬼火亂舞（狂亂）：攻擊力、攻速暫時提高，時間到恢復；升級的幅度與時間更大', () => {
    const { run } = make(11, { ults: ['ghostfireDance'] });
    const p0 = run.stats.value.power;
    const a0 = run.stats.value.atkSpeed;
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    const p1 = run.stats.value.power;
    expect(p1).toBeGreaterThan(p0);
    expect(run.stats.value.atkSpeed).toBeGreaterThan(a0);
    for (let i = 0; i < 60 * 8; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.stats.value.power).toBeCloseTo(p0, 5);
    expect(run.stats.value.atkSpeed).toBeCloseTo(a0, 5);
    // 升級後的幅度比 Lv0 大
    const up = make(11, { ults: ['ghostfireDance'], ultLevels: { ghostfireDance: ULT_UPGRADE.maxLevel } }).run;
    up.devChargeUlt();
    up.castUltimate();
    expect(up.stats.value.power).toBeGreaterThan(p1);
  });
  it('守燈結界（護罩，還沒有人用的效果類型）：無敵、回血、周圍敵人被震開受傷', () => {
    const { run } = make(12);
    run.devSetUlt('bulwarkLantern');
    run.hp = run.maxHp * 0.3;
    const near = placeEnemy(run, 3, 0);
    settle(run);
    run.devChargeUlt();
    run.castUltimate();
    expect(run.hp).toBeGreaterThan(run.maxHp * 0.6);
    expect(run.invul).toBeGreaterThan(3);
    expect(run.enemies.alive[near]).toBe(0);
    const hp = run.hp;
    for (let i = 0; i < 120; i++) run.step(DT);
    expect(run.hp).toBeGreaterThanOrEqual(hp - 1e-6);
  });
});
