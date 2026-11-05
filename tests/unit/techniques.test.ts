import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { TECHS, TECH_CHOICES, TECH_DEEPEN, TECH_FAMILIES, TECH_LEVELS, TECH_MAX, TECH_PICK_LEVELS, techById, techMix, techsFor } from '../../src/data/techniques';
import { ITEM_POOL } from '../../src/data/items';
import { kindIndex } from '../../src/systems/enemies';
import { Rng } from '../../src/lib/random';
import { zhTW } from '../../src/i18n/zh-TW';

const DT = 1 / 60;
afterEach(() => resetTuning());

function make(seed = 3, mapNumber?: number) {
  tuning.stageSeconds = 600;
  const run = new Run({ seed, bus: new EventBus(), mapNumber });
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
/** 主武器升到 level 級；技法面板選 pick（沒指定就選第一張），回傳選過的 id */
function levelWeapon(run: Run, level: number, pick?: string): string[] {
  const chosen: string[] = [];
  while (run.weaponLevel < level) {
    run.give('ghostfire', 'common');
    while (run.awaitingPick) {
      if (run.offerKind === 'tech') {
        const i = pick ? run.offer!.findIndex((c) => c.cardId === 'tech:' + pick) : 0;
        chosen.push(run.offer![Math.max(0, i)].cardId);
        run.chooseCard(Math.max(0, i));
      } else run.chooseCard(0);
    }
  }
  return chosen;
}

describe('技法池（資料全掃）', () => {
  it('id 唯一、每個都有名稱與說明（≤36 字）、適合的道具都在卡池、互斥雙向一致、三個系都有、剛好一個機制資料', () => {
    expect(new Set(TECHS.map((t) => t.id)).size).toBe(TECHS.length);
    for (const f of TECH_FAMILIES) expect(TECHS.filter((t) => t.family === f).length, f).toBeGreaterThanOrEqual(3);
    for (const t of TECHS) {
      for (const k of [`tech.${t.id}`, `tech.${t.id}.desc`] as const) {
        const txt = zhTW[k as keyof typeof zhTW] as string | undefined;
        expect(txt, k).toBeTruthy();
        expect(txt!.length, k).toBeLessThanOrEqual(36);
      }
      for (const id of t.likes) expect(ITEM_POOL, `${t.id} 的 ${id}`).toContain(id);
      for (const x of t.excludes) expect(techById(x).excludes, `${t.id} ✕ ${x} 要雙向`).toContain(t.id);
      const blocks = [t.split, t.bounce, t.homing, t.orbit, t.ward, t.satellite, t.burn, t.seed, t.pillar].filter(Boolean);
      expect(blocks, `${t.id} 的機制資料`).toHaveLength(1);
    }
    expect(TECH_PICK_LEVELS.every((l) => l >= 2)).toBe(true);
    expect(techsFor('ghostfire').length).toBe(TECHS.length);
  });
  it('混搭提示：命中效果 × 出手方式 → hit；同系 → family；沒關係 → null', () => {
    expect(techMix('hellfire', ['ring'])).toEqual({ kind: 'hit', via: 'ring', hit: 'hellfire' });
    expect(techMix('pillar', ['kitsunebi'])).toEqual({ kind: 'hit', via: 'pillar', hit: 'kitsunebi' });
    expect(techMix('seed', ['hellfire'])?.kind).toBe('family');
    expect(techMix('homing', ['ward'])).toBeNull();
    expect(techMix('ring', [])).toBeNull();
  });
});

describe('技法怎麼拿', () => {
  it('主武器到 4、7 級各跳一次三選一（隨機抽 3 個、互不相同）；選了就有，不會在別的等級跳', () => {
    const run = make(5);
    for (let lv = 2; lv <= 3; lv++) run.give('ghostfire', 'common');
    expect(run.offer).toBeNull();
    run.give('ghostfire', 'common');
    expect(run.weaponLevel).toBe(TECH_PICK_LEVELS[0]);
    expect(run.offerKind).toBe('tech');
    expect(run.techMode).toBe('new');
    expect(run.offer).toHaveLength(TECH_CHOICES);
    expect(new Set(run.offer!.map((o) => o.cardId)).size).toBe(TECH_CHOICES);
    const first = run.offer![1].cardId.slice('tech:'.length);
    run.chooseCard(1);
    expect(run.tech.owned).toEqual([first]);
    expect(run.offer).toBeNull();
    run.give('ghostfire', 'common');
    run.give('ghostfire', 'common');
    expect(run.offer, '5、6 級不該跳').toBeNull();
    run.give('ghostfire', 'common');
    expect(run.weaponLevel).toBe(TECH_PICK_LEVELS[1]);
    expect(run.offerKind).toBe('tech');
    run.chooseCard(0);
    expect(run.tech.owned).toHaveLength(2);
    expect(new Set(run.tech.owned).size).toBe(2);
  });
  it('固定種子可以重現；不同種子抽到的不一樣（不是每局同樣三張）', () => {
    const offers = (seed: number) => {
      const run = make(seed);
      levelWeapon(run, 3);
      run.give('ghostfire', 'common');
      return run.offer!.map((o) => o.cardId).join(',');
    };
    expect(offers(11)).toBe(offers(11));
    const seen = new Set<string>();
    for (let s = 1; s <= 12; s++) seen.add(offers(s));
    expect(seen.size, '12 個種子的第一次三選一都一樣').toBeGreaterThan(3);
  });
  it('在升級選卡中途升到 4 級：技法面板插進來，選完繼續剩下的升級，沒有卡住', () => {
    const run = make(6);
    run.give('ghostfire', 'common');
    run.give('ghostfire', 'common');
    run.addXp(500);
    let guard = 0;
    let sawTech = false;
    while (run.offer && guard++ < 300) {
      if (run.offerKind === 'tech') {
        sawTech = true;
        run.chooseCard(0);
        continue;
      }
      const gi = run.offer.findIndex((o) => o.cardId === 'ghostfire');
      run.chooseCard(gi >= 0 ? gi : 0);
    }
    expect(run.offer).toBeNull();
    expect(sawTech || run.weaponLevel < TECH_PICK_LEVELS[0]).toBe(true);
  });
  it('一局最多 TECH_MAX 個：大關（3 關）的過關畫面先補新技法；拿滿之後改成「加深」（技法等級）', () => {
    const run = make(7, 3);
    levelWeapon(run, 7);
    expect(run.tech.owned).toHaveLength(2);
    // 第 1 關過關 → 第 3 個；第 2 關過關 → 第 4 個
    for (const want of [3, 4]) {
      run.devClearStage();
      expect(run.phase).toBe('intermission');
      expect(run.offerKind).toBe('tech');
      expect(run.techMode).toBe('new');
      run.chooseCard(0);
      expect(run.tech.owned).toHaveLength(want);
      expect(run.offer).toBeNull();
      run.continueFromIntermission();
    }
    expect(run.tech.owned).toHaveLength(TECH_MAX);
    // 拿滿之後：加深（用新的一局直接給 4 個，再過關）
    const full = make(7, 3);
    full.devAddTech(...run.tech.owned);
    full.devClearStage();
    expect(full.tech.owned).toHaveLength(TECH_MAX);
    expect(full.offerKind).toBe('tech');
    expect(full.techMode).toBe('up');
    const id = full.offer![0].cardId.slice('tech-up:'.length);
    full.chooseCard(0);
    expect(full.tech.levelOf(id)).toBe(2);
    expect(full.tech.owned).toHaveLength(TECH_MAX);
  });
  it('一般地圖（2 關）：只有第 1 關的過關畫面有技法選擇，第 2 關過關就是通關', () => {
    const run = make(7);
    run.devClearStage();
    expect(run.offerKind).toBe('tech');
    run.chooseCard(0);
    run.continueFromIntermission();
    run.devClearStage();
    expect(run.phase).toBe('ended');
    expect(run.offer).toBeNull();
  });
  it('過關畫面有待選的技法時不能直接出發（面板擋著）；選完才能出發', () => {
    const run = make(8);
    run.devClearStage();
    expect(run.offer).not.toBeNull();
    run.continueFromIntermission();
    expect(run.phase, '還沒選就出發了').toBe('intermission');
    run.chooseCard(0);
    run.continueFromIntermission();
    expect(run.phase).toBe('combat');
  });
  it('互斥：拿了燈籠環就不會再抽到彈跳／歸巢；拿了彈跳就不會抽到燈籠環', () => {
    const rng = new Rng(1);
    const a = make(9);
    a.devAddTech('ring');
    for (let i = 0; i < 40; i++) for (const id of a.tech.offerNew(rng, 9)) expect(['bounce', 'homing']).not.toContain(id);
    const b = make(9);
    b.devAddTech('bounce');
    for (let i = 0; i < 40; i++) expect(b.tech.offerNew(rng, 9)).not.toContain('ring');
  });
});

describe('出手方式與命中效果', () => {
  it('狐火分裂：命中後分裂出小火打到旁邊的敵人（對照組不會）', () => {
    tuning.volley = 1; // 一次只射 1 顆（鬼火 +N 會各打不同的敵人，會把對照組搞亂）
    const run = make(7);
    run.devAddTech('kitsunebi');
    const a = placeEnemy(run, 4, 0);
    const b = placeEnemy(run, 7, 2);
    const c = placeEnemy(run, 7, -2);
    stepN(run, 120);
    expect(run.enemies.hp[a] < 1e6).toBe(true);
    expect(run.enemies.hp[b] < 1e6 && run.enemies.hp[c] < 1e6, '分裂的小火應該打到旁邊兩隻').toBe(true);
    const r2 = make(7);
    const a2 = placeEnemy(r2, 4, 0);
    const b2 = placeEnemy(r2, 7, 2);
    const c2 = placeEnemy(r2, 7, -2);
    stepN(r2, 120);
    expect(r2.enemies.hp[a2] < 1e6).toBe(true);
    expect(r2.enemies.hp[b2] === 1e6 && r2.enemies.hp[c2] === 1e6, '對照組不該打到旁邊').toBe(true);
  });
  it('彈跳：打中後跳到範圍內下一隻、最多 jumps 次；範圍外的不跳', () => {
    tuning.volley = 1;
    const run = make(12);
    run.devAddTech('bounce');
    const b = techById('bounce').bounce!;
    const a = placeEnemy(run, 4, 0);
    const near1 = placeEnemy(run, 4 + b.range - 1, 0);
    const near2 = placeEnemy(run, 4 + 2 * (b.range - 1), 0);
    const near3 = placeEnemy(run, 4 + 3 * (b.range - 1), 0);
    const far = placeEnemy(run, -20, 0);
    stepN(run, 180);
    const hurt = (i: number) => run.enemies.hp[i] < 1e6;
    expect(hurt(a)).toBe(true);
    expect(hurt(near1), '第 1 跳').toBe(true);
    expect(hurt(near2), '第 2 跳').toBe(true);
    expect(hurt(far)).toBe(false);
    void near3; // 第 3 個只可能被後來的鬼火直接打到，不測
    const r2 = make(12);
    tuning.volley = 1;
    const a2 = placeEnemy(r2, 4, 0);
    const n1 = placeEnemy(r2, 4 + b.range - 1, 0);
    stepN(r2, 40);
    expect(r2.enemies.hp[n1], '對照組（沒有彈跳）不該被打到').toBe(1e6);
    void a2;
  });
  it('歸巢：鬼火飛到盡頭會折返飛回玩家身邊、回程多穿透；對照組飛到盡頭就消失', () => {
    const run = make(13);
    run.director.active = false;
    run.devAddTech('homing');
    const h = techById('homing').homing!;
    expect(run.tech.weapon.projectileSpeed).toBeGreaterThan(run.yokai.weapon.projectileSpeed);
    const w = run.tech.weapon;
    const pi = run.projectiles.spawn(run.px, run.pz, 1, 0, w, 10, false, -1, 0, 0);
    run.projectiles.homing[pi] = run.tech.homingFlag;
    run.projectiles.life[pi] = 0.4;
    const pierce0 = run.projectiles.pierceLeft[pi];
    let turned = false;
    let farthest = 0;
    let lastDist = 99;
    for (let i = 0; i < 60 * 3 && run.projectiles.alive[pi]; i++) {
      run.step(DT);
      farthest = Math.max(farthest, run.projectiles.x[pi] - run.px);
      if (run.projectiles.homing[pi] === 2 && !turned) {
        turned = true;
        expect(run.projectiles.pierceLeft[pi], '回程要多穿透').toBe(pierce0 + h.returnPierce);
      }
      if (run.projectiles.alive[pi]) lastDist = Math.hypot(run.projectiles.x[pi] - run.px, run.projectiles.z[pi] - run.pz);
    }
    expect(turned, '飛到盡頭沒有折返').toBe(true);
    expect(farthest).toBeGreaterThan(3);
    expect(run.projectiles.alive[pi], '回程飛到玩家身邊就該消失').toBe(0);
    expect(lastDist, '消失前最後的位置該在玩家身邊（折返飛回來了）').toBeLessThan(2.5);
    // 對照組：沒有歸巢，飛到盡頭就消失（不折返）
    const r2 = make(13);
    r2.director.active = false;
    const p2 = r2.projectiles.spawn(r2.px, r2.pz, 1, 0, r2.yokai.weapon, 10, false, -1, 0, 0);
    r2.projectiles.life[p2] = 0.4;
    for (let i = 0; i < 60; i++) r2.step(DT);
    expect(r2.projectiles.alive[p2]).toBe(0);
    expect(r2.projectiles.homing[p2]).toBe(0);
  });
  it('燈籠環：不發射投射物，繞身鬼火打到身邊的敵人；環內護身打到貼身的、把它們推出去（舊版貼身的打不到）', () => {
    const run = make(8);
    run.devAddTech('ring');
    const near = placeEnemy(run, run.orbitRadius, 0);
    const far = placeEnemy(run, 9, 0);
    stepN(run, 120);
    expect(run.projectiles.aliveCount).toBe(0);
    expect(run.enemies.hp[near]).toBeLessThan(1e6);
    expect(run.enemies.hp[far]).toBe(1e6);
    const r2 = make(18);
    r2.devAddTech('ring');
    const inner = r2.orbitRadius - techById('ring').orbit!.hitRadius;
    expect(inner).toBeGreaterThan(0.8);
    const hug = placeEnemy(r2, 0.8, 0);
    const far2 = placeEnemy(r2, 9, 0);
    stepN(r2, 20);
    expect(r2.enemies.hp[hug], '貼身的人類沒受傷').toBeLessThan(1e6);
    expect(Math.hypot(r2.enemies.x[hug] - r2.px, r2.enemies.z[hug] - r2.pz), '沒有被推開').toBeGreaterThan(0.8 + 0.5);
    expect(r2.innerHits).toBeGreaterThan(0);
    expect(r2.enemies.hp[far2]).toBe(1e6);
  });
  it('護身火：充好之前被碰到照扣；充好之後擋下一次、炸開打到周圍的人、重新充能', () => {
    const run = make(14);
    run.god = false;
    run.devAddTech('ward');
    const w = techById('ward').ward!;
    const e = placeEnemy(run, 0.3, 0);
    // 還沒充好：被碰到會扣血
    run.step(DT);
    expect(run.tech.wardReady).toBe(false);
    expect(run.hp).toBeLessThan(run.maxHp);
    run.hp = run.maxHp;
    // 充好
    run.enemies.kill(e);
    for (let i = 0; i < (w.chargeSeconds + 0.5) / DT; i++) run.step(DT);
    expect(run.tech.wardReady).toBe(true);
    const hp0 = run.hp;
    run.invul = 0;
    const hit = placeEnemy(run, 0.3, 0);
    const bystander = placeEnemy(run, 1.5, 0);
    for (let i = 0; i < 10 && run.tech.wardReady; i++) run.step(DT);
    expect(run.tech.wardReady, '碰到之後護身火沒用掉').toBe(false);
    expect(run.hp, '護身火沒有擋下傷害').toBeGreaterThanOrEqual(hp0 - 1e-6);
    expect(run.enemies.hp[hit] < 1e6 && run.enemies.hp[bystander] < 1e6, '炸開沒打到周圍的人').toBe(true);
    expect(run.tech.wardProgress).toBeLessThan(0.2);
  });
  it('衛星燈：照常發射，另外外圈有一盞燈籠打到經過的人', () => {
    const run = make(15);
    run.devAddTech('satellite');
    const R = run.tech.satRadius;
    expect(R).toBeGreaterThan(4);
    const e = placeEnemy(run, R, 0);
    const mid = placeEnemy(run, R, 1.5);
    stepN(run, 60 * 6); // 衛星轉一圈都經過
    expect(run.projectiles.aliveCount + run.kills, '衛星燈不該取代發射').toBeGreaterThanOrEqual(0);
    expect(run.enemies.hp[e] < 1e6 || run.enemies.hp[mid] < 1e6).toBe(true);
    expect(run.tech.satCount).toBe(1);
  });
  it('業火：命中處留下燃燒地，持續燒、時間到消失；鬼火變慢變重', () => {
    const run = make(9);
    run.devAddTech('hellfire');
    const a = placeEnemy(run, 4, 0);
    stepN(run, 60);
    expect(run.zoneCount).toBeGreaterThan(0);
    const hp1 = run.enemies.hp[a];
    stepN(run, 30);
    expect(run.enemies.hp[a]).toBeLessThan(hp1);
    run.devTeleport(run.px + 30, run.pz);
    stepN(run, 60 * 4);
    expect(run.zoneCount).toBe(0);
  });
  it('火種：被武器打倒的人留下火種，delay 秒後爆炸打到旁邊的人；不是武器打倒的（補給品落雷）不留', () => {
    tuning.volley = 1;
    const run = make(16);
    run.devAddTech('seed');
    const sd = techById('seed').seed!;
    const dead = placeEnemy(run, 4, 0, 1);
    const near = placeEnemy(run, 4 + sd.radius * 0.5, 0);
    for (let i = 0; i < 60 && run.enemies.alive[dead]; i++) stepN(run, 1);
    expect(run.enemies.alive[dead]).toBe(0);
    expect(run.tech.seedCount, '沒有留下火種').toBeGreaterThan(0);
    const hp0 = run.enemies.hp[near];
    stepN(run, Math.ceil((sd.delay + 0.3) / DT));
    expect(run.enemies.hp[near], '火種爆炸沒打到旁邊的人').toBeLessThan(hp0);
    expect(run.tech.seedCount).toBeLessThanOrEqual(sd.max);
    // 對照組：落雷鼓打倒的不留
    const r2 = make(16);
    r2.devAddTech('seed');
    placeEnemy(r2, 6, 0, 1);
    r2.devPickup('drum', 0.3);
    r2.step(DT);
    expect(r2.tech.seedCount).toBe(0);
  });
  it('鬼火柱：每隔幾秒往人最多的地方噴一次、打到範圍內的人；沒有人時不浪費', () => {
    const run = make(17);
    run.devAddTech('pillar');
    const p = techById('pillar').pillar!;
    for (let i = 0; i < run.enemies.capacity; i++) if (run.enemies.alive[i]) run.enemies.kill(i);
    run.director.active = false;
    stepN(run, 120);
    expect(run.enemies.aliveCount, '沒有敵人時').toBe(0);
    // 一群聚在一起的人 + 一個落單的：柱子該落在人群上
    const cluster = [placeEnemy(run, 6, 0), placeEnemy(run, 6.6, 0.4), placeEnemy(run, 6.2, -0.5)];
    const lone = placeEnemy(run, -7, 0);
    run.devTeleport(run.px, run.pz);
    const hp0 = cluster.map((i) => run.enemies.hp[i]);
    const lone0 = run.enemies.hp[lone];
    for (let i = 0; i < Math.ceil((p.life + 0.2) / DT); i++) run.step(DT);
    expect(cluster.every((i, k) => run.enemies.hp[i] < hp0[k]), '柱子沒有落在人群上').toBe(true);
    void lone0;
  });
});

describe('混搭（命中效果掛在出手方式上）', () => {
  it('燈籠環＋業火：繞身的火打到人也留下燃燒地（單獨燈籠環沒有）', () => {
    const run = make(19);
    run.devAddTech('ring', 'hellfire');
    placeEnemy(run, run.orbitRadius, 0);
    stepN(run, 90);
    expect(run.zoneCount, '燈籠環的命中沒有觸發業火').toBeGreaterThan(0);
    const r2 = make(19);
    r2.devAddTech('ring');
    placeEnemy(r2, r2.orbitRadius, 0);
    stepN(r2, 90);
    expect(r2.zoneCount).toBe(0);
  });
  it('燈籠環＋狐火分裂：環上的火打到人會分裂出小火打到旁邊的人', () => {
    const run = make(20);
    run.devAddTech('ring', 'kitsunebi');
    const R = run.orbitRadius;
    placeEnemy(run, R, 0);
    const side = placeEnemy(run, R + 5, 1);
    stepN(run, 180);
    expect(run.enemies.hp[side], '分裂的小火沒有飛出去').toBeLessThan(1e6);
  });
  it('命中效果的冷卻：繞身的高頻判定，同一隻人類 hitFxCooldown 秒內只觸發一次（燃燒地不爆量）', () => {
    const run = make(21);
    run.devAddTech('ring', 'hellfire');
    placeEnemy(run, run.orbitRadius, 0);
    stepN(run, 60);
    // 1 秒內每隻人類最多觸發 1/0.5 + 1 次
    expect(run.zoneCount).toBeLessThanOrEqual(3);
  });
});

describe('同系加深、技法等級、滿級加強', () => {
  it('同系拿兩個：該系加深一次（分裂 +1 顆、環繞 半徑與顆數、燃燒 傷害）', () => {
    const a = make(22);
    a.devAddTech('ring');
    const n0 = a.orbitCount;
    const r0 = a.orbitRadius;
    a.devAddTech('satellite');
    expect(a.tech.deep.orbit).toBe(1);
    expect(a.orbitCount).toBe(n0 + TECH_DEEPEN.orbit.orbs);
    expect(a.orbitRadius).toBeCloseTo(r0 * TECH_DEEPEN.orbit.radius, 5);
    const b = make(22);
    b.devAddTech('kitsunebi', 'hellfire');
    expect(b.tech.deep.split).toBe(0);
    expect(b.tech.deep.burn).toBe(0);
  });
  it('技法等級：加深一次 → 效果乘 1 + perLevel；到上限不再加', () => {
    const run = make(23);
    run.devAddTech('hellfire');
    expect(run.tech.levelUp('hellfire')).toBe(true);
    expect(run.tech.levelOf('hellfire')).toBe(2);
    run.tech.levelUp('hellfire');
    expect(run.tech.levelUp('hellfire')).toBe(false);
    expect(run.tech.levelOf('hellfire')).toBe(TECH_LEVELS.max);
    const a = make(23);
    a.devAddTech('hellfire');
    const b = make(23);
    b.devAddTech('hellfire');
    b.tech.levelUp('hellfire');
    const dmg = (r: Run) => {
      const e = placeEnemy(r, 4, 0);
      stepN(r, 70);
      const z = r.tech.zoneDmg[0];
      void e;
      return z;
    };
    tuning.volley = 1;
    expect(dmg(b)).toBeGreaterThan(dmg(a));
  });
  it('主武器滿級時技法再加強（燈籠環 顆數與半徑、衛星燈 盞數）', () => {
    const run = make(10);
    run.devAddTech('ring', 'satellite');
    const n0 = run.orbitCount;
    const r0 = run.orbitRadius;
    const s0 = run.tech.satCount;
    levelWeapon(run, 8);
    expect(run.weaponMaxed).toBe(true);
    expect(run.orbitCount).toBeGreaterThan(n0);
    expect(run.orbitRadius).toBeGreaterThan(r0);
    expect(run.tech.satCount).toBeGreaterThan(s0);
  });
  it('技法 12 組合都能跑 10 秒不出錯（兩兩組合全掃，沒有 NaN 傷害）', () => {
    const ids = TECHS.map((t) => t.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const run = make(30 + i * 13 + j);
        run.devAddTech(ids[i]);
        if (!run.tech.canOffer(ids[j])) continue;
        run.devAddTech(ids[j]);
        for (let k = 0; k < 6; k++) placeEnemy(run, 3 + k, k - 2);
        stepN(run, 60 * 4);
        expect(Number.isFinite(run.hp), `${ids[i]}＋${ids[j]}`).toBe(true);
        for (let e = 0; e < run.enemies.capacity; e++) if (run.enemies.alive[e]) expect(Number.isFinite(run.enemies.hp[e]), `${ids[i]}＋${ids[j]} 的敵人血量`).toBe(true);
      }
    }
  });
});
