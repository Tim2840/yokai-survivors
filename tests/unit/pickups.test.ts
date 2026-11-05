import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { PICKUPS, PICKUP_KINDS, PICKUP_RULES, PICKUP_WEIGHTS } from '../../src/data/pickups';
import { Pickups } from '../../src/systems/pickups';
import { Rng } from '../../src/lib/random';
import { kindIndex } from '../../src/systems/enemies';
import { zhTW } from '../../src/i18n/zh-TW';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed, bus });
  run.god = true;
  return { run, bus };
}
const killNow = (run: Run, i: number) => (run as unknown as { onKill(i: number): void }).onKill(i);
/** 放一個補給品在腳邊 dist 公尺，走過去（真的移動）直到撿到 */
function walkPick(run: Run, kind: (typeof PICKUP_KINDS)[number]) {
  run.devPickup(kind, 2);
  for (let i = 0; i < 120 && run.lastPickup?.kind !== kind; i++) {
    run.setMove(1, 0);
    if (run.awaitingPick) run.chooseCard(0);
    if (run.elementResult) run.dismissResult();
    run.step(DT);
  }
  run.setMove(0, 0);
}

describe('補給品（D39）：資料', () => {
  it('全掃：每種都有名稱、效果文字、在某個來源的權重 > 0；權重表沒有不存在的種類', () => {
    for (const k of PICKUP_KINDS) {
      expect(zhTW[`pickup.${k}` as keyof typeof zhTW], k).toBeTruthy();
      expect(zhTW[`pickup.fx.${PICKUPS[k].type}` as keyof typeof zhTW], k).toBeTruthy();
      expect(Object.values(PICKUP_WEIGHTS).some((w) => w[k] > 0), k).toBe(true);
    }
    for (const w of Object.values(PICKUP_WEIGHTS)) expect(Object.keys(w).sort()).toEqual([...PICKUP_KINDS].sort());
    // 小、中、大回復依序變大
    const heal = (k: 'dango' | 'onigiri' | 'sake') => (PICKUPS[k] as { frac: number }).frac;
    expect(heal('dango')).toBeLessThan(heal('onigiri'));
    expect(heal('onigiri')).toBeLessThan(heal('sake'));
  });

  it('抽樣 20,000 次：分佈接近權重', () => {
    const p = new Pickups(new Rng(1));
    for (const src of ['normal', 'elite', 'boss'] as const) {
      const w = PICKUP_WEIGHTS[src];
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      const cnt: Record<string, number> = {};
      const N = 20000;
      for (let i = 0; i < N; i++) {
        const k = p.roll(src);
        cnt[k] = (cnt[k] ?? 0) + 1;
      }
      for (const k of PICKUP_KINDS) expect((cnt[k] ?? 0) / N, `${src} ${k}`).toBeCloseTo(w[k] / total, 1);
    }
  });
});

