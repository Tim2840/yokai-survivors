import * as THREE from 'three';
import { palette } from './palette';
import { FIRE_FX } from '../data/vfx';

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
        cSmokeDark: { value: col(FIRE_FX.smoke.dark) },
        cSmokeLight: { value: col(FIRE_FX.smoke.light) },
        cGold: { value: col(palette.flame.gold) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec3 aInfo; // x = seed, y = fade(0..1), z = kind (0 flame tongue, 1 spark, 2 gold glint, 3 smoke puff)
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
      uniform vec3 cOutline, cRed, cOrange, cYellow, cCore, cSmokeDark, cSmokeLight, cGold;
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
        if (vInfo.z > 2.5) {
          // smoke: a scalloped cloud (ukiyo-e cloud pattern), flat dark violet with a lighter inner lobe; shrinks as it fades
          vec2 q = vUv * 2.0 - 1.0;
          float ang = atan(q.y, q.x);
          float r = length(q);
          float edge = 0.78 - fade * 0.45 + 0.09 * cos(ang * 5.0 + seed * 3.0) + 0.04 * cos(ang * 9.0 - seed);
          if (r > edge) discard;
          float inner = edge - 0.2 + 0.05 * cos(ang * 4.0 + seed * 2.0);
          c = mix(cSmokeLight, cSmokeDark, smoothstep(inner - 0.02, inner + 0.02, r + 0.15 * q.y));
          c = mix(c, cOutline * 0.6, smoothstep(edge - 0.1, edge - 0.06, r));
        } else if (vInfo.z > 1.5) {
          // gold glint (kira): a four-point star with thin rays, rotating slowly
          vec2 q = vUv * 2.0 - 1.0;
          float a = seed + uTime * 2.0;
          q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q;
          q = abs(q);
          float s = 1.0 - fade * 0.6;
          float star = (q.x * q.y) * 14.0 + max(q.x, q.y) * 0.9;
          if (star > s || max(q.x, q.y) > s) discard;
          c = mix(cCore * 1.2, cGold, smoothstep(0.15, 0.6, star / s));
        } else if (vInfo.z > 0.5) {
          // spark: small diamond, darker and redder as it ages
          vec2 q = abs(vUv * 2.0 - 1.0);
          if (q.x + q.y > 1.0 - fade * 0.3) discard;
          c = mix(cCore, cRed, fade);
          c = mix(c, cOutline, step(0.72 - fade * 0.3, q.x + q.y));
        } else {
          float t = uTime + seed * 17.0;
          float u = vUv.x * 2.0 - 1.0;
          // flicker: the whole tongue breathes up and down
          float breathe = 0.9 + 0.07 * sin(t * 6.3 + seed * 4.0) + 0.04 * sin(t * 13.7 + seed * 1.3);
          float v = vUv.y / breathe;
          // sway; the tip hooks to one side (ukiyo-e flame pattern)
          float sway = sin(t * 1.9 + seed * 6.0);
          float hook = sign(sway + 0.001) * (0.6 + 0.4 * sin(t * 2.7 + seed));
          u += v * v * 0.38 * sway + v * 0.1 * sin(t * 4.3 + seed * 3.0);
          u += v * v * v * 0.55 * hook;
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
          // a blob of flame that pinches off the tip and rises away (licks leaving the fire)
          float ph = fract(t * 0.9 + seed * 0.37);
          vec2 bc = vec2(0.28 * hook * ph - 0.1 * sway, 0.6 + 0.38 * ph);
          vec2 bq = vec2(vUv.x * 2.0 - 1.0, vUv.y) - bc;
          bq.y *= 0.75;
          float blob = (0.13 * (1.0 - ph) * (1.0 - fade)) - length(bq);
          f = max(f, blob * 2.2);
          if (f < 0.0) discard;
          c = band(f, fade);
          // woodblock carving lines: a thin dark-red stroke along the red/orange edge in the upper body
          float ln = 1.0 - smoothstep(0.0, 0.016, abs(f + fade * -0.12 - 0.24));
          c = mix(c, cOutline * 1.35, ln * 0.55 * smoothstep(0.15, 0.45, v) * (1.0 - fade));
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

/**
 * 火光（D91）：加法混合、很淡的圓形光。aGlow.x = 強度、aGlow.y = 種類（0 = 平鋪在地上的火光，1 = 面向鏡頭的光暈）。
 * 實例矩陣只用位置與 x 縮放（半徑）。夜晚預設時段才看得出火在發光；強度刻意壓低，避免畫面泛白。
 */
export function glowMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { cGlow: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      attribute vec2 aGlow;
      varying vec2 vUv;
      varying float vI;
      void main() {
        vUv = uv;
        vI = aGlow.x;
        vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float r = length(instanceMatrix[0].xyz);
        vec3 p = position * r;
        vec4 mv;
        float pull;
        if (aGlow.y > 0.5) {
          mv = viewMatrix * vec4(center, 1.0);
          mv.xy += p.xy;
          pull = 0.3;
        } else {
          mv = viewMatrix * vec4(center + vec3(p.x, 0.0, -p.y), 1.0);
          pull = 0.6;
        }
        // slide each vertex toward the camera along its own view ray (same screen position):
        // small terrain bumps no longer cut hard edges into the flat glow, but a character standing in it still hides it
        float dl = length(mv.xyz);
        mv.xyz *= max(0.0, 1.0 - pull / max(dl, 1e-3));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 cGlow;
      varying vec2 vUv;
      varying float vI;
      void main() {
        float d = length(vUv * 2.0 - 1.0);
        if (d > 1.0) discard;
        float a = (1.0 - d) * (1.0 - d);
        gl_FragColor = vec4(cGlow * a * vI, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    // 要做深度測試：第一版關掉深度測試避免地形切出硬邊，結果光畫在角色身上、角色被洗白（vfx-f6 的護罩格）；
    // 改成頂點沿視線往鏡頭拉近 0.3～0.6 公尺（見頂點著色器）
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** 光的一片：寬高 2（半徑 1）、中心在原點 */
export function glowQuad(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(2, 2);
}
