import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { palette } from '../art/palette';
import { ball, lathe } from '../art/shapes';
import { paint } from './villager';

/**
 * 人類的日系 Q 版造型（D72，docs/23 第 8 節）：單一幾何＋頂點色，給 InstancedMesh 用。
 * 共同的比例：頭大身小（頭約佔身高 45%）、大眼睛（深色＋白色高光）、腮紅、短手短腳；
 * 每種人類靠「頭上的東西＋手上的東西＋衣服顏色」一眼分得出來（像素化後手機上敵人只有約 20 px 高）。
 * 約定：腳底 y = 0、臉朝 +z、身高約 1.3 公尺。腳的頂點 y < FOOT_Y，頂點著色器會讓它們前後擺（走路）。
 */
export const CHIBI = {
  bodyR: 0.27,
  bodyY: 0.36,
  headR: 0.31,
  headY: 0.86,
  /** 頂點著色器用：低於這個高度的頂點算「腳」 */
  footY: 0.16,
} as const;

const C = palette.chibi;

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}

/** 頭、臉（眼睛、高光；腮紅只在玩家角色上，敵人省三角形）、身體、腰帶、手、腳——所有人類共用的底子；衣服顏色與身形由參數決定 */
function base(parts: THREE.BufferGeometry[], o: { robe: string; belt: string; bodyScale?: [number, number, number]; collar?: boolean }): void {
  const s = o.bodyScale ?? [1, 1.1, 0.95];
  parts.push(paint(ball(CHIBI.bodyR, 7, 5).scale(s[0], s[1], s[2]).translate(0, CHIBI.bodyY, 0), o.robe, 1.25));
  parts.push(paint(new THREE.TorusGeometry(CHIBI.bodyR * 0.95, 0.04, 3, 8).rotateX(Math.PI / 2).translate(0, CHIBI.bodyY - 0.02, 0), o.belt, 1.2));
  if (o.collar !== false) {
    // 和服的白色交領（胸前一個小 V）
    parts.push(paint(new THREE.ConeGeometry(0.1, 0.16, 3).rotateX(Math.PI).translate(0, CHIBI.bodyY + 0.2, CHIBI.bodyR * 0.82), C.collar, 1.2));
  }
  // 頭
  parts.push(paint(ball(CHIBI.headR, 9, 6).scale(1.02, 0.96, 0.98).translate(0, CHIBI.headY, 0), C.skin, 1.12));
  // 眼睛：大大的深色橢圓＋白色高光（像素化後是 2～3 格深色＋1 格白）
  for (const sx of [-1, 1]) {
    parts.push(paint(ball(0.055, 5, 4).scale(0.85, 1.25, 0.5).translate(sx * 0.11, CHIBI.headY - 0.01, CHIBI.headR * 0.93), C.eye));
    parts.push(paint(ball(0.022, 4, 3).translate(sx * 0.11 + 0.015, CHIBI.headY + 0.03, CHIBI.headR * 0.99), C.eyeHi, 1.5));
  }
  // 短手（兩顆小圓球在身體兩側）
  for (const sx of [-1, 1]) parts.push(paint(ball(0.075, 4, 3).translate(sx * (CHIBI.bodyR + 0.03), CHIBI.bodyY + 0.02, 0.04), C.skin, 1.1));
  // 腳
  for (const sx of [-1, 1]) parts.push(paint(ball(0.085, 4, 3).scale(1, 0.75, 1.35).translate(sx * 0.11, 0.07, 0.03), C.foot));
}

/** 後腦勺的頭髮（從後面包住頭的上半，臉露在前面） */
function hairBack(parts: THREE.BufferGeometry[], color: string, top = true): void {
  parts.push(paint(ball(CHIBI.headR * 1.04, 8, 5).scale(1.04, top ? 0.9 : 0.75, 0.92).translate(0, CHIBI.headY + 0.05, -0.06), color, 1.1));
}

export const ASHIGARU = { height: 1.45 } as const;
export const YUMI = { height: 1.35 } as const;

/** 村人：棕色和服、頭巾、黑髮、左手火把 */
export function buildVillagerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  base(parts, { robe: palette.human.earth, belt: palette.human.robe });
  hairBack(parts, C.hair);
  // 頭巾（額頭一圈橙色帶子＋後面打結的小球）
  parts.push(paint(new THREE.TorusGeometry(CHIBI.headR * 0.98, 0.045, 3, 8).rotateX(Math.PI / 2 - 0.15).translate(0, CHIBI.headY + 0.1, 0), palette.human.robeAccent, 1.3));
  parts.push(paint(ball(0.06, 5, 4).translate(0, CHIBI.headY + 0.08, -CHIBI.headR - 0.02), palette.human.robeAccent, 1.3));
  // 火把：左手斜舉的木棒＋發亮的火焰（頂點色 > 1，Bloom 會發光）
  const from = new THREE.Vector3(-0.3, 0.38, 0.06);
  const to = new THREE.Vector3(-0.44, 0.8, 0.14);
  const dir = new THREE.Vector3().subVectors(to, from);
  parts.push(
    paint(
      new THREE.CylinderGeometry(0.03, 0.03, dir.length(), 5, 1)
        .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()))
        .translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2),
      palette.human.wood,
    ),
  );
  parts.push(paint(lathe([[0, 0], [0.09, 0.02], [0.06, 0.16], [0, 0.26]], { radius: 0.03, segments: 5, steps: 1 }).translate(-0.44, 0.82, 0.14), palette.fire.torch, 3.2));
  return merge(parts);
}

