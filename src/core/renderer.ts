import * as THREE from 'three';
import { CAMERA, fovForAspect } from '../data/camera';
import { CameraRig, type HeightSource } from './cameraRig';
import { palette } from '../art/palette';
import { createPipeline, type Pipeline } from './postfx';
import type { Quality } from './save';
import type { AmbienceDef } from '../data/ambience';

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
  /** 半球光（補月光照不到的暗面；顏色與強度跟著地圖主題，數量不變） */
  readonly hemi: THREE.HemisphereLight;
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
    this.hemi = new THREE.HemisphereLight(palette.night.sky, palette.night.groundDark, 0.5);
    this.scene.add(this.hemi);
    this.playerLight = new THREE.PointLight(palette.warm.orange, 30, 12, 1.6);
    this.playerLight.position.set(0, 1.5, 0);
    this.scene.add(this.playerLight);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.snapCamera(0, 0, 0, { heightAt: () => 0 });
  }

  /** 套用地圖主題的天色、霧、環境光與月光方向（每局開始時；只改顏色與位置，不增減光源） */
  applyAmbience(a: AmbienceDef): void {
    (this.scene.background as THREE.Color).set(a.sky.horizon);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(a.fog.color);
    fog.near = a.fog.near;
    fog.far = a.fog.far;
    this.hemi.color.set(a.hemi.sky);
    this.hemi.groundColor.set(a.hemi.ground);
    this.hemi.intensity = a.hemi.intensity;
    const az = (a.sky.lightAzimuth * Math.PI) / 180;
    const el = (a.sky.moon.elevation * Math.PI) / 180;
    // 主光的方位另外設（lightAzimuth：從預設鏡頭那一側照過來，角色的臉不背光）；仰角比月亮高一些，不然斜照太平、地面明暗太重
    const lightEl = Math.min(Math.PI / 2, el + 0.5);
    this.moon.position.set(Math.sin(az) * Math.cos(lightEl), Math.sin(lightEl), Math.cos(az) * Math.cos(lightEl)).multiplyScalar(25);
    this.moon.color.set(a.sky.moon.color);
    this.moon.intensity = a.sky.moon.light;
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
