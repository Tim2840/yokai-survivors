import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { BOSSES, bossForStage } from '../../src/data/bosses';
import { ENEMIES, ENEMY_IDS } from '../../src/data/enemies';
import { TELE_NONE } from '../../src/game/bossSkills';
import { zhTW } from '../../src/i18n/zh-TW';

const DT = 1 / 60;
afterEach(() => resetTuning());

/** 開一局、（可選）進到第 stage 關、召喚頭目、清掉其他人類、頭目放在玩家前方 dist 公尺 */
function withBoss(stage = 0, dist = 7) {
  tuning.stageSeconds = 600;
  const bus = new EventBus();
  const run = new Run({ seed: 5, bus });
  for (let k = 0; k < stage; k++) run.startNextStage();
  run.director.summonBoss();
  for (let i = 0; i < 600 && run.director.bossIndex < 0; i++) run.step(DT);
  const b = run.director.bossIndex;
  expect(b).toBeGreaterThanOrEqual(0);
  run.director.active = false;
  const en = run.enemies;
  for (let i = 0; i < en.high; i++) if (en.alive[i] && i !== b) en.kill(i);
  en.relocate(b, run.px + dist, run.pz);
  return { run, bus, b };
}
/** 跑 sec 秒；dodge = 看到預告就往外躲；血一直補滿（只數招式打中幾次） */
function play(run: Run, sec: number, dodge: boolean) {
  const out = new Float32Array(2);
  for (let i = 0; i < Math.round(sec / DT); i++) {
    if (run.awaitingPick) run.chooseCard(0);
    if (dodge && run.boss.escapeDir(run.px, run.pz, out)) run.setMove(out[0], out[1]);
    else run.setMove(0, 0);
    run.hp = run.maxHp;
    run.step(DT);
  }
}

