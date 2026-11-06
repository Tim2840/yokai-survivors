import { t } from '../i18n';
import type { I18nKey } from '../i18n/zh-TW';
import { M1_PLAYTEST, resetTuning, saveTuning, tuning } from '../data/tuning';

/** 測試頁的試玩調整面板（D18、G1 用）。只有 DEV_TOOLS 才會建立；主網址沒有。 */
const FIELDS: { key: keyof typeof M1_PLAYTEST; label: I18nKey; step: string }[] = [
  { key: 'countScale', label: 'tune.count', step: '0.1' },
  { key: 'hpScale', label: 'tune.hp', step: '0.1' },
  { key: 'damageScale', label: 'tune.dmg', step: '0.1' },
  { key: 'volley', label: 'tune.volley', step: '1' },
  { key: 'splash', label: 'tune.splash', step: '0.1' },
  { key: 'stageSeconds', label: 'tune.stage', step: '30' },
  { key: 'techChance', label: 'tune.techChance', step: '0.05' },
];

export function buildTuningPanel(parent: HTMLElement) {
  const el = document.createElement('div');
  el.className = 'overlay hidden';
  el.dataset.screen = 'tuning';
  el.innerHTML = `<div class="panel"><h2>${t('tune.title')}</h2><p>${t('tune.note')}</p>
    <div class="tune-grid">${FIELDS.map((f) => `<label for="tune-${f.key}">${t(f.label)}</label><input id="tune-${f.key}" type="number" inputmode="decimal" min="0" max="3600" step="${f.step}" />`).join('')}</div>
    <div class="row"><button class="btn secondary" id="btn-tune-reset" type="button">${t('tune.reset')}</button><button class="btn" id="btn-tune-done" type="button">${t('tune.done')}</button></div></div>`;
  parent.appendChild(el);
  const input = (k: string) => el.querySelector<HTMLInputElement>('#tune-' + k)!;
  const fill = () => FIELDS.forEach((f) => (input(f.key).value = String(Math.round(tuning[f.key] * 100) / 100)));
  FIELDS.forEach((f) =>
    input(f.key).addEventListener('input', () => {
      const v = Number(input(f.key).value);
      const hi = f.key === 'stageSeconds' ? 3600 : 100;
      const lo = f.key === 'stageSeconds' ? 30 : 0;
      if (Number.isFinite(v) && v >= lo && v <= hi && input(f.key).value !== '') {
        tuning[f.key] = f.key === 'volley' ? Math.floor(v) : v;
        saveTuning();
      }
    }),
  );
  el.querySelector('#btn-tune-reset')!.addEventListener('click', () => {
    resetTuning();
    saveTuning();
    fill();
  });
  return {
    el,
    show() {
      fill();
      el.classList.remove('hidden');
    },
    hide() {
      el.classList.add('hidden');
    },
    /** 主選單上的小按鈕（只有測試頁才會建立，所以按鈕的程式放在這裡而不是 menu.ts） */
    button(onClick: () => void): HTMLElement {
      const b = document.createElement('button');
      b.className = 'btn secondary small';
      b.id = 'btn-tune';
      b.type = 'button';
      b.textContent = t('tune.open');
      b.addEventListener('click', onClick);
      return b;
    },
    onDone(fn: () => void) {
      el.querySelector('#btn-tune-done')!.addEventListener('click', fn);
    },
  };
}
