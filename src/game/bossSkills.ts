import { BOSSES, BOSS_TELEGRAPH, type BossDef, type BossSkillDef } from '../data/bosses';
import { COMBAT } from '../data/combat';
import { ENEMY_IDS } from '../data/enemies';
import type { Run } from './run';

/** 預告的形狀：0 沒有、1 直線（衝撞）、2 圓（封魔陣、喚眾）、3 扇形（投網、居合） */
export const TELE_NONE = 0;
export const TELE_LINE = 1;
export const TELE_CIRCLE = 2;
export const TELE_CONE = 3;

type State = 'idle' | 'windup' | 'dash' | 'pause';

/** 依敵人種類 id 找頭目定義（沒有 = 不是有技能的頭目） */
const BOSS_OF_KIND: (BossDef | null)[] = ENEMY_IDS.map((id) => Object.values(BOSSES).find((b) => b.enemy === id) ?? null);

/**
 * 頭目技能（D95，docs/34）：場上的頭目照常追人，冷卻到了且玩家在範圍內 → 站定、地上出現紅色預告 → 出手。
 * 半血時進入第二階段（移速、冷卻、多一招）。不暫停遊戲、不跳框。熱路徑不配置記憶體。
 * 預告的位置在「開始預告」那一刻鎖定（看到紅色範圍就躲得掉）；衝撞是頭目沿預告線衝過去。
 */
export class BossSkills {
  /** 目前追蹤的頭目（敵人索引）與它的定義 */
  index = -1;
  def: BossDef | null = null;
  state: State = 'idle';
  /** 第二階段（半血） */
  phase2 = false;
  /** 第二階段開始時閃一下（秒，畫面用） */
  flash = 0;
  /** 正在用的招 */
  skill: BossSkillDef | null = null;
  /** 這一招剩幾次（衝撞 repeat、居合 hits） */
  private left = 0;
  private timer = 0;
  private gapT = 0;
  private readonly cd: number[] = [0, 0, 0, 0, 0, 0];
  private rot = 0;
  private dashLeft = 0;
  private dashHit = false;
  /** 預告（畫面與 sim 讀）：形狀、原點、方向（單位向量）、a = 長度或半徑、b = 寬度或半角、progress 0～1、strike = 已出手（餘韻） */
  readonly tele = { shape: TELE_NONE, x: 0, z: 0, dx: 0, dz: 1, a: 0, b: 0, progress: 0, strike: false, linger: 0 };
  /** 各招用了幾次（測試、sim） */
  readonly used: Record<string, number> = {};
  /** 打中玩家幾次（測試、sim） */
  hits = 0;

  constructor(private readonly run: Run) {}

  reset(): void {
    this.index = -1;
    this.def = null;
    this.state = 'idle';
    this.phase2 = false;
    this.flash = 0;
    this.skill = null;
    this.tele.shape = TELE_NONE;
    this.tele.linger = 0;
  }

