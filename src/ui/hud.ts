import { t } from '../i18n';
import { describeCard } from './overlays';
import type { I18nKey } from '../i18n/zh-TW';
import type { Run } from '../game/run';
import type { CurseId } from '../data/altar';
import type { StatId } from '../data/stats';
import type { ElementSlot } from '../systems/elements';
import { ULT } from '../data/ultimates';
import { STAGE } from '../data/stage';
import { PICKUPS } from '../data/pickups';
import { BARRIER, DOSOJIN, JIZO, JIZO_ARMOR_SECONDS, OFFERING } from '../data/elements';


/**
 * 戰鬥 HUD（docs/08 第 5 節）：左上生命、上中波數與倒數、右上暫停鈕、下方魂火條與等級、左下虛擬搖桿（觸控裝置）。
 * 只在值變了才改 DOM（每幀呼叫 update，不重排版）。
 */
export interface Hud {
  root: HTMLElement;
  stickBase: HTMLElement;
  stickKnob: HTMLElement;
  jumpButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  abilitiesButton: HTMLButtonElement;
  ultButton: HTMLButtonElement;
  /** yaw = 鏡頭的 yaw（傳送門箭頭要相對鏡頭轉） */
  update(run: Run, yaw: number): void;
  show(visible: boolean): void;
}

