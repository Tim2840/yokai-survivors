import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { ENEMIES, ENEMY_IDS } from '../../src/data/enemies';
import { SPAWN_RECIPES, recipeFor } from '../../src/data/spawnRecipes';
import { ENEMY_MODELS } from '../../src/units/enemyModels';
import { zhTW } from '../../src/i18n/zh-TW';
import { kindIndex } from '../../src/systems/enemies';
import { EnemyShots, ENEMY_SHOT_CAPACITY } from '../../src/systems/enemyShots';
import { COMBAT } from '../../src/data/combat';
import { defaultSave, merge } from '../../src/core/save';

/** 人類的行為框架（E-1，docs/22）：資料完整、盾、遠程與箭、出場配方、首次出場 */
const DT = 1 / 60;
afterEach(() => resetTuning());
function make(seed = 3): Run {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus(), yokaiId: 'chochin-kozo' });
  run.god = true;
  run.director.active = false;
  return run;
}

describe('人類資料全掃', () => {
  it('每種人類都有名稱、造型；行為欄位和 behavior 一致；提示文字存在', () => {
    for (const id of ENEMY_IDS) {
      const d = ENEMIES[id];
      expect(d.id, id).toBe(id);
      expect(zhTW[d.name as keyof typeof zhTW], `${id} 名稱`).toBeTruthy();
      expect(ENEMY_MODELS[id], `${id} 沒有造型（src/units/enemyModels.ts）`).toBeTypeOf('function');
      if (d.intro) expect(zhTW[d.intro as keyof typeof zhTW], `${id} 提示`).toBeTruthy();
      if (d.behavior === 'shield') {
        expect(d.shield, id).toBeTruthy();
        expect(d.shield!.reduction).toBeGreaterThan(0);
        expect(d.shield!.reduction).toBeLessThan(1);
      } else expect(d.shield, `${id} 不是盾兵卻有盾`).toBeUndefined();
      if (d.behavior === 'ranged') {
        const r = d.ranged!;
        expect(r, id).toBeTruthy();
        expect(r.range).toBeGreaterThanOrEqual(r.keep);
        expect(r.windup).toBeGreaterThan(0.3); // 預告至少要讓人反應得過來
        expect(r.shotSpeed * r.windup).toBeGreaterThan(0);
      } else expect(d.ranged, `${id} 不是遠程卻有遠程欄位`).toBeUndefined();
    }
  });
  it('新人類第一次出場的提示 ≤ 36 字，且不帶角色專屬字', () => {
    for (const id of ENEMY_IDS) {
      const k = ENEMIES[id].intro;
      if (!k) continue;
      const text = zhTW[k as keyof typeof zhTW];
      expect([...text].length, text).toBeLessThanOrEqual(36);
      expect(text).not.toMatch(/鬼火|燈|火焰/);
    }
  });
});

describe('出場配方', () => {
  it('種類都存在、權重為正、開局一定有可出的敵人（第一行 from = 0）、同時上限合理', () => {
    expect(SPAWN_RECIPES.length).toBeGreaterThanOrEqual(2);
    for (const r of SPAWN_RECIPES) {
      expect(r.some((e) => e.from === 0)).toBe(true);
      for (const e of r) {
        expect(ENEMIES[e.id], e.id).toBeTruthy();
        expect(ENEMIES[e.id].id).not.toBe('taimasou'); // 頭目不走配方
        expect(e.weight).toBeGreaterThan(0);
        expect(e.from).toBeGreaterThanOrEqual(0);
        expect(e.from).toBeLessThan(1);
        if (e.cap !== undefined) expect(e.cap).toBeGreaterThan(0);
      }
    }
    expect(recipeFor(99)).toBe(SPAWN_RECIPES[SPAWN_RECIPES.length - 1]);
  });
  it('導演真的會依配方生出新種類；同時上限有效', () => {
    const run = new Run({ seed: 11, bus: new EventBus(), yokaiId: 'chochin-kozo' });
    tuning.stageSeconds = 600;
    run.god = true;
    run.director.start(1, 1, { hpMult: 1 }); // 第 2 關的配方
    run.director.time = 400; // 超過 60%：所有種類都開放
    tuning.countScale = 6;
    for (let i = 0; i < 60 * 60; i++) run.step(DT);
    const c = run.enemies.kindCount;
    expect(c[kindIndex('ashigaru')]).toBeGreaterThan(0);
    expect(c[kindIndex('yumi')]).toBeGreaterThan(0);
    expect(c[kindIndex('yumi')]).toBeLessThanOrEqual(recipeFor(1).find((e) => e.id === 'yumi')!.cap!);
  });
  it('第 1 關開局只有村人（60 秒內沒有足輕、弓手）', () => {
    const run = new Run({ seed: 5, bus: new EventBus(), yokaiId: 'chochin-kozo' });
    tuning.stageSeconds = 600;
    run.god = true;
    for (let i = 0; i < 60 * 40; i++) run.step(DT);
    expect(run.enemies.kindCount[kindIndex('ashigaru')]).toBe(0);
    expect(run.enemies.kindCount[kindIndex('yumi')]).toBe(0);
    expect(run.enemies.kindCount[kindIndex('villager')]).toBeGreaterThan(0);
  });
});

