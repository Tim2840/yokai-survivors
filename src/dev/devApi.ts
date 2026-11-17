import { xpNeed } from '../data/progression';
import { FORMS } from '../data/yokai';
import { CAMERA } from '../data/camera';
import { kindIndex } from '../systems/enemies';
import { ENEMY_IDS } from '../data/enemies';
import { collectMarkers, markers } from '../game/minimapMarkers';
import { OMIKUJI_RESULTS, type ElementKind, type OmikujiResult } from '../data/elements';
import { PICKUP_KINDS, type PickupKind } from '../data/pickups';
import { EVO, evosFor } from '../data/techniques';
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
        xpNeeded: r.xpNeeded,
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
          return i >= 0 && r.enemies.alive[i] ? { maxHp: r.enemies.maxHp[i], hp: r.enemies.hp[i], id: ENEMY_IDS[r.enemies.kind[i]], x: r.enemies.x[i], z: r.enemies.z[i], state: r.boss.state, skill: r.boss.skill?.id ?? null, tele: { ...r.boss.tele }, phase2: r.boss.phase2, hits: r.boss.hits, used: { ...r.boss.used } } : null;
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
        form: r.form,
        /** 赤鬼（docs/35）：怒氣層數、最近一次揮擊（距今幾秒、是不是震波） */
        rage: r.rage,
        frenzyGuard: r.frenzyGuard,
        swing: r.lastSwing ? { age: r.clock - r.lastSwing.at, shock: r.lastSwing.shock, full: r.lastSwing.full } : null,
        techMax: r.tech.max,
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
    /** Blender 試作的模型載好了嗎（?model=blender；docs/26） */
    get blenderReady() {
      return ctx.game.view?.blenderReady ?? false;
    },
    settle: () => ctx.game.frame(1),
    advance: (dt: number) => ctx.loop.advance(dt),
    render: () => {
      ctx.game.frame(1);
      ctx.loop.render();
    },
    /** 敵人轉檯圖用（docs/29）：設定第 i 隻敵人的朝向（度；0 = 臉朝 +z）。只要不 advance，它就維持這個朝向 */
    enemyYaw: (i: number, deg: number) => {
      const r = run();
      if (r) r.enemies.yaw[i] = (deg * Math.PI) / 180;
    },
    /** 特效目錄用：這一幀畫了幾個特效實例（火舌＋火星） */
    /** 開關火的網格（量 draw call） */
    fxVisible: (flames: boolean, glow: boolean) => (ctx.game.view as unknown as { fxVisible?: (a: boolean, b: boolean) => void } | null)?.fxVisible?.(flames, glow),
    /** 技法場上狀態（特效目錄等「那一招真的出手」再截圖）：爆圈種類、火柱／間歇泉、火種／水泡、水痕、漩渦、水域各幾個 */
    techState: () => {
      const t = run()?.tech;
      if (!t) return null;
      const n = (a: ArrayLike<number>) => { let k = 0; for (let i = 0; i < a.length; i++) if (a[i] > 0) k++; return k; };
      const flashes: number[] = [];
      for (let i = 0; i < t.flashLife.length; i++) if (t.flashLife[i] > 0) flashes.push(t.flashKind[i]);
      return { flashes, pillars: n(t.pillarLife), seeds: n(t.seedT), wakes: n(t.wakeLife), vortex: n(t.vortLife), domains: n(t.domLife) };
    },
    /** 火特效分項：每幀的火舌、粒子、光（沒有火的妖怪是 null） */
    get fxStats() {
      return (ctx.game.view as unknown as { fxStats?: unknown } | null)?.fxStats ?? null;
    },
    get fxCount() {
      return (ctx.game.view as unknown as { fxCount?: number } | null)?.fxCount ?? 0;
    },
    /** 截圖用：凍結模擬（遊戲迴圈照樣畫圖，但敵人不會轉回去面向玩家）；false 解除 */
    freeze: (on = true) => (on ? ctx.loop.hold('dev-freeze') : ctx.loop.release('dev-freeze')),
    /** 敵人轉檯圖用：把玩家角色藏起來（不擋鏡頭）；只給截圖用 */
    hidePlayer: (hide = true) => {
      const v = ctx.game.view as unknown as { player?: { root: { visible: boolean } } } | null;
      if (v?.player) v.player.root.visible = !hide;
    },
    /** 遊玩時的預設鏡頭（俯仰角度、距離）：轉檯圖的「遊玩視角」那一格用 */
    playCamera: { pitch: CAMERA.pitchDeg, dist: CAMERA.distance },
    /** 玩家角色面向的方向（度）：鏡頭的 yaw 設成這個值，鏡頭就在角色的正前方（轉檯圖用，docs/29） */
    get facingDeg() {
      return ((run()?.facing ?? 0) * 180) / Math.PI;
    },
    /** 鏡頭的朝向與俯仰（度；測試與截圖用，鏡頭會被夾在上下限內）；回傳實際值 */
    setCamera: (yawDeg?: number, pitchDeg?: number, dist?: number) => {
      const rig = ctx.renderer.rig;
      const D = Math.PI / 180;
      if (dist !== undefined) (rig as unknown as { desiredDist: number }).desiredDist = dist;
      if (yawDeg !== undefined) rig.yaw = yawDeg * D;
      if (pitchDeg !== undefined) rig.rotate(0, pitchDeg * D - rig.pitch);
      ctx.game.frame(1);
      return { yaw: rig.yaw / D, pitch: rig.pitch / D };
    },
    /** 會投影、看得到的網格有幾個（陰影成本分析用）；依父層名稱分組太麻煩，直接回傳數量與前幾個的三角形數 */
    shadowCasters: () => {
      let n = 0;
      let tris = 0;
      ctx.renderer.scene.traverseVisible((o) => {
        const m = o as import('three').Mesh;
        if (m.isMesh && m.castShadow) {
          n++;
          const g = m.geometry;
          tris += ((g.index ? g.index.count : g.attributes.position.count) / 3) * ((m as import('three').InstancedMesh).count ?? 1);
        }
      });
      return { n, tris };
    },
    /** draw call 分項（效能分析用）：每個看得到、會畫的物件逐一關掉再畫一次，少了幾次就是它的成本；依「父層名稱／種類／材質」分組加總 */
    drawBreakdown: () => {
      const r = ctx.renderer;
      const info = r.pipeline.renderer.info;
      r.render();
      const base = info.render.calls;
      const items: import('three').Object3D[] = [];
      r.scene.traverseVisible((o) => {
        const m = o as import('three').Mesh;
        if (!(m.isMesh || (o as import('three').Points).isPoints || (o as import('three').Line).isLine || (o as import('three').Sprite).isSprite)) return;
        if ((m as import('three').InstancedMesh).isInstancedMesh && (m as import('three').InstancedMesh).count === 0) return;
        items.push(o);
      });
      const out: Record<string, number> = {};
      for (const o of items) {
        o.visible = false;
        r.render();
        const d = base - info.render.calls;
        o.visible = true;
        if (d <= 0) continue;
        const m = o as import('three').Mesh;
        const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as import('three').Material | undefined;
        // 往上找到場景下第二層的祖先，用「第一層#索引/第二層#索引（名稱）」分組
        const chain: import('three').Object3D[] = [];
        for (let p: import('three').Object3D | null = o; p && p !== r.scene; p = p.parent) chain.unshift(p);
        const lv = (k: number) => (chain[k] ? `${chain[k].name || chain[k].type}#${chain[k].parent?.children.indexOf(chain[k]) ?? -1}` : '-');
        const key = `${lv(0)}/${lv(1)}/${lv(2)}|${mat?.type ?? ''}${(m as import('three').InstancedMesh).isInstancedMesh ? '|inst' : ''}${m.castShadow ? '|S' : ''}`;
        out[key] = (out[key] ?? 0) + d;
      }
      r.render();
      return { base, parts: Object.entries(out).sort((a, b) => b[1] - a[1]) };
    },
    /** 看得到、會畫的物件清單（draw call 分析用）：名稱或父層名稱、種類、實例數、是否投影 */
    drawList: () => {
      const out: string[] = [];
      ctx.renderer.scene.traverseVisible((o) => {
        const m = o as import('three').Mesh;
        if (!(m.isMesh || (o as import('three').Points).isPoints || (o as import('three').Line).isLine || (o as import('three').Sprite).isSprite)) return;
        const n = (m as import('three').InstancedMesh).isInstancedMesh ? (m as import('three').InstancedMesh).count : 1;
        if (n === 0) return;
        out.push(`${o.name || o.parent?.name || o.parent?.parent?.name || '?'}|${o.type}|${n}|${m.castShadow ? 'S' : ''}|${(Array.isArray(m.material) ? m.material[0] : m.material)?.type ?? ''}`);
      });
      return out;
    },
    /** 清場：敵人、敵方的箭都清掉，並解除無敵時間（測試人類行為用） */
    clearEnemies: () => run()?.devClearEnemies(),
    /** 在玩家相對位置 (dx, dz) 放一隻指定的人類（截圖用；不動、打不死）；回傳索引 */
    spawnAt: (id: string, dx: number, dz: number, variant = 0, vet = 0, hp = 1e9) => {
      const r = run();
      if (!r) return -1;
      const i = r.enemies.spawn(kindIndex(id), r.px + dx, r.pz + dz, 1, 0, dx * 0.7 + dz, variant, 1, vet);
      if (i >= 0) {
        r.enemies.hp[i] = r.enemies.maxHp[i] = hp;
        r.enemies.speed[i] = 0;
        r.enemies.yaw[i] = Math.atan2(-dx, -dz);
      }
      return i;
    },
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
    /** 頭目現在就預告某一招（D95；截圖、回歸用）；頭目要先在場 */
    bossCast: (id: string) => run()?.boss.force(id) ?? false,
    /** 讓玩家受一次傷（走一般受傷流程：無敵、閃避、護身火、怒氣都照算；god 時不扣） */
    hurtForTest: (raw: number) => {
      const r = run();
      if (!r) return false;
      return r.bossStrike(raw);
    },
    /** 只留頭目：其他人類全部清掉、停止湧出（頭目技能的回歸用） */
    bossOnly: () => {
      const r = run();
      const b = r?.director.bossIndex ?? -1;
      if (!r || b < 0) return false;
      for (let i = 0; i < r.enemies.high; i++) if (r.enemies.alive[i] && i !== b) r.enemies.kill(i);
      r.director.active = false;
      return true;
    },
    /** 頭目生命設成最大生命的 frac（半血變招的回歸用） */
    bossHp: (frac: number) => {
      const r = run();
      const b = r?.director.bossIndex ?? -1;
      if (!r || b < 0) return false;
      r.enemies.hp[b] = r.enemies.maxHp[b] * frac;
      return true;
    },
    /** 頭目移到玩家 (dx, dz) 公尺處 */
    bossTo: (dx: number, dz: number) => {
      const r = run();
      const i = r?.director.bossIndex ?? -1;
      if (!r || i < 0) return false;
      r.enemies.relocate(i, r.px + dx, r.pz + dz);
      return true;
    },
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
    /** 把一個已有的技法換成另一個（測試用：逐個看河童新補的技法在能力面板的樣子） */
    replaceTech: (oldId: string, newId: string) => run()?.tech.replace(oldId, newId) ?? false,
    /** 在身邊生一隻精英並直接打倒（走正常的打倒流程：魂玉、寶箱、補給品；D93 回歸用） */
    eliteKill: () => {
      const r = run();
      if (!r) return false;
      const i = r.enemies.spawn(0, r.px + 9, r.pz, r.director.virtualWave(), 0, 0, 1); // 離遠一點：掉的補給品不會馬上被撿到、蓋掉 HUD 提示
      if (i < 0) return false;
      r.weaponHit(i, 1e9, 0, 0, 0, false);
      return true;
    },
    /** 直接升到第 n 階化身（D94：轉檯圖、截圖用）：一級一級升、選卡都選第一張 */
    toForm: (n: number) => {
      const r = run();
      if (!r) return false;
      const want = FORMS[Math.max(0, Math.min(FORMS.length, n) - 1)]?.level ?? 0;
      for (let g = 0; g < 400 && r.level < want; g++) {
        r.addXp(xpNeed(r.level) - r.xp + 0.01);
        for (let k = 0; k < 10 && r.awaitingPick; k++) r.chooseCard(0);
      }
      return r.form;
    },
    /** 直接給魂玉（D93） */
    giveGem: (n = 1) => run()?.addGem(n),
    /** 直接進化（特效目錄用）：找含這個技法的進化，把材料練到門檻再進化；回傳有沒有成功 */
    evolveTech: (id: string) => {
      const r = run();
      if (!r) return false;
      const e = evosFor(r.weaponItemId).find((v) => v.from.includes(id));
      if (!e) return false;
      for (const m of e.from) if (r.tech.techLevel(m) < EVO.capBefore) r.devTechLevel(m, EVO.capBefore);
      if (EVO.gem && r.soulGems <= 0) r.addGem(1);
      const ok = r.tech.evolve(e.id);
      if (ok && EVO.gem) r.soulGems--;
      return ok;
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
    /** 直接套用一個神籤結果（D78 倒數標籤的測試用） */
    omikuji: (result: string) => {
      const r = run();
      if (!r || !(OMIKUJI_RESULTS as readonly string[]).includes(result)) return false;
      r.elements.applyOmikuji(result as OmikujiResult);
      return true;
    },
    /** 現在 HUD 要倒數的限時效果（label、剩幾秒、壞事） */
    buffs: () => {
      const r = run();
      if (!r) return [];
      const n = r.collectBuffs();
      return r.buffs.slice(0, n).map((b) => ({ label: b.label, left: b.left, bad: b.bad }));
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
