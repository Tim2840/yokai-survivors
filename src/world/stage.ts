import * as THREE from 'three';
import { palette } from '../art/palette';
import { soft, glow } from '../art/materials';
import { ball, mesh } from '../art/shapes';

/** M0 的空場景：一塊夜裡的草地＋一盞代表玩家位置的紙燈籠光點。M1 換成高度圖地形。 */
export function buildStage(scene: THREE.Scene): { lantern: THREE.Object3D; group: THREE.Group } {
  const group = new THREE.Group();
  scene.add(group);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), soft(palette.night.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const lantern = new THREE.Group();
  const body = mesh(ball(0.45), glow(palette.warm.amber, 1.8));
  body.position.y = 0.9;
  lantern.add(body);
  group.add(lantern);
  return { lantern, group };
}
