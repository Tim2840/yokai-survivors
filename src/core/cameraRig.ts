import { CAMERA } from '../data/camera';
import { Shake } from './feel';

/** 只要會回答「某個水平位置的地面高度」就行（TerrainMap 符合） */
export interface HeightSource {
  heightAt(x: number, z: number): number;
}

const DEG = Math.PI / 180;

/**
 * 玩家移動輸入（螢幕座標：ix 往右、iz 往後，W = −1）→ 世界座標，依鏡頭的 yaw 轉。
 * yaw = 0 時鏡頭在玩家的 +z 側往 −z 看，輸入與世界座標相同。寫進 out[0]、out[1]（不配置記憶體）。
 */
export function worldMove(ix: number, iz: number, yaw: number, out: Float32Array | number[]): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out[0] = c * ix + s * iz;
  out[1] = -s * ix + c * iz;
}

/**
 * 軌道鏡頭（純數學，不碰 Three.js）：yaw 360° 自由、pitch 有上下限；
 * 注視點平滑跟隨玩家的 3D 位置；彈簧臂沿線取樣地形，碰到就拉近（最短 minDistance），放開時慢慢回復。
 */
export class CameraRig {
  /** 螢幕震動（D69）：位移疊在鏡頭位置上，不影響瞄準與移動方向 */
  readonly shake = new Shake();
  yaw = 0;
  pitch = CAMERA.pitchDeg * DEG;
  /** 平滑後的注視點與鏡頭位置（唯讀使用） */
  tx = 0;
  ty = 0;
  tz = 0;
  x = 0;
  y = 0;
  z = 0;
  /** 目前彈簧臂的長度 */
  dist: number = CAMERA.distance;
  /** 想要的距離（之後可由縮放調整） */
  desiredDist: number = CAMERA.distance;

  /** 回到預設方向（開新的一局） */
  reset(): void {
    this.yaw = 0;
    this.pitch = CAMERA.pitchDeg * DEG;
    this.desiredDist = CAMERA.distance;
    this.dist = CAMERA.distance;
  }

  rotate(dyaw: number, dpitch: number): void {
    this.yaw += dyaw;
    // 保持在 (−π, π]，避免數字無限增大
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw <= -Math.PI) this.yaw += Math.PI * 2;
    this.pitch = Math.min(CAMERA.maxPitchDeg * DEG, Math.max(CAMERA.minPitchDeg * DEG, this.pitch + dpitch));
  }

  /** 鏡頭立刻到位（開局、換關、測試） */
  snap(px: number, py: number, pz: number, map: HeightSource): void {
    this.tx = px;
    this.ty = py + CAMERA.lookHeight;
    this.tz = pz;
    this.dist = this.desiredDist;
    this.solve(map, 1, true);
  }

  /** 每個畫面幀：dt 秒、玩家位置（腳底）。不配置記憶體 */
  update(dt: number, px: number, py: number, pz: number, map: HeightSource): void {
    const k = 1 - Math.exp(-CAMERA.followDamping * dt);
    const ky = 1 - Math.exp(-CAMERA.followDampingY * dt);
    this.tx += (px - this.tx) * k;
    this.tz += (pz - this.tz) * k;
    this.ty += (py + CAMERA.lookHeight - this.ty) * ky;
    this.solve(map, dt, false);
    this.shake.update(dt);
    if (this.shake.trauma > 0) {
      // 位移在鏡頭的左右與上下方向（不改注視點）
      this.x += Math.cos(this.yaw) * this.shake.ox;
      this.z -= Math.sin(this.yaw) * this.shake.ox;
      this.y += this.shake.oy;
    }
  }

  private solve(map: HeightSource, dt: number, snap: boolean): void {
    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp;
    const dy = Math.sin(this.pitch);
    const dz = Math.cos(this.yaw) * cp;
    // 彈簧臂：從注視點往鏡頭方向取樣，第一個低於「地形 + 邊界」的點之前的距離就是允許的長度
    const want = this.desiredDist;
    let allowed = want;
    const n = CAMERA.armSamples;
    for (let s = 1; s <= n; s++) {
      const d = (want * s) / n;
      const x = this.tx + dx * d;
      const z = this.tz + dz * d;
      if (this.ty + dy * d < map.heightAt(x, z) + CAMERA.groundMargin) {
        allowed = Math.max(CAMERA.minDistance, (want * (s - 1)) / n);
        break;
      }
    }
    if (snap || allowed < this.dist) this.dist = allowed;
    else this.dist += (allowed - this.dist) * Math.min(1, CAMERA.armRelease * dt);
    this.x = this.tx + dx * this.dist;
    this.y = this.ty + dy * this.dist;
    this.z = this.tz + dz * this.dist;
    // 最短距離仍在地形裡（陡崖邊）：把鏡頭往上抬，不穿地
    const floor = map.heightAt(this.x, this.z) + CAMERA.hardMargin;
    if (this.y < floor) this.y = floor;
  }
}
