import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { PLAYABLE_YOKAI, YOKAI, type WeaponDef, type YokaiDef } from '../../src/data/yokai';
import { WEAPON_LEVELS, itemPoolFor, registerItem } from '../../src/data/items';
import { kindIndex } from '../../src/systems/enemies';

/**
 * 主武器的出手方式（D61）：projectile／boomerang／sweep。測試用的假妖怪直接塞進資料表，測完拿掉。
 * 提燈小僧（projectile）的行為由既有的測試守著（techniques、run、evolution…）。
 */
const DT = 1 / 60;
const BASE = YOKAI['chochin-kozo'];
const mk = (id: string, w: Partial<WeaponDef>): YokaiDef => ({ ...BASE, id, weapon: { ...BASE.weapon, id: `w-${id}`, ...w } });
const FAKE: Record<string, YokaiDef> = {
  'test-sweep': mk('test-sweep', { kind: 'sweep', damage: 20, interval: 0.5, range: 6, reach: 3, arc: Math.PI / 2, shockEvery: 3, shockRadius: 1.5, shockDamage: 2, knockback: 0.2 }),
  'test-boomerang': mk('test-boomerang', { kind: 'boomerang', damage: 10, interval: 0.6, range: 9, pierce: 20, lifetime: 1.2 }),
};

beforeAll(() => {
  for (const [id, y] of Object.entries(FAKE)) {
    YOKAI[id] = y;
    (PLAYABLE_YOKAI as string[]).push(id);
    registerItem({ id: y.weapon.id, kind: 'weapon', maxLevel: 2, rarityScales: true, levelGate: 4 });
    WEAPON_LEVELS[y.weapon.id] = [{ damage: 1 }];
  }
});
afterEach(() => resetTuning());

function make(yokaiId: string, seed = 3): Run {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus(), yokaiId });
  run.god = true;
  run.director.active = false;
  return run;
}
function place(run: Run, dx: number, dz: number, hp = 1e6): number {
  const i = run.enemies.spawn(kindIndex('villager'), run.px + dx, run.pz + dz, 1, 0, 0);
  run.enemies.hp[i] = run.enemies.maxHp[i] = hp;
  run.enemies.speed[i] = 0;
  return i;
}
const stepN = (run: Run, n: number) => {
  for (let i = 0; i < n; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
};

describe('選卡池跟著妖怪的主武器走（D61）', () => {
  it('itemPoolFor：主武器那一格換成這隻妖怪自己的；其他不變；提燈小僧不變', () => {
    expect(itemPoolFor('ghostfire')[0]).toBe('ghostfire');
    const p = itemPoolFor('w-test-sweep');
    expect(p[0]).toBe('w-test-sweep');
    expect(p).not.toContain('ghostfire');
    expect(p.slice(1)).toEqual(itemPoolFor('ghostfire').slice(1));
  });
  it('Run：假妖怪開局的主武器是自己的、發牌池裡也是', () => {
    const run = make('test-sweep');
    expect(run.weaponItemId).toBe('w-test-sweep');
    expect(run.weaponLevel).toBe(1);
  });
});

describe('sweep：近戰扇形揮擊', () => {
  it('扇形內的人被打到並擊退；扇形外（背後）與射程外的人沒事', () => {
    const run = make('test-sweep');
    const front = place(run, 2, 0); // 最近的 → 朝 +x 揮
    const side = place(run, 2, 1.2); // 夾角約 31°，在 90° 扇形內
    const back = place(run, -2.6, 0); // 比正前方遠，才會朝正前方揮
    const far = place(run, 8, 0);
    stepN(run, 30); // 開局冷卻 0.3 秒
    expect(run.enemies.hp[front], '正前方沒被打到').toBeLessThan(1e6);
    expect(run.enemies.hp[side], '扇形內的側前方沒被打到').toBeLessThan(1e6);
    expect(run.enemies.hp[back], '背後不該被打到').toBe(1e6);
    expect(run.enemies.hp[far], '射程外不該被打到').toBe(1e6);
    expect(run.lastSwing?.shock).toBe(false);
    expect(run.lastSwing!.dx).toBeGreaterThan(0.9);
  });
  it('冷卻：連續揮的間隔 = interval ÷ 攻速；射程內沒人就不揮', () => {
    const run = make('test-sweep');
    stepN(run, 120);
    expect(run.lastSwing, '沒有人卻揮了').toBeNull();
    place(run, 2, 0);
    stepN(run, 20); // 開局冷卻 0.3 秒
    const n0 = run.swingCountForTest;
    stepN(run, 120); // 2 秒，間隔 0.5 秒 → 約 4 下
    const n = run.swingCountForTest - n0;
    expect(n, '2 秒內的揮擊次數').toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
  });
  it('第 shockEvery 下是震波：半徑 ×shockRadius（背後也打到）、傷害 ×shockDamage', () => {
    const run = make('test-sweep');
    const a = place(run, 2, 0);
    const back = place(run, -3.5, 0); // 一般扇形與射程 3 都打不到；震波（360°、半徑 4.5）打得到
    const dmg: number[] = [];
    let last = 1e6;
    for (let sw = 1; sw <= 3; sw++) {
      const before = run.swingCountForTest;
      for (let g = 0; g < 600 && run.swingCountForTest === before; g++) stepN(run, 1);
      expect(run.swingCountForTest, `第 ${sw} 下沒揮`).toBeGreaterThan(before);
      dmg.push(last - run.enemies.hp[a]);
      last = run.enemies.hp[a];
      if (sw < 3) expect(run.enemies.hp[back], `第 ${sw} 下背後不該被打到`).toBe(1e6);
    }
    expect(run.lastSwing!.shock).toBe(true);
    expect(run.enemies.hp[back], '震波沒打到背後').toBeLessThan(1e6);
    expect(dmg[2]).toBeGreaterThan(dmg[0] * 1.8);
  });
  it('打倒會結算（擊殺數增加）', () => {
    const run = make('test-sweep');
    place(run, 2, 0, 5);
    stepN(run, 40);
    expect(run.kills).toBeGreaterThanOrEqual(1);
  });
});

describe('boomerang：飛到盡頭折返、來回都打', () => {
  it('投射物帶歸巢旗標；敵人在去程與回程路上都被打到', () => {
    const run = make('test-boomerang');
    const near = place(run, 4, 0);
    stepN(run, 25);
    expect(run.projectiles.aliveCount).toBeGreaterThan(0);
    let homing = 0;
    for (let i = 0; i < run.projectiles.capacity; i++) if (run.projectiles.alive[i] && run.projectiles.homing[i] > 0) homing++;
    expect(homing, '水盤沒有歸巢旗標').toBeGreaterThan(0);
    stepN(run, 90);
    expect(run.enemies.hp[near], '來回路上的敵人沒被打到').toBeLessThan(1e6);
  });
  it('提燈小僧（projectile）的鬼火不會自己折返（沒有歸巢技法時 homing 一律 0）', () => {
    const run = new Run({ seed: 3, bus: new EventBus() });
    run.god = true;
    run.director.active = false;
    run.enemies.spawn(kindIndex('villager'), run.px + 4, run.pz, 1, 0, 0);
    for (let i = 0; i < 25; i++) run.step(DT);
    expect(run.projectiles.aliveCount).toBeGreaterThan(0);
    for (let i = 0; i < run.projectiles.capacity; i++) if (run.projectiles.alive[i]) expect(run.projectiles.homing[i]).toBe(0);
  });
});
