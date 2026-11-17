import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { YOKAI } from '../../src/data/yokai';
import { itemPoolFor } from '../../src/data/items';
import { kindIndex } from '../../src/systems/enemies';

const DT = 1 / 60;
/** 赤鬼開一局：清場、停湧出；回傳 run 與「在 (dx, dz) 放一隻很硬的村人」 */
function oni(seed = 7) {
  const run = new Run({ seed, bus: new EventBus(), yokaiId: 'aka-oni' });
  const en = run.enemies;
  for (let i = 0; i < en.high; i++) if (en.alive[i]) en.kill(i);
  run.director.active = false;
  /** 放好的人每一步都釘回原位（金棒有擊退，被打飛之後「最近的那隻」會換人） */
  const pins: [number, number, number][] = [];
  const put = (dx: number, dz: number, hp = 1e6) => {
    const i = en.spawn(kindIndex('villager'), run.px + dx, run.pz + dz, 1, 0, 0, 0, 1);
    en.hp[i] = en.maxHp[i] = hp;
    en.speed[i] = 0;
    pins.push([i, run.px + dx, run.pz + dz]);
    en.update(0, run.px, run.pz, run.flow, 0, 0);
    return i;
  };
  (run as unknown as { __pins: typeof pins }).__pins = pins;
  return { run, en, put };
}
/** 跑 sec 秒：不選卡（避免抽到連打之類改變揮擊次數的卡）、每步把釘住的人放回原位 */
const step = (run: Run, sec: number) => {
  const pins = (run as unknown as { __pins: [number, number, number][] }).__pins ?? [];
  for (let i = 0; i < Math.round(sec / DT); i++) {
    while (run.awaitingPick) run.chooseCard(0);
    for (const [e, x, z] of pins) run.enemies.relocate(e, x, z);
    run.step(DT);
  }
};

describe('赤鬼（docs/35）', () => {
  it('選卡池：揮擊沒效果的多重、碎裂、穿透不出現；揮擊專用的連打、長柄只給赤鬼', () => {
    const pool = itemPoolFor(YOKAI['aka-oni'].weapon.id);
    for (const id of ['volley', 'splash', 'pierce']) expect(pool).not.toContain(id);
    expect(pool).toContain('combo');
    expect(pool).toContain('reach');
    for (const y of ['chochin-kozo', 'kappa']) for (const id of ['combo', 'reach']) expect(itemPoolFor(YOKAI[y].weapon.id), `${y} 不該抽到 ${id}`).not.toContain(id);
  });

  it('金棒：只打前方扇形（背後的人不受傷），第 3 下是 360° 震波', () => {
    const { run, en, put } = oni();
    const front = put(2, 0);
    const back = put(-2.6, 0);
    let swings = 0;
    for (let i = 0; i < 600 && run.swingCountForTest < 2; i++) step(run, DT);
    swings = run.swingCountForTest;
    expect(swings).toBe(2);
    expect(en.hp[front]).toBeLessThan(1e6);
    expect(en.hp[back], '前兩下是扇形，背後的不該被打').toBe(1e6);
    for (let i = 0; i < 600 && run.swingCountForTest < 3; i++) step(run, DT);
    expect(run.lastSwing?.shock).toBe(true);
    expect(en.hp[back], '第 3 下震波打到背後').toBeLessThan(1e6);
  });

  it('怒氣：被打一次 +1 層、攻擊力跟著加；不被打一陣子會掉；最多 10 層', () => {
    const { run } = oni();
    const p0 = run.stats.value.power;
    (run as unknown as { hurtPlayer(n: number): boolean }).hurtPlayer(1);
    expect(run.rage).toBe(1);
    expect(run.stats.value.power).toBeCloseTo(p0 * (1 + 0.03), 5);
    for (let k = 0; k < 20; k++) (run as unknown as { hurtPlayer(n: number): boolean }).hurtPlayer(1);
    expect(run.rage).toBe(10);
    expect(run.resource).toEqual({ kind: 'rage', value: 10, max: 10 });
    run.hp = run.maxHp;
    step(run, 5.2);
    expect(run.rage).toBe(9);
  });

  it('連打（道具）與連擊（技法）：揮完之後多揮一下；長柄讓半徑變大', () => {
    const { run, put } = oni();
    put(2, 0);
    const r0 = run.swingReach;
    run.give('reach', 'common');
    expect(run.swingReach).toBeGreaterThan(r0);
    run.devAddTech('combo');
    step(run, 0.05);
    const s0 = run.lastSwing?.at ?? -1;
    for (let i = 0; i < 600 && (run.lastSwing?.at ?? -1) === s0; i++) step(run, DT);
    const first = run.lastSwing!.at;
    step(run, 0.3);
    expect(run.lastSwing!.at, '連擊：0.22 秒後應該又揮了一下').toBeGreaterThan(first);
  });

  it('旋風棒：一般揮擊也打到背後；重擊：每 2 下一次震波；地裂：震波沿方向打到遠處的人', () => {
    const a = oni();
    const back = a.put(-2, 0);
    a.put(2, 0);
    a.run.devAddTech('spin');
    for (let i = 0; i < 600 && a.run.swingCountForTest < 1; i++) step(a.run, DT);
    expect(a.en.hp[back]).toBeLessThan(1e6);
    const b = oni();
    b.put(2, 0);
    b.run.devAddTech('heavy');
    for (let i = 0; i < 900 && b.run.swingCountForTest < 2; i++) step(b.run, DT);
    expect(b.run.lastSwing?.shock).toBe(true);
    const c = oni();
    c.put(2, 0);
    const far = c.put(6, 0);
    c.run.devAddTech('rift');
    for (let i = 0; i < 1200 && c.run.swingCountForTest < 3; i++) step(c.run, DT);
    expect(c.en.hp[far], '震波半徑外、在裂縫上的人要受傷').toBeLessThan(1e6);
  });

  it('大招：鬼神化減傷；金棒大震定住附近的人', () => {
    const { run, en, put } = oni();
    const i = put(4, 0);
    run.devSetUlt('oniGod');
    run.ultCharge = 100;
    expect(run.castUltimate()).toBe(true);
    expect(run.frenzyGuard).toBeGreaterThan(0);
    const hp0 = run.hp;
    (run as unknown as { hurtPlayer(n: number): boolean }).hurtPlayer(10);
    const lost = hp0 - run.hp;
    run.frenzyGuard = 0;
    run.hp = hp0;
    (run as unknown as { hurtPlayer(n: number): boolean }).hurtPlayer(10);
    expect(lost).toBeLessThan(hp0 - run.hp);
    const b = oni();
    const j = b.put(4, 0);
    b.en.speed[j] = 2;
    b.run.devSetUlt('kanaboQuake');
    b.run.ultCharge = 100;
    expect(b.run.castUltimate()).toBe(true);
    expect(b.en.hold[j]).toBeGreaterThan(1);
    void en;
    void i;
  });
});