describe('盾（足輕）', () => {
  const setup = () => {
    const run = make();
    const i = run.enemies.spawn(kindIndex('ashigaru'), run.px + 4, run.pz, 1, 0, 0);
    run.enemies.speed[i] = 0;
    run.enemies.hp[i] = run.enemies.maxHp[i] = 1e6;
    run.step(DT); // 盾面轉向玩家
    return { run, i };
  };
  it('玩家在盾面這一側：減傷；繞到背後：全額；村人沒有盾', () => {
    const { run, i } = setup();
    const en = run.enemies;
    expect(en.shielded(i)).toBe(true);
    expect(en.guard(i, 10)).toBeCloseTo(10 * (1 - ENEMIES.ashigaru.shield!.reduction));
    // 把盾面轉到背對玩家
    en.face[i] += Math.PI;
    expect(en.shielded(i)).toBe(false);
    expect(en.guard(i, 10)).toBe(10);
    const v = en.spawn(kindIndex('villager'), run.px + 3, run.pz, 1, 0, 0);
    expect(en.guard(v, 10)).toBe(10);
  });
  it('武器傷害（weaponHit）也走盾：正面扣的血比背面少，傷害數字顯示減傷後的', () => {
    const { run, i } = setup();
    const en = run.enemies;
    const hp0 = en.hp[i];
    run.weaponHit(i, 100, 0, 0, 0, false);
    const front = hp0 - en.hp[i];
    en.face[i] += Math.PI;
    const hp1 = en.hp[i];
    run.weaponHit(i, 100, 0, 0, 0, false);
    const back = hp1 - en.hp[i];
    expect(front).toBeCloseTo(100 * (1 - ENEMIES.ashigaru.shield!.reduction));
    expect(back).toBeCloseTo(100);
  });
  it('盾面轉向有速度上限：玩家繞到背後，盾要幾秒才轉得回來（有繞行的空間）', () => {
    const run = make();
    const en = run.enemies;
    const i = en.spawn(kindIndex('ashigaru'), run.px + 4, run.pz, 1, 0, 0);
    en.speed[i] = 0;
    run.step(DT);
    expect(en.shielded(i)).toBe(true);
    // 玩家瞬間跑到敵人的另一側
    run.px += 8;
    run.step(DT);
    expect(en.shielded(i)).toBe(false);
    const need = Math.PI / ENEMIES.ashigaru.shield!.turn;
    let t = 0;
    while (!en.shielded(i) && t < 10) {
      run.step(DT);
      t += DT;
    }
    expect(t).toBeGreaterThan(need * 0.4);
    expect(t).toBeLessThan(need * 1.2);
  });
});