/** 足輕：藍灰的胴甲、草黃的陣笠（帽頂一個紅點）、胸前一面大圓盾（盾在 +z） */
export function buildAshigaruGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  base(parts, { robe: palette.human.slate, belt: palette.human.robe, bodyScale: [1.12, 1.1, 1], collar: false });
  // 頭髮被寬帽蓋住，省略（省三角形）
  // 陣笠：寬寬的圓錐帽，蓋到眉毛上
  parts.push(paint(lathe([[0, 0.2], [0.1, 0.15], [0.32, 0.05], [0.42, 0], [0.42, -0.02], [0, -0.02]], { radius: 0.02, segments: 10, steps: 1 }).translate(0, CHIBI.headY + 0.16, 0), palette.human.straw, 1.15));
  parts.push(paint(ball(0.05, 5, 4).translate(0, CHIBI.headY + 0.37, 0), palette.pickup.red, 1.2));
  // 盾：胸前的大圓盾（朱色）＋深色盾緣＋金色中心
  parts.push(paint(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 10).rotateX(Math.PI / 2).translate(0, 0.42, 0.36), palette.human.robeAccent, 1.2));
  parts.push(paint(new THREE.TorusGeometry(0.36, 0.04, 3, 12).translate(0, 0.42, 0.4), palette.chibi.foot));
  parts.push(paint(ball(0.08, 6, 5).translate(0, 0.42, 0.43), C.gold, 1.3));
  return merge(parts);
}

/** 弓手：綠色衣服、白色頭帶（鉢卷）、小斗笠、身旁一把大弓、背後一筒箭 */
export function buildYumiGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  base(parts, { robe: palette.human.archer, belt: palette.human.robe, bodyScale: [0.95, 1.15, 0.92] });
  hairBack(parts, C.hair);
  // 鉢卷（白色頭帶）＋後面飄的兩條帶子
  parts.push(paint(new THREE.TorusGeometry(CHIBI.headR * 0.99, 0.04, 3, 8).rotateX(Math.PI / 2 - 0.1).translate(0, CHIBI.headY + 0.08, 0), C.collar, 1.25));
  parts.push(paint(new THREE.BoxGeometry(0.05, 0.2, 0.03).rotateX(0.5).translate(0.05, CHIBI.headY - 0.02, -CHIBI.headR - 0.05), C.collar, 1.2));
  // 弓：左手邊一把豎著的大弓（半圓環）＋弦
  parts.push(paint(new THREE.TorusGeometry(0.5, 0.035, 3, 10, Math.PI).rotateZ(Math.PI / 2).translate(-0.34, 0.6, 0.12), palette.human.wood, 1.1));
  parts.push(paint(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4).translate(-0.34, 0.6, 0.12), C.collar, 1.2));
  // 背後的箭筒＋白色箭羽
  parts.push(paint(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6).rotateZ(0.35).translate(0.14, 0.62, -0.26), '#7a5a38'));
  parts.push(paint(ball(0.055, 5, 4).translate(0.24, 0.9, -0.26), C.collar, 1.3));
  return merge(parts);
}

/** 退魔僧（小頭目，放大 2.4 倍）：光頭、紫色僧衣、金色袈裟斜披、脖子一串大念珠、右手錫杖 */
export function buildTaimasouGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  base(parts, { robe: palette.human.monk, belt: palette.human.kesa, bodyScale: [1.15, 1.15, 1.05], collar: true });
  // 袈裟：從左肩斜到右腰的一條金帶
  parts.push(paint(new THREE.TorusGeometry(CHIBI.bodyR * 1.0, 0.05, 3, 10).rotateX(Math.PI / 2).rotateZ(0.7).translate(0, CHIBI.bodyY + 0.06, 0.01), palette.human.kesa, 1.25));
  // 念珠：脖子一圈深色大珠
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(paint(ball(0.04, 4, 3).translate(Math.sin(a) * 0.2, CHIBI.bodyY + 0.26 - Math.cos(a) * 0.02, Math.cos(a) * 0.2), '#3a2a20', 1.1));
  }
  // 錫杖：右手一根長杖＋頂端金色的環
  parts.push(paint(new THREE.CylinderGeometry(0.025, 0.025, 1.25, 5).translate(0.36, 0.62, 0.1), palette.human.wood));
  parts.push(paint(new THREE.TorusGeometry(0.1, 0.022, 3, 10).translate(0.36, 1.3, 0.1), C.gold, 1.4));
  parts.push(paint(new THREE.TorusGeometry(0.05, 0.015, 4, 8).rotateY(Math.PI / 2).translate(0.36, 1.22, 0.1), C.gold, 1.4));
  return merge(parts);
}
