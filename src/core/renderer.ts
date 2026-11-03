import * as THREE from 'three';
import { CAMERA, fovForAspect } from '../data/camera';
import { palette } from '../art/palette';

/**
 * 渲染器與鏡頭（M0 最小版）。畫質分級與 Bloom 在 M1 從燈落之境的 renderer.ts 搬（docs/10 第 2 節）。
 * 光源規則（docs/06 第 6 節）：只有 1 盞方向光（月光）＋ 1 盞點光（跟著玩家），中途不增減。
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly moon: THREE.DirectionalLight;
  readonly playerLight: THREE.PointLight;
  /** 鏡頭注視點（只動 X／Z） */
  readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(palette.night.sky);
    this.scene.fog = new THREE.Fog(palette.night.fog, 30, 70);

    this.camera = new THREE.PerspectiveCamera(CAMERA.baseFovDeg, 1, CAMERA.near, CAMERA.far);
    const p = (CAMERA.pitchDeg * Math.PI) / 180;
    this.offset.set(0, Math.sin(p) * CAMERA.distance, Math.cos(p) * CAMERA.distance);

    this.moon = new THREE.DirectionalLight(palette.moon, 1.6);
    this.moon.position.set(-8, 20, 6);
    this.scene.add(this.moon);
    this.playerLight = new THREE.PointLight(palette.warm.orange, 30, 12, 1.6);
    this.playerLight.position.set(0, 1.5, 0);
    this.scene.add(this.playerLight);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.snapCamera();
  }

  resize(): void {
    const w = Math.max(1, this.host.clientWidth || window.innerWidth);
    const h = Math.max(1, this.host.clientHeight || window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fovForAspect(this.camera.aspect);
    this.camera.updateProjectionMatrix();
  }

  /** 鏡頭立刻到位（開局、測試） */
  snapCamera(): void {
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }

  /** 平滑跟隨 (x, z)；dt 秒。不配置記憶體。 */
  follow(x: number, z: number, dt: number): void {
    const k = 1 - Math.exp(-CAMERA.followDamping * dt);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.camera.position.set(this.target.x + this.offset.x, this.target.y + this.offset.y, this.target.z + this.offset.z);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
