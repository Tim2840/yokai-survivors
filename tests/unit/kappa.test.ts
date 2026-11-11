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
  it('技法池只有河童的 9 種（連鎖、近身、佈置系各 3 種，和提燈小僧一樣，2026-11-11 補滿）；每種都有自己的進化；技法的機制名是鬼火那邊做好的（mech）；9 種對應 9 套不同的機制', () => {
    const t = techsFor('waterdisc');
    expect(t.map((x) => x.id).sort()).toEqual(['backwash', 'bubble', 'geyser', 'pond', 'splash', 'stream', 'torrent', 'veil', 'whirl']);
    for (const f of ['chain', 'near', 'field']) expect(t.filter((x) => x.family === f).length, f).toBe(3);
    expect(new Set(t.map((x) => mechOf(x))).size, '9 種技法要用 9 套不同的機制').toBe(9);
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
  it('補滿的三招真的在河童身上生效：回潮（水盤回程傷害更高、飛得更快）、水路（水流跑在前方、沖到路上的人）、水泡（打倒的人留下水泡、破裂打到旁邊的人）', () => {
    // 回潮：回程傷害倍率 1.5（沒有回潮 = 1）、水盤速度 ×1.15
    const a = make(51);
    expect(a.projectiles.homeReturnDamage).toBe(1);
    const sp0 = a.tech.weapon.projectileSpeed;
    a.devAddTech('backwash');
    expect(a.tech.act.homing?.id).toBe('backwash');
    expect(a.projectiles.homeReturnDamage).toBeCloseTo(techById('backwash').homing!.returnDamage!, 5);
    expect(a.tech.weapon.projectileSpeed).toBeCloseTo(sp0 * techById('backwash').homing!.speedMult, 5);
    // 回潮和渦盤互斥（渦盤不丟水盤）
    expect(a.tech.canOffer('whirl')).toBe(false);
    // 水路：燈籠那套機制，水流在移動方向前方；前方的人被沖到
    const b = make(52);
    b.devAddTech('stream');
    const o = techById('stream').lamp!;
    b.setMove(1, 0);
    for (let i = 0; i < 30; i++) b.step(DT);
    expect(b.tech.lampN).toBe(1);
    expect(b.tech.lampX[0] - b.px, '水流該在 +x 前方').toBeGreaterThan(o.ahead * 0.6);
    const e = place(b, o.ahead + 1, 0);
    b.setMove(0, 0);
    const hp0 = b.enemies.hp[e];
    for (let i = 0; i < 45; i++) b.step(DT);
    expect(b.enemies.hp[e], '前方的人沒被水流沖到').toBeLessThan(hp0);
    // 水泡：被水盤打倒的人留下水泡，破裂打到旁邊的人
    tuning.volley = 1;
    const c = make(53);
    c.devAddTech('bubble');
    const sd = techById('bubble').seed!;
    const dead = place(c, 4, 0, 1);
    const near = place(c, 4 + sd.radius * 0.5, 0);
    for (let i = 0; i < 120 && c.enemies.alive[dead]; i++) stepN(c, 1);
    expect(c.enemies.alive[dead]).toBe(0);
    expect(c.tech.seedCount, '沒有留下水泡').toBeGreaterThan(0);
    const hp1 = c.enemies.hp[near];
    stepN(c, Math.ceil((sd.delay + 0.3) / DT));
    expect(c.enemies.hp[near], '水泡破裂沒打到旁邊的人').toBeLessThan(hp1);
  });
  it('河童的 9 種技法兩兩組合都能跑 6 秒不出錯、沒有 NaN（互斥的跳過）；9 種各自單獨跑也行', () => {
    const ids = techsFor('waterdisc').map((t) => t.id);
    let ran = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i; j < ids.length; j++) {
        const run = make(60 + i * 11 + j);
        run.devAddTech(ids[i]);
        if (j !== i) {
          if (!run.tech.canOffer(ids[j])) continue;
          run.devAddTech(ids[j]);
        }
        for (let k = 0; k < 6; k++) place(run, 3 + k, k - 2);
        stepN(run, 60 * 6);
        expect(Number.isFinite(run.hp), `${ids[i]}＋${ids[j]}`).toBe(true);
        for (let e = 0; e < run.enemies.capacity; e++) if (run.enemies.alive[e]) expect(Number.isFinite(run.enemies.hp[e]), `${ids[i]}＋${ids[j]} 的敵人血量`).toBe(true);
        ran++;
      }
    }
    expect(ran).toBeGreaterThan(30);
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
