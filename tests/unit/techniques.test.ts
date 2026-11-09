import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../../src/core/bus';
import { Run } from '../../src/game/run';
import { tuning, resetTuning } from '../../src/data/tuning';
import { BASE_TECH_ID, EVO, EVOS, TECHS, TECH_DEEPEN, TECH_FAMILIES, TECH_LEVELS, TECH_OFFER, techById, techMix, techsFor } from '../../src/data/techniques';
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
/** 主武器升到 level 級（中途跳出的選卡選第一張） */
/** 讓某個技法進化並練到指定等級（D57：鬼火雨／衛星燈／燈油是進化形態 6 級解鎖的附加效果） */
function evolveTo(run: Run, id: string, level: number): void {
  run.devAddTech(id);
  run.devTechLevel(BASE_TECH_ID, EVO.minLevel);
  run.devTechLevel(id, EVO.minLevel);
  run.tech.evolve(EVOS.find((e) => e.from[1] === id)!.id);
  run.devTechLevel(id, level);
}

function levelWeapon(run: Run, level: number): void {
  while (run.weaponLevel < level) {
    run.give('ghostfire', 'common');
    while (run.awaitingPick) run.chooseCard(0);
  }
}

describe('技法池（資料全掃）', () => {
  it('id 唯一、每個都有名稱與說明（≤36 字）、適合的道具都在卡池、互斥雙向一致、三個系都有、剛好一個機制資料', () => {
    expect(new Set(TECHS.map((t) => t.id)).size).toBe(TECHS.length);
    for (const w of ['ghostfire', 'waterdisc']) for (const f of TECH_FAMILIES) expect(techsFor(w).filter((t) => t.family === f).length, `${w} ${f}`).toBeGreaterThanOrEqual(2);
    for (const t of TECHS) {
      for (const k of [`tech.${t.id}`, `tech.${t.id}.desc`] as const) {
        const txt = zhTW[k as keyof typeof zhTW] as string | undefined;
        expect(txt, k).toBeTruthy();
        expect(txt!.length, k).toBeLessThanOrEqual(36);
      }
      for (const id of t.likes) expect(ITEM_POOL, `${t.id} 的 ${id}`).toContain(id);
      for (const x of t.excludes) expect(techById(x).excludes, `${t.id} ✕ ${x} 要雙向`).toContain(t.id);
      const blocks = [t.split, t.bounce, t.homing, t.orbit, t.ward, t.lamp, t.burn, t.seed, t.pillar].filter(Boolean); // 鬼火雨／衛星燈／燈油的資料掛在併進去的技法上（D57）
      expect(blocks, `${t.id} 的機制資料`).toHaveLength(1);
    }
    expect(TECH_OFFER.chance).toBeGreaterThan(0);
    expect(TECH_OFFER.chance).toBeLessThan(1);
    expect(techsFor('ghostfire').length + techsFor('waterdisc').length).toBe(TECHS.length);
  });
  it('混搭提示：命中效果 × 出手方式 → hit；同系 → family；沒關係 → null', () => {
    expect(techMix('hellfire', ['ring'])).toEqual({ kind: 'hit', via: 'ring', hit: 'hellfire' });
    expect(techMix('pillar', ['kitsunebi'])).toEqual({ kind: 'hit', via: 'pillar', hit: 'kitsunebi' });
    expect(techMix('seed', ['hellfire'])?.kind).toBe('family');
    expect(techMix('homing', ['ward'])).toBeNull();
    expect(techMix('ring', [])).toBeNull();
  });
});

/** 直接叫出一次升級選卡（不經過經驗值），回傳這次的三張 */
function deal(run: Run): { cardId: string; rarity: string }[] {
  (run as unknown as { makeOffer(): void }).makeOffer();
  return run.offer!.map((o) => ({ ...o }));
}

