import * as THREE from 'three';

/**
 * 實例化圖層的共用小工具：直接寫 instanceMatrix 的 Float32Array（不建 Matrix4 物件），熱路徑零配置。
 */
export function writeMatrix(arr: Float32Array, i: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const o = i * 16;
  // 列主序存成 three 的欄主序：先旋轉（繞 Y）再縮放
  arr[o] = c * sx;
  arr[o + 1] = 0;
  arr[o + 2] = -s * sx;
  arr[o + 3] = 0;
  arr[o + 4] = 0;
  arr[o + 5] = sy;
  arr[o + 6] = 0;
  arr[o + 7] = 0;
  arr[o + 8] = s * sz;
  arr[o + 9] = 0;
  arr[o + 10] = c * sz;
  arr[o + 11] = 0;
  arr[o + 12] = x;
  arr[o + 13] = y;
  arr[o + 14] = z;
  arr[o + 15] = 1;
}

/** 把一個 InstancedMesh 的包圍球設成「整張地圖」，避免被誤剔除（舊專案的雷：InstancedBufferGeometry 要自己給包圍盒） */
export function setHugeBounds(mesh: THREE.InstancedMesh, radius: number): void {
  mesh.frustumCulled = false;
  mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
}
