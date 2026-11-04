import { t } from '../i18n';
import type { Run } from '../game/run';
import type { CurseId } from '../data/altar';
import type { StatId } from '../data/stats';
import type { ElementSlot } from '../systems/elements';
import { BARRIER, JIZO, JIZO_ARMOR_SECONDS } from '../data/elements';


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
      <div class="hud-wave"><b id="wave-text"></b><span id="wave-timer"></span><em id="wave-note"></em></div>
      <button class="hud-pause" id="btn-pause" type="button" aria-label="${t('pause.button')}">II</button>
    </div>
    <div class="hud-boss hidden" id="boss-bar"><span>${t('hud.boss')}</span><div class="bar"><i id="boss-fill"></i></div></div>
    <div class="hud-element hidden" id="element-box"><b id="element-title"></b><span id="element-desc"></span><div class="bar"><i id="element-fill"></i></div><em id="element-act"></em></div>
    <div class="hud-portal hidden" id="portal-box"><b id="portal-arrow">▲</b><span id="portal-text"></span></div>
    <div class="hud-bottom">
      <div class="xp"><i id="xp-fill"></i></div>
      <span id="lv-text"></span>
    </div>
    <div class="stick" id="stick-base"><div class="knob" id="stick-knob"></div></div>
    <button class="jump" id="btn-jump" type="button" aria-label="${t('hud.jump')}">${t('hud.jump')}</button>`;
  parent.appendChild(root);
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const hpFill = q('hp-fill');
  const hpText = q('hp-text');
  const waveText = q('wave-text');
  const timer = q('wave-timer');
  const note = q('wave-note');
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
      if (run.stageNumber !== lastWave) {
        lastWave = run.stageNumber;
        waveText.textContent = t('hud.stage', { n: run.stageNumber });
      }
      const left = Math.ceil(run.timeLeft);
      if (left !== lastTimer) {
        lastTimer = left;
        timer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      }
      const noteText = run.director.swarm ? t('hud.swarm') : run.portal.active ? t('hud.bossDown') : '';
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
      if (run.portal.active) {
        portalBox.classList.remove('hidden');
        const dx = run.portal.x - run.px;
        const dz = run.portal.z - run.pz;
        const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
        const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
        portalArrow.style.transform = `rotate(${Math.round((Math.atan2(right, fwd) * 180) / Math.PI)}deg)`;
        const m = Math.round(Math.hypot(dx, dz));
        if (m !== lastPortal) {
          lastPortal = m;
          portalText.textContent = t('hud.portal', { m });
        }
      } else if (lastPortal !== -1) {
        lastPortal = -1;
        portalBox.classList.add('hidden');
      }
      // 地圖要素：走近時顯示名稱、效果與按住進度
      const f = run.elements.focus;
      if (!f || f.announce > 0 || f.usedAge >= 0) {
        if (lastEl !== '') {
          lastEl = '';
          elBox.classList.add('hidden');
        }
      } else {
        const key = `${f.kind}|${f.rarity}|${f.effects.slice(0, f.effectCount).map((x) => x.id).join(',')}`;
        if (key !== lastEl) {
          lastEl = key;
          elBox.classList.remove('hidden');
          elBox.dataset.rarity = f.rarity;
          elTitle.textContent = `${t(`rarity.${f.rarity}`)}・${t(`element.${f.kind}`)}`;
          elDesc.textContent = describeElement(f);
          elAct.textContent = f.kind === 'barrier' ? t('element.stand') : t('element.hold');
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

/** 要素的效果說明（數字全部來自資料表） */
function describeElement(f: ElementSlot): string {
  if (f.kind === 'jizo') {
    const j = JIZO[f.rarity];
    return t(f.rarity === 'legend' ? 'element.jizo.descLegend' : 'element.jizo.desc', { heal: Math.round(j.healFrac * 100), armor: j.armor, sec: JIZO_ARMOR_SECONDS });
  }
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
