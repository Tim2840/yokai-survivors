import { FORM_AURA_RATE, FORM_BURST } from '../data/yokai';
import { lit } from '../art/materials';
import * as THREE from 'three';
import { fxOf, palette } from '../art/palette';
import { glow, soft } from '../art/materials';
import { ball } from '../art/shapes';
import type { Run } from '../game/run';
import { COMBAT } from '../data/combat';
import { buildLanternMonk, type Character } from '../units/lanternMonk';
import { buildKappa } from '../units/kappa';
import { ENEMY_MODELS } from '../units/enemyModels';
import { CHIBI } from '../units/humans';
import { ENEMY_IDS } from '../data/enemies';
import { EnemyShotsView } from './enemyShotsView';
import { markOverlay, pruneShadowCasters } from './overlay';
import { buildWorldView, type WorldView } from '../world/worldView';
import { buildAmbienceView, type AmbienceView } from '../world/ambienceView';
import { ambienceFor, timeOfDaySuffix, type AmbienceDef } from '../data/ambience';
import { currentLook } from '../data/look';
import { writeMatrix, setHugeBounds } from './instancedLayer';
import { DamageNumbers } from './damageNumbers';
import { ElementsView } from './elementsView';
import { PickupsView } from './pickupsView';
import { UltFx } from './ultFx';
import { TechFx } from './techFx';
import { ElementFx, GLOW_HALO } from './elementFx';
import { FireReact } from './fireReact';
import { WaterReact } from './waterReact';
import { FIRE_FX, WATER_FX, vfxStyleOf } from '../data/vfx';
import { FeelFx } from './feelFx';
import type { Renderer } from '../core/renderer';

const TWO_PI = Math.PI * 2;
/** 敵人彈跳動畫的角速度（整數，才能讓時間 % 2π 之後接得上） */
const BOUNCE_FREQ = 9;
/** 貼地的圓片（陰影、光圈）離地面多高：要高過地形雜訊的起伏，否則會被地面切掉一半 */
const DECAL_LIFT = 0.14;
const AURA_SEGMENTS = 64;
/** 光圈環的粗細（公尺） */
const AURA_WIDTH = 0.1;

/**
 * 一局的 3D 外觀：地形、玩家模型、敵人（InstancedMesh）、鬼火、魂火、腳下陰影、傷害數字。
 * 只讀 Run 的陣列與數值（模擬完全不依賴這裡）；每幀 update 不配置記憶體。
 */
/** 碎片（gen > 0 的投射物）的外觀縮放 */
const SHARD_VIEW_SCALE = 0.55;

/** 玩家身上那盞光的基準強度（Renderer 建立時的值；白天主題會打折） */
const PLAYER_LIGHT_BASE = 30;
/** 身上那盞光離腳底多高（公尺）：太近會把角色頂面曬白，高一點光照在地上是一圈、角色身上只是淡淡的暖色 */
const PLAYER_LIGHT_HEIGHT = 2.4;
/** 投影的最小零件大小（包圍球半徑，公尺）：小於這個的零件不投影（玩家的零件小，門檻低一點才有影子） */
const SHADOW_MIN_RADIUS = { world: 0.55, player: 0.25 } as const;

