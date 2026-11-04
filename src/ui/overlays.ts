import { t } from '../i18n';
import type { I18nKey } from '../i18n/zh-TW';
import { CARD_FORMAT, type StatId } from '../data/stats';
import type { BuildSummary } from '../game/buildSummary';
import { synergyHints } from '../data/synergies';
import { ultHints } from '../data/ultimates';
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
    const shown = String(Number(v.toFixed(2)));
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
    render(offer: CardOffer[], more: number, owned: ReadonlySet<string> = new Set(), active: readonly string[] = [], kind: 'levelup' | 'offering' | 'chest' = 'levelup', ult: { yokai: string; counts: ReadonlyMap<string, number>; fused: readonly string[] } = { yokai: '', counts: new Map(), fused: [] }) {
      title.textContent = t(kind === 'levelup' ? 'levelup.title' : kind === 'offering' ? 'levelup.offering' : 'levelup.chest');
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
        // 這張卡能湊成哪些聯動：已經有另一張 → 「選了就觸發」；還沒有 → 「再湊 X 就會 Y」；已觸發過的不顯示
        const hints = synergyHints(c.cardId, owned, active)
          .filter((h) => !h.done)
          .map((h) => {
            const syn = t(`synergy.${h.id}` as I18nKey);
            return `<span class="csyn${h.ready ? ' ready' : ''}">${h.ready ? t('card.syn.ready', { name: syn }) : t('card.syn.need', { card: t(`card.${h.partner}` as I18nKey), name: syn })}</span>`;
          })
          .join('');
        // 大招配方：這張卡是哪個大招的材料、目前進度；選了就湊齊的特別標出
        const ultLines = ultHints(c.cardId, ult.yokai, ult.counts, ult.fused)
          .map((h) => `<span class="csyn ult${h.completes ? ' ready' : ''}">${h.completes ? t('card.ult.completes', { name: t(`ult.${h.id}` as I18nKey) }) : t('card.ult.need', { name: t(`ult.${h.id}` as I18nKey), have: h.have, need: h.need })}</span>`)
          .join('');
        b.innerHTML = `<span class="shape ${SHAPES[c.rarity]}" aria-hidden="true"></span>
          <span class="rname">${t(`rarity.${c.rarity}` as I18nKey)}</span><b>${d.name}</b><span class="cdesc">${d.desc}</span>${hints}${ultLines}`;
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
const fix = (v: number, d = 2): string => String(Number(v.toFixed(d)));

/** 屬性在「目前的能力」裡怎麼顯示（數字都來自 BuildSummary，不在這裡算平衡） */
function statText(id: StatId, v: number, sum: BuildSummary): string {
  switch (id) {
    case 'maxHp':
      return t('sum.hp', { hp: Math.ceil(sum.hp), max: Math.round(sum.maxHp) });
    case 'regen':
      return t('sum.perSec', { v: fix(v, 1) });
    case 'power':
    case 'atkSpeed':
    case 'area':
      return `×${fix(v)}`;
    case 'pickup':
      return t('sum.meters', { v: fix(v, 1) });
    case 'crit':
    case 'critDmg':
    case 'dodge':
      return `${fix(v * 100, 0)}%`;
    case 'speed':
      return t('sum.speed', { v: fix(v, 1) });
    case 'armor':
      return t('sum.armor', { v: fix(v, 0), mult: fix(sum.damageTaken) });
    default:
      return fix(v, 0);
  }
}

/** 一張卡累計的效果文字（同一張卡拿幾次、各稀有度加總） */
function cardEffectText(c: BuildSummary['cards'][number]): string {
  if (c.weapon) return t(`card.fmt.${c.stat}` as I18nKey, { v: fix(c.total) });
  const fmt = CARD_FORMAT[c.stat as StatId];
  return t(`card.fmt.${fmt}` as I18nKey, { name: t(`stat.${c.stat}` as I18nKey), v: fix(c.total, 1) });
}

// ── 暫停（含「已拿到的卡」與「目前的能力」）──
export function buildPause(parent: HTMLElement, onResume: () => void, onQuit: () => void) {
  const o = overlay(
    parent,
    'pause',
    `<div class="panel pause-panel"><h2>${t('pause.title')}</h2><p id="pause-status"></p>
      <div class="sum"><section class="sum-col"><h3>${t('pause.cards')}</h3><ul class="sum-cards" id="sum-cards"></ul><div id="sum-syn"></div><div id="sum-ult"></div></section>
      <section class="sum-col"><h3>${t('pause.abilities')}</h3><dl class="sum-stats" id="sum-stats"></dl><div id="sum-curse"></div></section></div>
      <div class="row">${btn('btn-pause-quit', 'pause.quit', 'secondary')}${btn('btn-pause-resume', 'pause.resume')}</div></div>`,
  );
  o.el.querySelector('#btn-pause-resume')!.addEventListener('click', onResume);
  o.el.querySelector('#btn-pause-quit')!.addEventListener('click', onQuit);
  const q = (id: string) => o.el.querySelector<HTMLElement>('#' + id)!;
  return Object.assign(o, {
    render(sum: BuildSummary) {
      q('pause-status').textContent = t('pause.status', { level: sum.level, kills: sum.kills });
      const cards = q('sum-cards');
      cards.innerHTML = '';
      if (sum.cards.length === 0) cards.innerHTML = `<li class="empty">${t('pause.noCards')}</li>`;
      for (const c of sum.cards) {
        const li = document.createElement('li');
        li.dataset.card = c.id;
        const chips = (['common', 'rare', 'epic', 'legend'] as const).map((r) => `<i class="chip r-${r}"></i>`.repeat(c.byRarity[r])).join('');
        li.innerHTML = `<b>${t('pause.cardRow', { name: t(`card.${c.id}` as I18nKey), n: c.count })}</b><span class="chips">${chips}</span><em>${cardEffectText(c)}</em>`;
        cards.appendChild(li);
      }
      const syn = q('sum-syn');
      syn.innerHTML = sum.synergies.length ? `<h3>${t('pause.synergies')}</h3><ul class="sum-syn">${sum.synergies.map((id) => `<li><b>${t(`synergy.${id}` as I18nKey)}</b> <em>${t(`synergy.${id}.desc` as I18nKey)}</em></li>`).join('')}</ul>` : '';
      const ult = q('sum-ult');
      ult.innerHTML = sum.ultimates.length
        ? `<h3>${t('pause.ultimates')}</h3><ul class="sum-ult">${sum.ultimates
            .map(
              (u) =>
                `<li data-ult="${u.id}" class="${u.fused ? 'fused' : ''}"><b>${t(`ult.${u.id}` as I18nKey)}${u.fused ? ' ✓' : ''}</b><em>${t(`ult.${u.id}.desc` as I18nKey)}</em><span>${u.ingredients
                  .map((g) => `<i class="${g.have >= g.need ? 'ok' : ''}">${t(`card.${g.card}` as I18nKey)} ${g.have}/${g.need}</i>`)
                  .join('')}</span></li>`,
            )
            .join('')}</ul>`
        : '';
      const stats = q('sum-stats');
      const rows = sum.stats.map((s) => `<div data-stat="${s.id}"><dt>${t(`stat.${s.id}` as I18nKey)}</dt><dd>${statText(s.id, s.value, sum)}</dd></div>`);
      rows.push(`<div class="weapon-head"><dt><b>${t('pause.weapon')}</b></dt><dd></dd></div>`);
      rows.push(`<div data-stat="volley"><dt>${t('sum.volley')}</dt><dd>${fix(sum.weapon.volley)}</dd></div>`);
      rows.push(`<div data-stat="splash"><dt>${t('sum.splash')}</dt><dd>${t('sum.meters', { v: fix(sum.weapon.splash, 1) })}</dd></div>`);
      rows.push(`<div data-stat="pierce"><dt>${t('sum.pierce')}</dt><dd>${fix(sum.weapon.pierce)}</dd></div>`);
      stats.innerHTML = rows.join('');
      const curse = q('sum-curse');
      curse.innerHTML = sum.curses.length ? `<h3>${t('pause.curses')}</h3><ul class="sum-syn">${sum.curses.map((c) => `<li>${t(`curse.${c.id}` as I18nKey)} <b>+${fix(c.v * 100, 0)}%</b></li>`).join('')}</ul>` : '';
    },
  });
}
