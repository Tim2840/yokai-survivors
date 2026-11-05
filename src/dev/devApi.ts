import type { ElementKind } from '../data/elements';
import { PICKUP_KINDS, type PickupKind } from '../data/pickups';
import type { AudioEngine } from '../core/audio';
import type { FixedLoop } from '../core/loop';
import type { Renderer } from '../core/renderer';
import type { Game } from '../game/game';
import type { GameStateMachine } from '../game/stateMachine';
import type { RarityLike } from './rarityLike';

/**
 * 開發模式介面 window.__game（CLAUDE.md「開發模式介面」）。主網址（build:single:main）與正式 build 不含這個檔。
 * 已有：state／seed／paused／simTime／quality／audio／perf／screens／run／camera／offer／advance／render／spawn／setTime／killBoss／summonBoss／forcePickup／dropOrbs／give／addXp／god／teleport。
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

function countOrbs(r: NonNullable<Game['run']>, pulled: 0 | 1): number {
  let n = 0;
  for (let i = 0; i < r.orbs.high; i++) if (r.orbs.alive[i] && r.orbs.pulled[i] === pulled) n++;
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
        /** 已經在飛向玩家的魂火（拾取範圍內或招魂鈴）／還躺在地上的（k1 用） */
        orbsPulled: countOrbs(r, 1),
        orbsLoose: countOrbs(r, 0),
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
        stats: { ...r.stats.value },
        elements: r.elements.slots.filter((s) => s.active).map((s) => ({ kind: s.kind, rarity: s.rarity, x: s.x, y: s.y, z: s.z, announce: s.announce, progress: s.progress, used: s.usedAge >= 0, effects: s.effects.slice(0, s.effectCount).map((f) => ({ ...f })), offers: [...s.offers], rings: s.offers.map((_, k) => ({ x: s.ringX[k], z: s.ringZ[k], progress: s.ringProgress[k], blocked: s.ringBlocked[k] })) })),
        curse: { ...r.curse },
        ult: { fused: [...r.fused], fusable: r.fusable, charge: r.ultCharge, ready: r.ultReady, counts: Object.fromEntries(r.cardCounts), volleyBonus: r.volleyBonus },
        difficulty: r.difficulty,
        pickups: Array.from({ length: r.pickups.capacity }, (_, i) => i).filter((i) => r.pickups.alive[i]).map((i) => ({ kind: PICKUP_KINDS[r.pickups.kind[i]], x: r.pickups.x[i], z: r.pickups.z[i] })),
        frozen: r.frozenEnemies,
        summon: (() => {
          const s = r.elements.summonSlot;
          return { stage: r.summonStage, bossSpawned: r.director.bossSpawned, altar: s ? { x: s.x, z: s.z, announce: s.announce } : null };
        })(),
        variant: r.variant?.id ?? null,
        weaponLevel: r.weaponLevel,
        zones: r.zoneCount,
        orbit: r.orbitCount,
        focus: r.elements.focus ? r.elements.focus.kind : null,
        tuning: ctx.game.tuningInfo,
      };
    },
    /** 這一關的地圖摘要（台地、丘、尺寸）：傳送到特定地形、截圖與測試用 */
    get map() {
      const r = run();
      if (!r) return null;
      const d = r.map.def;
      return { id: d.id, size: d.size, plateaus: d.plateaus ?? [], hills: d.hills, zones: d.zones };
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
    /** 不畫圖，只讓鏡頭與畫面物件追上（鏡頭掃描測試用，比 render() 快很多） */
    settle: () => ctx.game.frame(1),
    advance: (dt: number) => ctx.loop.advance(dt),
    render: () => {
      ctx.game.frame(1);
      ctx.loop.render();
    },
    spawn: (id: string, n: number) => run()?.devSpawn(id, n) ?? 0,
    /** 把這一關的時間直接跳到 t 秒（跳到頭目前後用） */
    setTime: (t: number) => run()?.devSetTime(t),
    /** 在玩家身邊放一個地圖要素（kind: jizo／barrier／altar；rarity: common／rare／epic／legend）；回傳位置，放不下是 null */
    forceElement: (kind: string, rarity: RarityLike) => {
      const r = run();
      if (!r) return null;
      const s = r.elements.devForce(kind as ElementKind, rarity, r.px, r.pz);
      return s ? { x: s.x, y: s.y, z: s.z } : null;
    },
    /** 大招量表直接充滿（測試用；發動仍要真的按大招鈕或 F 鍵） */
    chargeUlt: () => run()?.devChargeUlt(),
    /** 頭目現在就倒下（走正常的擊殺流程，傳送門會開） */
    killBoss: () => run()?.devKillBoss() ?? false,
    summonBoss: () => run()?.devSummonBoss() ?? false,
    /** 把生命設成 v（測回血用） */
    setHp: (v: number) => {
      const r = run();
      if (r) r.hp = Math.max(1, Math.min(r.maxHp, v));
    },
    /** 在玩家前方放一個補給品（D39）：dango／onigiri／sake／bell／drum／yukiBreath／koban */
    /** 在玩家周圍 dist 公尺的圈上放 n 個魂火（k1：招魂鈴要把拾取範圍外的都吸過來）；回傳放了幾個 */
    dropOrbs: (n: number, dist: number) => {
      const r = run();
      if (!r) return 0;
      let k = 0;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (r.orbs.spawn(r.px + Math.cos(a) * dist, r.pz + Math.sin(a) * dist, 1)) k++;
      }
      return k;
    },
    /** 離玩家超過 dist 公尺、還躺在地上（沒在飛）的魂火數（k1） */
    orbsLooseBeyond: (dist: number) => {
      const r = run();
      if (!r) return 0;
      let n = 0;
      const o = r.orbs;
      for (let i = 0; i < o.high; i++) if (o.alive[i] && !o.pulled[i] && Math.hypot(o.x[i] - r.px, o.z[i] - r.pz) > dist) n++;
      return n;
    },
    forcePickup: (kind: string, dist?: number) => {
      const r = run();
      if (!r || !(PICKUP_KINDS as readonly string[]).includes(kind)) return false;
      r.devPickup(kind as PickupKind, dist);
      return true;
    },
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