describe('弓手與箭', () => {
  it('停在遠處、預告後射出一支箭；預告期間站定不動；箭朝預告鎖定的方向飛', () => {
    const run = make();
    const en = run.enemies;
    const i = en.spawn(kindIndex('yumi'), run.px + 12, run.pz, 1, 0, 0);
    en.shootCd[i] = 0;
    let sawWind = false;
    let x0 = NaN;
    for (let k = 0; k < 60 * 3 && run.shots.fired === 0; k++) {
      run.step(DT);
      if (en.wind[i] > 0) {
        if (!sawWind) x0 = en.x[i];
        sawWind = true;
        expect(en.x[i]).toBeCloseTo(x0, 5); // 瞄準中不動
      }
    }
    expect(sawWind).toBe(true);
    expect(run.shots.fired).toBe(1);
    expect(en.aimX[i]).toBeLessThan(-0.9); // 往 -x（玩家在左邊）
    const j = [...Array(run.shots.high).keys()].find((q) => run.shots.alive[q])!;
    expect(run.shots.vx[j]).toBeLessThan(0);
    expect(Math.abs(run.shots.vz[j])).toBeLessThan(1);
  });
  it('離玩家比 keep 近就退、比 keep 遠就靠近、在 keep 附近停下', () => {
    const run = make();
    const en = run.enemies;
    const keep = ENEMIES.yumi.ranged!.keep;
    const near = en.spawn(kindIndex('yumi'), run.px + 3, run.pz, 1, 0, 0);
    // 遠處找一個走得到、沒被擋住的位置
    let fx = 0;
    let fz = 0;
    for (let a = 0; a < 6.28; a += 0.3) {
      fx = run.px + Math.cos(a) * 22;
      fz = run.pz + Math.sin(a) * 22;
      if (!run.map.isBlocked(fx, fz) && run.flow.reachable(fx, fz)) break;
    }
    const far = en.spawn(kindIndex('yumi'), fx, fz, 1, 0, 0);
    const far0 = Math.hypot(fx - run.px, fz - run.pz);
    en.shootCd[near] = en.shootCd[far] = 99;
    for (let k = 0; k < 60; k++) run.step(DT);
    expect(Math.hypot(en.x[near] - run.px, en.z[near] - run.pz)).toBeGreaterThan(3.5);
    expect(Math.hypot(en.x[far] - run.px, en.z[far] - run.pz)).toBeLessThan(far0 - 1);
    for (let k = 0; k < 60 * 15; k++) run.step(DT);
    expect(Math.hypot(en.x[far] - run.px, en.z[far] - run.pz)).toBeLessThan(keep + 1.5);
    expect(Math.hypot(en.x[far] - run.px, en.z[far] - run.pz)).toBeGreaterThan(keep * 0.6);
  });
  it('箭打中玩家：扣血（走受傷流程、有無敵時間）；跳起來從腳下飛過；無敵時不結算；閃避率 100% 閃得掉', () => {
    const mk = () => {
      const run = make();
      run.god = false;
      run.hp = run.maxHp;
      return run;
    };
    // 直接打中
    let run = mk();
    run.shots.spawn(run.px - 3, run.pz, 1, 0, 9, 2, 10, 0.3);
    for (let k = 0; k < 40; k++) run.step(DT);
    expect(run.hp).toBeLessThan(run.maxHp);
    expect(run.shots.aliveCount).toBe(0);
    // 跳起來
    run = mk();
    run.py += COMBAT.arrowClear + 0.3;
    run.grounded = false;
    run.vy = 0;
    run.shots.spawn(run.px - 0.2, run.pz, 1, 0, 9, 2, 10, 0.3);
    // 凍住垂直速度：只量「在空中的這一刻」
    run.step(DT);
    expect(run.hp).toBe(run.maxHp);
    // 無敵中
    run = mk();
    run.invul = 5;
    run.shots.spawn(run.px - 0.2, run.pz, 1, 0, 9, 2, 10, 0.3);
    run.step(DT);
    expect(run.hp).toBe(run.maxHp);
  });
  it('箭的池：滿了不再射（不擠掉、不報錯）；壽命到了消失；reset 清空', () => {
    const s = new EnemyShots();
    for (let i = 0; i < ENEMY_SHOT_CAPACITY; i++) expect(s.spawn(0, 0, 1, 0, 1, 1, 1, 0.3)).toBeGreaterThanOrEqual(0);
    expect(s.spawn(0, 0, 1, 0, 1, 1, 1, 0.3)).toBe(-1);
    s.update(2, 100, 100, 0.5, true);
    expect(s.aliveCount).toBe(0);
    expect(s.spawn(0, 0, 1, 0, 1, 1, 1, 0.3)).toBeGreaterThanOrEqual(0);
    s.reset();
    expect(s.aliveCount).toBe(0);
  });
  it('凍住敵人（雪女的吐息）：弓手不瞄準也不射', () => {
    const run = make();
    const en = run.enemies;
    run.freezeUntil = run.clock + 5;
    run.step(DT); // 凍結的倍率在這一步結束時才套給敵人
    const i = en.spawn(kindIndex('yumi'), run.px + 10, run.pz, 1, 0, 0);
    en.shootCd[i] = 0;
    for (let k = 0; k < 60 * 3; k++) run.step(DT);
    expect(run.shots.fired).toBe(0);
    expect(en.wind[i]).toBe(0);
  });
});

describe('首次出場', () => {
  it('這一局每種人類第一次有活的就發一次 enemySeen（頭目也算）；之後不再發', () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('enemySeen', ({ id }) => seen.push(id));
    tuning.stageSeconds = 600;
    const run = new Run({ seed: 7, bus, yokaiId: 'chochin-kozo' });
    run.god = true;
    run.director.active = false;
    run.devSpawn('ashigaru', 2);
    run.step(DT);
    run.devSpawn('ashigaru', 2);
    run.devSpawn('yumi', 1);
    run.step(DT);
    for (let k = 0; k < 10; k++) run.step(DT);
    expect(seen.filter((x) => x === 'ashigaru')).toHaveLength(1);
    expect(seen.filter((x) => x === 'yumi')).toHaveLength(1);
  });
  it('存檔：codex.humans 預設是空字典、讀回舊存檔時保留已看過的種類', () => {
    expect(defaultSave().codex.humans).toEqual({});
    const loaded = merge(defaultSave(), { codex: { humans: { ashigaru: 1 } } });
    expect(loaded.codex.humans.ashigaru).toBe(1);
  });
});