export class RunView {
  private readonly world: WorldView;
  private player: Character;
  /** Blender 試作（docs/26）：載進來的鳥居，結束時要丟掉 */
  private trialProps: { dispose(): void }[] = [];
  private disposed = false;
  /** 試作模型載好了（截圖腳本等這個） */
  blenderReady = false;
  /** 投射物畫成扁盤（河童）還是圓球（鬼火） */
  private diskShot = false;
  private readonly enemyMeshes: THREE.InstancedMesh[];
  readonly shotsView: EnemyShotsView;
  readonly ambience: AmbienceView;
  /** 這一關的場景主題（時段） */
  readonly amb: AmbienceDef;
  private readonly enemyCounts = new Int32Array(ENEMY_IDS.length);
  private readonly enemyShadow: THREE.InstancedMesh;
  private readonly bulletMesh: THREE.InstancedMesh;
  private readonly orbMesh: THREE.InstancedMesh;
  private readonly playerShadow: THREE.Mesh;
  private readonly aura: THREE.Mesh;
  private readonly numbers: DamageNumbers;
  private readonly elementsView: ElementsView;
  private readonly pickupsView: PickupsView;
  private readonly ultFx: UltFx;
  private readonly techFx: TechFx;
  /** 浮世繪的火（docs/30）：只有火屬性的妖怪才有 */
  private readonly fireFx: ElementFx | null;
  private readonly fireReact: FireReact | WaterReact | null;
  private readonly isWater: boolean;
  private lastFxT = 0;
  /** 開發用：這一幀畫了幾個火舌＋火星（特效目錄等到有東西才截圖） */
  /** 畫面上的打倒／升級效果數（手感回歸 f1）：墨點爆圈＋火的打倒效果 */
  get popsActive(): number {
    return this.feelFx.active + (this.fireReact?.activeKills ?? 0);
  }
  private glowOn = true;
  /** 開發用：開關火的兩個網格（量 draw call 用） */
  fxVisible(flames: boolean, glow: boolean): void {
    if (!this.fireFx) return;
    this.fireFx.mesh.visible = flames;
    this.glowOn = glow;
    this.fireFx.glowMesh.visible = glow;
  }
  get fxStats(): { flames: number; particles: number; glows: number } | null {
    return this.fireFx?.stats ?? null;
  }
  get fxCount(): number {
    return this.fireFx?.count ?? 0;
  }
  readonly feelFx: FeelFx;
  private readonly portal: THREE.Group;
  private readonly portalRing: THREE.Mesh;
  private readonly portalBeam: THREE.Mesh;
  private readonly timeUniform = { value: 0 };
  private readonly disposables: { dispose(): void }[] = [];
  private readonly group = new THREE.Group();

