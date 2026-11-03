import type { AudioEngine } from '../core/audio';
import type { FixedLoop } from '../core/loop';
import type { Renderer } from '../core/renderer';
import type { Game } from '../game/game';
import type { GameStateMachine } from '../game/stateMachine';
import type { RarityLike } from './rarityLike';

/**
 * 開發模式介面 window.__game（CLAUDE.md「開發模式介面」）。主網址（build:single:main）與正式 build 不含這個檔。
 * 已有：state／seed／paused／simTime／quality／audio／screens／run／offer／advance／render／spawn／setWave／give／god／teleport。
 * 還沒有（隨系統加入）：forceElement。
 */
export interface DevContext {
  loop: FixedLoop;
  fsm: GameStateMachine;
  seed: number;
  audio: AudioEngine;
  renderer: Renderer;
  game: Game;
}

export function installDevApi(ctx: DevContext): void {
  const run = () => ctx.game.run;
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
    get audio() {
      return ctx.audio.debug();
    },
    /** 畫面上看得到的畫面名稱（卡住偵測用） */
    get screens() {
      return ctx.game.screens;
    },
    /** 這一局的快照（沒有局時是 null） */
    get run() {
      const r = run();
      if (!r) return null;
      return {
        phase: r.phase,
        wave: r.wave,
        time: r.time,
        hp: r.hp,
        maxHp: r.maxHp,
        level: r.level,
        xp: r.xp,
        kills: r.kills,
        enemies: r.enemies.aliveCount,
        projectiles: r.projectiles.aliveCount,
        orbs: r.orbs.aliveCount,
        pending: r.pendingPicks,
        awaitingPick: r.awaitingPick,
        px: r.px,
        pz: r.pz,
        god: r.god,
        seed: r.seed,
        picked: r.picked.length,
        tuning: ctx.game.tuningInfo,
      };
    },
    get offer() {
      return run()?.offer ?? null;
    },
    /** 繪製統計（上一幅）：draw call、三角形數、著色器程式數（預編譯後不該再增加） */
    get perf() {
      const i = ctx.renderer.pipeline.renderer.info;
      return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0 };
    },
    advance: (dt: number) => ctx.loop.advance(dt),
    render: () => {
      ctx.game.frame();
      ctx.loop.render();
    },
    spawn: (id: string, n: number) => run()?.devSpawn(id, n) ?? 0,
    setWave: (n: number) => run()?.setWave(n),
    give: (cardId: string, rarity: RarityLike) => run()?.give(cardId, rarity),
    set god(v: boolean) {
      const r = run();
      if (r) r.god = v;
    },
    get god() {
      return run()?.god ?? false;
    },
    /** 直接加魂火（測試升級流程用；選卡仍走真實的面板） */
    addXp: (n: number) => run()?.addXp(n),
    teleport: (x: number, z: number) => run()?.devTeleport(x, z) ?? false,
  };
  const w = window as unknown as Record<string, unknown>;
  w.__game = api;
  w.__loop = { advance: api.advance, render: api.render };
}
