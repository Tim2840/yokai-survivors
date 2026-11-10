import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { OVERLAY_LAYER, overlayUniforms } from '../render/overlay';

/**
 * 像素化＋描線（日系 RPG 風格，D72，docs/23 第 8 節）：場景只畫一次（低解析度＋深度貼圖），
 * 再用深度找邊界、在「邊界外側（比較遠的那一側）」描深色線（鄰居比自己近＝前景物體的邊；用相對深度差，遠近一樣粗），最後最近點放大到畫面。
 * Three.js 內建的 RenderPixelatedPass 會為了法線多畫一次整個場景（手機 draw call 翻倍、頂到預算），所以自己寫一個只用深度的版本。
 */
export class PixelPass extends Pass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** 低解析度畫面的短邊像素數（放大倍率 = 畫面短邊 ÷ 這個，取整數、至少 2） */
  private readonly shortSide: number;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly mat: THREE.ShaderMaterial;
  private readonly res = new THREE.Vector2();
  private readonly res2 = new THREE.Vector2();

  constructor(shortSide: number, scene: THREE.Scene, camera: THREE.Camera, edge: { strength: number; from: number; to: number; levels: number; dither: number }) {
    super();
    this.shortSide = shortSide;
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
        levels: { value: edge.levels },
        dither: { value: edge.dither },
        lowRes: { value: new THREE.Vector2(1, 1) },
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
        uniform float levels;
        uniform float dither;
        uniform vec2 lowRes;
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
          if (levels > 0.5) {
            // palette quantization in gamma space with a 4x4 Bayer dither on the low-res pixel grid; HDR part (> 1, glow) is kept
            vec3 hdr = max(c.rgb - 1.0, 0.0);
            vec3 g = pow(clamp(c.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
            vec2 q = floor(vUv * lowRes);
            int ix = int(mod(q.x, 4.0));
            int iy = int(mod(q.y, 4.0));
            int idx = ix + iy * 4;
            // 4x4 Bayer thresholds 0..15 (indexed without arrays for GLSL ES 1.0 safety)
            float b = 0.0;
            if (idx == 0) b = 0.0; else if (idx == 1) b = 8.0; else if (idx == 2) b = 2.0; else if (idx == 3) b = 10.0;
            else if (idx == 4) b = 12.0; else if (idx == 5) b = 4.0; else if (idx == 6) b = 14.0; else if (idx == 7) b = 6.0;
            else if (idx == 8) b = 3.0; else if (idx == 9) b = 11.0; else if (idx == 10) b = 1.0; else if (idx == 11) b = 9.0;
            else if (idx == 12) b = 15.0; else if (idx == 13) b = 7.0; else if (idx == 14) b = 13.0; else b = 5.0;
            float t = (b + 0.5) / 16.0 - 0.5;
            g = floor(g * (levels - 1.0) + 0.5 + t * dither) / (levels - 1.0);
            c.rgb = pow(clamp(g, 0.0, 1.0), vec3(2.2)) + hdr;
          }
          gl_FragColor = c;
        }
      `,
    });
    this.quad = new FullScreenQuad(this.mat);
  }

  setSize(width: number, height: number): void {
    // 放大倍率不一定是整數（2026-11-10 使用者：像素感再輕一些）：低解析度畫面的短邊固定約 shortSide，倍率 < 1.05 就乾脆不縮
    const raw = Math.min(width, height) / this.shortSide;
    const scale = raw < 1.05 ? 1 : raw;
    const w = Math.max(1, Math.floor(width / scale));
    const h = Math.max(1, Math.floor(height / scale));
    this.res.set(w, h);
    this.mat.uniforms.lowRes.value.set(w, h);
    this.target.setSize(w, h);
    this.mat.uniforms.texel.value.set(1 / w, 1 / h);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget): void {
    const cam0 = this.camera as THREE.PerspectiveCamera;
    const saved = cam0.layers.mask;
    // 第 0 層（地圖、角色、技能特效）畫在低解析度；第 1 層（光圈、光柱…不像素化的指示）等一下用完整解析度另外畫
    cam0.layers.set(0);
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
    // 指示圖層：完整解析度、不量化、不描線；靠低解析度的深度圖比較被擋住的部分
    const out = this.renderToScreen ? null : writeBuffer;
    const size = renderer.getDrawingBufferSize(this.res2);
    overlayUniforms.uOvOn.value = 1;
    overlayUniforms.uOvDepth.value = this.target.depthTexture;
    overlayUniforms.uOvRes.value.set(out ? out.width : size.x, out ? out.height : size.y);
    overlayUniforms.uOvNear.value = cam0.near;
    overlayUniforms.uOvFar.value = cam0.far;
    cam0.layers.set(OVERLAY_LAYER);
    const bg = this.scene.background;
    const auto = renderer.autoClear;
    this.scene.background = null;
    renderer.autoClear = false;
    renderer.setRenderTarget(out);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
    this.scene.background = bg;
    cam0.layers.mask = saved;
    overlayUniforms.uOvOn.value = 0;
  }

  dispose(): void {
    this.target.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}