  constructor(
    private readonly run: Run,
    private readonly renderer: Renderer,
  ) {
    const scene = renderer.scene;
    const { map } = run;
    // 場景主題：日系風格依關卡換時段（第 1 關白天、第 2 關黃昏、大頭目夜晚）
    this.amb = ambienceFor(map.def.id, currentLook().timeOfDay ? timeOfDaySuffix() : '');
    this.world = buildWorldView(map, run.seed, this.amb);
    this.group.add(this.world.group);
    // 場景氣氛（美術第一輪 A）：天空、月、星、草叢、花、遠景樹、光點；顏色與霧跟著地圖主題
    const amb = this.amb;
    renderer.applyAmbience(amb);
    this.ambience = buildAmbienceView(map, run.seed, amb, matchMedia('(hover: none) and (pointer: coarse)').matches);
    this.group.add(this.ambience.group);

    this.player = run.yokai.id === 'kappa' ? buildKappa() : buildLanternMonk();
    // 玩家身上的光：跟著妖怪的色組（顏色是 uniform，換色不會重編著色器；光源數量不變）
    renderer.playerLight.color.set(fxOf(run.yokai.id).light);
    renderer.playerLight.intensity = PLAYER_LIGHT_BASE * (this.amb.playerLight ?? 1);
    this.group.add(this.player.root);
    // Blender 模型（docs/26；Q54 使用者 2026-11-16「可以改用」）：主網址一律用；測試頁預設用（?model=code 看舊的）；開發版要帶 ?model=blender。
    // 載好之前先顯示程式建的舊模型，載好就換掉；並在出生點旁邊放一座鳥居
    if (useBlenderModels()) {
      void import('../units/blenderModels').then(async (mod) => {
        const torii = await mod.loadBlenderTorii();
        const monk = run.yokai.id === 'chochin-kozo' ? await mod.loadBlenderMonk() : run.yokai.id === 'kappa' ? await mod.loadBlenderKappa() : null;
        if (this.disposed) {
          torii.dispose();
          monk?.dispose();
          return;
        }
        const tx = run.px + 5;
        const tz = run.pz - 6;
        torii.root.position.set(tx, map.heightAt(tx, tz), tz);
        this.group.add(torii.root);
        this.trialProps.push(torii);
        if (monk) {
          this.group.remove(this.player.root);
          this.player.dispose();
          this.player = monk;
          this.group.add(monk.root);
        }
        // 敵人（村人先）：換掉實例化網格的幾何；aPhase（每隻的走路相位）搬到新幾何上，材質不換 → 著色器不會多編一份
        for (const [id, e] of Object.entries(mod.BLENDER_ENEMIES)) {
          const k = ENEMY_IDS.indexOf(id);
          if (k < 0 || this.disposed) continue;
          const geo = await mod.loadBlenderEnemyGeometry(e.url, e.fire);
          const mesh = this.enemyMeshes[k];
          geo.setAttribute('aPhase', mesh.geometry.getAttribute('aPhase'));
          mesh.geometry = geo;
          this.disposables.push(geo);
        }
        this.blenderReady = true;
      }).catch((err) => console.error('blender model load failed, keeping the code model', err));
    }

    // 敵人：每種人類一個實例化圖層（各自的幾何＋頂點色），頂點著色器做彈跳與傾斜（T2：頂點著色器動畫）
    // 走路：腳（CHIBI.footY 以下的頂點）左右輪流前後擺（D72）。材質的 onBeforeCompile 在每個材質上是同一份程式碼 → 著色器程式共用（p1 程式數不變）
    this.enemyMeshes = ENEMY_IDS.map((id) => {
      const eg = ENEMY_MODELS[id]();
      const phase = new THREE.InstancedBufferAttribute(new Float32Array(run.enemies.capacity), 1);
      phase.setUsage(THREE.DynamicDrawUsage);
      eg.setAttribute('aPhase', phase);
      const em = lit({ vertexColors: true, roughness: 0.85 });
      em.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.timeUniform;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
          float bounce = sin(uTime * ${BOUNCE_FREQ.toFixed(1)} + aPhase);
          // walk: feet (very low vertices) swing back and forth, left/right alternating
          if (transformed.y < ${CHIBI.footY.toFixed(2)}) transformed.z += sign(transformed.x) * bounce * 0.1;
          transformed.y += abs(bounce) * 0.1;
          transformed.x += bounce * transformed.y * 0.07;`,
          );
      };
      const mesh = new THREE.InstancedMesh(eg, em, run.enemies.capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(run.enemies.capacity * 3).fill(1), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      setHugeBounds(mesh, 200);
      this.group.add(mesh);
      this.disposables.push(eg, em);
      return mesh;
    });
    this.shotsView = new EnemyShotsView(run);
    this.group.add(this.shotsView.group);

    // 腳下陰影（沒有開陰影貼圖，用扁圓片代替；也讓敵人貼地看得清楚）
    const sg = new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.32, depthWrite: false });
    this.enemyShadow = new THREE.InstancedMesh(sg, sm, run.enemies.capacity);
    this.enemyShadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyShadow.count = 0;
    setHugeBounds(this.enemyShadow, 200);
    this.enemyShadow.renderOrder = 2;
    this.group.add(this.enemyShadow);
    this.playerShadow = new THREE.Mesh(sg, sm);
    this.playerShadow.scale.setScalar(1.25);
    this.playerShadow.renderOrder = 2;
    this.group.add(this.playerShadow);
    this.disposables.push(sg, sm);

    // 鬼火：發光小球
    const bg = ball(0.2, 12, 8);
    // 2026-11-10「太炫光」：發光倍率 3.2 → 1.7（亮、但只有一點點光暈，不糊成一片）
    // D85 水墨風：有顏色的墨團（自己只發一點光，夜晚看得到、不炫光）
    const inkC = fxOf(run.yokai.id).ink;
    const bm = soft(inkC, { emissive: inkC, emissiveIntensity: 0.6 });
    this.diskShot = run.yokai.id === 'kappa';
    this.bulletMesh = new THREE.InstancedMesh(bg, bm, run.projectiles.capacity);
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.count = 0;
    setHugeBounds(this.bulletMesh, 200);
    this.group.add(this.bulletMesh);
    this.disposables.push(bg, bm);

    // 魂火：小的青白色光點
    const og = ball(0.12, 10, 8);
    const om = glow(palette.fire.soul, 1.3);
    this.orbMesh = new THREE.InstancedMesh(og, om, run.orbs.capacity);
    this.orbMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.orbMesh.count = 0;
    setHugeBounds(this.orbMesh, 200);
    this.group.add(this.orbMesh);
    this.disposables.push(og, om);

    // 燈火光圈：地面上一圈淡淡的暖色環（半徑 = 光圈半徑）
    // 光圈環：每個頂點每幀貼著地形高度（平的環會在丘陵上被地面吃掉）
    const ag = new THREE.BufferGeometry();
    const ringPos = new Float32Array((AURA_SEGMENTS + 1) * 2 * 3);
    const ringIdx: number[] = [];
    for (let k = 0; k < AURA_SEGMENTS; k++) ringIdx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
    ag.setAttribute('position', new THREE.BufferAttribute(ringPos, 3).setUsage(THREE.DynamicDrawUsage));
    ag.setIndex(ringIdx);
    ag.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
    const am = new THREE.MeshBasicMaterial({ color: fxOf(run.yokai.id).aura, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    this.aura = new THREE.Mesh(ag, am);
    this.aura.frustumCulled = false;
    this.aura.renderOrder = 2;
    markOverlay(this.aura); // 玩家身上的光圈：指示範圍，不像素化
    this.group.add(this.aura);
    this.disposables.push(ag, am);

    this.elementsView = new ElementsView(run.elements, map);
    this.group.add(this.elementsView.group);
    this.pickupsView = new PickupsView(run);
    this.group.add(this.pickupsView.group);
    // 屬性特效（docs/30）：火（提燈小僧）、水（河童）共用同一套引擎，只換外觀
    const style = vfxStyleOf(run.yokai.id);
    this.isWater = style === 'water';
    this.fireFx = style === 'fire' ? new ElementFx() : style === 'water' ? new ElementFx(WATER_FX, palette.wave) : null;
    if (this.fireFx) this.group.add(...this.fireFx.objects);
    this.fireReact = !this.fireFx ? null : style === 'water' ? new WaterReact(run, this.fireFx) : new FireReact(run, this.fireFx);
    this.ultFx = new UltFx(run, this.fireFx);
    this.group.add(this.ultFx.group);
    this.techFx = new TechFx(run, this.fireFx);
    this.group.add(this.techFx.group);
    this.feelFx = new FeelFx(run, !!this.fireFx);
    this.group.add(this.feelFx.group);
    this.numbers = new DamageNumbers(renderer.camera, run.feed);
    this.group.add(this.numbers.mesh);

    // 傳送門：地上一圈發光環＋一道往上的光柱（遠處也看得到），頭目倒下後才顯示
    const pg = new THREE.TorusGeometry(1.5, 0.12, 10, 40).rotateX(Math.PI / 2);
    const pm = glow(palette.fire.soul, 3);
    this.portalRing = new THREE.Mesh(pg, pm);
    const bg2 = new THREE.CylinderGeometry(1.4, 1.4, 40, 24, 1, true);
    const bm2 = new THREE.MeshBasicMaterial({ color: palette.fire.soul, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.portalBeam = new THREE.Mesh(bg2, bm2);
    this.portalBeam.position.y = 20;
    markOverlay(this.portalBeam); // 傳送門光柱：不像素化
    this.portal = new THREE.Group();
    this.portal.add(this.portalRing, this.portalBeam);
    this.portal.visible = false;
    this.group.add(this.portal);
    this.disposables.push(pg, pm, bg2, bm2);

    scene.add(this.group);
    // 陰影只讓夠大的零件投影（每個投影的零件都多一次繪製；手機 draw call 預算 80）
    pruneShadowCasters(this.world.group, SHADOW_MIN_RADIUS.world);
    pruneShadowCasters(this.elementsView.group, SHADOW_MIN_RADIUS.world);
    pruneShadowCasters(this.player.root, SHADOW_MIN_RADIUS.player);
    renderer.snapCamera(run.px, run.py, run.pz, run.map);
  }

  /** 化身的那一刻（D94）：屬性光柱、四散的火星／水珠、閃光、衝擊波圈 */
  formBurst(form: number): void {
    const run = this.run;
    const y = run.py;
    const s = form >= 2 ? 1.4 : 1;
    this.feelFx.formBurst(FORM_BURST.radius * run.stats.value.area);
    const fx = this.fireFx;
    if (!fx) return;
    fx.flare(run.px, y, run.pz, 1.6 * s, 4.5 * s, 1.1, 0.3, true);
    fx.emit(run.px, y + 1.2, run.pz, 40 * s, 2.5, 5 * s);
    fx.glints(run.px, y + 1.4, run.pz, 14 * s, 1.6);
    fx.flash(run.px, y + 1, run.pz, 4 * s, 1.6, 0.6, GLOW_HALO);
    fx.ripple(run.px, run.map.heightAt(run.px, run.pz) + 0.06, run.pz, FORM_BURST.radius * 0.8, 0.9);
  }

  /** 每個畫面幀呼叫一次（不是每個模擬步）。dt = 這一幀的真實秒數，t = 累計時間 */
  update(dt: number, t: number): void {
    const run = this.run;
    const map = run.map;
    // 玩家（py = 腳底高度，跳起來時高於地面）
    const ground = map.heightAt(run.px, run.pz);
    this.player.root.position.set(run.px, run.py, run.pz);
    this.player.root.rotation.y = run.facing;
    // 化身（D84）：模型慢慢長大到這一階的大小
    const fs = this.player.root.scale.x + (run.formScale - this.player.root.scale.x) * Math.min(1, dt * 3);
    this.player.root.scale.setScalar(fs);
    this.player.update(dt, t, run.moveSpeed > 0.1 && run.grounded, run.moveSpeed);
    if (run.invul > 0) this.player.setFlash(Math.min(1, run.invul / COMBAT.invulnerable));
    // 腳下陰影貼著地面，跳得越高越小
    this.playerShadow.position.set(run.px, ground + DECAL_LIFT, run.pz);
    this.playerShadow.scale.setScalar(Math.max(0.4, 1.25 - (run.py - ground) * 0.3));
    const ar = run.yokai.aura.radius * run.stats.value.area;
    const ring = (this.aura.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let k = 0; k <= AURA_SEGMENTS; k++) {
      const a = (k / AURA_SEGMENTS) * TWO_PI;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      for (let side = 0; side < 2; side++) {
        const r = side === 0 ? ar - AURA_WIDTH : ar;
        const x = run.px + cx * r;
        const z = run.pz + sz * r;
        const o = (k * 2 + side) * 3;
        ring[o] = x;
        ring[o + 1] = map.heightAt(x, z) + DECAL_LIFT;
        ring[o + 2] = z;
      }
    }
    (this.aura.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    // 自由視角鏡頭與玩家身上的光
    this.renderer.updateCamera(dt, run.px, run.py, run.pz, map);
    this.renderer.playerLight.position.set(run.px, run.py + PLAYER_LIGHT_HEIGHT, run.pz);
    this.renderer.followLight(run.px, run.py, run.pz);
    this.numbers.refreshOrientation(this.renderer.camera);
    // 傳送門
    this.portal.visible = run.portal.active;
    if (run.portal.active) {
      this.portal.position.set(run.portal.x, run.portal.y, run.portal.z);
      this.portalRing.rotation.y = t * 1.2;
      this.portalRing.position.y = 0.6 + Math.sin(t * 2) * 0.12;
    }

    this.elementsView.update(t);
    this.pickupsView.update(t);
    const fxDt = Math.min(0.1, Math.max(0, t - this.lastFxT));
    this.lastFxT = t;
    this.fireFx?.begin();
    // 火光是裝飾：畫質最省（自動降到底或手動選「低」）時不畫，省一次繪製（p1：手機滿場 draw call 預算）
    if (this.fireFx) this.fireFx.glowMesh.visible = this.glowOn && this.renderer.pipeline.level < FIRE_FX.glow.offAtQuality;
    this.ultFx.update(fxDt);
    this.fireReact?.update(fxDt);
    // 化身後身上常駐的屬性光（D94）：火星或水珠繞著身體往上飄，第二階更多
    if (this.fireFx && run.form > 0) this.fireFx.emitRate(run.px, run.py + 0.9 * run.formScale, run.pz, FORM_AURA_RATE[run.form - 1], fxDt, 0.6);
    this.techFx.update(t);
    this.feelFx.update(dt);
    this.timeUniform.value = t % TWO_PI;

    // 敵人：依種類分到各自的圖層
    const e = run.enemies;
    const sm = this.enemyShadow.instanceMatrix.array as Float32Array;
    const counts = this.enemyCounts;
    counts.fill(0);
    let total = 0;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const k = e.kind[i];
      const mesh = this.enemyMeshes[k];
      const n = counts[k]++;
      const em = mesh.instanceMatrix.array as Float32Array;
      const ph = (mesh.geometry.getAttribute('aPhase') as THREE.InstancedBufferAttribute).array as Float32Array;
      const col = (mesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
      const x = e.x[i];
      const z = e.z[i];
      const y = map.heightAt(x, z);
      const sc = e.scale[i];
      writeMatrix(em, n, x, y, z, e.yaw[i], sc, sc, sc);
      writeMatrix(sm, total++, x, y + DECAL_LIFT, z, 0, sc, 1, sc);
      ph[n] = e.phase[i];
      const f = e.flash[i] > 0 ? 1 + (e.flash[i] / COMBAT.hitFlash) * 2.2 : 1;
      // 精英偏紅、頭目更紅（一般人類的顏色不變）；弓手瞄準時偏紅閃爍（預告）
      const v = e.variant[i];
      const aim = e.wind[i] > 0 ? 0.6 + 0.4 * Math.sin(t * 28) : 0;
      // 老練（Q55）：偏藍紫（和精英的紅、頭目的深紅分得開）
      const vt = e.vet[i] === 1;
      col[n * 3] = f * (vt ? 0.8 : v === 0 ? 1 : 1.5) * (1 + aim * 0.8);
      col[n * 3 + 1] = f * (vt ? 0.75 : v === 0 ? 1 : v === 1 ? 0.7 : 0.5) * (1 - aim * 0.45);
      col[n * 3 + 2] = f * (vt ? 1.45 : v === 0 ? 1 : v === 1 ? 0.7 : 0.5) * (1 - aim * 0.45);
    }
    for (let k = 0; k < this.enemyMeshes.length; k++) {
      const mesh = this.enemyMeshes[k];
      mesh.count = counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      (mesh.geometry.getAttribute('aPhase') as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
    this.enemyShadow.count = total;
    this.enemyShadow.instanceMatrix.needsUpdate = true;
    this.shotsView.update();
    this.ambience.update(t, this.renderer.camera.position, run.px, run.pz);

    // 鬼火
    const pr = run.projectiles;
    const bm = this.bulletMesh.instanceMatrix.array as Float32Array;
    let b = 0;
    for (let i = 0; i < pr.high; i++) {
      if (!pr.alive[i]) continue;
      // 碎火、分裂出來的小火畫小一點（看得出是碎片）
      const sc = pr.gen[i] === 0 ? 1 : SHARD_VIEW_SCALE;
      // 河童的水盤：扁扁的圓盤；鬼火：圓球
      if (this.fireFx && this.isWater) {
        // 水盤：圓盤照畫，飛的時候甩出水珠、帶一圈淡淡的水光
        const B = WATER_FX.bullet;
        const y = map.heightAt(pr.x[i], pr.z[i]) + 0.8;
        this.fireFx.emitRate(pr.x[i], y, pr.z[i], B.dropRate * sc, fxDt, 0.8);
        this.fireFx.glow(pr.x[i], y, pr.z[i], B.halo * sc, 1, GLOW_HALO);
      } else if (this.fireFx) {
        // 浮世繪的火：鬼火就是一團飄著的火舌，尾巴掉火星
        const B = FIRE_FX.bullet;
        const y = map.heightAt(pr.x[i], pr.z[i]) + B.lift;
        this.fireFx.flame(pr.x[i], y, pr.z[i], B.w * sc, B.h * sc, i * 0.61);
        this.fireFx.glow(pr.x[i], y + 0.45 * sc, pr.z[i], B.halo * sc, 1, GLOW_HALO);
        this.fireFx.emitRate(pr.x[i], y + 0.4 * sc, pr.z[i], B.sparkRate * sc, fxDt, 0.3);
        continue;
      }
      writeMatrix(bm, b++, pr.x[i], map.heightAt(pr.x[i], pr.z[i]) + 0.8, pr.z[i], 0, this.diskShot ? sc * 1.3 : sc, this.diskShot ? sc * 0.35 : sc, this.diskShot ? sc * 1.3 : sc);
    }
    this.bulletMesh.count = b;
    this.fireFx?.end(fxDt, t);
    this.bulletMesh.instanceMatrix.needsUpdate = true;

    // 魂火（上下輕輕飄）
    const ob = run.orbs;
    const om = this.orbMesh.instanceMatrix.array as Float32Array;
    let o = 0;
    for (let i = 0; i < ob.high; i++) {
      if (!ob.alive[i]) continue;
      const bob = Math.sin(t * 4 + i) * 0.08;
      writeMatrix(om, o++, ob.x[i], map.heightAt(ob.x[i], ob.z[i]) + 0.45 + bob, ob.z[i], 0, 1, 1, 1);
    }
    this.orbMesh.count = o;
    this.orbMesh.instanceMatrix.needsUpdate = true;

    this.numbers.update(dt, map);
  }

  /** 局結束：清掉飄著的數字，畫面凍結成背景 */
  freeze(): void {
    this.numbers.clear();
  }

  dispose(): void {
    this.numbers.dispose();
    this.elementsView.dispose();
    this.pickupsView.dispose();
    this.ultFx.dispose();
    this.techFx.dispose();
    this.fireFx?.dispose();
    this.feelFx.dispose();
    this.player.dispose();
    this.world.dispose();
    for (const d of this.disposables) d.dispose();
    for (const m of this.enemyMeshes) m.dispose();
    this.shotsView.dispose();
    this.ambience.dispose();
    this.enemyShadow.dispose();
    this.bulletMesh.dispose();
    this.orbMesh.dispose();
    this.group.removeFromParent();
  }
}

/** 這一局要不要換成 Blender 模型（主網址固定用、不吃網址參數；測試頁預設用；開發版預設不用） */
function useBlenderModels(): boolean {
  if (import.meta.env.MODE === 'single-main') return true;
  const q = new URLSearchParams(location.search).get('model');
  return (q ?? (import.meta.env.MODE === 'single' ? 'blender' : '')) === 'blender';
}
