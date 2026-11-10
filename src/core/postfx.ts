import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { MAX_QUALITY_LEVEL, QUALITY } from '../data/quality';
import type { Quality } from './save';
import { PixelPass } from './pixelPass';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { currentLook } from '../data/look';

/**
 * 後製管線與畫質分級（從燈落之境的 renderer.ts 搬來，docs/10 第 2 節）：
 * 場景 → Bloom（只抓高亮度）→ Neutral 色調映射 → 調色＋暈影＋抖動。
 * 改動：拿掉移軸模糊；畫質模式存在本作的存檔（settings.quality）而不是另一個 localStorage 鍵；數字移到 src/data/quality.ts。
 * 重點（舊專案的雷）：後製畫在自己的渲染目標上，抗鋸齒要設在渲染目標（samples）；預編譯要綁著渲染目標。
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uContrast: { value: 1 },
    uSat: { value: 1 },
    uVig: { value: 0 },
    uSeed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSat;
    uniform float uVig;
    uniform float uSeed;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= mix(vec3(0.94, 0.97, 1.05), vec3(1.04, 1.0, 0.95), smoothstep(0.15, 0.85, l));
      vec2 q = vUv - 0.5;
      col *= 1.0 - uVig * smoothstep(0.08, 0.75, dot(q, q));
      col += (hash(gl_FragCoord.xy + uSeed) - 0.5) / 255.0;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export function createPipeline(container: HTMLElement, opts: { mode: Quality; onModeChange?: (m: Quality) => void; fixedLevel?: number }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.info.autoReset = false;
  container.appendChild(renderer.domElement);

  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  let mode = opts.mode;
  const levelFor = (m: Quality) => (m === 'auto' ? 0 : QUALITY.modeLevel[m]);
  let level = opts.fixedLevel ?? levelFor(mode);
  const fixed = opts.fixedLevel !== undefined;

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const look = currentLook();
  // 日系 RPG 樣張（docs/23 第 8 節）：低解析度畫面＋描線；一般是普通的 RenderPass
  const pixelPass = look.pixelShort > 0 ? new PixelPass(look.pixelShort, new THREE.Scene(), new THREE.PerspectiveCamera(), { strength: look.edge, from: look.edgeFrom, to: look.edgeTo, levels: look.levels, dither: look.dither, tint: look.edgeTint }) : null;
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const b = look.bloom;
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), b.strength, b.radius, b.threshold);
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uContrast.value = look.contrast;
  grade.uniforms.uSat.value = look.saturation;
  grade.uniforms.uVig.value = look.vignette;
  composer.addPass(pixelPass ?? renderPass);
  composer.addPass(bloom);
  // 移軸景深：上下兩條模糊、中間清楚（模型屋感）
  const tiltH = look.tiltShift > 0 ? new ShaderPass(HorizontalTiltShiftShader) : null;
  const tiltV = look.tiltShift > 0 ? new ShaderPass(VerticalTiltShiftShader) : null;
  if (tiltH && tiltV) {
    tiltH.uniforms.r.value = look.tiltFocus;
    tiltV.uniforms.r.value = look.tiltFocus;
    composer.addPass(tiltH);
    composer.addPass(tiltV);
  }
  composer.addPass(new OutputPass());
  composer.addPass(grade);

  let maxRatio = 2;
  const RATIO_CAP = touch ? QUALITY.ratioCapTouch : QUALITY.ratioCapDesktop;
  // 手機降到 2 級以下才用半解析度光暈（最高畫質用半解析度會讓細光環閃爍，舊專案的雷）
  const bloomScale = () => (touch && level >= 2 ? 0.5 : 1);
  const bloomSetSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w: number, h: number) => bloomSetSize(Math.max(1, Math.round(w * bloomScale())), Math.max(1, Math.round(h * bloomScale())));
  const ratio = () => Math.min(window.devicePixelRatio || 1, maxRatio);

  const resize = () => {
    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);
    renderer.setPixelRatio(ratio());
    renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio());
    composer.setSize(w, h);
    if (tiltH && tiltV) {
      tiltH.uniforms.h.value = look.tiltShift / (w * ratio());
      tiltV.uniforms.v.value = look.tiltShift / (h * ratio());
    }
    return { w, h };
  };

  const apply = () => {
    const samples = level >= 4 ? 0 : level >= 2 ? (touch ? 0 : 2) : touch ? 2 : 4;
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      if (rt.samples !== samples) {
        rt.samples = samples;
        rt.dispose();
      }
    }
    bloom.enabled = level < MAX_QUALITY_LEVEL;
    // 移軸景深是兩道全解析度的後製：畫質自動降到 2 級以下（手機掉幀）就先關掉它
    if (tiltH && tiltV) tiltH.enabled = tiltV.enabled = level < 2;
    maxRatio = RATIO_CAP[level];
    resize();
  };

  // 自動降級（只降不升、不存檔）
  let acc = 0;
  let count = 0;
  let lastT = performance.now();
  let warmUntil = lastT + QUALITY.warmupMs;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) warmUntil = performance.now() + QUALITY.resumeWarmupMs;
  });
  const govern = () => {
    const now = performance.now();
    const ms = now - lastT;
    lastT = now;
    if (fixed || mode !== 'auto' || ms > 250 || document.hidden || now < warmUntil) return;
    acc += ms;
    count++;
    if (acc >= QUALITY.windowMs) {
      if (acc / count > QUALITY.slowFrameMs && level < MAX_QUALITY_LEVEL) {
        level++;
        apply();
      }
      acc = 0;
      count = 0;
    }
  };

  apply();

  return {
    renderer,
    resize,
    get level() {
      return level;
    },
    get mode() {
      return mode;
    },
    setMode(m: Quality) {
      mode = m;
      level = levelFor(m);
      acc = 0;
      count = 0;
      warmUntil = performance.now() + QUALITY.resumeWarmupMs;
      apply();
      opts.onModeChange?.(m);
    },
    /** 載入時先把著色器編好（要綁著後製的渲染目標；後製各道也先畫一幅） */
    precompile(scene: THREE.Scene, camera: THREE.Camera) {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(composer.renderTarget1);
      renderer.compile(scene, camera);
      renderer.setRenderTarget(prev);
      renderPass.scene = scene;
      renderPass.camera = camera;
      if (pixelPass) {
        pixelPass.scene = scene;
        pixelPass.camera = camera;
      }
      const was = bloom.strength;
      bloom.strength = 0;
      composer.render();
      bloom.strength = was;
    },
    render(scene: THREE.Scene, camera: THREE.Camera) {
      govern();
      renderer.info.reset();
      renderPass.scene = scene;
      renderPass.camera = camera;
      if (pixelPass) {
        pixelPass.scene = scene;
        pixelPass.camera = camera;
      }
      grade.uniforms.uSeed.value = (grade.uniforms.uSeed.value + 1.7) % 100;
      composer.render();
    },
  };
}

export type Pipeline = ReturnType<typeof createPipeline>;
