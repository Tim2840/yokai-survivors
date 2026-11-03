import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { FixedLoop, STEP, MAX_FRAME_DT, MAX_STEPS_PER_FRAME } from '../../src/core/loop';
import { GameStateMachine } from '../../src/game/stateMachine';
import { GAME_STATES, TRANSITIONS, type GameState } from '../../src/game/states';

describe('事件匯流排', () => {
  it('on 收得到、off 之後收不到', () => {
    const b = new EventBus();
    const fn = vi.fn();
    const off = b.on('paused', fn);
    b.emit('paused', { paused: true, reason: 'user' });
    off();
    b.emit('paused', { paused: false, reason: 'user' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ paused: true, reason: 'user' });
  });
  it('emit 途中取消訂閱，不會跳過同一輪的其他監聽', () => {
    const b = new EventBus();
    const calls: string[] = [];
    const offA = b.on('paused', () => {
      calls.push('a');
      offA();
    });
    b.on('paused', () => calls.push('b'));
    b.emit('paused', { paused: true, reason: 'user' });
    b.emit('paused', { paused: true, reason: 'user' });
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});

describe('狀態機', () => {
  const allowed = (from: GameState, to: GameState) => TRANSITIONS[from].includes(to);

  it('主流程走得通：BOOT→MENU→RUN_SETUP→COMBAT⇄INTERMISSION→RUN_END→META_SHOP→MENU', () => {
    const fsm = new GameStateMachine(new EventBus());
    for (const s of ['MENU', 'RUN_SETUP', 'COMBAT', 'INTERMISSION', 'COMBAT', 'RUN_END', 'META_SHOP', 'MENU'] as GameState[]) {
      expect(fsm.go(s), s).toBe(true);
    }
  });

  it('全掃：每一對 (from, to) 都照轉換表准或拒', () => {
    for (const from of GAME_STATES) {
      for (const to of GAME_STATES) {
        const b = new EventBus();
        const rejected = vi.fn();
        b.on('stateRejected', rejected);
        const fsm = new GameStateMachine(b);
        // 走到 from（用轉換表做 BFS 找路）
        const path = findPath('BOOT', from);
        if (!path) continue;
        for (const s of path) fsm.go(s);
        expect(fsm.state).toBe(from);
        const ok = fsm.go(to);
        expect(ok, `${from}→${to}`).toBe(allowed(from, to));
        expect(fsm.state).toBe(ok ? to : from);
        expect(rejected).toHaveBeenCalledTimes(ok ? 0 : 1);
      }
    }
  });

  it('每個狀態都從 BOOT 走得到，也都走得回 MENU（不會卡死）', () => {
    for (const s of GAME_STATES) {
      if (s === 'BOOT') continue;
      expect(findPath('BOOT', s), s).not.toBeNull();
      if (s !== 'MENU') expect(findPath(s, 'MENU'), s).not.toBeNull();
    }
  });

  it('戰鬥中不能直接回主選單或去商店（只能經過結算）', () => {
    expect(allowed('COMBAT', 'MENU')).toBe(false);
    expect(allowed('COMBAT', 'META_SHOP')).toBe(false);
  });

  it('request:state 事件由狀態機處理，並發 stateChanged；enter／exit 依序呼叫', () => {
    const b = new EventBus();
    const fsm = new GameStateMachine(b);
    const order: string[] = [];
    fsm.register('BOOT', { exit: (to) => order.push(`exit BOOT→${to}`) });
    fsm.register('MENU', { enter: (from) => order.push(`enter MENU←${from}`) });
    b.on('stateChanged', ({ from, to }) => order.push(`changed ${from}→${to}`));
    b.emit('request:state', { to: 'MENU' });
    expect(fsm.state).toBe('MENU');
    expect(order).toEqual(['exit BOOT→MENU', 'enter MENU←BOOT', 'changed BOOT→MENU']);
  });

  function findPath(from: GameState, to: GameState): GameState[] | null {
    if (from === to) return [];
    const prev = new Map<GameState, GameState>();
    const q: GameState[] = [from];
    const seen = new Set<GameState>([from]);
    while (q.length) {
      const cur = q.shift()!;
      for (const n of TRANSITIONS[cur]) {
        if (seen.has(n)) continue;
        seen.add(n);
        prev.set(n, cur);
        if (n === to) {
          const path: GameState[] = [n];
          let p = cur;
          while (p !== from) {
            path.unshift(p);
            p = prev.get(p)!;
          }
          return path;
        }
        q.push(n);
      }
    }
    return null;
  }
});

describe('固定步長主迴圈', () => {
  const make = () => {
    let sims = 0;
    let draws = 0;
    const loop = new FixedLoop(
      () => sims++,
      () => draws++,
    );
    return { loop, sims: () => sims, draws: () => draws };
  };

  it('1 秒真實時間 = 60 步模擬（不論幀率）', () => {
    for (const fps of [30, 60, 144]) {
      const { loop, sims } = make();
      for (let i = 0; i <= fps; i++) loop.frame((i * 1000) / fps);
      expect(Math.abs(sims() - 60), `${fps} fps`).toBeLessThanOrEqual(1);
    }
  });

  it('切回分頁的大 dt 被夾住：一幀最多補 MAX_STEPS_PER_FRAME 步', () => {
    const { loop, sims } = make();
    loop.frame(0);
    loop.frame(10_000);
    expect(sims()).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME);
    expect(sims()).toBe(Math.floor(MAX_FRAME_DT / STEP));
  });

  it('時間倒退或 NaN 不會讓模擬倒跑', () => {
    const { loop, sims } = make();
    loop.frame(1000);
    loop.frame(500);
    loop.frame(NaN);
    expect(sims()).toBe(0);
  });

  it('暫停：模擬停、渲染照畫', () => {
    const { loop, sims, draws } = make();
    loop.paused = true;
    for (let i = 0; i < 30; i++) loop.frame(i * 16.7);
    expect(sims()).toBe(0);
    expect(draws()).toBe(30);
  });

  it('advance(dt) 快進模擬但不畫圖；render() 才畫', () => {
    const { loop, sims, draws } = make();
    loop.advance(2);
    expect(sims()).toBe(120);
    expect(draws()).toBe(0);
    expect(loop.simTime).toBeCloseTo(2, 5);
    loop.render();
    expect(draws()).toBe(1);
  });
});

import { canPlay } from '../../src/core/audio';
import { AUDIO } from '../../src/data/audio';
import { degreeToSemitones, MIYAKO } from '../../src/core/music';

describe('音效節流（docs/08 第 3 節）', () => {
  it('同時最多 maxConcurrent 個', () => {
    expect(canPlay(1000, 0, AUDIO.maxConcurrent - 1, false)).toBe(true);
    expect(canPlay(1000, 0, AUDIO.maxConcurrent, false)).toBe(false);
  });
  it('高頻音效最短間隔', () => {
    expect(canPlay(1000, 1000 - AUDIO.minIntervalMs + 1, 0, true)).toBe(false);
    expect(canPlay(1000, 1000 - AUDIO.minIntervalMs, 0, true)).toBe(true);
    expect(canPlay(1000, 999, 0, false)).toBe(true);
  });
});

describe('音樂音階', () => {
  it('都節音階：級數 0..5 = 0,1,5,7,8,12；負數往下', () => {
    expect([0, 1, 2, 3, 4, 5].map((d) => degreeToSemitones(d, MIYAKO))).toEqual([0, 1, 5, 7, 8, 12]);
    expect(degreeToSemitones(-1, MIYAKO)).toBe(-4);
  });
  it('不給音階時是五聲音階（燈落之境的行為不變）', () => {
    expect([0, 1, 2, 3, 4, 5].map((d) => degreeToSemitones(d))).toEqual([0, 2, 4, 7, 9, 12]);
  });
});
