import * as THREE from 'three';
import { palette } from '../art/palette';
import { glow } from '../art/materials';
import { ball } from '../art/shapes';
import type { Run } from '../game/run';
import { COMBAT } from '../data/combat';
import { buildLanternMonk, type Character } from '../units/lanternMonk';
import { buildVillagerGeometry } from '../units/villager';
import { buildWorldView, type WorldView } from '../world/worldView';
import { writeMatrix, setHugeBounds } from './instancedLayer';
import { DamageNumbers } from './damageNumbers';
import { ElementsView } from './elementsView';
import { PickupsView } from './pickupsView';
import { UltFx } from './ultFx';
import { VariantFx } from './variantFx';
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
export class RunView {
  private readonly world: WorldView;
  private readonly player: Character;
  private readonly enemyMesh: THREE.InstancedMesh;
  private readonly enemyShadow: THREE.InstancedMesh;
  private readonly bulletMesh: THREE.InstancedMesh;
  private readonly orbMesh: THREE.InstancedMesh;
  private readonly playerShadow: THREE.Mesh;
  private readonly aura: THREE.Mesh;
  private readonly numbers: DamageNumbers;
  private readonly elementsView: ElementsView;
  private readonly pickupsView: PickupsView;
  private readonly ultFx: UltFx;
  private readonly variantFx: VariantFx;
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
    this.world = buildWorldView(map, run.seed);
    this.group.add(this.world.group);

    this.player = buildLanternMonk();
    this.group.add(this.player.root);

