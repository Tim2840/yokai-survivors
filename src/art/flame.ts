import * as THREE from 'three';
import { palette } from './palette';

/**
 * 浮世繪風的火（docs/30）：一個材質同時畫「火舌」與「火星」（每個實例的 aInfo.z 選種類），一次繪製。
 * - 幾何是一片底在 y = 0 的方形；頂點著色器把它轉成只繞垂直軸面向鏡頭（火永遠往上竄，不會跟著鏡頭俯仰倒下）。
 * - 片段著色器用雜訊畫出火舌：下寬上尖、尖端分叉往一邊捲、整條會搖、雜訊往上捲動（燃燒的感覺）；
 *   顏色是平塗的色帶（木版畫的分色），最外圈一條暗紅描邊；aFade 越大火越小、色帶往外縮（快熄的火只剩紅與暗紅）。
 * - 剪影式透明（discard）：不需要排序、可以寫深度；邊緣靠多重取樣抗鋸齒。
 * 全部程式產生，不用貼圖檔。顏色在 palette.flame。著色器字串裡的註解用英文（原始碼掃描不准字串裡有中文）。
 */
export function flameMaterial(time: { value: number }): THREE.ShaderMaterial {
  const C = palette.flame;
  const col = (h: string) => new THREE.Color(h);
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: time,
        cOutline: { value: col(C.outline) },
        cRed: { value: col(C.red) },
        cOrange: { value: col(C.orange) },
        cYellow: { value: col(C.yellow) },
        cCore: { value: col(C.core) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 aInfo; // x = seed, y = fade(0..1), z = kind (0 flame tongue, 1 spark)
      varying vec2 vUv;
      varying vec3 vInfo;
      void main() {
        vUv = uv;
        vInfo = aInfo;
        vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sx = length(instanceMatrix[0].xyz);
        float sy = length(instanceMatrix[1].xyz);
        vec3 toCam = cameraPosition - center;
        toCam.y = 0.0;
        float l = length(toCam);
        vec3 right = l > 1e-4 ? normalize(cross(vec3(0.0, 1.0, 0.0), toCam / l)) : vec3(1.0, 0.0, 0.0);
        vec3 wp = center + right * position.x * sx + vec3(0.0, position.y * sy, 0.0);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 cOutline, cRed, cOrange, cYellow, cCore;
      varying vec2 vUv;
      varying vec3 vInfo;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 1.7) + 0.125 * vn(p * 4.01 + 3.1); }
      // flat colour bands (woodblock style); tiny transition at each edge for anti-aliasing
      vec3 band(float f, float fade) {
        float w = 0.02;
        vec3 c = cOutline;
        c = mix(c, cRed, smoothstep(0.07 - w, 0.07 + w, f));
        c = mix(c, cOrange, smoothstep(0.24 - w, 0.24 + w, f + fade * -0.12));
        c = mix(c, cYellow, smoothstep(0.42 - w, 0.42 + w, f + fade * -0.25));
        c = mix(c, cCore * 1.15, smoothstep(0.62 - w, 0.62 + w, f + fade * -0.4));
        return c;
      }
      void main() {
        float seed = vInfo.x;
        float fade = vInfo.y;
        vec3 c;
        if (vInfo.z > 0.5) {
          // spark: small diamond, darker and redder as it ages
          vec2 q = abs(vUv * 2.0 - 1.0);
          if (q.x + q.y > 1.0 - fade * 0.3) discard;
          c = mix(cCore, cRed, fade);
          c = mix(c, cOutline, step(0.72 - fade * 0.3, q.x + q.y));
        } else {
          float t = uTime + seed * 17.0;
          float u = vUv.x * 2.0 - 1.0;
          float v = vUv.y;
          // sway; the tip hooks to one side (ukiyo-e flame pattern)
          float sway = sin(t * 1.9 + seed * 6.0);
          u += v * v * 0.38 * sway + v * 0.1 * sin(t * 4.3 + seed * 3.0);
          u += v * v * v * 0.55 * sign(sway + 0.001) * (0.6 + 0.4 * sin(t * 2.7 + seed));
          // noise scrolling upward: tongues rise
          float nz = fbm(vec2(u * 2.0 + seed * 9.0, v * 2.2 - t * 2.1));
          float nz2 = vn(vec2(u * 4.5 - seed * 4.0, v * 3.6 - t * 3.3));
          // body: round base, widest low, tapering to the top
          float w = 0.8 * pow(max(1.0 - v, 0.0), 0.75) * smoothstep(-0.04, 0.22, v);
          float shape = w - abs(u);
          // forks: a horizontal wave (pushed by noise) splits the upper half into 2-3 tongues
          float tg = 0.5 + 0.5 * cos((u + (nz - 0.5) * 0.7) * 8.5 + seed * 2.0);
          float f = shape * 2.0 + (nz - 0.5) * (0.3 + 0.7 * v) + (nz2 - 0.5) * 0.16 * v
                  - v * v * 0.75 * tg - fade * 0.55;
          if (f < 0.0) discard;
          c = band(f, fade);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    fog: true,
    side: THREE.DoubleSide,
  });
  return m;
}

/** 火舌／火星共用的一片：寬 1、高 1、底邊在 y = 0、中心 x = 0 */
export function flameQuad(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
}
