import { ENEMY_IDS } from '../data/enemies';
import { collectMarkers, markers } from '../game/minimapMarkers';
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
 * 已有：state／seed／paused／simTime／quality／audio／perf／screens／run／camera／offer／advance／render／spawn／setTime／killBoss／clearStage／summonBoss／forcePickup／dropOrbs／giveTech／techNext／give／addXp／god／teleport。
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
        trial: { ...r.elements.trial, needs: [...r.elements.trial.needs] },
        summit: { mult: r.director.summitMult, chests: r.summitChests },
        boss: (() => {
          const i = r.director.bossIndex;
          return i >= 0 && r.enemies.alive[i] ? { maxHp: r.enemies.maxHp[i], hp: r.enemies.hp[i] } : null;
        })(),
        curse: { ...r.curse },
        ult: { equipped: [...r.ults], mods: { ...r.ultModsView }, charge: r.ultCharge, ready: r.ultReady, counts: Object.fromEntries(r.cardCounts), volleyBonus: r.volleyBonus },
        difficulty: r.difficulty,
        pickups: Array.from({ length: r.pickups.capacity }, (_, i) => i).filter((i) => r.pickups.alive[i]).map((i) => ({ kind: PICKUP_KINDS[r.pickups.kind[i]], x: r.pickups.x[i], z: r.pickups.z[i] })),
        frozen: r.frozenEnemies,
        summon: (() => {
          const s = r.elements.summonSlot;
          return { stage: r.summonStage, bossSpawned: r.director.bossSpawned, altar: s ? { x: s.x, z: s.z, announce: s.announce } : null };
        })(),
        techs: [...r.tech.owned],
        techLevels: [...r.tech.levels],
        evolved: [...r.tech.evolved],
        evolvable: r.tech.evolvable.map((e) => e.id),
        fuseSlot: (() => {
          const f = r.elements.fuseSlot;
          return f ? { x: f.x, z: f.z, announce: f.announce } : null;
        })(),
        techMode: r.techMode,
        ward: r.tech.wardProgress,
        wardReady: r.tech.wardReady,
        seeds: r.tech.seedCount,
        markers: (() => {
          const n = collectMarkers(r);
          return markers.slice(0, n).map((m) => ({ shape: m.shape, group: m.group, x: m.x, z: m.z, high: m.high }));
        })(),
        yokai: r.yokai.id,
        weaponId: r.weaponItemId,
        weaponLevel: r.weaponLevel,
        zones: r.zoneCount,
        orbit: r.orbitCount,
        focus: r.elements.focus ? r.elements.focus.kind : null,
        tuning: ctx.game.tuningInfo,
        feel: ctx.game.feelState,
        humans: {
          kinds: Object.fromEntries(ENEMY_IDS.map((id, k) => [id, r.enemies.kindCount[k]])),
          shots: {
            alive: r.shots.aliveCount,
            fired: r.shots.fired,
            list: (() => {
              const out: { x: number; z: number; vx: number; vz: number }[] = [];
              for (let i = 0; i < r.shots.high && out.length < 8; i++) if (r.shots.alive[i]) out.push({ x: r.shots.x[i], z: r.shots.z[i], vx: r.shots.vx[i], vz: r.shots.vz[i] });
              return out;
            })(),
          },
          winding: (() => {
            let n = 0;
            for (let i = 0; i < r.enemies.high; i++) if (r.enemies.alive[i] && r.enemies.wind[i] > 0) n++;
            return n;
          })(),
          view: ctx.game.humansView,
          intro: r.enemyIntro ? { key: r.enemyIntro.key, left: r.enemyIntro.until - r.clock } : null,
        },
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
    /** 鏡頭的朝向與俯仰（度；測試與截圖用，鏡頭會被夾在上下限內）；回傳實際值 */
    setCamera: (yawDeg?: number, pitchDeg?: number) => {
      const rig = ctx.renderer.rig;
      const D = Math.PI / 180;
      if (yawDeg !== undefined) rig.yaw = yawDeg * D;
      if (pitchDeg !== undefined) rig.rotate(0, pitchDeg * D - rig.pitch);
      ctx.game.frame(1);
      return { yaw: rig.yaw / D, pitch: rig.pitch / D };
    },
    /** 清場：敵人、敵方的箭都清掉，並解除無敵時間（測試人類行為用） */
    clearEnemies: () => run()?.devClearEnemies(),
    /** 場上敵人的生命設成極大（行為測試用） */
    tankEnemies: () => run()?.devTankEnemies(),
    /** 用世界座標的方向走（不看輸入；null = 還給輸入）；閃箭測試要精準方向 */
    driveWorld: (x: number | null, z = 0) => {
      ctx.game.devMove = x === null ? null : [x, z];
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
    /** 換成指定的大招（可帶升級等級） */
    setUlt: (id: string, level = 0) => run()?.devSetUlt(id, level),
    /** 頭目現在就倒下（走正常的擊殺流程，傳送門會開） */
    killBoss: () => run()?.devKillBoss() ?? false,
    /** 現在就過關（走正常流程：進過關畫面；一般地圖第 1 關過關會跳技法面板，D48） */
    clearStage: () => run()?.devClearStage(),
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
    /** 下一次升級選卡一定有一張技法卡（D49：平常是機率；回歸用真的點擊拿技法） */
    techNext: () => run()?.devTechNext(),
    /** 把技法（或 ghostfire）練到指定等級（D53：進化要兩個材料都 8 級） */
    techLevel: (id: string, level: number) => {
      const r = run();
      if (!r) return false;
      r.devTechLevel(id, level);
      return true;
    },
    /** 直接給技法（不經面板，D48；給 TECH_MAX 以內） */
    giveTech: (...ids: string[]) => {
      const r = run();
      if (!r) return false;
      r.devAddTech(...ids);
      return true;
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