export function buildHud(parent: HTMLElement): Hud {
  const root = document.createElement('div');
  root.className = 'hud hidden';
  root.dataset.screen = 'hud';
  root.innerHTML = `
    <div class="hud-top">
      <div class="hud-hp" aria-label="${t('hud.hp')}">
        <div class="bar"><i id="hp-fill"></i></div>
        <span id="hp-text"></span>
      </div>
      <div class="hud-wave"><b id="wave-text"></b><span id="wave-timer"></span><i id="wave-diff" class="hidden"></i><em id="wave-note"></em></div>
      <div class="hud-btns"><button class="hud-abilities" id="btn-abilities" type="button">${t('hud.abilities')}</button><button class="hud-pause" id="btn-pause" type="button" aria-label="${t('pause.button')}">II</button></div>
    </div>
    <div class="hud-boss hidden" id="boss-bar"><span>${t('hud.boss')}</span><div class="bar"><i id="boss-fill"></i></div></div>
    <div class="hud-element hidden" id="element-box"><b id="element-title"></b><span id="element-desc"></span><div class="bar"><i id="element-fill"></i></div><em id="element-act"></em></div>
    <div class="hud-synergy hidden" id="synergy-box"></div>
    <div class="hud-portal hidden" id="portal-box"><b id="portal-arrow">▲</b><span id="portal-text"></span></div>
    <div class="hud-bottom">
      <div class="xp"><i id="xp-fill"></i></div>
      <span id="lv-text"></span>
    </div>
    <div class="stick" id="stick-base"><div class="knob" id="stick-knob"></div></div>
    <button class="ult hidden" id="btn-ult" type="button"><span class="ult-fill" id="ult-fill"></span><b>${t('hud.ult')}</b><em id="ult-key">F</em></button>
    <button class="jump" id="btn-jump" type="button" aria-label="${t('hud.jump')}">${t('hud.jump')}</button>`;
  parent.appendChild(root);
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const hpFill = q('hp-fill');
  const hpText = q('hp-text');
  const waveText = q('wave-text');
  const timer = q('wave-timer');
  const note = q('wave-note');
  const waveDiff = q('wave-diff');
  const bossBar = q('boss-bar');
  const bossFill = q('boss-fill');
  const portalBox = q('portal-box');
  const portalArrow = q('portal-arrow');
  const portalText = q('portal-text');
  const elBox = q('element-box');
  const elTitle = q('element-title');
  const elDesc = q('element-desc');
  const elFill = q('element-fill');
  const elAct = q('element-act');
  const ultBtn = q('btn-ult');
  const ultFill = q('ult-fill');
  const ultKey = q('ult-key');
  let lastUlt = '';
  const synBox = q('synergy-box');
  let lastSyn = '';
  let lastEl = '';
  const xpFill = q('xp-fill');
  const lvText = q('lv-text');
  let lastHp = '';
  let lastWave = -1;
  let lastTimer = -1;
  let lastXp = '';
  let lastLv = -1;
  let lastNote = '';
  let lastBoss = false;
  let lastPortal = -1;
  return {
    root,
    stickBase: q('stick-base'),
    stickKnob: q('stick-knob'),
    jumpButton: q<HTMLButtonElement>('btn-jump'),
    pauseButton: q<HTMLButtonElement>('btn-pause'),
    abilitiesButton: q<HTMLButtonElement>('btn-abilities'),
    ultButton: q<HTMLButtonElement>('btn-ult'),
    show(v) {
      root.classList.toggle('hidden', !v);
    },
    update(run, yaw) {
      const hp = Math.max(0, Math.ceil(run.hp));
      const key = `${hp}/${Math.round(run.maxHp)}`;
      if (key !== lastHp) {
        lastHp = key;
        hpText.textContent = key;
        hpFill.style.width = `${Math.max(0, Math.min(1, run.hp / run.maxHp)) * 100}%`;
      }
      const diff = Math.round(run.difficulty * 100);
      const waveKey = run.stageNumber * 10000 + diff;
      if (waveKey !== lastWave) {
        lastWave = waveKey;
        waveText.textContent = t('hud.stage', { n: run.stageNumber });
        // 難度另起一行（中間欄要窄，不把血條與右上的鈕擠壞）
        waveDiff.textContent = diff > 0 ? t('hud.diff', { d: diff }) : '';
        waveDiff.classList.toggle('hidden', diff <= 0);
      }
      const left = Math.ceil(run.timeLeft);
      if (left !== lastTimer) {
        lastTimer = left;
        timer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      }
      const altar = run.elements.summonSlot;
      const shrine = run.elements.fuseSlot;
      // 道祖神（D47）：只在出現後 hintSeconds 秒內提示、指路（不想換的人不會一直被叫過去）
      const dslot = run.elements.dosojinSlot;
      const dosojin = dslot && dslot.announce <= 0 && dslot.age < DOSOJIN.hintSeconds ? dslot : null;
      const noteText = run.director.swarm ? t('hud.swarm') : run.portal.active ? t('hud.bossDown') : altar ? t('hud.summonNote') : shrine ? t('hud.fuseNote') : dosojin ? t('hud.dosojinNote') : '';
      if (noteText !== lastNote) {
        lastNote = noteText;
        note.textContent = noteText;
        note.classList.toggle('alarm', run.director.swarm);
      }
      // 頭目血條
      const bi = run.director.bossIndex;
      const bossAlive = bi >= 0 && run.enemies.alive[bi] === 1 && run.enemies.variant[bi] === 2;
      if (bossAlive !== lastBoss) {
        lastBoss = bossAlive;
        bossBar.classList.toggle('hidden', !bossAlive);
      }
      if (bossAlive) bossFill.style.width = `${Math.max(0, run.enemies.hp[bi] / run.enemies.maxHp[bi]) * 100}%`;
      // 傳送門箭頭：相對鏡頭的方向與距離
      // 傳送門優先；還沒開的召喚祭壇也用同一個箭頭（D34）
      // 箭頭：傳送門 > 召喚祭壇 > 合魂祠 > 道祖神；走到旁邊就不顯示
      const near = (e: { x: number; z: number; announce: number } | null) => !!e && e.announce <= 0 && Math.hypot(e.x - run.px, e.z - run.pz) > ALTAR_ARROW_HIDE;
      const arrowKind = run.portal.active ? 'portal' : near(altar) ? 'summon' : near(shrine) ? 'fuse' : near(dosojin) ? 'dosojin' : '';
      const target = arrowKind === 'portal' ? run.portal : arrowKind === 'summon' ? altar : arrowKind === 'fuse' ? shrine : arrowKind === 'dosojin' ? dosojin : null;
      if (target) {
        portalBox.classList.remove('hidden');
        portalBox.dataset.kind = arrowKind;
        const dx = target.x - run.px;
        const dz = target.z - run.pz;
        const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
        const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
        portalArrow.style.transform = `rotate(${Math.round((Math.atan2(right, fwd) * 180) / Math.PI)}deg)`;
        const kindNo = arrowKind === 'portal' ? 0 : arrowKind === 'summon' ? 1 : arrowKind === 'fuse' ? 2 : 3;
        const m = Math.round(Math.hypot(dx, dz)) * 4 + kindNo;
        if (m !== lastPortal) {
          lastPortal = m;
          portalText.textContent = t((['hud.portal', 'hud.summon', 'hud.fuse', 'hud.dosojin'] as const)[kindNo], { m: m >> 2 });
        }
      } else if (lastPortal !== -1) {
        lastPortal = -1;
        portalBox.classList.add('hidden');
      }
      // 提示框：補給品、大招材料齊、大招融合，誰最近發生就顯示誰（4 秒；不是彈窗，不暫停）
      let synText = '';
      let synAt = -1;
      // 神籤的結果改由結果卡顯示（D36），這裡不再重複
      const pk = run.lastPickup;
      if (pk && run.clock - pk.at < 3 && pk.at >= synAt) {
        synAt = pk.at;
        synText = t('hud.pickup', { name: t(`pickup.${pk.kind}` as I18nKey), fx: t(`pickup.fx.${PICKUPS[pk.kind].type}` as I18nKey, { v: Math.round(pk.v) }) });
      }
      const rd = run.lastReady;
      if (rd && run.clock - rd.at < 6 && rd.at >= synAt && !run.fused.includes(rd.id)) {
        synAt = rd.at;
        synText = t('hud.fusionReady', { name: t(`ult.${rd.id}` as I18nKey) });
      }
      const vc = run.lastTechChange;
      if (vc && run.clock - vc.at < 4 && vc.at >= synAt) {
        synAt = vc.at;
        synText = t('hud.techChanged', { name: t(`tech.${vc.to}` as I18nKey) });
      }
      const fu = run.lastFuse;
      if (fu && run.clock - fu.at < 6 && fu.at >= synAt) {
        synAt = fu.at;
        synText = t('hud.fusion', { name: t(`ult.${fu.id}` as I18nKey) });
      }
      // 大招鈕：有融合過才顯示；量表滿了會發亮
      const hasUlt = run.fused.length > 0;
      // 冷卻中：鈕上顯示倒數秒數（D：大招冷卻）
      const cool = Math.ceil(run.ultCooldownLeft);
      const ultState = `${hasUlt}|${run.ultReady}|${cool}`;
      if (ultState !== lastUlt) {
        lastUlt = ultState;
        ultBtn.classList.toggle('cooling', cool > 0);
        ultKey.textContent = cool > 0 ? t('hud.ultCool', { s: cool }) : 'F';
        ultBtn.classList.toggle('hidden', !hasUlt);
        ultBtn.classList.toggle('ready', run.ultReady);
      }
      if (hasUlt) ultFill.style.height = `${Math.min(100, (run.ultCharge / ULT.max) * 100).toFixed(0)}%`;
      if (synText !== lastSyn) {
        lastSyn = synText;
        synBox.textContent = synText;
        synBox.classList.toggle('hidden', synText === '');
      }
      // 地圖要素：走近時顯示名稱、效果與按住進度
      const f = run.elements.focus;
      if (!f || f.announce > 0 || f.usedAge >= 0) {
        if (lastEl !== '') {
          lastEl = '';
          elBox.classList.add('hidden');
        }
      } else {
        const mult = f.kind === 'summon' ? summonMultNow(run) : 0;
        const fox = f.kind === 'fox' ? f.offers.map((id, k) => `${id}:${run.cardCounts.get(id) ?? 0}:${f.ringBlocked[k] ? 'x' : ''}`).join(',') : '';
        const key = `${f.kind}|${f.rarity}|${f.blocked ? 'x' : ''}|${mult.toFixed(1)}|${fox}|${f.effects.slice(0, f.effectCount).map((x) => x.id).join(',')}`;
        if (key !== lastEl) {
          lastEl = key;
          elBox.classList.remove('hidden');
          elBox.dataset.rarity = f.rarity;
          elTitle.textContent = `${t(`rarity.${f.rarity}`)}・${t(`element.${f.kind}`)}`;
          elDesc.textContent = f.kind === 'summon' ? t('element.summon.desc', { mult: mult.toFixed(1) }) : f.kind === 'fox' ? describeFox(f, run.cardCounts) : f.kind === 'fuse' ? t(f.blocked ? 'element.fuse.none' : 'element.fuse.desc') : f.kind === 'dosojin' ? t('element.dosojin.desc') : describeElement(f);
          elAct.textContent = f.kind === 'barrier' ? t('element.stand') : f.kind === 'fox' ? t('element.fox.act') : t('element.hold');
        }
        elFill.style.width = `${f.kind === 'barrier' ? (f.inside ? 100 : 0) : Math.round(f.progress * 100)}%`;
      }
      const xp = `${Math.round((run.xp / run.xpNeeded) * 1000)}`;
      if (xp !== lastXp) {
        lastXp = xp;
        xpFill.style.width = `${(Number(xp) / 10).toFixed(1)}%`;
      }
      if (run.level !== lastLv) {
        lastLv = run.level;
        lvText.textContent = t('hud.level', { n: run.level });
      }
    },
  };
}