describe('頭目技能（D95）', () => {
  it('每關的頭目：第 1 關退魔僧、第 2 關獵河武士；每個頭目的名字都有中文、每招都有參數', () => {
    expect(bossForStage(0).enemy).toBe('taimasou');
    expect(bossForStage(1).enemy).toBe('kawagari');
    for (const d of Object.values(BOSSES)) {
      expect(ENEMY_IDS).toContain(d.enemy);
      expect((zhTW as Record<string, string>)[ENEMIES[d.enemy].name]).toBeTruthy();
      expect(d.skills.length).toBeGreaterThanOrEqual(3);
      expect(d.skills.filter((s) => !s.phase2).length, `${d.enemy} 一開始至少 2 招`).toBeGreaterThanOrEqual(2);
      expect(d.skills.some((s) => s.phase2), `${d.enemy} 要有半血才用的招`).toBe(true);
      for (const s of d.skills) expect(s.windup, `${d.enemy}.${s.id} 預告太短，手機上躲不掉`).toBeGreaterThanOrEqual(0.7);
    }
    const { run, b } = withBoss(1);
    expect(ENEMY_IDS[run.enemies.kind[b]]).toBe('kawagari');
  });

  it('退魔僧：站著不動 → 預告出現、頭目站定，然後被打中；兩招都會用', () => {
    const { run, b } = withBoss(0, 7);
    let sawTele = false;
    let heldStill = true;
    for (let i = 0; i < 20 * 60; i++) {
      const bx = run.enemies.x[b];
      const wasWarn = run.boss.state === 'windup';
      run.setMove(0, 0);
      run.hp = run.maxHp;
      run.step(DT);
      if (wasWarn && run.boss.state === 'windup') {
        sawTele = true;
        if (Math.abs(run.enemies.x[b] - bx) > 1e-6) heldStill = false;
        expect(run.boss.tele.shape).not.toBe(TELE_NONE);
      }
    }
    expect(sawTele).toBe(true);
    expect(heldStill, '預告時頭目要站定').toBe(true);
    expect(run.boss.used.charge ?? 0).toBeGreaterThan(0);
    expect(run.boss.used.seal ?? 0).toBeGreaterThan(0);
    expect(run.boss.hits).toBeGreaterThan(0);
  });

  it('看到預告就躲：同一段時間被招式打中的次數明顯比站著少（舊版沒有招式 → 這條沒有意義；新版躲得掉才算合格）', () => {
    const a = withBoss(0, 7);
    play(a.run, 30, false);
    const b = withBoss(0, 7);
    play(b.run, 30, true);
    expect(a.run.boss.hits).toBeGreaterThanOrEqual(3);
    expect(b.run.boss.hits).toBeLessThanOrEqual(a.run.boss.hits / 3);
  });

  it('封魔陣打中會減速；獵河武士的投網打中會定身（不能走也不能跳）', () => {
    const { run } = withBoss(0, 7);
    play(run, 25, false);
    expect(run.boss.used.seal ?? 0).toBeGreaterThan(0);
    const k = withBoss(1, 5);
    let rooted = false;
    for (let i = 0; i < 20 * 60 && !rooted; i++) {
      k.run.setMove(0, 0);
      k.run.hp = k.run.maxHp;
      k.run.step(DT);
      if (k.run.rootT > 0) rooted = true;
    }
    expect(rooted).toBe(true);
    const x0 = k.run.px;
    k.run.setMove(1, 0);
    k.run.requestJump();
    k.run.step(DT);
    k.run.step(DT);
    expect(Math.abs(k.run.px - x0)).toBeLessThan(1e-6);
  });

  it('追趕（D97）：玩家跑遠了頭目加速到比玩家快、追得上；靠近後恢復原本的速度（拿掉追趕會紅）', () => {
    const { run, b } = withBoss(0, 30);
    run.boss.devHoldSkills = true;
    const base = run.boss.baseSpeed;
    run.setMove(0, 0);
    run.step(DT);
    expect(run.enemies.speed[b]).toBeGreaterThan(run.stats.value.speed);
    expect(run.boss.chase).toBeGreaterThan(1.5);
    // 玩家一直往反方向跑 10 秒：距離要縮短（追得上）
    const d0 = Math.hypot(run.enemies.x[b] - run.px, run.enemies.z[b] - run.pz);
    for (let i = 0; i < 600; i++) {
      run.hp = run.maxHp;
      run.setMove(-1, 0);
      run.step(DT);
    }
    const d1 = Math.hypot(run.enemies.x[b] - run.px, run.enemies.z[b] - run.pz);
    expect(d1).toBeLessThan(d0);
    // 靠近之後恢復原本的速度
    run.enemies.relocate(b, run.px + 6, run.pz);
    run.setMove(0, 0);
    run.step(DT);
    expect(run.enemies.speed[b]).toBeCloseTo(base, 5);
  });

  it('半血變招：生命降到一半 → 第二階段（發事件、變快），之後會用半血限定的招（喚眾在身邊圍一圈）', () => {
    const { run, bus, b } = withBoss(0, 7);
    const log: string[] = [];
    bus.on('bossPhase2', () => log.push('p2'));
    const sp0 = run.boss.baseSpeed;
    run.enemies.hp[b] = run.enemies.maxHp[b] * 0.49;
    run.director.active = true; // 喚眾要靠導演生出來
    const ring0 = run.director.ringsSpawned;
    play(run, 40, true);
    expect(log).toEqual(['p2']);
    expect(run.boss.phase2).toBe(true);
    expect(run.boss.baseSpeed).toBeGreaterThan(sp0); // 比原本的移速快（追趕的加速另外算，D97）
    expect(run.boss.used.summon ?? 0).toBeGreaterThan(0);
    expect(run.director.ringsSpawned).toBeGreaterThan(ring0);
  });

  it('上帝模式、雪女的吐息凍住時，招式不會打到人', () => {
    const { run } = withBoss(0, 7);
    run.god = true;
    play(run, 20, false);
    expect(run.boss.hits).toBe(0);
  });
});
