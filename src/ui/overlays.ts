import { t } from '../i18n';
import type { I18nKey } from '../i18n/zh-TW';
import { CARD_FORMAT, type StatId } from '../data/stats';
import { cardById, isWeaponCard, type CardOffer } from '../systems/cards';
import { PLAYABLE_YOKAI, STARTER_YOKAI } from '../data/yokai';

/** 全螢幕覆蓋層（選妖怪、升級選卡、整備、結算、暫停）。都有 data-screen，給回歸的卡住偵測讀。 */
export interface Overlay {
  el: HTMLElement;
  show(): void;
  hide(): void;
  readonly visible: boolean;
}

function overlay(parent: HTMLElement, name: string, html: string): Overlay {
  const el = document.createElement('div');
  el.className = 'overlay hidden';
  el.dataset.screen = name;
  el.innerHTML = html;
  parent.appendChild(el);
  return {
    el,
    show: () => el.classList.remove('hidden'),
    hide: () => el.classList.add('hidden'),
    get visible() {
      return !el.classList.contains('hidden');
    },
  };
}

const btn = (id: string, key: I18nKey, cls = '') => `<button class="btn ${cls}" id="${id}" type="button">${t(key)}</button>`;

// ── 選妖怪 ──
export function buildSetup(parent: HTMLElement, onStart: (yokaiId: string) => void, onBack: () => void) {
  const cards = STARTER_YOKAI.map((id) => {
    const ok = PLAYABLE_YOKAI.includes(id);
    return `<button class="yokai-card${ok ? '' : ' locked'}" type="button" data-yokai="${id}" ${ok ? '' : 'disabled'}>
      <b>${t(`yokai.${id}` as I18nKey)}</b>
      <span>${t(`yokai.${id}.desc` as I18nKey)}</span>
      ${ok ? '' : `<em>${t('setup.locked')}</em>`}
    </button>`;
  }).join('');
  const o = overlay(parent, 'setup', `<div class="panel"><h2>${t('setup.title')}</h2><div class="yokai-row">${cards}</div>
    <div class="row">${btn('btn-setup-back', 'setup.back', 'secondary')}${btn('btn-setup-go', 'setup.go')}</div></div>`);
  let chosen = PLAYABLE_YOKAI[0];
  const mark = () => o.el.querySelectorAll<HTMLElement>('.yokai-card').forEach((c) => c.classList.toggle('selected', c.dataset.yokai === chosen));
  o.el.querySelectorAll<HTMLButtonElement>('.yokai-card:not(.locked)').forEach((c) =>
    c.addEventListener('click', () => {
      chosen = c.dataset.yokai!;
      mark();
    }),
  );
  mark();
  o.el.querySelector('#btn-setup-go')!.addEventListener('click', () => onStart(chosen));
  o.el.querySelector('#btn-setup-back')!.addEventListener('click', onBack);
  return o;
}

// ── 升級選卡 ──
const SHAPES: Record<string, string> = { common: 'circle', rare: 'diamond', epic: 'hex', legend: 'star' };

export function describeCard(o: CardOffer): { name: string; desc: string } {
  const card = cardById(o.cardId);
  const v = card.values[o.rarity];
  if (isWeaponCard(card)) {
    const shown = Number.isInteger(v) ? String(v) : v.toFixed(1);
    return { name: t(`card.${card.id}` as I18nKey), desc: t(`card.fmt.${card.weapon}` as I18nKey, { v: shown }) };
  }
  const fmt = CARD_FORMAT[card.stat as StatId];
  const value = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return {
    name: t(`card.${card.id}` as I18nKey),
    desc: t(`card.fmt.${fmt}` as I18nKey, { name: t(`stat.${card.stat}` as I18nKey), v: value }),
  };
}