describe('補給品：掉落', () => {
  it('一般人類約 normalChance 機率掉一個；精英一定掉 1 個；頭目掉 bossDrops 個', () => {
    const { run } = make(41);
    const N = 6000;
    for (let k = 0; k < N; k++) {
      run.pickups.reset();
      killNow(run, run.enemies.spawn(kindIndex('villager'), run.px + 8, run.pz, 1, 0, 0, 0, 1));
      if (run.pickups.aliveCount > 0) (run as unknown as { __n: number }).__n = ((run as unknown as { __n?: number }).__n ?? 0) + 1;
    }
    const got = (run as unknown as { __n?: number }).__n ?? 0;
    expect(got / N).toBeGreaterThan(PICKUP_RULES.normalChance * 0.5);
    expect(got / N).toBeLessThan(PICKUP_RULES.normalChance * 1.8);
    run.pickups.reset();
    killNow(run, run.enemies.spawn(kindIndex('villager'), run.px + 8, run.pz, 1, 0, 0, 1, 1));
    expect(run.pickups.aliveCount).toBe(1);
    run.pickups.reset();
    run.devSummonBoss();
    for (let i = 0; i < 30; i++) {
      while (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    const before = run.pickups.aliveCount;
    expect(run.devKillBoss(), '頭目沒出來').toBe(true);
    expect(run.pickups.aliveCount - before).toBe(PICKUP_RULES.bossDrops);
  });

  it('池滿了擠掉最舊的；放太久會消失', () => {
    const p = new Pickups(new Rng(2));
    for (let k = 0; k < PICKUP_RULES.max + 5; k++) {
      p.spawn('dango', 100 + k, 0);
      p.update(0.01, 0, 0, 0);
    }
    expect(p.aliveCount).toBe(PICKUP_RULES.max);
    p.update(PICKUP_RULES.lifetime, 0, 0, 0);
    expect(p.aliveCount).toBe(0);
  });
});

describe('補給品：撿到的效果', () => {
  it('糰子／飯糰／御神酒：回復最大生命的 frac（不超過上限），HUD 提示記下實際回了多少', () => {
    for (const k of ['dango', 'onigiri', 'sake'] as const) {
      const { run } = make(42);
      run.hp = 1;
      walkPick(run, k);
      const frac = (PICKUPS[k] as { frac: number }).frac;
      expect(run.lastPickup?.kind).toBe(k);
      expect(run.lastPickup!.v).toBeCloseTo(run.maxHp * frac, 5);
      expect(run.hp).toBeGreaterThanOrEqual(1 + run.maxHp * frac - 1e-6);
    }
    const { run } = make(43);
    walkPick(run, 'sake');
    expect(run.hp).toBeLessThanOrEqual(run.maxHp);
  });

  it('招魂鈴：遠處（拾取範圍外）的魂火全部飛過來被收走', () => {
    const { run } = make(44);
    for (let k = 0; k < 30; k++) run.orbs.spawn(run.px + 20 + k, run.pz + 15, 1);
    const xp0 = run.xp + run.level * 1000;
    walkPick(run, 'bell');
    expect(run.lastPickup?.kind).toBe('bell');
    for (let i = 0; i < 60 * 8 && run.orbs.aliveCount > 0; i++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.orbs.aliveCount).toBe(0);
    expect(run.xp + run.level * 1000).toBeGreaterThan(xp0);
  });

  it('雷鼓：半徑內的一般人類倒下、精英受最大生命 bossFrac 的傷害；半徑外的沒事', () => {
    const { run } = make(45);
    const e = PICKUPS.drum as { radius: number; bossFrac: number };
    const near = run.enemies.spawn(kindIndex('villager'), run.px + 6, run.pz + 4, 5, 0, 0, 0, 1);
    const far = run.enemies.spawn(kindIndex('villager'), run.px + e.radius + 8, run.pz, 5, 0, 0, 0, 1);
    const elite = run.enemies.spawn(kindIndex('villager'), run.px - 5, run.pz, 5, 0, 0, 1, 1);
    run.enemies.update(0, run.px, run.pz, run.flow, 0, 0);
    const eliteHp = run.enemies.hp[elite];
    run.devPickup('drum', 0.3);
    run.step(DT);
    expect(run.lastPickup?.kind).toBe('drum');
    expect(run.enemies.alive[near]).toBe(0);
    expect(run.enemies.alive[far]).toBe(1);
    expect(run.enemies.hp[elite]).toBeCloseTo(eliteHp - run.enemies.maxHp[elite] * e.bossFrac, 3);
  });

  it('雪女的吐息：人類全部停住、碰到也不扣血，seconds 秒後恢復', () => {
    const { run } = make(46);
    run.god = false;
    const secs = (PICKUPS.yukiBreath as { seconds: number }).seconds;
    run.devPickup('yukiBreath', 0.3);
    run.step(DT);
    expect(run.frozenEnemies).toBe(true);
    const i = run.enemies.spawn(kindIndex('villager'), run.px + 6, run.pz, 5, 0, 0, 0, 1);
    const x0 = run.enemies.x[i];
    for (let k = 0; k < 60; k++) run.step(DT);
    // 凍住的人類不會往玩家走（被鬼火打到的擊退還是有，只會往外）
    expect(run.enemies.x[i]).toBeGreaterThanOrEqual(x0 - 1e-6);
    // 碰到也不扣
    const touch = run.enemies.spawn(kindIndex('villager'), run.px + 0.2, run.pz, 5, 0, 0, 0, 1);
    void touch;
    const hp = run.hp;
    for (let k = 0; k < 30; k++) run.step(DT);
    expect(run.hp).toBeGreaterThanOrEqual(hp - 1e-6);
    for (let k = 0; k < 60 * secs; k++) {
      if (run.awaitingPick) run.chooseCard(0);
      run.step(DT);
    }
    expect(run.frozenEnemies).toBe(false);
  });

  it('小判：功德 +amount（結算時算進去）', () => {
    const { run } = make(47);
    const before = (run as unknown as { bonusMerit: number }).bonusMerit;
    walkPick(run, 'koban');
    expect((run as unknown as { bonusMerit: number }).bonusMerit - before).toBe((PICKUPS.koban as { amount: number }).amount);
  });

  it('拾取範圍內會被吸過來；範圍外不動', () => {
    const p = new Pickups(new Rng(3));
    const a = p.spawn('dango', 3, 0);
    const b = p.spawn('dango', 30, 0);
    p.update(0.1, 0, 0, 4);
    expect(p.x[a]).toBeLessThan(3);
    expect(p.x[b]).toBe(30);
  });

  it('換關時清空', () => {
    const { run } = make(48);
    run.devPickup('koban', 20);
    expect(run.pickups.aliveCount).toBe(1);
    run.devClearStage();
    run.continueFromIntermission();
    expect(run.pickups.aliveCount).toBe(0);
  });
});