  update(dt: number): void {
    const run = this.run;
    const en = run.enemies;
    const bi = run.director.bossIndex;
    if (this.flash > 0) this.flash -= dt;
    if (this.tele.linger > 0) {
      this.tele.linger -= dt;
      if (this.tele.linger <= 0 && this.state !== 'windup') this.tele.shape = TELE_NONE;
    }
    if (bi < 0 || !en.alive[bi] || en.variant[bi] !== 2) {
      if (this.index >= 0) this.reset();
      return;
    }
    if (bi !== this.index) this.begin(bi);
    const def = this.def;
    if (!def) return;
    if (run.frozenEnemies) {
      // 被凍住（雪女的吐息）：技能也停
      en.hold[bi] = Math.max(en.hold[bi], dt * 2);
      return;
    }
    // 半血變招
    if (!this.phase2 && en.hp[bi] <= en.maxHp[bi] * def.phase2.at) {
      this.phase2 = true;
      this.flash = def.phase2.flash;
      en.speed[bi] *= def.phase2.speedMult;
      run.bus.emit('bossPhase2', { id: ENEMY_IDS[en.kind[bi]] });
    }
    for (let k = 0; k < def.skills.length; k++) if (this.cd[k] > 0) this.cd[k] -= dt;
    const dx = run.px - en.x[bi];
    const dz = run.pz - en.z[bi];
    const dist = Math.hypot(dx, dz);
    switch (this.state) {
      case 'idle': {
        this.gapT -= dt;
        if (this.gapT > 0) return;
        const k = this.pick(dist);
        if (k < 0) return;
        this.skill = def.skills[k];
        this.cd[k] = this.skill.cooldown * (this.phase2 ? def.phase2.cooldownMult : 1);
        this.left = this.skill.kind === 'charge' ? (this.skill.repeat ?? 1) : this.skill.kind === 'iai' ? (this.skill.hits ?? 1) : 1;
        this.used[this.skill.id] = (this.used[this.skill.id] ?? 0) + 1;
        this.warn(bi);
        return;
      }
      case 'windup': {
        en.hold[bi] = Math.max(en.hold[bi], dt * 2);
        this.timer -= dt;
        this.tele.progress = Math.min(1, 1 - this.timer / Math.max(1e-6, this.skill!.windup));
        // 站著預告時臉朝預告方向
        if (this.tele.shape === TELE_LINE || this.tele.shape === TELE_CONE) en.yaw[bi] = Math.atan2(this.tele.dx, this.tele.dz);
        if (this.timer <= 0) this.strike(bi);
        return;
      }
      case 'dash': {
        en.hold[bi] = Math.max(en.hold[bi], dt * 2);
        const s = this.skill!;
        const step = Math.min(this.dashLeft, (s.dashSpeed ?? 10) * dt);
        const nx = en.x[bi] + this.tele.dx * step;
        const nz = en.z[bi] + this.tele.dz * step;
        if (run.map.stepBlocked(en.x[bi], en.z[bi], nx, nz)) this.dashLeft = 0;
        else {
          en.x[bi] = nx;
          en.z[bi] = nz;
          this.dashLeft -= step;
        }
        if (!this.dashHit) {
          const r = (s.width ?? 2) / 2 + COMBAT.playerRadius;
          if ((run.px - en.x[bi]) ** 2 + (run.pz - en.z[bi]) ** 2 <= r * r && this.hitPlayer(s)) this.dashHit = true;
        }
        if (this.dashLeft <= 0) this.after(bi);
        return;
      }
      case 'pause': {
        en.hold[bi] = Math.max(en.hold[bi], dt * 2);
        this.timer -= dt;
        if (this.timer <= 0) this.warn(bi);
        return;
      }
    }
  }

  /** 開發與測試：現在就預告某一招（不看冷卻、範圍；半血限定的也可以） */
  force(id: string): boolean {
    const bi = this.run.director.bossIndex;
    if (bi < 0 || !this.run.enemies.alive[bi]) return false;
    if (bi !== this.index) this.begin(bi);
    const k = this.def?.skills.findIndex((s) => s.id === id) ?? -1;
    if (k < 0) return false;
    this.skill = this.def!.skills[k];
    this.left = this.skill.kind === 'charge' ? (this.skill.repeat ?? 1) : this.skill.kind === 'iai' ? (this.skill.hits ?? 1) : 1;
    this.warn(bi);
    return true;
  }

  /** 換了一隻頭目（新的一關）：讀它的技能表 */
  private begin(bi: number): void {
    this.reset();
    this.index = bi;
    this.def = BOSS_OF_KIND[this.run.enemies.kind[bi]];
    if (!this.def) return;
    this.cd.fill(0);
    this.rot = 0;
    this.gapT = this.def.firstDelay;
  }

  /** 輪流挑一招：冷卻好了、玩家在範圍內、（半血限定的）已經半血 */
  private pick(dist: number): number {
    const sk = this.def!.skills;
    for (let n = 0; n < sk.length; n++) {
      const k = (this.rot + n) % sk.length;
      const s = sk[k];
      if (s.phase2 && !this.phase2) continue;
      if (this.cd[k] > 0 || dist > s.useRange) continue;
      this.rot = (k + 1) % sk.length;
      return k;
    }
    return -1;
  }

  /** 開始預告：鎖定位置與方向 */
  private warn(bi: number): void {
    const run = this.run;
    const en = run.enemies;
    const s = this.skill!;
    const ex = en.x[bi];
    const ez = en.z[bi];
    let dx = run.px - ex;
    let dz = run.pz - ez;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const t = this.tele;
    t.progress = 0;
    t.strike = false;
    t.linger = 0;
    t.dx = dx;
    t.dz = dz;
    if (s.kind === 'charge') {
      t.shape = TELE_LINE;
      t.x = ex;
      t.z = ez;
      t.a = s.length ?? 10;
      t.b = s.width ?? 2;
    } else if (s.kind === 'seal') {
      t.shape = TELE_CIRCLE;
      t.x = run.px;
      t.z = run.pz;
      t.a = s.radius ?? 3;
      t.b = 0;
    } else if (s.kind === 'summon') {
      t.shape = TELE_CIRCLE;
      t.x = ex;
      t.z = ez;
      t.a = 2.5;
      t.b = 0;
    } else {
      t.shape = TELE_CONE;
      t.x = ex;
      t.z = ez;
      t.a = s.radius ?? 5;
      t.b = s.halfAngle ?? 0.6;
    }
    this.state = 'windup';
    this.timer = s.windup;
    // 下一步的移動就要站定（預告開始那一刻起不再往前）
    en.hold[bi] = Math.max(en.hold[bi], 0.05);
    run.bus.emit('bossSkill', { id: s.id, step: 'warn' });
  }

