import { describe, it, expect } from 'vitest';
import { ENEMY_MODELS } from '../../src/units/enemyModels';
import { ENEMY_IDS } from '../../src/data/enemies';
import { CHIBI } from '../../src/units/humans';

/** 人類造型（D72 日系 Q 版）：每種都有、三角形在預算內（p1：每隻 ≤ 700）、腳在地上、臉朝 +z、有腳可以擺 */
describe('人類造型全掃', () => {
  for (const id of ENEMY_IDS) {
    it(id, () => {
      const g = ENEMY_MODELS[id]();
      const tris = g.attributes.position.count / 3;
      expect(tris, `${id} 三角形 ${tris}`).toBeLessThanOrEqual(700);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(b.min.y).toBeGreaterThan(-0.05);
      expect(b.min.y).toBeLessThan(0.05);
      expect(b.max.y).toBeGreaterThan(1.0);
      expect(b.max.y).toBeLessThan(1.6);
      // 腳的頂點（走路時會擺）存在
      const pos = g.attributes.position;
      let feet = 0;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < CHIBI.footY) feet++;
      expect(feet).toBeGreaterThan(10);
      expect(g.attributes.color).toBeTruthy();
      g.dispose();
    });
  }
});
