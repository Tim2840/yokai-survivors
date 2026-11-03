import { afterEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { WAVES } from '../../src/data/waves';
import { xpNeed } from '../../src/data/progression';

const DT = 1 / 60;

function make(seed = 1, bus = new EventBus()) {
  const run = new Run({ seed, bus });
  return { run, bus };
}

/** 機器人：繞圈風箏、自動選第一張卡、整備立刻出發。回傳每步呼叫的函式 */
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

describe('一局的模擬（無頭）', () => {
  it('第 1 波：20 秒後結束、發 waveEnd、進整備；殘兵撤退、魂火全收', () => {
    const { run, bus } = make(1);
    const events: string[] = [];
    bus.on('waveStart', (e) => events.push(`start${e.wave}`));
    bus.on('waveEnd', (e) => events.push(`end${e.wave}`));
    let t = 0;
    while (run.phase === 'combat' && t < 40) {
      botStep(run, t);
      t += DT;
    }
    expect(run.phase).toBe('intermission');
    expect(run.time).toBeGreaterThanOrEqual(WAVES.duration - 0.1);
    expect(run.time).toBeLessThan(WAVES.duration + 0.2);
    expect(run.enemies.aliveCount).toBe(0);
    expect(run.orbs.aliveCount).toBe(0);
    expect(events).toEqual(['end1']);
    run.continueFromIntermission();
    expect(run.wave).toBe(2);
    expect(run.phase).toBe('combat');
  });

  it('同種子同機器人 → 完全相同的結果（可重現）；不同種子不同', () => {
    const play = (seed: number) => {
      const { run } = make(seed);
      let t = 0;
      while (t < 60) {
        botStep(run, t);
        t += DT;
      }
      return JSON.stringify([run.kills, run.level, run.wave, Math.round(run.hp * 1000), run.picked, Math.round(run.px * 1000), Math.round(run.pz * 1000)]);
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
    for (let k = 0; k < total - 1; k++) {
      expect(run.chooseCard(0), `第 ${k + 1} 次`).toBe(true);
      expect(run.awaitingPick).toBe(true);
    }
    expect(run.chooseCard(0)).toBe(false);
    expect(run.awaitingPick).toBe(false);
    expect(run.picked).toHaveLength(total);
  });

  it('選到生命卡：最大生命與現有生命一起增加', () => {
    const { run } = make(4);
    const before = run.maxHp;
    run.give('hp', 'rare');
    expect(run.maxHp).toBe(before + 16);
    expect(run.hp).toBe(before + 16);
  });

  it('死亡：生命歸零 → 延遲後 runEnd(death)，功德照規則算', () => {
    const { run, bus } = make(5);
    let end: { result: string; merit: number } | null = null;
    bus.on('runEnd', (e) => (end = e));
    run.hp = 0.001;
    run.hp = -1;
    for (let i = 0; i < 200; i++) run.step(DT);
    expect(run.phase).toBe('ended');
    expect(end).not.toBeNull();
    expect(end!.result).toBe('death');
    expect(end!.merit).toBe(0);
  });

  it('無敵（god）：被圍毆也不會死', () => {
    tuning.countScale = 4;
    const { run } = make(6);
    run.god = true;
    let t = 0;
    while (run.phase === 'combat' && t < 20.5) {
      run.setMove(0, 0);
      botStep(run, t);
      t += DT;
    }
    expect(run.dead).toBe(false);
    expect(run.hp).toBeGreaterThan(0);
  });

  it('放棄：功德 50%、發 runEnd(abandon)', () => {
    const { run, bus } = make(7);
    let end: { result: string } | null = null;
    bus.on('runEnd', (e) => (end = e));
    run.kills = 100;
    run.abandon();
    expect(end!.result).toBe('abandon');
    expect(run.phase).toBe('ended');
  });

  it('跑 5 波不變形：沒有 NaN、敵人都在地圖內且不在擋路格、數量不超過上限', () => {
    tuning.countScale = 2.5;
    const { run } = make(8);
    run.god = true;
    let t = 0;
    let checks = 0;
    while (run.wave <= 5 && t < 200) {
      botStep(run, t);
      t += DT;
      if (Math.round(t * 60) % 30 === 0) {
        checks++;
        expect(Number.isFinite(run.px) && Number.isFinite(run.pz)).toBe(true);
        expect(run.enemies.aliveCount).toBeLessThanOrEqual(run.enemies.capacity);
        const e = run.enemies;
        for (let i = 0; i < e.high; i++) {
          if (!e.alive[i]) continue;
          expect(Number.isFinite(e.x[i]) && Number.isFinite(e.z[i]) && Number.isFinite(e.hp[i])).toBe(true);
          expect(run.map.isBlocked(e.x[i], e.z[i]), `敵人 ${i} 在擋路格 ${e.x[i].toFixed(1)},${e.z[i].toFixed(1)}`).toBe(false);
        }
        expect(run.map.isBlocked(run.px, run.pz)).toBe(false);
      }
    }
    expect(checks).toBeGreaterThan(50);
    expect(run.wave).toBeGreaterThanOrEqual(5);
  });

  it('卡住偵測（T7）：站著不動 3 波，沒有敵人 5 秒內位移 < 0.5 公尺還離玩家很遠', () => {
    tuning.countScale = 3;
    const { run } = make(9);
    run.god = true;
    run.setMove(0, 0);
    let t = 0;
    let snap = new Map<number, [number, number]>();
    let stuck = 0;
    let compared = 0;
    while (run.wave <= 3 && t < 120) {
      if (run.phase === 'intermission') run.continueFromIntermission();
      else if (run.awaitingPick) run.chooseCard(0);
      else run.step(DT);
      t += DT;
      const e = run.enemies;
      if (Math.round(t * 60) % 300 === 0) {
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
    expect(compared).toBeGreaterThan(20);
    expect(stuck).toBe(0);
  });
});

describe('效能（T4：400 隻時模擬 CPU）', () => {
  it('桌機上限 400 隻：每步平均耗時（記錄實測）', () => {
    tuning.countScale = 12;
    tuning.hpScale = 50;
    const { run } = make(10);
    run.god = true;
    run.setWave(20);
    run.setMove(0, 0);
    // 先跑到 400 隻
    let guard = 0;
    while (run.enemies.aliveCount < 380 && guard++ < 600) {
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
