import { afterEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { STAGE } from '../../src/data/stage';
import { MOVE } from '../../src/data/movement';
import { xpNeed } from '../../src/data/progression';
import type { MapDef } from '../../src/data/maps/prototype';
import { makeHighlands } from '../../src/data/maps/highlands';

const DT = 1 / 60;

/** 平地、沒有障礙的測試地圖；可選一座台地（全是懸崖，沒有緩坡）放在 (10,0)，半徑 5.5 讓邊緣（x = 4.5）落在兩個頂點之間 */
function flatMap(plateauHeight = 0): MapDef {
  return {
    id: 'test',
    size: { w: 80, d: 80 },
    cell: 1,
    noiseSeed: 1,
    noiseHeight: 0,
    hills: [],
    zones: [],
    obstacles: [],
    playerStart: { x: 0, z: 0 },
    plateaus: plateauHeight > 0 ? [{ x: 10, z: 0, r: 5.5, height: plateauHeight, rampDir: 0, rampWidth: 0, cliffEdge: 0.01 }] : [],
  };
}

function make(seed = 1, opts: { map?: MapDef; bus?: EventBus } = {}) {
  const bus = opts.bus ?? new EventBus();
  const run = new Run({ seed, bus, mapFor: opts.map ? () => opts.map! : undefined });
  return { run, bus };
}

/** 機器人：繞圈風箏、自動選第一張卡、過關畫面立刻出發 */
function botStep(run: Run, t: number) {
  if (run.awaitingPick) {
    run.chooseCard(0);
    return;
  }
  if (run.phase === 'intermission') {
    run.continueFromIntermission();
    return;
  }
  const a = t * 0.8;
  run.setMove(Math.cos(a), Math.sin(a));
  run.step(DT);
}

afterEach(() => resetTuning());

describe('連續計時關卡（D22）', () => {
  it('湧出速率隨時間升高：開場 < 尾聲；虛擬波數 1 → 20 後不再增加', () => {
    const { run } = make();
    const d = run.director;
    expect(d.virtualWave(0)).toBe(1);
    expect(d.virtualWave(d.duration)).toBe(20);
    expect(d.virtualWave(d.duration * 2)).toBe(20);
    expect(d.rate(0)).toBeLessThan(d.rate(d.duration / 2));
    expect(d.rate(d.duration / 2)).toBeLessThan(d.rate(d.duration));
    // 2.5 倍時開場約 1.6、尾聲約 13.5 點／秒（docs/02 第 8.1 節）
    expect(d.rate(0)).toBeCloseTo((13 / 20) * 2.5, 5);
    expect(d.rate(d.duration)).toBeCloseTo((108 / 20) * 2.5, 5);
  });

  it('定時事件：精英在 25% 出現、小高潮在 50% 速率加倍、頭目在 80% 出現（縮短成 60 秒的關卡）', () => {
    tuning.stageSeconds = 60;
    tuning.countScale = 1;
    const { run } = make(2, { map: flatMap() });
    run.god = true;
    const seen = { elite: 0, boss: 0 };
    let surgeRate = 0;
    let beforeRate = 0;
    for (let i = 0; i < 60 * 60; i++) {
      run.setMove(0, 0);
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
      if (Math.abs(run.time - 29.9) < DT / 2) beforeRate = run.director.rate();
      if (Math.abs(run.time - 30.5) < DT / 2) surgeRate = run.director.rate();
      if (Math.abs(run.time - 14) < DT / 2) expect([...run.enemies.variant].some((v, k) => v === 1 && run.enemies.alive[k])).toBe(false);
      if (Math.abs(run.time - 16) < DT / 2) seen.elite = [...run.enemies.variant].filter((v, k) => v === 1 && run.enemies.alive[k]).length;
      if (Math.abs(run.time - 47) < DT / 2) expect(run.director.bossSpawned).toBe(false);
      if (Math.abs(run.time - 49) < DT / 2) seen.boss = [...run.enemies.variant].filter((v, k) => v === 2 && run.enemies.alive[k]).length;
    }
    expect(seen.elite).toBeGreaterThanOrEqual(1);
    expect(seen.boss).toBe(1);
    expect(surgeRate / beforeRate).toBeGreaterThan(1.9);
  });

  it('精英：HP ×4、傷害 ×1.5、體型 ×1.4、魂火 ×5；頭目 HP 固定（不吃虛擬波數）', () => {
    const { run } = make(3, { map: flatMap() });
    const e = run.enemies;
    const v = e.spawn(0, 20, 0, 10, 0, 0, 0, 1);
    const el = e.spawn(0, 21, 0, 10, 0, 0, 1, 1);
    expect(e.maxHp[el] / e.maxHp[v]).toBeCloseTo(STAGE.elite.hp);
    expect(e.damage[el] / e.damage[v]).toBeCloseTo(STAGE.elite.damage);
    expect(e.scale[el]).toBeCloseTo(STAGE.elite.scale);
    expect(e.points(el)).toBe(STAGE.elite.orbMult);
    const b1 = e.spawn(1, 22, 0, 1, 0, 0, 2, 1);
    const b2 = e.spawn(1, 23, 0, 20, 0, 0, 2, 1);
    expect(e.maxHp[b1]).toBe(e.maxHp[b2]);
  });

  it('同畫面敵人滿了（手機 200 隻）時，頭目一定生得出來（擠掉最遠的一般敵人）', () => {
    tuning.stageSeconds = 60;
    tuning.countScale = 60;
    const bus = new EventBus();
    const run = new Run({ seed: 12, bus, mobile: true });
    run.god = true;
    run.setMove(0, 0);
    run.devSetTime(30);
    for (let i = 0; i < 60 * 8 && run.enemies.aliveCount < run.enemies.capacity; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.enemies.aliveCount).toBe(run.enemies.capacity);
    run.devSetTime(48);
    for (let i = 0; i < 120; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.director.bossIndex).toBeGreaterThanOrEqual(0);
    expect(run.enemies.variant[run.director.bossIndex]).toBe(2);
    expect(run.enemies.aliveCount).toBeLessThanOrEqual(run.enemies.capacity);
  });

  it('打倒頭目 → 傳送門開、發 bossDown；走進去 → 過關（發 stageClear、進過關畫面）；出發 → 第 2 關換地圖、敵人 HP ×1.5', () => {
    tuning.stageSeconds = 60;
    const { run, bus } = make(4, { map: undefined });
    const log: string[] = [];
    bus.on('bossDown', (e) => log.push(`boss${e.stage}`));
    bus.on('stageClear', (e) => log.push(`clear${e.stage}${e.last ? 'L' : ''}`));
    bus.on('stageStart', (e) => log.push(`start${e.stage}`));
    run.god = true;
    run.devSetTime(48);
    for (let i = 0; i < 30; i++) run.step(DT);
    expect(run.director.bossIndex).toBeGreaterThanOrEqual(0);
    expect(run.portal.active).toBe(false);
    expect(run.devKillBoss()).toBe(true);
    expect(run.portal.active).toBe(true);
    expect(run.bossesDefeated).toBe(1);
    const map1 = run.map.def.id + JSON.stringify(run.map.def.hills[0]);
    // 玩家傳送到傳送門旁，真的走進去
    run.devTeleport(run.portal.x - 3, run.portal.z);
    let guard = 0;
    while (run.phase === 'combat' && guard++ < 600) {
      run.setMove(run.portal.x - run.px, run.portal.z - run.pz);
      run.step(DT);
    }
    expect(run.phase).toBe('intermission');
    expect(log).toEqual(['boss1', 'clear1']);
    run.continueFromIntermission();
    expect(run.stageNumber).toBe(2);
    expect(run.phase).toBe('combat');
    expect(run.map.def.id + JSON.stringify(run.map.def.hills[0])).not.toBe(map1);
    expect(run.portal.active).toBe(false);
    expect(run.enemies.aliveCount).toBe(0);
    const i = run.enemies.spawn(0, 30, 0, 1, 0, 0, 0, 1 + STAGE.hpPerStage * 1);
    expect(run.enemies.maxHp[i]).toBeCloseTo(10 * 1.5 * tuning.hpScale);
    expect(log.slice(2)).toEqual(['start2']);
  });

  it('最後一關的傳送門 → 勝利（runEnd victory、功德含首次通關）', () => {
    tuning.stageSeconds = 60;
    const { run, bus } = make(5);
    let end: { result: string; merit: number; stage: number } | null = null;
    bus.on('runEnd', (e) => (end = e));
    run.god = true;
    for (let s = 0; s < STAGE.count; s++) {
      while (run.awaitingPick) run.chooseCard(0); // 過關清場收進的魂火可能升級，模擬在選卡前是凍結的（D15）
      run.devSetTime(48);
      for (let i = 0; i < 30; i++) run.step(DT);
      run.devKillBoss();
      run.devTeleport(run.portal.x - 3, run.portal.z);
      let guard = 0;
      while (run.phase === 'combat' && guard++ < 600) {
        run.setMove(run.portal.x - run.px, run.portal.z - run.pz);
        if (run.awaitingPick) run.chooseCard(0);
        run.step(DT);
      }
      if (run.phase === 'intermission') run.continueFromIntermission();
    }
    expect(run.bossesDefeated, `打倒的頭目數 ${run.bossesDefeated}、階段 ${run.phase}、第 ${run.stageNumber} 關、傳送門 ${JSON.stringify(run.portal)}、玩家 ${run.px.toFixed(1)},${run.pz.toFixed(1)}`).toBe(STAGE.count);
    expect(run.phase).toBe('ended');
    expect(end!.result).toBe('victory');
    expect(end!.stage).toBe(STAGE.count);
    expect(end!.merit).toBeGreaterThanOrEqual(120 * STAGE.count + 100 * STAGE.count + 200);
  });

  it('最終蜂群：時間歸零而頭目還活著 → 速率 ×3、精英每 20 秒一隻、傳送門不開', () => {
    tuning.stageSeconds = 30;
    tuning.countScale = 1;
    const { run } = make(6, { map: flatMap() });
    run.god = true;
    run.devSetTime(29.9);
    run.director.eventsFired = STAGE.events.length;
    run.director.bossSpawned = true; // 頭目還沒生（假裝出了但沒被打死）
    for (let i = 0; i < 20; i++) run.step(DT);
    expect(run.director.swarm).toBe(true);
    expect(run.director.rate()).toBeCloseTo(run.director.rate(30) , 5);
    expect(run.director.rate() / ((108 / 20) * 1)).toBeCloseTo(STAGE.swarm.rateMult, 5);
    expect(run.portal.active).toBe(false);
    expect(run.timeLeft).toBe(0);
  });
});

describe('跳躍（D24）', () => {
  const settle = (run: Run, steps = 10) => {
    for (let i = 0; i < steps; i++) run.step(DT);
  };

  it('高度約 1.2 公尺、滯空約 0.7 秒、落地後回到地面', () => {
    const { run } = make(1, { map: flatMap() });
    settle(run);
    run.requestJump();
    let apex = 0;
    let air = 0;
    for (let i = 0; i < 120; i++) {
      run.step(DT);
      apex = Math.max(apex, run.py);
      if (!run.grounded) air += DT;
    }
    expect(apex).toBeGreaterThan(1.1);
    expect(apex).toBeLessThan(1.3);
    expect(air).toBeGreaterThan(0.6);
    expect(air).toBeLessThan(0.8);
    expect(run.grounded).toBe(true);
    expect(run.py).toBeCloseTo(run.map.heightAt(run.px, run.pz), 5);
  });

  it('土狼時間：走出平台邊緣後 0.1 秒內還能跳；超過就不行', () => {
    const { run } = make(1, { map: flatMap(1) });
    run.devTeleport(14, 0); // 平台頂（高 1）
    expect(run.grounded).toBe(true);
    settle(run, 5);
    expect(run.py).toBeCloseTo(1, 1);
    // 往 +x 走出邊緣（邊緣在 x = 15.5），掉下去
    run.setMove(1, 0);
    let steps = 0;
    while (run.grounded && steps++ < 200) run.step(DT);
    expect(run.grounded).toBe(false);
    run.requestJump(); // 剛離開：在土狼時間內
    run.step(DT);
    expect(run.vy).toBeGreaterThan(0);
    // 對照組：落地後等 0.3 秒再跳，在空中（沒有土狼）
    const b = make(1, { map: flatMap(1) }).run;
    b.devTeleport(14, 0);
    b.setMove(1, 0);
    steps = 0;
    while (b.grounded && steps++ < 200) b.step(DT);
    for (let i = 0; i < 9; i++) b.step(DT); // 0.15 秒：超過土狼時間 0.1 秒，但還在空中（落 1 公尺要約 0.32 秒）
    expect(b.grounded).toBe(false);
    b.requestJump();
    b.step(DT);
    expect(b.vy).toBeLessThan(0); // 沒有被加上起跳速度，還在往下掉
  });

  it('跳躍緩衝：落地前 0.1 秒按跳，落地瞬間起跳', () => {
    const { run } = make(1, { map: flatMap() });
    settle(run);
    run.requestJump();
    // 等到快落地
    for (let i = 0; i < 200 && !(run.py < 0.2 && run.vy < 0); i++) run.step(DT);
    run.requestJump();
    let jumped = false;
    for (let i = 0; i < 12; i++) {
      run.step(DT);
      if (run.vy > 3) jumped = true;
    }
    expect(jumped).toBe(true);
  });

  it('1 公尺的台階：走不上去（撞牆）、跳起來走得上去；3 公尺的懸崖：跳也上不去', () => {
    const walk = (h: number, jump: boolean) => {
      const { run } = make(1, { map: flatMap(h) });
      run.devTeleport(0, 0);
      run.setMove(1, 0);
      for (let i = 0; i < 45; i++) run.step(DT); // 先跑 0.75 秒（約 3 公尺），真玩家是跑著跳
      if (jump) run.requestJump();
      for (let i = 0; i < 80; i++) run.step(DT);
      return { x: run.px, y: run.py };
    };
    const a = walk(1, false);
    expect(a.x).toBeLessThan(4.6); // 台地邊緣在 x = 4.5
    const b = walk(1, true);
    expect(b.x).toBeGreaterThan(6);
    expect(b.y).toBeGreaterThan(0.9);
    const c = walk(3, true);
    expect(c.x).toBeLessThan(4.6);
  });

  it('接觸傷害看高度：站在敵人旁會受傷；跳到最高點時不會被這隻碰到', () => {
    const hit = (airborne: boolean) => {
      const { run } = make(1, { map: flatMap() });
      settle(run, 3);
      run.enemies.spawn(0, 0.5, 0, 1, 0, 0, 0, 1);
      run.enemies.contactCd[0] = 0;
      run.enemies.speed[0] = 0;
      if (airborne) {
        run.requestJump();
        for (let i = 0; i < 15; i++) run.step(DT); // 到接近最高點
        expect(run.py).toBeGreaterThan(MOVE.contactClear);
      }
      const hp0 = run.hp;
      run.invul = 0;
      for (let i = 0; i < 6; i++) run.step(DT);
      return run.hp < hp0;
    };
    expect(hit(false)).toBe(true);
    expect(hit(true)).toBe(false);
  });

  it('空中的操控力 80%：空中改變方向比地面慢', () => {
    const { run } = make(1, { map: flatMap() });
    settle(run);
    run.setMove(1, 0);
    for (let i = 0; i < 20; i++) run.step(DT);
    run.requestJump();
    run.setMove(-1, 0);
    run.step(DT);
    run.step(DT);
    expect(run.moveSpeed).toBeGreaterThan(0); // 還有慣性，沒有立刻反向
  });
});

describe('一局的模擬（無頭）', () => {
  it('同種子同機器人 → 完全相同的結果（可重現）；不同種子不同', () => {
    tuning.stageSeconds = 60;
    const play = (seed: number) => {
      const { run } = make(seed);
      let t = 0;
      while (t < 40) {
        botStep(run, t);
        t += DT;
      }
      return JSON.stringify([run.kills, run.level, run.stageIndex, Math.round(run.hp * 1000), run.picked, Math.round(run.px * 1000), Math.round(run.pz * 1000), Math.round(run.py * 1000)]);
    };
    expect(play(42)).toBe(play(42));
    expect(play(42)).not.toBe(play(43));
  });

  it('升級當下模擬凍結，選完才繼續（D15）', () => {
    const { run, bus } = make(2);
    const levelUps: number[] = [];
    bus.on('levelUp', (e) => levelUps.push(e.level));
    for (let i = 0; i < 60; i++) run.step(DT);
    const t0 = run.time;
    run.addXp(xpNeed(0));
    expect(run.awaitingPick).toBe(true);
    expect(run.offer).toHaveLength(3);
    expect(levelUps).toEqual([1]);
    for (let i = 0; i < 300; i++) run.step(DT);
    expect(run.time).toBe(t0);
    run.chooseCard(1);
    expect(run.awaitingPick).toBe(false);
    run.step(DT);
    expect(run.time).toBeGreaterThan(t0);
  });

  it('一次升好幾級：連續選，只發一次 levelUp，最後一張選完才解除', () => {
    const { run, bus } = make(3);
    let n = 0;
    bus.on('levelUp', () => n++);
    run.addXp(500);
    const total = run.pendingPicks;
    expect(total).toBeGreaterThan(3);
    expect(n).toBe(1);
    for (let k = 0; k < total - 1; k++) expect(run.chooseCard(0), `第 ${k + 1} 次`).toBe(true);
    expect(run.chooseCard(0)).toBe(false);
    expect(run.picked).toHaveLength(total);
  });

  it('選到生命卡：最大生命與現有生命一起增加', () => {
    const { run } = make(4);
    const before = run.maxHp;
    run.give('hp', 'rare');
    expect(run.maxHp).toBe(before + 16);
    expect(run.hp).toBe(before + 16);
  });

  it('死亡：生命歸零 → 延遲後 runEnd(death)；放棄 → 50%', () => {
    const a = make(5);
    let end: { result: string; merit: number } | null = null;
    a.bus.on('runEnd', (e) => (end = e));
    a.run.hp = -1;
    for (let i = 0; i < 200; i++) a.run.step(DT);
    expect(a.run.phase).toBe('ended');
    expect(end!.result).toBe('death');
    expect(end!.merit).toBe(0);
    const b = make(6);
    let end2: { result: string; merit: number } | null = null;
    b.bus.on('runEnd', (e) => (end2 = e));
    b.run.kills = 100;
    b.run.abandon();
    expect(end2!.result).toBe('abandon');
    expect(end2!.merit).toBe(5); // 100 擊殺 ÷ 10 = 10，放棄 50%
  });

  it('無敵（god）：被圍毆也不會死', () => {
    tuning.countScale = 6;
    const { run } = make(7);
    run.god = true;
    for (let i = 0; i < 60 * 40; i++) {
      run.setMove(0, 0);
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.dead).toBe(false);
    expect(run.hp).toBeGreaterThan(0);
  });

  it('不變形：沒有 NaN、敵人在地圖內不在擋路格、玩家不在地下、數量不超過上限（含跳躍亂跳）', () => {
    tuning.stageSeconds = 90;
    tuning.countScale = 3;
    const { run } = make(8);
    run.god = true;
    let t = 0;
    let checks = 0;
    while (t < 80) {
      if (Math.round(t * 60) % 40 === 0) run.requestJump();
      botStep(run, t);
      t += DT;
      if (Math.round(t * 60) % 30 === 0) {
        checks++;
        expect(Number.isFinite(run.px) && Number.isFinite(run.py) && Number.isFinite(run.pz)).toBe(true);
        expect(run.py).toBeGreaterThanOrEqual(run.map.heightAt(run.px, run.pz) - 1e-6);
        expect(run.enemies.aliveCount).toBeLessThanOrEqual(run.enemies.capacity);
        const e = run.enemies;
        for (let i = 0; i < e.high; i++) {
          if (!e.alive[i]) continue;
          expect(Number.isFinite(e.x[i]) && Number.isFinite(e.z[i]) && Number.isFinite(e.hp[i])).toBe(true);
          expect(run.map.isBlocked(e.x[i], e.z[i]), `敵人 ${i} 在擋路格`).toBe(false);
        }
      }
    }
    expect(checks).toBeGreaterThan(100);
  });

  it('卡住偵測（T7）：站著不動 70 秒，沒有敵人 5 秒內位移 < 0.5 公尺還離玩家很遠', () => {
    tuning.stageSeconds = 90;
    tuning.countScale = 3;
    const { run } = make(9);
    run.god = true;
    run.setMove(0, 0);
    let snap = new Map<number, [number, number]>();
    let stuck = 0;
    let compared = 0;
    for (let k = 0; k < 60 * 70; k++) {
      if (run.awaitingPick) run.chooseCard(0);
      else run.step(DT);
      if (k % 300 === 299) {
        const e = run.enemies;
        const next = new Map<number, [number, number]>();
        for (let i = 0; i < e.high; i++) {
          if (!e.alive[i]) continue;
          const id = e.phase[i];
          next.set(id, [e.x[i], e.z[i]]);
          const prev = snap.get(id);
          if (prev) {
            compared++;
            const moved = Math.hypot(e.x[i] - prev[0], e.z[i] - prev[1]);
            const far = Math.hypot(e.x[i] - run.px, e.z[i] - run.pz) > 3;
            if (moved < 0.5 && far && e.kx[i] < 0.1) stuck++;
          }
        }
        snap = next;
      }
    }
    expect(compared).toBeGreaterThan(50);
    expect(stuck).toBe(0);
  });
});

describe('效能（T4：400 隻時模擬 CPU）', () => {
  it('桌機上限 400 隻：每步平均耗時（記錄實測）', () => {
    tuning.countScale = 40;
    tuning.hpScale = 50;
    const { run } = make(10);
    run.god = true;
    run.setMove(0, 0);
    let guard = 0;
    while (run.enemies.aliveCount < 380 && guard++ < 3000) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.enemies.aliveCount).toBeGreaterThanOrEqual(380);
    const n = 300;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.setMove(Math.cos(i * 0.05), Math.sin(i * 0.05));
      run.step(DT);
    }
    const per = (performance.now() - t0) / n;
    console.log(`400 隻（${run.enemies.aliveCount} 隻存活）每步 ${per.toFixed(3)} ms`);
    expect(run.enemies.aliveCount).toBeLessThanOrEqual(400);
    expect(per).toBeLessThan(8);
  });
});

