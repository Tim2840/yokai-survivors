import * as THREE from 'three';
import { CAMERA, fovForAspect } from '../data/camera';
import { CameraRig, type HeightSource } from './cameraRig';
import { palette } from '../art/palette';
import { createPipeline, type Pipeline } from './postfx';
import type { Quality } from './save';

/**
 * 渲染器與鏡頭。後製與畫質分級在 postfx.ts（從燈落之境搬來）。
 * 光源規則（docs/06 第 6 節）：只有 1 盞方向光（月光）＋ 1 盞點光（跟著玩家），中途不增減。
 */
export class Renderer {
  readonly pipeline: Pipeline;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly moon: THREE.DirectionalLight;
  readonly playerLight: THREE.PointLight;
  /** 自由視角鏡頭的數學（D23） */
  readonly rig = new CameraRig();

  constructor(
    host: HTMLElement,
    quality: { mode: Quality; onModeChange?: (m: Quality) => void; fixedLevel?: number },
  ) {
    this.pipeline = createPipeline(host, quality);

    this.scene.background = new THREE.Color(palette.night.sky);
    this.scene.fog = new THREE.Fog(palette.night.fog, 45, 140);

    this.camera = new THREE.PerspectiveCamera(CAMERA.baseFovDeg, 1, CAMERA.near, CAMERA.far);

    this.moon = new THREE.DirectionalLight(palette.moon, 2.6);
    this.moon.position.set(-8, 20, 6);
    this.scene.add(this.moon);
    this.playerLight = new THREE.PointLight(palette.warm.orange, 30, 12, 1.6);
    this.playerLight.position.set(0, 1.5, 0);
    this.scene.add(this.playerLight);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.snapCamera(0, 0, 0, { heightAt: () => 0 });
  }

  resize(): void {
    const { w, h } = this.pipeline.resize();
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = fovForAspect(this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  /** 鏡頭立刻到位（開局、換關、測試） */
  snapCamera(px: number, py: number, pz: number, map: HeightSource): void {
    this.rig.snap(px, py, pz, map);
    this.applyRig();
  }

  /** 每個畫面幀：鏡頭跟隨玩家（3D 位置）、彈簧臂避開地形 */
  updateCamera(dt: number, px: number, py: number, pz: number, map: HeightSource): void {
    this.rig.update(dt, px, py, pz, map);
    this.applyRig();
  }

  private applyRig(): void {
    const r = this.rig;
    this.camera.position.set(r.x, r.y, r.z);
    this.camera.lookAt(r.tx, r.ty, r.tz);
    this.camera.updateMatrixWorld();
  }

  precompile(): void {
    this.pipeline.precompile(this.scene, this.camera);
  }

  render(): void {
    this.pipeline.render(this.scene, this.camera);
  }
}
