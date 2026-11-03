import { t } from '../i18n';
import { WAVES } from '../data/waves';
import type { Run } from '../game/run';

/**
 * 戰鬥 HUD（docs/08 第 5 節）：左上生命、上中波數與倒數、右上暫停鈕、下方魂火條與等級、左下虛擬搖桿（觸控裝置）。
 * 只在值變了才改 DOM（每幀呼叫 update，不重排版）。
 */
export interface Hud {
  root: HTMLElement;
  stickBase: HTMLElement;
  stickKnob: HTMLElement;
  pauseButton: HTMLButtonElement;
  update(run: Run): void;
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
      <div class="hud-wave"><b id="wave-text"></b><span id="wave-timer"></span></div>
      <button class="hud-pause" id="btn-pause" type="button" aria-label="${t('pause.button')}">II</button>
    </div>
    <div class="hud-bottom">
      <div class="xp"><i id="xp-fill"></i></div>
      <span id="lv-text"></span>
    </div>
    <div class="stick" id="stick-base"><div class="knob" id="stick-knob"></div></div>`;
  parent.appendChild(root);
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const hpFill = q('hp-fill');
  const hpText = q('hp-text');
  const waveText = q('wave-text');
  const timer = q('wave-timer');
  const xpFill = q('xp-fill');
  const lvText = q('lv-text');
  let lastHp = '';
  let lastWave = -1;
  let lastTimer = -1;
  let lastXp = '';
  let lastLv = -1;
  return {
    root,
    stickBase: q('stick-base'),
    stickKnob: q('stick-knob'),
    pauseButton: q<HTMLButtonElement>('btn-pause'),
    show(v) {
      root.classList.toggle('hidden', !v);
    },
    update(run) {
      const hp = Math.max(0, Math.ceil(run.hp));
      const key = `${hp}/${Math.round(run.maxHp)}`;
      if (key !== lastHp) {
        lastHp = key;
        hpText.textContent = key;
        hpFill.style.width = `${Math.max(0, Math.min(1, run.hp / run.maxHp)) * 100}%`;
      }
      if (run.wave !== lastWave) {
        lastWave = run.wave;
        waveText.textContent = t('hud.wave', { n: run.wave });
      }
      const left = Math.max(0, Math.ceil(WAVES.duration - run.director.time));
      if (left !== lastTimer) {
        lastTimer = left;
        timer.textContent = String(left);
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