/** 狐面商的兩個提案：「紅圈：妖刀 新！：攻擊力 +24%，但最大生命 -12」，收不下的加註 */
function describeFox(f: ElementSlot, levels: ReadonlyMap<string, number>): string {
  return f.offers
    .map((id, k) => {
      const d = describeCard({ cardId: id, rarity: f.rarity }, levels);
      return t(`element.fox.ring${k}` as I18nKey, { offer: `${d.name} ${d.level}：${d.desc}` }) + (f.ringBlocked[k] ? t('element.fox.full') : '');
    })
    .join('\n');
}

/** 站到祭壇旁這麼近（公尺）就不顯示箭頭（改看要素提示框） */
const ALTAR_ARROW_HIDE = 3;

/** 現在召喚的話，小頭目的生命倍率（D34：越晚越強） */
function summonMultNow(run: Run): number {
  return 1 + STAGE.summon.hpGrowth * Math.min(1, run.time / run.director.duration);
}

/** 要素的效果說明（數字全部來自資料表） */
function describeElement(f: ElementSlot): string {
  if (f.kind === 'jizo') {
    const j = JIZO[f.rarity];
    return t(f.rarity === 'legend' ? 'element.jizo.descLegend' : 'element.jizo.desc', { heal: Math.round(j.healFrac * 100), armor: j.armor, sec: JIZO_ARMOR_SECONDS });
  }
  if (f.kind === 'offering') {
    const o = OFFERING[f.rarity];
    if (f.blocked) return t('element.offering.poor');
    return t('element.offering.desc', { cost: Math.round(o.costFrac * 100), rarity: t(`rarity.${o.reward}`), more: o.picks > 1 ? t('element.offering.more', { n: o.picks }) : '' });
  }
  if (f.kind === 'chest') return t('element.chest.desc', { rarity: t(`rarity.${f.rarity}`) });
  if (f.kind === 'omikuji') return t('element.omikuji.desc');
  if (f.kind === 'barrier') return t('element.barrier.desc', { pct: Math.round(BARRIER[f.rarity].bonus * 100) });
  // 詛咒祭壇：把抽到的每個效果列出來，詛咒（敵人變強）與好處（自己變強）用 +％ 寫在一起
  const parts: string[] = [];
  for (let k = 0; k < f.effectCount; k++) {
    const x = f.effects[k];
    const name = x.curse ? t(`curse.${x.id as CurseId}`) : t(`stat.${x.id as StatId}`);
    parts.push(t('element.altar.effect', { name, pct: Math.round(x.v * 100) }));
  }
  return parts.join('\n');
}
