import type { AudioEngine } from '../core/audio';
import type { FixedLoop } from '../core/loop';
import type { Renderer } from '../core/renderer';
import type { GameStateMachine } from '../game/stateMachine';

/**
 * 開發模式介面 window.__game（CLAUDE.md「開發模式介面」）。主網址（build:single:main）與正式 build 不含這個檔。
 * M0 有 state／seed／paused／simTime／quality／audio／advance／render；spawn、setWave、give、god、teleport、forceElement 隨 M1 以後的系統加入。
 */
export interface DevContext {
  loop: FixedLoop;
  fsm: GameStateMachine;
  seed: number;
  audio: AudioEngine;
  renderer: Renderer;
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
    /** 畫質：目前等級（0 最好）與模式 */
    get quality() {
      return { level: ctx.renderer.pipeline.level, mode: ctx.renderer.pipeline.mode };
    },
    /** 音訊除錯：是否已解鎖、目前曲子 */
    get audio() {
      return ctx.audio.debug();
    },
    advance: (dt: number) => ctx.loop.advance(dt),
    render: () => ctx.loop.render(),
  };
  const w = window as unknown as Record<string, unknown>;
  w.__game = api;
  w.__loop = { advance: api.advance, render: api.render };
}
