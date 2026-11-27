import { t } from '../i18n';
import type { I18nKey } from '../i18n/zh-TW';
import type { Quality, SaveData } from '../core/save';
import { FX_CHOICES, QUALITY_CHOICES, TEXT_CHOICES, TEXT_SCALE, VOLUME_STEP, type TextSize } from '../data/settings';

/** 設定改了之後要做的事（由 Game 接到音量、畫質、手感、小地圖；這裡只管畫面與存檔欄位） */
export interface SettingsHooks {
  onVolume(sfx: number, music: number): void;
  onQuality(q: Quality): void;
  onFx(level: string): void;
  onMinimapRotate(on: boolean): void;
  /** 每改一項就存檔 */
  onSave(): void;
  onClose(): void;
}

/** 字級：改 :root 的 --ts（theme.css 所有字的大小都乘它） */
export function applyTextSize(size: string): void {
  if (typeof document === 'undefined') return;
  const k = TEXT_SCALE[(size in TEXT_SCALE ? size : 'normal') as TextSize];
  document.documentElement.style.setProperty('--ts', String(k));
}

/**
 * 設定畫面（D103）：主選單與暫停頁都開得到；每一項改了立刻生效、立刻存檔（沒有「套用」鈕，關掉就好）。
 * 選項：音效、音樂（滑桿）、畫質、特效、字級、小地圖跟著鏡頭轉（分段按鈕）。
 */
export function buildSettings(parent: HTMLElement, save: SaveData, hooks: SettingsHooks) {
  const el = document.createElement('div');
  el.className = 'overlay hidden';
  el.dataset.screen = 'settings';
  const seg = (id: string, label: I18nKey, choices: readonly string[], keyOf: (c: string) => I18nKey) =>
    `<div class="set-row"><span class="set-label">${t(label)}</span><div class="seg" id="${id}" role="radiogroup">${choices
      .map((c) => `<button type="button" class="seg-btn" data-v="${c}" role="radio">${t(keyOf(c))}</button>`)
      .join('')}</div></div>`;
  const slider = (id: string, label: I18nKey) =>
    `<div class="set-row"><span class="set-label">${t(label)}</span><div class="set-slider"><input type="range" id="${id}" min="0" max="100" step="${VOLUME_STEP}"><b id="${id}-v"></b></div></div>`;
  el.innerHTML = `<div class="panel settings-panel"><h2>${t('settings.title')}</h2>
    <div class="settings-rows">${slider('set-sfx', 'settings.sfx')}${slider('set-music', 'settings.music')}
    ${seg('set-quality', 'settings.quality', QUALITY_CHOICES, (c) => `settings.quality.${c}` as I18nKey)}
    ${seg('set-fx', 'settings.fx', FX_CHOICES, (c) => `settings.fx.${c}` as I18nKey)}
    ${seg('set-text', 'settings.text', TEXT_CHOICES, (c) => `settings.text.${c}` as I18nKey)}
    ${seg('set-mm', 'settings.minimap', ['off', 'on'], (c) => `settings.minimap.${c}` as I18nKey)}</div>
    <p class="set-hint">${t('settings.hint')}</p>
    <div class="row"><button type="button" class="btn" id="btn-settings-close">${t('settings.close')}</button></div></div>`;
  parent.appendChild(el);
  const q = <T extends HTMLElement>(id: string) => el.querySelector<T>('#' + id)!;
  const s = save.settings;

  const markSeg = (id: string, v: string) => {
    for (const b of q(id).querySelectorAll<HTMLButtonElement>('.seg-btn')) {
      const on = b.dataset.v === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  };
  const showVol = () => {
    q<HTMLInputElement>('set-sfx').value = String(Math.round(s.sfx * 100));
    q<HTMLInputElement>('set-music').value = String(Math.round(s.music * 100));
    q('set-sfx-v').textContent = String(Math.round(s.sfx * 100));
    q('set-music-v').textContent = String(Math.round(s.music * 100));
  };
  const refresh = () => {
    showVol();
    markSeg('set-quality', s.quality);
    markSeg('set-fx', s.fx);
    markSeg('set-text', s.text);
    markSeg('set-mm', s.minimapRotate ? 'on' : 'off');
  };

  for (const id of ['set-sfx', 'set-music']) {
    q<HTMLInputElement>(id).addEventListener('input', () => {
      s.sfx = Number(q<HTMLInputElement>('set-sfx').value) / 100;
      s.music = Number(q<HTMLInputElement>('set-music').value) / 100;
      showVol();
      hooks.onVolume(s.sfx, s.music);
      hooks.onSave();
    });
  }
  const onSeg = (id: string, apply: (v: string) => void) =>
    q(id).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.seg-btn');
      if (!b?.dataset.v) return;
      apply(b.dataset.v);
      refresh();
      hooks.onSave();
    });
  onSeg('set-quality', (v) => {
    s.quality = v as Quality;
    hooks.onQuality(s.quality);
  });
  onSeg('set-fx', (v) => {
    s.fx = v;
    hooks.onFx(v);
  });
  onSeg('set-text', (v) => {
    s.text = v;
    applyTextSize(v);
  });
  onSeg('set-mm', (v) => {
    s.minimapRotate = v === 'on';
    hooks.onMinimapRotate(s.minimapRotate);
  });
  q('btn-settings-close').addEventListener('click', () => hooks.onClose());

  return {
    el,
    show() {
      refresh();
      el.classList.remove('hidden');
    },
    hide: () => el.classList.add('hidden'),
    get visible() {
      return !el.classList.contains('hidden');
    },
  };
}