    // 敵人：單一幾何＋頂點色，頂點著色器做彈跳與傾斜（T2：頂點著色器動畫）
    const eg = buildVillagerGeometry();
    const phase = new THREE.InstancedBufferAttribute(new Float32Array(run.enemies.capacity), 1);
    phase.setUsage(THREE.DynamicDrawUsage);
    eg.setAttribute('aPhase', phase);
    const em = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    em.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.timeUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float bounce = sin(uTime * ${BOUNCE_FREQ.toFixed(1)} + aPhase);
          transformed.y += abs(bounce) * 0.1;
          transformed.x += bounce * transformed.y * 0.07;`,
        );
    };
    this.enemyMesh = new THREE.InstancedMesh(eg, em, run.enemies.capacity);
    this.enemyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(run.enemies.capacity * 3).fill(1), 3);
    this.enemyMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.enemyMesh.count = 0;
    setHugeBounds(this.enemyMesh, 200);
    this.group.add(this.enemyMesh);
    this.disposables.push(eg, em);

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
    const bm = glow(palette.fire.ghost, 3.2);
    this.bulletMesh = new THREE.InstancedMesh(bg, bm, run.projectiles.capacity);
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.count = 0;
    setHugeBounds(this.bulletMesh, 200);
    this.group.add(this.bulletMesh);
    this.disposables.push(bg, bm);

    // 魂火：小的青白色光點
    const og = ball(0.12, 10, 8);
    const om = glow(palette.fire.soul, 3.4);
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
    const am = new THREE.MeshBasicMaterial({ color: palette.warm.amber, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    this.aura = new THREE.Mesh(ag, am);
    this.aura.frustumCulled = false;
    this.aura.renderOrder = 2;
    this.group.add(this.aura);
    this.disposables.push(ag, am);

    this.elementsView = new ElementsView(run.elements, map);
    this.group.add(this.elementsView.group);
    this.pickupsView = new PickupsView(run);
    this.group.add(this.pickupsView.group);
    this.ultFx = new UltFx(run);
    this.group.add(this.ultFx.group);
    this.variantFx = new VariantFx(run);
    this.group.add(this.variantFx.group);
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
    this.portal = new THREE.Group();
    this.portal.add(this.portalRing, this.portalBeam);
    this.portal.visible = false;
    this.group.add(this.portal);
    this.disposables.push(pg, pm, bg2, bm2);

    scene.add(this.group);
    renderer.snapCamera(run.px, run.py, run.pz, run.map);
  }

  /** 每個畫面幀呼叫一次（不是每個模擬步）。dt = 這一幀的真實秒數，t = 累計時間 */
  update(dt: number, t: number): void {
    const run = this.run;
    const map = run.map;
    // 玩家（py = 腳底高度，跳起來時高於地面）
    const ground = map.heightAt(run.px, run.pz);
    this.player.root.position.set(run.px, run.py, run.pz);
    this.player.root.rotation.y = run.facing;
    this.player.update(dt, t, run.moveSpeed > 0.1 && run.grounded, run.moveSpeed);
    if (run.invul > 0) this.player.setFlash(Math.min(1, run.invul / COMBAT.invulnerable));
    // 腳下陰影貼著地面，跳得越高越小
    this.playerShadow.position.set(run.px, ground + DECAL_LIFT, run.pz);
    this.playerShadow.scale.setScalar(Math.max(0.4, 1.25 - (run.py - ground) * 0.3));
    const ar = run.yokai.aura.radius * run.stats.value.area * run.syn.auraMult;
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
    this.renderer.playerLight.position.set(run.px, run.py + 1.6, run.pz);
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
    this.ultFx.update();
    this.variantFx.update(t);
    this.timeUniform.value = t % TWO_PI;

    // 敵人
    const e = run.enemies;
    const em = this.enemyMesh.instanceMatrix.array as Float32Array;
    const sm = this.enemyShadow.instanceMatrix.array as Float32Array;
    const ph = (this.enemyMesh.geometry.getAttribute('aPhase') as THREE.InstancedBufferAttribute).array as Float32Array;
    const col = (this.enemyMesh.instanceColor as THREE.InstancedBufferAttribute).array as Float32Array;
    let n = 0;
    for (let i = 0; i < e.high; i++) {
      if (!e.alive[i]) continue;
      const x = e.x[i];
      const z = e.z[i];
      const y = map.heightAt(x, z);
      const sc = e.scale[i];
      writeMatrix(em, n, x, y, z, e.yaw[i], sc, sc, sc);
      writeMatrix(sm, n, x, y + DECAL_LIFT, z, 0, sc, 1, sc);
      ph[n] = e.phase[i];
      const f = e.flash[i] > 0 ? 1 + (e.flash[i] / COMBAT.hitFlash) * 2.2 : 1;
      // 精英偏紅、頭目更紅（一般人類的顏色不變）
      const v = e.variant[i];
      col[n * 3] = f * (v === 0 ? 1 : 1.5);
      col[n * 3 + 1] = f * (v === 0 ? 1 : v === 1 ? 0.7 : 0.5);
      col[n * 3 + 2] = f * (v === 0 ? 1 : v === 1 ? 0.7 : 0.5);
      n++;
    }
    this.enemyMesh.count = n;
    this.enemyShadow.count = n;
    this.enemyMesh.instanceMatrix.needsUpdate = true;
    this.enemyShadow.instanceMatrix.needsUpdate = true;
    (this.enemyMesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.enemyMesh.geometry.getAttribute('aPhase') as THREE.InstancedBufferAttribute).needsUpdate = true;

    // 鬼火
    const pr = run.projectiles;
    const bm = this.bulletMesh.instanceMatrix.array as Float32Array;
    let b = 0;
    for (let i = 0; i < pr.high; i++) {
      if (!pr.alive[i]) continue;
      writeMatrix(bm, b++, pr.x[i], map.heightAt(pr.x[i], pr.z[i]) + 0.8, pr.z[i], 0, 1, 1, 1);
    }
    this.bulletMesh.count = b;
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
    this.variantFx.dispose();
    this.player.dispose();
    this.world.dispose();
    for (const d of this.disposables) d.dispose();
    this.enemyMesh.dispose();
    this.enemyShadow.dispose();
    this.bulletMesh.dispose();
    this.orbMesh.dispose();
    this.group.removeFromParent();
  }
}
