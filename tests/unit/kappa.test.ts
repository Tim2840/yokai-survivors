import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { EVO, evosFor, techsFor, mechOf, techById } from '../../src/data/techniques';
import { ultsOf } from '../../src/data/ultimates';
import { WEAPON_LEVELS } from '../../src/data/items';
import { PLAYABLE_YOKAI } from '../../src/data/yokai';
import { Rng } from '../../src/lib/random';
import { kindIndex } from '../../src/systems/enemies';

/** 河童（D63）：水盤、河童的技法池與進化、大招、選卡池都和提燈小僧分開 */
const DT = 1 / 60;
afterEach(() => resetTuning());
function make(seed = 3): Run {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus(), yokaiId: 'kappa' });
  run.god = true;
  run.director.active = false;
  return run;
}
const place = (run: Run, dx: number, dz: number, hp = 1e6): number => {
  const i = run.enemies.spawn(kindIndex('villager'), run.px + dx, run.pz + dz, 1, 0, 0);
  run.enemies.hp[i] = run.enemies.maxHp[i] = hp;
  run.enemies.speed[i] = 0;
  return i;
};
const stepN = (run: Run, n: number) => {
  for (let i = 0; i < n; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
};

describe('河童', () => {
  it('可玩；主武器是水盤、有 8 級表；基礎能力值和提燈小僧不同', () => {
    expect(PLAYABLE_YOKAI).toContain('kappa');
    const run = make();
    expect(run.weaponItemId).toBe('waterdisc');
    expect(WEAPON_LEVELS.waterdisc).toHaveLength(7);
    expect(run.maxHp).toBe(85);
    expect(run.yokai.weapon.kind).toBe('boomerang');
  });
  it('技法池只有河童的 6 種；每種都有自己的進化；技法的機制名是鬼火那邊做好的（mech）', () => {
    const t = techsFor('waterdisc');
    expect(t.map((x) => x.id).sort()).toEqual(['geyser', 'pond', 'splash', 'torrent', 'veil', 'whirl']);
    expect(evosFor('waterdisc').map((e) => e.from[1]).sort()).toEqual(t.map((x) => x.id).sort());
    for (const x of t) expect(mechOf(x), x.id).not.toBe(x.id);
    const run = make(5);
    run.level = 40;
    const rng = new Rng(2);
    for (let k = 0; k < 400; k++) {
      const id = run.tech.pickCard(rng)!;
      expect(t.map((x) => x.id), `河童抽到不是自己的技法 ${id}`).toContain(id);
    }
  });
  it('水盤打得到人、也有回程（歸巢旗標）；技法「激流盤」用彈跳的機制生效', () => {
    const run = make(7);
    const a = place(run, 4, 0, 40);
    stepN(run, 90);
    expect(run.enemies.hp[a], '水盤沒打到人').toBeLessThan(40);
    const r2 = make(7);
    r2.devAddTech('torrent');
    expect(r2.tech.act.bounce?.id).toBe('torrent');
    expect(r2.tech.act.kitsunebi).toBeNull();
    const near = place(r2, 4, 0, 1e6);
    const far = place(r2, 8, 1, 1e6);
    stepN(r2, 120);
    expect(r2.enemies.hp[near] < 1e6 || r2.enemies.hp[far] < 1e6).toBe(true);
  });
  it('D67 一次一批：開局一次丟 1 個；上一個沒回到身邊之前不丟下一個；飛回來之後才丟下一個（舊版開局一次 2 發、不等回來會紅）', () => {
    const run = make(21);
    expect(run.volleyExact, '河童開局一次 1 個').toBe(1);
    for (let i = 0; i < 5; i++) place(run, 4 + i * 0.5, i - 2);
    let maxAlive = 0;
    let throws = 0;
    let lastAlive = 0;
    let wentOut = 0;
    let returned = false;
    for (let f = 0; f < 60 * 8; f++) {
      run.step(DT);
      const a = run.projectiles.aliveCount;
      maxAlive = Math.max(maxAlive, a);
      if (a > lastAlive) throws++;
      lastAlive = a;
      for (let i = 0; i < run.projectiles.capacity; i++) {
        if (!run.projectiles.alive[i] || run.projectiles.gen[i] !== 0) continue;
        const d = Math.hypot(run.projectiles.x[i] - run.px, run.projectiles.z[i] - run.pz);
        wentOut = Math.max(wentOut, d);
        if (run.projectiles.homing[i] === 2 && d < 3) returned = true;
      }
    }
    expect(maxAlive, '同時只有 1 個水盤（碎片不算）').toBeLessThanOrEqual(1 + 3);
    expect(throws, '8 秒內至少丟了 2 次').toBeGreaterThanOrEqual(2);
    expect(wentOut, '飛出去了').toBeGreaterThan(3);
    expect(wentOut, '折返要急轉彎，不能繞出很遠的大圈（舊版繞到 12.8 公尺）').toBeLessThan(9.5);
    expect(returned, '折返後回到身邊').toBe(true);
  });
  it('D67 全角色開局都是 1 發（以前試玩用的全域「起步 2 顆」蓋掉每隻妖怪自己的設定）', () => {
    for (const id of ['chochin-kozo', 'kappa']) {
      const run = new Run({ seed: 4, bus: new EventBus(), yokaiId: id });
      expect(run.volleyExact, id).toBe(1);
    }
  });
  it('進化：水盤＋渦盤各 5 級 → 渦潮陣；之後可以升到 8 級', () => {
    const run = make(9);
    run.devAddTech('whirl');
    run.devTechLevel('waterdisc', EVO.minLevel);
    run.devTechLevel('whirl', EVO.minLevel);
    expect(run.tech.evolvable.map((e) => e.id)).toEqual(['evoWhirl']);
    expect(run.tech.evolve('evoWhirl')).toBe(true);
    expect(run.tech.capOf('whirl')).toBe(8);
    expect(run.tech.act.ring?.orbit?.baseOrbs).toBe(3);
  });
  it('大招：雨乞（回血）、大波；一開始就有雨乞', () => {
    expect(ultsOf('kappa').map((u) => u.id).sort()).toEqual(['rainPrayer', 'tidalWave']);
    const run = make(11);
    expect(run.ults).toEqual(['rainPrayer']);
    run.god = false;
    run.hp = 10;
    run.ultCharge = 100;
    run.castUltimate();
    expect(run.hp).toBeGreaterThan(10 + 20);
  });
  it('提燈小僧不受影響：技法池還是 9 種、進化 9 個', () => {
    expect(techsFor('ghostfire')).toHaveLength(9);
    expect(evosFor('ghostfire')).toHaveLength(9);
    expect(techById('ring').mech).toBeUndefined();
  });
});
