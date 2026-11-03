import { t } from '../i18n';
import { CONTENT_VERSION } from '../game/changelog';

/** 主選單（M0：只有標題與按鈕；開始遊戲在 M1 接上 RUN_SETUP） */
export function buildMenu(root: HTMLElement, onStart: () => void, onShrine: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'menu';
  el.dataset.screen = 'menu';
  const h1 = document.createElement('h1');
  h1.textContent = t('game.title');
  const sub = document.createElement('p');
  sub.className = 'sub';
  sub.textContent = t('game.subtitle');
  const start = document.createElement('button');
  start.className = 'btn';
  start.id = 'btn-start';
  start.textContent = t('menu.start');
  start.addEventListener('click', onStart);
  const shrine = document.createElement('button');
  shrine.className = 'btn secondary';
  shrine.id = 'btn-shrine';
  shrine.textContent = t('menu.shrine');
  shrine.addEventListener('click', onShrine);
  const ver = document.createElement('span');
  ver.className = 'version';
  ver.textContent = t('menu.version', { version: CONTENT_VERSION });
  el.append(h1, sub, start, shrine, ver);
  root.appendChild(el);
  return el;
}

let toastTimer = 0;
export function toast(text: string): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.remove('hidden');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.add('hidden'), 2200);
}
