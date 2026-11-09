import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * 像素化＋描線（日系 RPG 風格，D72，docs/23 第 8 節）：場景只畫一次（低解析度＋深度貼圖），
 * 再用深度找邊界、在「邊界外側（比較遠的那一側）」描深色線（鄰居比自己近＝前景物體的邊；用相對深度差，遠近一樣粗），最後最近點放大到畫面。
 * Three.js 內建的 RenderPixelatedPass 會為了法線多畫一次整個場景（手機 draw call 翻倍、頂到預算），所以自己寫一個只用深度的版本。
 */
export class PixelPass extends Pass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  private pixelSize: number;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly mat: THREE.ShaderMaterial;
  private readonly res = new THREE.Vector2();

  constructor(pixelSize: number, scene: THREE.Scene, camera: THREE.Camera, edge: { strength: number; from: number; to: number }) {
    super();
    this.pixelSize = pixelSize;
    this.scene = scene;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        texel: { value: new THREE.Vector2() },
        near: { value: 0.1 },
        far: { value: 100 },
        strength: { value: edge.strength },
        edgeFrom: { value: edge.from },
        edgeTo: { value: edge.to },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 texel;
        uniform float near;
        uniform float far;
        uniform float strength;
        uniform float edgeFrom;
        uniform float edgeTo;
        varying vec2 vUv;
        float viewDepth(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
        // neighbour closer than this pixel -> this pixel is background just outside an edge (relative difference)
        float edgeAt(float d, vec2 uv) {
          float n = viewDepth(uv);
          return smoothstep(edgeFrom, edgeTo, (d - n) / max(d, 0.001));
        }
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float d = viewDepth(vUv);
          float e = edgeAt(d, vUv + vec2(texel.x, 0.0)) + edgeAt(d, vUv - vec2(texel.x, 0.0)) + edgeAt(d, vUv + vec2(0.0, texel.y)) + edgeAt(d, vUv - vec2(0.0, texel.y));
          c.rgb *= 1.0 - strength * clamp(e, 0.0, 1.0);
          gl_FragColor = c;
        }
      `,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / this.pixelSize));
    const h = Math.max(1, Math.floor(height / this.pixelSize));
    this.res.set(w, h);
    this.target.setSize(w, h);
    this.mat.uniforms.texel.value.set(1 / w, 1 / h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    const cam = this.camera as THREE.PerspectiveCamera;
    this.mat.uniforms.near.value = cam.near;
    this.mat.uniforms.far.value = cam.far;
    this.mat.uniforms.tDiffuse.value = this.target.texture;
    this.mat.uniforms.tDepth.value = this.target.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose(): void {
    this.target.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