describe('台地孤島', () => {
  it('玩家站在上不去的台地頂：敵人直線朝玩家擠，不是全部不動；生成不因為不連通而停擺', () => {
    tuning.countScale = 4;
    const def = makeHighlands(3);
    const pl = def.plateaus![0];
    pl.rampWidth = 0;
    const bus = new EventBus();
    const run = new Run({ seed: 3, bus, mapFor: () => def });
    run.god = true;
    // 站到台地頂（找一個頂上可走的點）
    let ok = false;
    for (let a = 0; a < 360 && !ok; a += 30) ok = run.devTeleport(pl.x + Math.cos((a * Math.PI) / 180) * pl.r * 0.3, pl.z + Math.sin((a * Math.PI) / 180) * pl.r * 0.3);
    expect(ok).toBe(true);
    expect(run.flow.isolated).toBe(true);
    run.setMove(0, 0);
    for (let i = 0; i < 60 * 25; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.enemies.aliveCount).toBeGreaterThan(10);
    // 有敵人靠近台地腳下（直線擠過來）
    let near = 0;
    for (let i = 0; i < run.enemies.high; i++) if (run.enemies.alive[i] && Math.hypot(run.enemies.x[i] - run.px, run.enemies.z[i] - run.pz) < pl.r + 8) near++;
    expect(near).toBeGreaterThan(3);
  });
});
