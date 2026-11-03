import type { AudioEngine } from '../core/audio';
import type { FixedLoop } from '../core/loop';
import type { Renderer } from '../core/renderer';
import type { Game } from '../game/game';
import type { GameStateMachine } from '../game/stateMachine';
import type { RarityLike } from './rarityLike';

/**
 * 開發模式介面 window.__game（CLAUDE.md「開發模式介面」）。主網址（build:single:main）與正式 build 不含這個檔。
 * 已有：state／seed／paused／simTime／quality／audio／perf／screens／run／camera／offer／advance／render／spawn／setTime／killBoss／give／addXp／god／teleport。
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

function countVariant(r: NonNullable<Game['run']>, v: number): number {
  let n = 0;
  for (let i = 0; i < r.enemies.high; i++) if (r.enemies.alive[i] && r.enemies.variant[i] === v) n++;
  return n;
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
        stage: r.stageNumber,
        time: r.time,
        timeLeft: r.timeLeft,
        hp: r.hp,
        maxHp: r.maxHp,
        level: r.level,
        xp: r.xp,
        kills: r.kills,
        enemies: r.enemies.aliveCount,
        elites: countVariant(r, 1),
        bossAlive: r.director.bossIndex >= 0 && r.enemies.alive[r.director.bossIndex] === 1,
        swarm: r.director.swarm,
        portal: { ...r.portal },
        projectiles: r.projectiles.aliveCount,
        orbs: r.orbs.aliveCount,
        pending: r.pendingPicks,
        awaitingPick: r.awaitingPick,
        px: r.px,
        py: r.py,
        pz: r.pz,
        grounded: r.grounded,
        groundY: r.map.heightAt(r.px, r.pz),
        god: r.god,
        seed: r.seed,
        picked: r.picked.length,
        tuning: ctx.game.tuningInfo,
      };
    },
    /** 鏡頭狀態與鏡頭下方的地面高度（鏡頭不穿地的檢查用） */
    get camera() {
      const rig = ctx.renderer.rig;
      const r = run();
      return { yaw: rig.yaw, pitch: rig.pitch, dist: rig.dist, x: rig.x, y: rig.y, z: rig.z, groundY: r ? r.map.heightAt(rig.x, rig.z) : 0 };
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
    /** 把這一關的時間直接跳到 t 秒（跳到頭目前後用） */
    setTime: (t: number) => run()?.devSetTime(t),
    /** 頭目現在就倒下（走正常的擊殺流程，傳送門會開） */
    killBoss: () => run()?.devKillBoss() ?? false,
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