  /** 預告時間到：出手 */
  private strike(bi: number): void {
    const run = this.run;
    const s = this.skill!;
    const t = this.tele;
    t.progress = 1;
    t.strike = true;
    run.bus.emit('bossSkill', { id: s.id, step: 'strike' });
    if (s.kind === 'charge') {
      this.state = 'dash';
      this.dashLeft = t.a;
      this.dashHit = false;
      t.linger = BOSS_TELEGRAPH.linger + t.a / (s.dashSpeed ?? 10);
      return;
    }
    t.linger = BOSS_TELEGRAPH.linger;
    if (s.kind === 'summon') run.director.queueRing(s.count ?? 8);
    else if (this.inside(run.px, run.pz)) this.hitPlayer(s);
    this.after(bi);
  }

  /** 一次出手完：還有次數就再預告一次（重新瞄準），不然回到追人 */
  private after(_bi: number): void {
    this.left--;
    const s = this.skill!;
    if (this.left > 0) {
      this.state = 'pause';
      this.timer = s.kind === 'iai' ? (s.hitGap ?? 0.3) : 0.25;
      return;
    }
    this.state = 'idle';
    this.gapT = this.def!.gap;
  }

  /** 玩家（水平位置）在目前的預告範圍內嗎 */
  inside(px: number, pz: number): boolean {
    const t = this.tele;
    const rx = px - t.x;
    const rz = pz - t.z;
    const pr = COMBAT.playerRadius;
    if (t.shape === TELE_CIRCLE) return rx * rx + rz * rz <= (t.a + pr) ** 2;
    if (t.shape === TELE_LINE) {
      const along = rx * t.dx + rz * t.dz;
      const side = Math.abs(rx * t.dz - rz * t.dx);
      return along >= -pr && along <= t.a + pr && side <= t.b / 2 + pr;
    }
    if (t.shape === TELE_CONE) {
      const d = Math.hypot(rx, rz);
      if (d > t.a + pr) return false;
      if (d < pr * 2) return true;
      return (rx * t.dx + rz * t.dz) / d >= Math.cos(t.b);
    }
    return false;
  }

  /**
   * 離開目前預告範圍最短的方向（單位向量寫進 out；不在範圍內回傳 false）。
   * 給 sim 機器人與測試用（「看到紅色範圍就躲得掉」）：圓往外、直線往側邊、扇形往側邊或往後。
   */
  escapeDir(px: number, pz: number, out: Float32Array): boolean {
    const t = this.tele;
    if (t.shape === TELE_NONE || t.strike || !this.inside(px, pz)) return false;
    const rx = px - t.x;
    const rz = pz - t.z;
    if (t.shape === TELE_CIRCLE) {
      const l = Math.hypot(rx, rz);
      if (l < 1e-3) {
        out[0] = t.dz;
        out[1] = -t.dx;
      } else {
        out[0] = rx / l;
        out[1] = rz / l;
      }
      return true;
    }
    // 直線、扇形：往離中線較近的那一側
    const side = rx * t.dz - rz * t.dx;
    const sgn = side >= 0 ? 1 : -1;
    out[0] = t.dz * sgn;
    out[1] = -t.dx * sgn;
    if (t.shape === TELE_CONE) {
      // 扇形很近的時候往後退比較快出範圍
      const d = Math.hypot(rx, rz);
      const need = t.a + COMBAT.playerRadius - d;
      const lateral = d * Math.sin(t.b) - Math.abs(side);
      if (need < lateral) {
        out[0] = rx / Math.max(d, 1e-3);
        out[1] = rz / Math.max(d, 1e-3);
      }
    }
    return true;
  }

  /** 招式打中玩家：走一般受傷流程（無敵、閃避、護身火、護甲），再加減速／定身 */
  private hitPlayer(s: BossSkillDef): boolean {
    const run = this.run;
    const bi = this.index;
    const raw = run.enemies.damage[bi] * s.damageMult;
    if (!run.bossStrike(raw)) return false;
    this.hits++;
    if (s.slow && s.slowSeconds) run.slowPlayer(s.slow, s.slowSeconds);
    if (s.root) run.rootPlayer(s.root);
    return true;
  }
}