export function buildCardPicker(parent: HTMLElement, onPick: (index: number) => void) {
  const o = overlay(parent, 'levelup', `<div class="panel"><h2 id="lv-title"></h2><div class="cards" id="cards"></div><p class="hint" id="lv-pending"></p></div>`);
  const cardsEl = o.el.querySelector<HTMLElement>('#cards')!;
  const title = o.el.querySelector<HTMLElement>('#lv-title')!;
  const pending = o.el.querySelector<HTMLElement>('#lv-pending')!;
  return Object.assign(o, {
    render(offer: CardOffer[], more: number) {
      title.textContent = t('levelup.title');
      pending.textContent = more > 1 ? t('levelup.pending', { n: more - 1 }) : '';
      cardsEl.innerHTML = '';
      offer.forEach((c, i) => {
        const d = describeCard(c);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `card r-${c.rarity}`;
        b.dataset.card = c.cardId;
        b.dataset.rarity = c.rarity;
        b.dataset.index = String(i);
        b.innerHTML = `<span class="shape ${SHAPES[c.rarity]}" aria-hidden="true"></span>
          <span class="rname">${t(`rarity.${c.rarity}` as I18nKey)}</span><b>${d.name}</b><span class="cdesc">${d.desc}</span>`;
        b.addEventListener('click', () => onPick(i));
        cardsEl.appendChild(b);
      });
    },
  });
}

// ── 整備 ──
export function buildIntermission(parent: HTMLElement, onNext: () => void, onQuit: () => void) {
  const o = overlay(parent, 'intermission', `<div class="panel"><h2 id="inter-title"></h2><p id="inter-stats"></p>
    <div class="row">${btn('btn-inter-quit', 'inter.quit', 'secondary')}${btn('btn-inter-next', 'inter.next')}</div></div>`);
  o.el.querySelector('#btn-inter-next')!.addEventListener('click', onNext);
  o.el.querySelector('#btn-inter-quit')!.addEventListener('click', onQuit);
  return Object.assign(o, {
    render(wave: number, kills: number, level: number) {
      o.el.querySelector('#inter-title')!.textContent = t('inter.title', { n: wave });
      o.el.querySelector('#inter-stats')!.textContent = t('inter.stats', { kills, level });
    },
  });
}

// ── 結算 ──
export function buildRunEnd(parent: HTMLElement, onAgain: () => void, onMenu: () => void, onShrine: () => void) {
  const o = overlay(parent, 'runend', `<div class="panel"><h2 id="end-title"></h2><ul class="stats" id="end-stats"></ul>
    <div class="row">${btn('btn-end-menu', 'end.menu', 'secondary')}${btn('btn-end-shrine', 'end.shrine', 'secondary')}${btn('btn-end-again', 'end.again')}</div></div>`);
  o.el.querySelector('#btn-end-again')!.addEventListener('click', onAgain);
  o.el.querySelector('#btn-end-menu')!.addEventListener('click', onMenu);
  o.el.querySelector('#btn-end-shrine')!.addEventListener('click', onShrine);
  return Object.assign(o, {
    render(r: { result: 'death' | 'victory' | 'abandon'; stage: number; kills: number; level: number; merit: number }, seed?: number) {
      o.el.querySelector('#end-title')!.textContent = t(`end.${r.result}` as I18nKey);
      const lines = [t('end.stage', { n: r.stage }), t('end.kills', { n: r.kills }), t('end.level', { n: r.level }), t('end.merit', { n: r.merit })];
      if (seed !== undefined) lines.push(t('end.seed', { seed }));
      o.el.querySelector('#end-stats')!.innerHTML = lines.map((s) => `<li>${s}</li>`).join('');
    },
  });
}

// ── 暫停 ──
export function buildPause(parent: HTMLElement, onResume: () => void, onQuit: () => void) {
  const o = overlay(parent, 'pause', `<div class="panel"><h2>${t('pause.title')}</h2><div class="row">${btn('btn-pause-quit', 'pause.quit', 'secondary')}${btn('btn-pause-resume', 'pause.resume')}</div></div>`);
  o.el.querySelector('#btn-pause-resume')!.addEventListener('click', onResume);
  o.el.querySelector('#btn-pause-quit')!.addEventListener('click', onQuit);
  return o;
}
