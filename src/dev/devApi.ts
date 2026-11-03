import type { FixedLoop } from '../core/loop';
import type { GameStateMachine } from '../game/stateMachine';

/**
 * 開發模式介面 window.__game（CLAUDE.md「開發模式介面」）。主網址（build:single:main）與正式 build 不含這個檔。
 * M0 只有 state／seed／advance／render／paused；spawn、setWave、give、god、teleport、forceElement 隨 M1 以後的系統加入。
 */
export interface DevContext {
  loop: FixedLoop;
  fsm: GameStateMachine;
  seed: number;
}

export function installDevApi(ctx: DevContext): void {
  const api = {
    get state() {
      return ctx.fsm.state;
    },
    get seed() {
      return ctx.seed;
    },
    get paused() {
      return ctx.loop.paused;
    },
    get simTime() {
      return ctx.loop.simTime;
    },
    advance: (dt: number) => ctx.loop.advance(dt),
    render: () => ctx.loop.render(),
  };
  const w = window as unknown as Record<string, unknown>;
  w.__game = api;
  w.__loop = { advance: api.advance, render: api.render };
}