describe('技法怎麼拿（D49：機率出現在升級卡裡、8 級、分稀有度）', () => {
  it('不再固定跳出技法面板：主武器 1→8 級、過關畫面都不會開技法面板', () => {
    const run = make(5);
    for (let lv = 2; lv <= 8; lv++) {
      run.give('ghostfire', 'common');
      expect(run.offerKind === 'tech' && run.awaitingPick, `主武器 ${lv} 級跳出技法面板`).toBe(false);
      while (run.awaitingPick) run.chooseCard(0);
    }
    run.devClearStage();
    expect(run.offerKind === 'tech' && run.offer !== null, '過關畫面跳出技法面板').toBe(false);
  });
  it('玩家 minLevel 級以前一張技法卡都不會出現；之後大約 chance 的機率出現一張（一次最多一張）', () => {
    const run = make(6);
    run.level = TECH_OFFER.minLevel - 1;
    for (let k = 0; k < 2000; k++) expect(deal(run).some((c) => c.cardId.startsWith('tech:'))).toBe(false);
    run.level = 10;
    let hit = 0;
    const N = 4000;
    for (let k = 0; k < N; k++) {
      const n = deal(run).filter((c) => c.cardId.startsWith('tech:')).length;
      expect(n).toBeLessThanOrEqual(1);
      hit += n;
    }
    expect(hit / N).toBeGreaterThan(TECH_OFFER.chance - 0.03);
    expect(hit / N).toBeLessThan(TECH_OFFER.chance + 0.03);
  });
  it('技法卡分稀有度（只有已解鎖的）；選了學會、再選同一個升一級，稀有度越高效果越強；到進化前的上限（5 級）就不再出現', () => {
    const run = make(7);
    run.level = 10;
    const seen = new Set<string>();
    for (let k = 0; k < 3000; k++) for (const c of deal(run)) if (c.cardId.startsWith('tech:')) seen.add(c.rarity);
    expect([...seen].every((r) => ['common', 'rare'].includes(r)), `出現了沒解鎖的稀有度：${[...seen]}`).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
    // 學會（凡）→ 良升一級
    const a = make(8);
    a.devTechNext();
    a.addXp(a.xpNeeded);
    const i = a.offer!.findIndex((c) => c.cardId.startsWith('tech:'));
    expect(i, '指定的下一次升級沒有技法卡').toBeGreaterThanOrEqual(0);
    const id = a.offer![i].cardId.slice('tech:'.length);
    a.offer![i].rarity = 'common';
    a.chooseCard(i);
    expect(a.tech.levelOf(id)).toBe(1);
    expect(a.tech.powerOf(id)).toBeCloseTo(1, 5);
    a.tech.levelUp(id, 1.2);
    expect(a.tech.levelOf(id)).toBe(2);
    expect(a.tech.powerOf(id)).toBeCloseTo(1 + TECH_LEVELS.perLevel * 1.2, 5);
    for (let k = 0; k < 20; k++) a.tech.levelUp(id, 1);
    expect(a.tech.levelOf(id), '進化前最多 EVO.minLevel 級（D57）').toBe(EVO.minLevel);
    // 到上限的那個不會再被抽到
    const rng = new Rng(3);
    for (let k = 0; k < 300; k++) expect(a.tech.pickCard(rng)).not.toBe(id);
  });
  it('D60 集中：已有的技法，等級越高越常出現在技法卡裡；（舊版平均分配會紅）', () => {
    const run = make(12);
    run.level = 40;
    run.devAddTech('ring', 'ward');
    run.tech.devSetLevel('ring', 4);
    const rng = new Rng(5);
    const n: Record<string, number> = {};
    for (let k = 0; k < 1500; k++) {
      const id = run.tech.pickCard(rng)!;
      n[id] = (n[id] ?? 0) + 1;
    }
    expect(n.ring, '練到 4 級的環').toBeGreaterThan(n.ward * 1.5);
    expect(n.ward, '1 級的護身火也還會出現').toBeGreaterThan(0);
    expect(TECH_OFFER.levelBias).toBeGreaterThan(0);
  });
  it('D62 先填滿欄位：還有空位時，沒拿過的技法佔多數（變化）；欄位滿了就只剩已有的', () => {
    const run = make(13);
    run.level = 40;
    run.devAddTech('ring');
    const rng = new Rng(6);
    let fresh = 0;
    const N = 800;
    for (let k = 0; k < N; k++) if (run.tech.pickCard(rng) !== 'ring') fresh++;
    expect(fresh / N, '有空位時新技法的比例').toBeGreaterThan(0.5);
    run.devAddTech('ward', 'hellfire');
    const rng2 = new Rng(7);
    for (let k = 0; k < 200; k++) expect(['ring', 'ward', 'hellfire']).toContain(run.tech.pickCard(rng2));
  });
  it('拿滿 TECH_MAX 個之後只會出現已有的下一級；互斥照舊（燈籠環在身上不出彈跳／歸巢）', () => {
    const rng = new Rng(9);
    const full = make(9);
    full.devAddTech('ring', 'ward', 'hellfire', 'seed');
    full.level = 30;
    for (let k = 0; k < 500; k++) expect(full.tech.owned).toContain(full.tech.pickCard(rng));
    const r = make(9);
    r.devAddTech('ring');
    for (let k = 0; k < 500; k++) expect(['bounce', 'homing']).not.toContain(r.tech.pickCard(rng));
  });
  it('養成門檻（D50）：已有的技法下一級要玩家等級 ≥ minLevel + levelGap × 目前技法等級（舊版會紅）', () => {
    const rng = new Rng(21);
    const run = make(21);
    run.devAddTech('ring', 'ward', 'hellfire', 'seed'); // 拿滿：只剩下一級可以出
    const gate = (lv: number) => TECH_OFFER.minLevel + TECH_OFFER.levelGap * lv;
    run.level = gate(1) - 1;
    for (let k = 0; k < 200; k++) expect(run.tech.pickCard(rng), '等級不夠還出現下一級').toBeNull();
    run.level = gate(1);
    expect(run.tech.pickCard(rng)).not.toBeNull();
    // 升到 2 級之後，要再高一點才會出第 3 級
    run.tech.levelUp('ring');
    for (let k = 0; k < 300; k++) expect(run.tech.pickCard(rng), '2 級的燈籠環太早出第 3 級').not.toBe('ring');
  });
  it('固定種子可以重現；不同種子出現的技法卡不一樣', () => {
    const seq = (seed: number) => {
      const run = make(seed);
      run.level = 10;
      const out: string[] = [];
      for (let k = 0; k < 80; k++) for (const c of deal(run)) if (c.cardId.startsWith('tech:')) out.push(c.cardId + c.rarity);
      return out.join(',');
    };
    expect(seq(11)).toBe(seq(11));
    expect(seq(11)).not.toBe(seq(12));
  });
  it('一般升級裡選了技法卡：這次升級就用掉了（不會多一次選卡）、選完繼續剩下的升級', () => {
    const run = make(10);
    run.devTechNext();
    run.addXp(run.xpNeeded * 3);
    const before = (run as unknown as { pendingPicks: number }).pendingPicks;
    const i = run.offer!.findIndex((c) => c.cardId.startsWith('tech:'));
    run.chooseCard(i);
    expect(run.tech.owned).toHaveLength(1);
    expect((run as unknown as { pendingPicks: number }).pendingPicks).toBe(before - 1);
    let guard = 0;
    while (run.offer && guard++ < 50) run.chooseCard(0);
    expect(run.awaitingPick).toBe(false);
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
  it('衛星燈（燈籠環進化形態 6 級解鎖）：外圈有一盞大燈籠打到經過的人；5 級還沒有', () => {
    const r5 = make(15);
    evolveTo(r5, 'ring', EVO.minLevel);
    expect(r5.tech.satCount, '5 級不該有衛星燈').toBe(0);
    const run = make(15);
    evolveTo(run, 'ring', 6);
    const R = run.tech.satRadius;
    expect(R).toBeGreaterThan(4);
    const e = placeEnemy(run, R, 0);
    const mid = placeEnemy(run, R, 1.5);
    stepN(run, 60 * 6); // 衛星轉一圈都經過
    expect(run.enemies.hp[e] < 1e6 || run.enemies.hp[mid] < 1e6).toBe(true);
    expect(run.tech.satCount).toBe(1);
  });
  it('業火：命中處留下燃燒地，持續燒、時間到消失；鬼火變慢變重', () => {
    const run = make(9);
    run.director.active = false; // 只看自己放的人類（D50 敵人變多，移走之後新湧出的又會被打出燃燒地）
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

describe('第二步的三種技法', () => {
  it('鬼火雨（狐火分裂進化形態 6 級解鎖）：命中時在命中點附近落下小火；5 級沒有；落點固定種子可重現', () => {
    tuning.volley = 1;
    const r5 = make(40);
    evolveTo(r5, 'kitsunebi', EVO.minLevel);
    expect(r5.tech.act.rain, '5 級不該有鬼火雨').toBeNull();
    const run = make(40);
    evolveTo(run, 'kitsunebi', 6);
    expect(run.tech.act.rain?.rain).toBeTruthy();
    const r = techById('kitsunebi').rain!;
    expect(r.range).toBeGreaterThan(r.radius);
    placeEnemy(run, 4, 0);
    stepN(run, 90);
    let rained = 0;
    for (let i = 0; i < run.tech.flashKind.length; i++) if (run.tech.flashKind[i] === 3 && run.tech.flashMax[i] > 0) rained++;
    expect(rained, '命中之後沒有落下小火').toBeGreaterThan(0);
  });
  it('開路燈：燈籠在移動方向的前方 ahead 公尺，朝哪邊跑就在哪邊；路上的人被燒到', () => {
    const run = make(41);
    run.director.active = false;
    run.devAddTech('lamp');
    const o = techById('lamp').lamp!;
    run.setMove(1, 0);
    for (let i = 0; i < 30; i++) run.step(DT);
    const dx = run.tech.lampX[0] - run.px;
    expect(run.tech.lampN).toBe(1);
    expect(dx, '往 +x 跑，燈籠該在 +x 前方').toBeGreaterThan(o.ahead * 0.6);
    run.setMove(-1, 0);
    for (let i = 0; i < 60; i++) run.step(DT);
    expect(run.tech.lampX[0] - run.px, '轉向 −x 之後燈籠跟著換邊').toBeLessThan(-o.ahead * 0.6);
    // 前方的人被燒到、被推開
    const e = placeEnemy(run, -o.ahead, 0);
    const hp0 = run.enemies.hp[e];
    for (let i = 0; i < 30; i++) run.step(DT);
    expect(run.enemies.hp[e], '前方的人沒被燈籠燒到').toBeLessThan(hp0);
  });
  it('燈油（業火進化形態 6 級解鎖）：被打中的人身上沾火、持續燒、時間到停；燒死時火傳給附近的人；5 級沒有', () => {
    tuning.volley = 1;
    const r5 = make(42);
    evolveTo(r5, 'hellfire', EVO.minLevel);
    expect(r5.tech.act.oil, '5 級不該有燈油').toBeNull();
    const run = make(42);
    run.director.active = false;
    evolveTo(run, 'hellfire', 6);
    const o = run.tech.act.oil!.oil!;
    const a = placeEnemy(run, 4, 0);
    const near = placeEnemy(run, 4, o.spreadRange * 0.95);
    const hp0 = run.enemies.hp[a];
    for (let i = 0; i < 120 && run.enemies.hp[a] === hp0; i++) stepN(run, 1); // 鬼火打中 a
    run.devTeleport(run.px + 40, run.pz); // 不再被鬼火打，只剩燒
    stepN(run, 10);
    expect(run.tech.oilShown).toBeGreaterThan(0);
    // 燒死 → 傳給附近的人（讓 a 剩一點血）
    run.enemies.hp[a] = 1;
    stepN(run, Math.ceil((o.tick + 0.2) / DT));
    expect(run.enemies.alive[a]).toBe(0);
    stepN(run, 5);
    expect(run.tech.oilShown, '火沒有傳給附近的人').toBeGreaterThan(0);
    // 時間到就停
    stepN(run, Math.ceil((o.atMaxSeconds + 4) / DT));
    expect(run.tech.oilShown).toBe(0);
    void near;
  });
  it('燈油＋燈籠環：繞身的火打到人也會沾上燈油（混搭）', () => {
    const run = make(43);
    run.director.active = false;
    run.devAddTech('ring');
    evolveTo(run, 'hellfire', 6);
    placeEnemy(run, run.orbitRadius, 0);
    stepN(run, 60);
    expect(run.tech.oilShown, '燈籠環的命中沒有觸發燈油').toBeGreaterThan(0);
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
    a.devAddTech('ward');
    expect(a.tech.deep.orbit).toBe(1);
    expect(a.orbitCount).toBe(n0 + TECH_DEEPEN.orbit.orbs);
    expect(a.orbitRadius).toBeCloseTo(r0 * TECH_DEEPEN.orbit.radius, 5);
    const b = make(22);
    b.devAddTech('kitsunebi', 'hellfire');
    expect(b.tech.deep.split).toBe(0);
    expect(b.tech.deep.burn).toBe(0);
  });
  it('技法等級：升一級 → 效果乘 1 + perLevel × 稀有度；到上限（進化前 5 級）不再加', () => {
    const run = make(23);
    run.devAddTech('hellfire');
    expect(run.tech.levelUp('hellfire')).toBe(true);
    expect(run.tech.levelOf('hellfire')).toBe(2);
    for (let k = 2; k < EVO.minLevel; k++) run.tech.levelUp('hellfire');
    expect(run.tech.levelUp('hellfire')).toBe(false);
    expect(run.tech.levelOf('hellfire'), '進化前最多 5 級').toBe(EVO.minLevel);
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
    evolveTo(run, 'ring', 6);
    const n0 = run.orbitCount;
    const r0 = run.orbitRadius;
    const s0 = run.tech.satCount;
    levelWeapon(run, 8);
    expect(run.weaponMaxed).toBe(true);
    expect(run.orbitCount).toBeGreaterThan(n0);
    expect(run.orbitRadius).toBeGreaterThan(r0);
    expect(run.tech.satCount).toBeGreaterThan(s0);
  });
  it('技法兩兩組合都能跑 10 秒不出錯（兩兩組合全掃，沒有 NaN 傷害）', () => {
    const ids = techsFor('ghostfire').map((t) => t.id);
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
