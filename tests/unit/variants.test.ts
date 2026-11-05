import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { VARIANTS, VARIANT_LEVEL, variantsFor } from '../../src/data/variants';
import { ITEM_POOL } from '../../src/data/items';
import { kindIndex } from '../../src/systems/enemies';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus() });
  run.god = true;
  return run;
}
function placeEnemy(run: Run, dx: number, dz: number, hp = 1e6): number {
  const i = run.enemies.spawn(kindIndex('villager'), run.px + dx, run.pz + dz, 1, 0, 0);
  run.enemies.hp[i] = run.enemies.maxHp[i] = hp;
  run.enemies.speed[i] = 0;
  return i;
}
function stepN(run: Run, n: number) {
  for (let i = 0; i < n; i++) {
    if (run.awaitingPick) run.chooseCard(0);
    run.step(DT);
  }
}

describe('招式變化（資料全掃）', () => {
  it('每把主武器正好 3 種變化、id 唯一、類型互不相同、適合的道具都在卡池', () => {
    expect(new Set(VARIANTS.map((v) => v.id)).size).toBe(VARIANTS.length);
    const g = variantsFor('ghostfire');
    expect(g).toHaveLength(3);
    expect(new Set(g.map((v) => v.type)).size).toBe(3);
    for (const v of VARIANTS) for (const id of v.likes) expect(ITEM_POOL, `${v.id} 的 ${id}`).toContain(id);
  });
});

describe('選擇時機', () => {
  it('主武器升到第 4 級時跳出三選一（只有一次），選了就固定', () => {
    const run = make(5);
    for (let i = 1; i < VARIANT_LEVEL - 1; i++) run.give('ghostfire', 'common');
    expect(run.offer).toBeNull();
    run.give('ghostfire', 'common');
    expect(run.weaponLevel).toBe(VARIANT_LEVEL);
    expect(run.offerKind).toBe('variant');
    expect(run.offer!.map((o) => o.cardId)).toEqual(variantsFor('ghostfire').map((v) => 'variant:' + v.id));
    run.chooseCard(1);
    expect(run.variant?.id).toBe(variantsFor('ghostfire')[1].id);
    expect(run.offer).toBeNull();
    for (let i = 0; i < 5; i++) run.give('ghostfire', 'common');
    expect(run.offerKind).not.toBe('variant');
    expect(run.variant?.id).toBe(variantsFor('ghostfire')[1].id);
  });
  it('在升級選卡中途升到 4 級：變化面板插進來，選完繼續剩下的升級', () => {
    const run = make(6);
    run.give('ghostfire', 'common');
    run.give('ghostfire', 'common');
    // 讓下一次升級的卡只剩主武器：直接塞一個 offer 模擬
    run.addXp(500);
    let guard = 0;
    while (run.offer && guard++ < 200) {
      if (run.offerKind === 'variant') {
        run.chooseCard(2);
        break;
      }
      const gi = run.offer.findIndex((o) => o.cardId === 'ghostfire');
      run.chooseCard(gi >= 0 ? gi : 0);
    }
    expect(run.variant, '升到 4 級應該選過變化').not.toBeNull();
    // 之後還能繼續選（沒有卡住）
    guard = 0;
    while (run.offer && guard++ < 200) run.chooseCard(0);
    expect(run.offer).toBeNull();
  });
});

describe('三種變化的效果', () => {
  it('狐火分裂：命中後分裂出小火打到旁邊的敵人', () => {
    // 一次只射 1 顆（鬼火 +N 會各打不同的敵人，會把對照組搞亂）
    tuning.volley = 1;
    const run = make(7);
    run.devSetVariant('kitsunebi');
    const a = placeEnemy(run, 4, 0);
    const b = placeEnemy(run, 7, 2);
    const c = placeEnemy(run, 7, -2);
    stepN(run, 120);
    const hurt = (i: number) => run.enemies.hp[i] < 1e6;
    expect(hurt(a)).toBe(true);
    expect(hurt(b) && hurt(c), '分裂的小火應該打到旁邊兩隻').toBe(true);
    // 對照組（同一刻同一狀態）：沒有變化時，鬼火只追最近的，旁邊兩隻不會被打到
    const r2 = make(7);
    const a2 = placeEnemy(r2, 4, 0);
    const b2 = placeEnemy(r2, 7, 2);
    const c2 = placeEnemy(r2, 7, -2);
    stepN(r2, 120);
    expect(r2.enemies.hp[a2] < 1e6).toBe(true);
    expect(r2.enemies.hp[b2] === 1e6 && r2.enemies.hp[c2] === 1e6, '對照組不該打到旁邊').toBe(true);
  });
  it('燈籠環：不發射投射物，繞身的鬼火打到身邊的敵人', () => {
    const run = make(8);
    run.devSetVariant('lanternRing');
    const near = placeEnemy(run, run.orbitRadius, 0);
    const far = placeEnemy(run, 9, 0);
    stepN(run, 120);
    expect(run.projectiles.aliveCount).toBe(0);
    expect(run.enemies.hp[near]).toBeLessThan(1e6);
    expect(run.enemies.hp[far]).toBe(1e6);
    expect(run.orbitCount).toBeGreaterThanOrEqual(1);
  });
  it('燈籠環的環內護身（D46）：貼身的人類會受傷、被推到外面；環外遠處的不受影響（舊版貼身的打不到）', () => {
    const run = make(18);
    run.devSetVariant('lanternRing');
    const o = run.variant!.orbit!;
    const inner = run.orbitRadius - o.hitRadius;
    expect(inner).toBeGreaterThan(0.8);
    const hug = placeEnemy(run, 0.8, 0);
    const far = placeEnemy(run, 9, 0);
    stepN(run, 20);
    expect(run.enemies.hp[hug], '貼身的人類沒受傷').toBeLessThan(1e6);
    expect(Math.hypot(run.enemies.x[hug] - run.px, run.enemies.z[hug] - run.pz), '沒有被推開').toBeGreaterThan(0.8 + 0.5);
    expect(run.innerHits).toBeGreaterThan(0);
    expect(run.enemies.hp[far]).toBe(1e6);
  });
  it('業火：命中處留下燃燒地，持續燒、時間到消失；鬼火變慢變重', () => {
    const run = make(9);
    run.devSetVariant('hellfire');
    const a = placeEnemy(run, 4, 0);
    stepN(run, 60);
    expect(run.zoneCount).toBeGreaterThan(0);
    const hp1 = run.enemies.hp[a];
    // 停止射擊（移走玩家），燃燒地還會繼續燒
    stepN(run, 30);
    expect(run.enemies.hp[a]).toBeLessThan(hp1);
    run.devTeleport(run.px + 30, run.pz);
    stepN(run, 60 * 4);
    expect(run.zoneCount).toBe(0);
  });
  it('主武器滿級時變化再加強（分裂數、繞身數、燃燒地大小）', () => {
    const run = make(10);
    run.devSetVariant('lanternRing');
    const n0 = run.orbitCount;
    const r0 = run.orbitRadius;
    for (let i = 0; i < 10; i++) run.give('ghostfire', 'common');
    while (run.offer) run.chooseCard(0);
    expect(run.weaponMaxed).toBe(true);
    expect(run.orbitCount).toBeGreaterThan(n0);
    expect(run.orbitRadius).toBeGreaterThan(r0);
  });
});
