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
  it('技法池只有河童的 9 種（三系各 3 種）；每種都有自己的進化；9 種對應 9 套不同的機制，其中 5 套是河童自己的（D86：渦流、相撲、滑水、水域、水牢），不是換皮', () => {
    const t = techsFor('waterdisc');
    expect(t.map((x) => x.id).sort()).toEqual(['backwash', 'domain', 'geyser', 'prison', 'sumo', 'torrent', 'vortex', 'wake', 'whirl']);
    for (const f of ['chain', 'near', 'field']) expect(t.filter((x) => x.family === f).length, f).toBe(3);
    expect(new Set(t.map((x) => mechOf(x))).size, '9 種技法要用 9 套不同的機制').toBe(9);
    expect(evosFor('waterdisc').map((e) => e.from[1]).sort()).toEqual(t.map((x) => x.id).sort());
    const own = t.filter((x) => mechOf(x) === x.id).map((x) => x.id).sort();
    expect(own, '河童自己的機制').toEqual(['domain', 'prison', 'sumo', 'vortex', 'wake']);
    for (const g of techsFor('ghostfire')) expect(own).not.toContain(mechOf(g));
    const run = make(5);
    run.level = 40;
    const rng = new Rng(2);
    for (let k = 0; k < 400; k++) {
      const id = run.tech.pickCard(rng)!;
      expect(t.map((x) => x.id), `河童抽到不是自己的技法 ${id}`).toContain(id);
    }
  });
  it('水盤打得到人；「激流盤」用彈跳的機制生效；「回潮」回程傷害 ×1.5、水盤更快、和渦盤互斥', () => {
    const run = make(7);
    const a0 = place(run, 4, 0, 40);
    stepN(run, 90);
    expect(run.enemies.hp[a0], '水盤沒打到人').toBeLessThan(40);
    const r2 = make(7);
    r2.devAddTech('torrent');
    expect(r2.tech.act.bounce?.id).toBe('torrent');
    const near = place(r2, 4, 0, 1e6);
    const far = place(r2, 8, 1, 1e6);
    stepN(r2, 120);
    expect(r2.enemies.hp[near] < 1e6 || r2.enemies.hp[far] < 1e6).toBe(true);
    const a = make(51);
    expect(a.projectiles.homeReturnDamage).toBe(1);
    const sp0 = a.tech.weapon.projectileSpeed;
    a.devAddTech('backwash');
    expect(a.projectiles.homeReturnDamage).toBeCloseTo(techById('backwash').homing!.returnDamage!, 5);
    expect(a.tech.weapon.projectileSpeed).toBeCloseTo(sp0 * techById('backwash').homing!.speedMult, 5);
    expect(a.tech.canOffer('whirl')).toBe(false);
  });
  it('渦流：命中處生出漩渦，把周圍的人往中心拉（距離變近）、持續受傷', () => {
    tuning.volley = 1;
    const run = make(61);
    run.devAddTech('vortex');
    const v = techById('vortex').vortex!;
    place(run, 5, 0);
    const side = place(run, 5, v.radius * 0.8);
    for (let i = 0; i < 240 && run.tech.vortexCount === 0; i++) stepN(run, 1);
    expect(run.tech.vortexCount, '命中後沒有漩渦').toBeGreaterThan(0);
    const k = Array.from(run.tech.vortLife).findIndex((x) => x > 0);
    const d0 = Math.hypot(run.enemies.x[side] - run.tech.vortX[k], run.enemies.z[side] - run.tech.vortZ[k]);
    const hp0 = run.enemies.hp[side];
    stepN(run, 60);
    const d1 = Math.hypot(run.enemies.x[side] - run.tech.vortX[k], run.enemies.z[side] - run.tech.vortZ[k]);
    expect(d1, `旁邊的人沒有被拉近（${d0} → ${d1}）`).toBeLessThan(d0 - 0.5);
    expect(run.enemies.hp[side], '漩渦沒有傷害').toBeLessThan(hp0);
    expect(run.tech.vortexCount).toBeLessThanOrEqual(v.max);
  });
  it('滑水：站著不動沒有水痕；移動時身後留下水痕，踩到的人受傷、變慢；時間到水痕消失', () => {
    const run = make(62);
    run.devAddTech('wake');
    const w = techById('wake').wake!;
    stepN(run, 60);
    expect(run.tech.wakeCount, '沒動不該有水痕').toBe(0);
    const x0 = run.px;
    const z0 = run.pz;
    run.setMove(1, 0);
    stepN(run, 90);
    expect(run.tech.wakeCount, '移動後沒有水痕').toBeGreaterThan(1);
    (run.tech as unknown as { act: { ring: unknown } }).act.ring = {}; // 不丟水盤，只看水痕
    const k = Array.from(run.tech.wakeLife).findIndex((x) => x > 0.8);
    const e = place(run, run.tech.wakeX[k] - run.px, run.tech.wakeZ[k] - run.pz);
    void x0;
    void z0;
    const hp0 = run.enemies.hp[e];
    run.setMove(0, 0);
    stepN(run, Math.ceil((w.tick * 1.5) / DT));
    expect(run.enemies.hp[e], '踩到水痕的人沒受傷').toBeLessThan(hp0);
    expect(run.enemies.slowBy[e], '踩到水痕的人沒變慢').toBeCloseTo(w.slow, 5);
    stepN(run, Math.ceil((w.seconds + 0.5) / DT));
    expect(run.tech.wakeCount, '水痕沒有消失').toBe(0);
  });
  it('相撲：前方沒人不出手；前方有人 → 推飛（受傷、被推遠），身後的人也受傷；背後的人不受影響', () => {
    const run = make(63);
    run.devAddTech('sumo');
    const sm = techById('sumo').sumo!;
    run.setMove(1, 0);
    stepN(run, 12);
    run.setMove(0, 0);
    stepN(run, 30);
    expect(run.tech.sumoAt, '前方沒人不該出手').toBe(-1);
    (run.tech as unknown as { act: { ring: unknown } }).act.ring = {}; // 不丟水盤，只看相撲
    const front = place(run, sm.reach * 0.6, 0);
    const behindIt = place(run, sm.reach + sm.chainRadius * 0.6, 0);
    const back = place(run, -2, 0);
    const xf = run.enemies.x[front];
    stepN(run, 20);
    expect(run.tech.sumoAt).toBeGreaterThan(0);
    expect(run.enemies.hp[front], '前方的人沒受傷').toBeLessThan(1e6);
    expect(run.enemies.x[front], '前方的人沒被推開').toBeGreaterThan(xf + 0.5);
    expect(run.enemies.hp[behindIt], '身後的人沒被撞到').toBeLessThan(1e6);
    expect(run.enemies.hp[back], '背後的人不該受傷').toBe(1e6);
  });
  it('水域：命中處留下水域（不傷人）；裡面的敵人變慢；河童走進去攻擊速度、回復變高，走出來恢復；最多 max 片', () => {
    tuning.volley = 1;
    const run = make(64);
    run.devAddTech('domain');
    const dm = techById('domain').domain!;
    const e = place(run, 5, 0);
    for (let i = 0; i < 240 && run.tech.domainCount === 0; i++) stepN(run, 1);
    expect(run.tech.domainCount).toBeGreaterThan(0);
    stepN(run, 10);
    expect(run.enemies.slowBy[e], '水域裡的敵人沒變慢').toBeCloseTo(dm.slow, 5);
    expect(run.tech.inDomain).toBe(false);
    const s0 = { ...run.stats.value };
    const k = Array.from(run.tech.domLife).findIndex((x) => x > 0);
    run.devTeleport(run.tech.domX[k], run.tech.domZ[k]);
    stepN(run, 2);
    expect(run.tech.inDomain).toBe(true);
    expect(run.stats.value.atkSpeed).toBeCloseTo(s0.atkSpeed * (1 + dm.selfAtkSpeed), 4);
    expect(run.stats.value.regen).toBeCloseTo(s0.regen + dm.selfRegen, 4);
    run.enemies.alive.fill(0);
    stepN(run, Math.ceil((dm.seconds + 1) / DT));
    expect(run.tech.inDomain, '水域消失後還有加成').toBe(false);
    expect(run.stats.value.atkSpeed).toBeCloseTo(s0.atkSpeed, 4);
  });
  it('水牢：被打倒的人留下水泡；沒人碰就等著（不自己爆）；有人碰到 → 周圍的人被困住（不能動）並受傷；頭目不被困住', () => {
    tuning.volley = 1;
    const run = make(65);
    run.devAddTech('prison');
    const pr = techById('prison').prison!;
    const dead = place(run, 4, 0, 1);
    for (let i = 0; i < 120 && run.enemies.alive[dead]; i++) stepN(run, 1);
    expect(run.enemies.alive[dead]).toBe(0);
    expect(run.tech.seedCount, '沒有留下水泡').toBe(1);
    stepN(run, 60);
    expect(run.tech.seedCount, '沒人碰不該自己爆').toBe(1);
    expect(run.tech.prisonTrips).toBe(0);
    const k = Array.from(run.tech.seedT).findIndex((x) => x > 0);
    (run.tech as unknown as { act: { ring: unknown } }).act.ring = {}; // 不丟水盤
    const e = place(run, run.tech.seedX[k] - run.px + 0.3, run.tech.seedZ[k] - run.pz);
    stepN(run, 3);
    expect(run.tech.prisonTrips).toBe(1);
    expect(run.enemies.hold[e], '碰到水泡的人沒被困住').toBeGreaterThan(pr.hold - 0.5);
    expect(run.enemies.hp[e], '水牢沒有傷害').toBeLessThan(1e6);
    run.enemies.speed[e] = 3;
    const ex = run.enemies.x[e];
    stepN(run, 30);
    expect(Math.abs(run.enemies.x[e] - ex), '被困住還在走').toBeLessThan(0.05);
    const boss = place(run, 9, 9);
    run.enemies.variant[boss] = 2;
    run.enemies.applyHold(boss, 5);
    expect(run.enemies.hold[boss]).toBe(0);
  });
  it('間歇泉：噴到的人被沖上天（定身）、落地時再受一次傷害', () => {
    const run = make(66);
    run.devAddTech('geyser');
    const p = techById('geyser').pillar!;
    expect(p.launchSeconds).toBeGreaterThan(0);
    (run.tech as unknown as { act: { ring: unknown } }).act.ring = {}; // 不丟水盤，只看水柱
    const e = place(run, 5, 0);
    for (let i = 0; i < 400 && run.enemies.hp[e] === 1e6; i++) stepN(run, 1);
    const hp1 = run.enemies.hp[e];
    expect(hp1, '水柱沒打到').toBeLessThan(1e6);
    expect(run.enemies.hold[e], '沒有被沖上天').toBeGreaterThan(0);
    stepN(run, Math.ceil((p.launchSeconds! + 0.1) / DT));
    expect(run.enemies.hp[e], '落地沒有再受傷').toBeLessThan(hp1);
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
