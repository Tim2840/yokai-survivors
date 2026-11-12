import { t } from '../i18n';
import type { I18nKey } from '../i18n/zh-TW';
import { CARD_FORMAT, type StatId } from '../data/stats';
import { setWeaponTextFormatter, type BuildSummary } from '../game/buildSummary';
import { cardLinks } from '../data/links';
import { DIFFICULTY } from '../data/difficulty';
import { EVO, TECH_CARD_PREFIX, TECH_KEEP, TECH_LEVELS, TECH_SWAP_PREFIX, evoOfCard, isEvoCard, isTechCard, techById, techMix } from '../data/techniques';
import type { Rarity } from '../data/rarity';
import { cardById, type CardOffer } from '../systems/cards';
import { AFFIX_LABEL, type Affix } from '../data/affixes';
import { ITEM_WEAPON_KINDS, WEAPON_LEVELS, itemDown, itemValue, scaleWeaponStep, type WeaponLevel } from '../data/items';
import { PLAYABLE_YOKAI, STARTER_YOKAI, YOKAI } from '../data/yokai';
import { CARD_EFFECT } from '../data/stats';
import { lineIsGood, type ElementResult, type ResultLine } from '../systems/elementResult';

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
export function buildSetup(parent: HTMLElement, onStart: (yokaiId: string) => void, onBack: () => void, onChoose: (yokaiId: string) => void = () => {}) {
  const cards = STARTER_YOKAI.map((id) => {
    const ok = PLAYABLE_YOKAI.includes(id);
    return `<button class="yokai-card${ok ? '' : ' locked'}" type="button" data-yokai="${id}" ${ok ? '' : 'disabled'}>
      <b>${t(`yokai.${id}` as I18nKey)}</b>
      <span>${t(`yokai.${id}.desc` as I18nKey)}</span>
      ${ok ? '' : `<em>${t('setup.locked')}</em>`}
    </button>`;
  }).join('');
  const o = overlay(parent, 'setup', `<div class="panel"><h2>${t('setup.title')}</h2><div class="yokai-row">${cards}</div>
    <p id="setup-ult"></p>
    <div class="row">${btn('btn-setup-back', 'setup.back', 'secondary')}${btn('btn-setup-go', 'setup.go')}</div></div>`);
  let chosen = PLAYABLE_YOKAI[0];
  const mark = () => o.el.querySelectorAll<HTMLElement>('.yokai-card').forEach((c) => c.classList.toggle('selected', c.dataset.yokai === chosen));
  o.el.querySelectorAll<HTMLButtonElement>('.yokai-card:not(.locked)').forEach((c) =>
    c.addEventListener('click', () => {
      chosen = c.dataset.yokai!;
      mark();
      onChoose(chosen);
    }),
  );
  mark();
  o.el.querySelector('#btn-setup-go')!.addEventListener('click', () => onStart(chosen));
  o.el.querySelector('#btn-setup-back')!.addEventListener('click', onBack);
  return Object.assign(o, {
    /** 選到的妖怪裝配的大招（在神社更換） */
    setUltLine(text: string) {
      o.el.querySelector('#setup-ult')!.textContent = text;
    },
  });
}

// ── 神社（D52：目前只有大招的解鎖、升級、裝配；之後局外商店的其他分頁都放這裡）──
export interface ShrineUlt {
  id: string;
  unlocked: boolean;
  equipped: boolean;
  level: number;
  maxLevel: number;
  unlockPrice: number;
  upPrice: number;
  mods: { power: number; radius: number; cooldown: number; charge: number };
  next: { power?: number; radius?: number; cooldown?: number; charge?: number } | null;
}
export interface ShrineView {
  merit: number;
  /** 技法格子（D84）：現在幾格、最多幾格、下一格的價格（null = 全開了） */
  slots: { have: number; max: number; price: number | null };
  yokai: { id: string; ults: ShrineUlt[] }[];
}
export interface ShrineActions {
  onBack(): void;
  onEquip(yokai: string, ult: string): void;
  onBuy(ult: string): void;
  onUpgrade(ult: string): void;
  onBuySlot(): void;
  /** 只有測試頁給：功德 +1000 */
  onCheat?: () => void;
}

function ultStepText(st: NonNullable<ShrineUlt['next']>): string {
  const parts: string[] = [];
  if (st.power) parts.push(t('ult.step.power', { v: fix(st.power * 100, 0) }));
  if (st.radius) parts.push(t('ult.step.radius', { v: fix(st.radius * 100, 0) }));
  if (st.cooldown) parts.push(t('ult.step.cooldown', { v: fix(st.cooldown, 0) }));
  if (st.charge) parts.push(t('ult.step.charge', { v: fix(st.charge * 100, 0) }));
  return parts.join('、');
}

export function buildShrine(parent: HTMLElement, a: ShrineActions) {
  const o = overlay(
    parent,
    'shrine',
    `<div class="panel shrine-panel"><h2>${t('shrine.title')}</h2><p id="shrine-merit"></p>
      <div class="shrine-body" id="shrine-body"></div>
      <div class="row">${a.onCheat ? btn('btn-shrine-cheat', 'shrine.cheat', 'secondary') : ''}${btn('btn-shrine-back', 'shrine.back')}</div></div>`,
  );
  o.el.querySelector('#btn-shrine-back')!.addEventListener('click', a.onBack);
  o.el.querySelector('#btn-shrine-cheat')?.addEventListener('click', () => a.onCheat?.());
  const body = o.el.querySelector<HTMLElement>('#shrine-body')!;
  body.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'slot') return a.onBuySlot();
    const row = b.closest<HTMLElement>('[data-ult]')!;
    if (act === 'equip') a.onEquip(row.dataset.yokai!, row.dataset.ult!);
    else if (act === 'buy') a.onBuy(row.dataset.ult!);
    else if (act === 'up') a.onUpgrade(row.dataset.ult!);
  });
  return Object.assign(o, {
    render(v: ShrineView) {
      o.el.querySelector('#shrine-merit')!.textContent = t('shrine.merit', { n: v.merit });
      const sl = v.slots;
      const slotHtml = `<section class="shrine-yokai" id="shrine-slots"><h3>${t('shrine.slots')}</h3><div class="shrine-ult" data-slots="${sl.have}">
        <b>${t('shrine.slotsHave', { n: sl.have, max: sl.max })}</b><span class="d">${t('shrine.slotsDesc')}</span>
        <span class="acts">${sl.price === null ? `<span class="badge">${t('shrine.max')}</span>` : `<button class="btn secondary" type="button" data-act="slot" ${v.merit >= sl.price ? '' : 'disabled'}>${t('shrine.slotBuy', { k: sl.have + 1, n: sl.price })}</button>`}</span></div></section>`;
      body.innerHTML = slotHtml + v.yokai
        .map(
          (y) => `<section class="shrine-yokai"><h3>${t(`yokai.${y.id}` as I18nKey)}：${t('shrine.ults')}</h3>${y.ults
            .map((u) => {
              const equip = !u.unlocked
                ? `<button class="btn secondary" type="button" data-act="buy" ${v.merit >= u.unlockPrice ? '' : 'disabled'}>${t('shrine.buy', { n: u.unlockPrice })}</button>`
                : u.equipped
                  ? `<span class="badge">${t('shrine.equipped')}</span>`
                  : `<button class="btn secondary" type="button" data-act="equip">${t('shrine.equip')}</button>`;
              const up = !u.unlocked
                ? ''
                : u.next
                  ? `<button class="btn secondary" type="button" data-act="up" ${v.merit >= u.upPrice ? '' : 'disabled'}>${t('shrine.up', { n: u.upPrice })}</button>`
                  : `<span class="badge">${t('shrine.max')}</span>`;
              return `<div class="shrine-ult${u.equipped ? ' equipped' : ''}${u.unlocked ? '' : ' locked'}" data-ult="${u.id}" data-yokai="${y.id}">
                <b>${t(`ult.${u.id}` as I18nKey)} ${u.unlocked ? t('ult.level', { lv: u.level, max: u.maxLevel }) : `<em>${t('shrine.locked')}</em>`}</b>
                <span class="d">${t(`ult.${u.id}.desc` as I18nKey)}</span>
                <span class="m">${ultModsText(u.mods)}${u.unlocked && u.next ? `<br>${t('shrine.next', { text: ultStepText(u.next) })}` : ''}</span>
                <span class="acts">${equip}${up}</span></div>`;
            })
            .join('')}</section>`,
        )
        .join('');
    },
  });
}

// ── 升級選卡 ──
const SHAPES: Record<string, string> = { common: 'circle', rare: 'diamond', epic: 'hex', legend: 'star' };

const num = (v: number, d = 2): string => String(Number(v.toFixed(d)));

/** 主武器某一級加什麼（文字） */
export function weaponLevelText(step: WeaponLevel): string {
  const parts: string[] = [];
  if (step.damage) parts.push(t('item.w.damage', { v: num(step.damage) }));
  if (step.volley) parts.push(t('item.w.volley', { v: num(step.volley) }));
  if (step.cooldownPct) parts.push(t('item.w.cooldown', { v: num(step.cooldownPct) }));
  if (step.pierce) parts.push(t('item.w.pierce', { v: num(step.pierce) }));
  if (step.splash) parts.push(t('item.w.splash', { v: num(step.splash) }));
  return parts.join('、');
}

setWeaponTextFormatter((s) => weaponLevelText(s) || t('item.w.none'));

/** 一張卡的名稱、等級變化與「這一級加多少」（levels = 目前的法具等級） */
export function describeCard(o: CardOffer, levels: ReadonlyMap<string, number> = new Map()): { name: string; desc: string; level: string; isNew: boolean } {
  const d = cardById(o.cardId);
  const lv = levels.get(d.id) ?? 0;
  const name = t(`card.${d.id}` as I18nKey);
  if (d.kind === 'fallback') return { name, desc: t(`card.fmt.${d.id}` as I18nKey, { v: num(itemValue(d, o.rarity)) }), level: '', isNew: false };
  const level = lv === 0 ? t('card.new') : t('card.levelUp', { from: lv, to: lv + 1, max: d.maxLevel });
  if (d.kind === 'weapon') {
    const raw = WEAPON_LEVELS[d.id]?.[lv - 1];
    return { name, desc: raw ? weaponLevelText(scaleWeaponStep(raw, o.rarity)) : '', level, isNew: false };
  }
  const v = itemValue(d, o.rarity);
  if (d.kind === 'mod') return { name, desc: t(`card.fmt.${d.mod}` as I18nKey, { v: num(v) }), level, isNew: lv === 0 };
  const fmt = CARD_FORMAT[d.stat as StatId];
  const up = t(`card.fmt.${fmt}` as I18nKey, { name: t(`stat.${d.stat}` as I18nKey), v: num(v, 1) });
  return { name, desc: d.down ? `${up}${t('card.down', { text: downText(d.down.stat, itemDown(d, o.rarity)) })}` : up, level, isNew: lv === 0 };
}

/** 取捨道具扣的東西：「最大生命 -15」「移動速度 -4%」 */
export function downText(stat: StatId, v: number): string {
  return t(`card.fmtDown.${CARD_FORMAT[stat]}` as I18nKey, { name: t(`stat.${stat}` as I18nKey), v: num(v, 1) });
}

/** 選卡面板需要的玩家狀態（技法卡要寫出混搭、等級） */
export interface PickerContext {
  yokai: string;
  counts: ReadonlyMap<string, number>;
  techs?: readonly string[];
  techLevels?: readonly number[];
  techMode?: 'new' | 'up' | 'swap';
}

const techName = (id: string): string => t(`tech.${id}` as I18nKey);

/** 進化卡的內容（HTML）：標籤、名稱、說明、材料 */
function evoCardHtml(cardId: string): string {
  const e = evoOfCard(cardId);
  const [a, b] = e.from;
  return `<span class="rname">${t('card.evoTag')}</span><b>${t(`evo.${e.id}` as I18nKey)}</b><span class="cdesc">${t(`evo.${e.id}.desc` as I18nKey)}</span><span class="ctech">${t('card.evoFrom', { a: techName(a), la: EVO.minLevel, b: techName(b), lb: EVO.minLevel })}</span>`;
}

/** 技法卡的內容（HTML）：標籤、名稱、玩法說明、適合的道具、和已有技法的混搭 */
/** 詞條（D53）的文字：「力量 +10%、迅捷 +8%」；沒有詞條就空字串 */
export function affixHtml(affixes: readonly Affix[] | undefined): string {
  if (!affixes || affixes.length === 0) return '';
  // 詞條只強化這個技法（名稱借用能力值的字，D77）；數量是整數，其他用百分比
  const list = affixes.map((a) => (a.stat === 'count' ? t('card.affixCount', { name: t(AFFIX_LABEL[a.stat] as I18nKey), v: a.value }) : t('card.affixItem', { name: t(AFFIX_LABEL[a.stat] as I18nKey), v: Math.round(a.value * 100) }))).join('、');
  return `<span class="ctech caffix" data-affixes="${affixes.length}">${t('card.affix', { list })}</span>`;
}


function techCardHtml(cardId: string, rarity: Rarity, owned: readonly string[], levels: readonly number[], affixes?: readonly Affix[]): string {
  if (cardId === TECH_KEEP) return `<span class="rname">${t('card.techTag')}</span><b>${t('tech.keep')}</b><span class="cdesc">${t('tech.keep.desc')}</span>`;
  // 已有的技法：升一級（D49：最高 TECH_LEVELS.max 級，效果吃這張卡的稀有度）
  if (cardId.startsWith(TECH_CARD_PREFIX) && owned.includes(cardId.slice(TECH_CARD_PREFIX.length))) {
    const id = cardId.slice(TECH_CARD_PREFIX.length);
    const lv = levels[owned.indexOf(id)] ?? 1;
    return `<span class="rname">${t(`rarity.${rarity}` as I18nKey)}・${t('tech.up.tag', { a: lv, b: lv + 1, max: TECH_LEVELS.max })}</span><b>${techName(id)}</b><span class="cdesc">${t(`tech.${id}.desc` as I18nKey)}</span>${affixHtml(affixes)}`;
  }
  let id: string;
  let tag: string;
  let rest = owned;
  if (cardId.startsWith(TECH_SWAP_PREFIX)) {
    const [from, to] = cardId.slice(TECH_SWAP_PREFIX.length).split('>');
    id = to;
    tag = t('tech.swap.tag', { old: techName(from) });
    rest = owned.filter((x) => x !== from);
  } else {
    id = cardId.slice(TECH_CARD_PREFIX.length);
    tag = `${t(`rarity.${rarity}` as I18nKey)}・${t('card.techTag')}・${t(`tech.family.${techById(id).family}` as I18nKey)}`;
  }
  if (techById(id).form) tag += `・${t('card.formTag')}`;
  const mix = techMix(id, rest);
  const mixText = !mix ? '' : t('tech.mix.hit', { via: techName(mix.via), hit: techName(mix.hit) });
  return `<span class="rname">${tag}</span><b>${techName(id)}</b><span class="cdesc">${t(`tech.${id}.desc` as I18nKey)}</span>${affixHtml(affixes)}${mixText ? `<span class="ctech mix">${mixText}</span>` : ''}`;
}

/** 大招的局外升級累計（能力面板用）：「攻擊力 ×1.1、範圍 ×1.08、冷卻 23 秒、充能 ×1.1」 */
export function ultModsText(m: { power: number; radius: number; cooldown: number; charge: number }): string {
  return `${t('ult.mods', { power: fix(m.power, 2), radius: fix(m.radius, 2) })}、${t('ult.mods2', { cooldown: fix(m.cooldown, 0), charge: fix(m.charge, 2) })}`;
}

/**
 * 法具連結：它適合哪些技法。
 * - 能力面板（詳細，使用者 2026-11-06：「詳細在暫停頁那邊」）：列出全部適合的技法，沒有就明講沒有。
 * - 選卡畫面（只給 owned）：**只列「會影響的現有招式」**（玩家現在有的技法與鬼火）；沒有就不顯示。
 */
export function cardLinkLines(cardId: string, yokai: string, owned?: readonly string[]): string[] {
  const l = cardLinks(cardId, yokai);
  if (cardById(cardId).kind === 'fallback') return [];
  if (owned) {
    const mine = l.techs.filter((x) => x === YOKAI[yokai]?.weapon.id || owned.includes(x));
    return mine.length ? [t('card.link.owned', { list: mine.map((x) => techName(x)).join('、') })] : [];
  }
  if (l.weapon) return [t('card.link.weapon')];
  if (!l.techs.length) return [t('card.link.none')];
  return [t('card.link.tech', { list: l.techs.map((x) => techName(x)).join('、') })];
}

export function buildCardPicker(parent: HTMLElement, onPick: (index: number) => void) {
  const o = overlay(parent, 'levelup', `<div class="panel"><h2 id="lv-title"></h2><div class="cards" id="cards"></div><p class="hint" id="lv-pending"></p></div>`);
  const cardsEl = o.el.querySelector<HTMLElement>('#cards')!;
  const title = o.el.querySelector<HTMLElement>('#lv-title')!;
  const pending = o.el.querySelector<HTMLElement>('#lv-pending')!;
  return Object.assign(o, {
    render(offer: CardOffer[], more: number, kind: 'levelup' | 'offering' | 'chest' | 'tech' | 'fusion' = 'levelup', ult: PickerContext = { yokai: '', counts: new Map() }) {
      title.textContent = t(kind === 'tech' ? (ult.techMode === 'swap' ? 'levelup.dosojin' : 'levelup.tech') : kind === 'levelup' ? 'levelup.title' : kind === 'offering' ? 'levelup.offering' : kind === 'fusion' ? 'levelup.fusion' : 'levelup.chest');
      pending.textContent = more > 1 ? t('levelup.pending', { n: more - 1 }) : '';
      cardsEl.innerHTML = '';
      offer.forEach((c, i) => {
        if (isEvoCard(c.cardId)) {
          // 進化卡（D53）：寶箱最前面、合魂祠
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'card r-evo';
          b.dataset.card = c.cardId;
          b.dataset.index = String(i);
          b.innerHTML = evoCardHtml(c.cardId);
          b.addEventListener('click', () => onPick(i));
          cardsEl.appendChild(b);
          return;
        }
        if (isTechCard(c.cardId)) {
          // 技法（D48）：新技法／加深／道祖神換一個／維持現狀
          const owned = ult.techs ?? [];
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'card r-variant';
          b.dataset.card = c.cardId;
          b.dataset.index = String(i);
          b.innerHTML = techCardHtml(c.cardId, c.rarity, owned, ult.techLevels ?? [], c.affixes);
          b.dataset.rarity = c.rarity;
          b.addEventListener('click', () => onPick(i));
          cardsEl.appendChild(b);
          return;
        }
        const d = describeCard(c, ult.counts);
        const kind = cardById(c.cardId).kind;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `card r-${kind === 'weapon' ? 'weapon' : c.rarity}${d.isNew ? ' is-new' : ''}`;
        b.dataset.card = c.cardId;
        b.dataset.rarity = c.rarity;
        b.dataset.index = String(i);
        b.innerHTML = `<span class="shape ${SHAPES[c.rarity]}" aria-hidden="true"></span>
          <span class="rname">${kind === 'weapon' ? `${t(`rarity.${c.rarity}` as I18nKey)}・${t('card.weaponTag')}` : kind === 'fallback' ? '' : cardById(c.cardId).rarityScales ? t(`rarity.${c.rarity}` as I18nKey) : ''}</span><b>${d.name}</b><span class="clv">${d.level}</span><span class="cdesc">${d.desc}</span>${cardLinkLines(c.cardId, ult.yokai, ult.techs ?? []).map((x) => `<span class="csyn clink">${x}</span>`).join('')}`;
        b.addEventListener('click', () => onPick(i));
        cardsEl.appendChild(b);
      });
    },
  });
}

// ── 要素結果卡（D36）──
/** 出現後這麼久（毫秒）才接受關閉：避免玩家正在按的鍵或點擊把它直接關掉 */
export const RESULT_GUARD_MS = 400;

/** 一行結果的文字（數字全部來自結果資料） */
export function resultLineText(l: ResultLine, levels: ReadonlyMap<string, number> = new Map()): string {
  // D78：限時的寫秒數，其他（石地藏、好籤、祭壇…）寫「整場」，玩家分得出來
  const sec = (s?: number) => (s ? t('result.seconds', { s }) : t('result.wholeRun'));
  switch (l.t) {
    case 'heal':
      // 生命本來就滿的時候不要寫「回復 0 生命」
      return Math.round(l.v) <= 0 ? t('result.healFull') : t('result.heal', { v: Math.round(l.v) });
    case 'stat': {
      const name = t(`stat.${l.stat}` as I18nKey);
      if (l.pct !== undefined) return t('card.fmt.pct', { name, v: num(l.pct * 100, 0) }) + sec(l.seconds);
      const fmt = CARD_FORMAT[l.stat];
      return t(`card.fmt.${fmt}` as I18nKey, { name, v: num((l.flat ?? 0) / CARD_EFFECT[l.stat].scale, 1) }) + sec(l.seconds);
    }
    case 'curse':
      return t('element.altar.effect', { name: t(`curse.${l.id}` as I18nKey), pct: Math.round(l.v * 100) }) + sec(l.seconds);
    case 'uncurse':
      return t('result.uncurse', { name: t(`curse.${l.id}` as I18nKey) });
    case 'omikuji':
      return t(`omikuji.${l.id}` as I18nKey);
    case 'merit':
      return t('result.merit', { v: l.v });
    case 'summon':
      return t('result.summon', { mult: num(l.mult, 1) });
    case 'item': {
      const d = describeCard({ cardId: l.cardId, rarity: l.rarity }, new Map([...levels, [l.cardId, l.level - 1]]));
      return t('result.item', { name: d.name, lv: l.level, desc: d.desc });
    }
    case 'summit':
      return t('result.summit', { m: num(l.mult, 1), n: l.chests });
    case 'trial':
      return l.tier >= 0 ? t('result.trial.win', { k: l.kills, n: l.tier + 1, r: t(`rarity.${l.reward}` as I18nKey) }) : t('result.trial.lose', { k: l.kills });
  }
}

export function buildResultCard(parent: HTMLElement, onClose: () => void) {
  const o = overlay(parent, 'result', `<div class="panel result-panel"><p class="result-head">${t('result.head')}</p><h2 id="result-title"></h2><ul class="result-lines" id="result-lines"></ul>${btn('btn-result-ok', 'result.ok')}</div>`);
  const title = o.el.querySelector<HTMLElement>('#result-title')!;
  const head = o.el.querySelector<HTMLElement>('.result-head')!;
  const list = o.el.querySelector<HTMLElement>('#result-lines')!;
  const ok = o.el.querySelector<HTMLButtonElement>('#btn-result-ok')!;
  let shownAt = 0;
  const ready = () => performance.now() - shownAt >= RESULT_GUARD_MS;
  ok.addEventListener('click', () => {
    if (ready()) onClose();
  });
  return Object.assign(o, {
    render(r: ElementResult, levels: ReadonlyMap<string, number> = new Map()) {
      o.el.dataset.kind = r.kind;
      o.el.dataset.rarity = r.rarity;
      head.textContent = t(r.kind === 'summon' ? 'result.headSummon' : 'result.head');
      title.textContent = `${t(`rarity.${r.rarity}`)}・${t(`element.${r.kind}` as I18nKey)}`;
      list.innerHTML = '';
      for (const l of r.lines) {
        const li = document.createElement('li');
        li.className = `${lineIsGood(l) ? 'good' : 'bad'}${l.t === 'omikuji' || l.t === 'summon' ? ' big' : ''}`;
        li.dataset.line = l.t;
        li.textContent = resultLineText(l, levels);
        list.appendChild(li);
      }
    },
    open() {
      shownAt = performance.now();
      ok.disabled = true;
      window.setTimeout(() => (ok.disabled = false), RESULT_GUARD_MS);
      o.show();
    },
    /** 鍵盤（Enter）關閉：過了防誤觸時間才算 */
    tryClose(): boolean {
      if (!o.visible || !ready()) return false;
      onClose();
      return true;
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

/** 一個法具累計的效果文字 */
function cardEffectText(c: BuildSummary['cards'][number]): string {
  if (c.kind === 'weapon') return c.weaponText;
  if (c.kind === 'mod') return t(`card.fmt.${c.stat}` as I18nKey, { v: fix(c.total) });
  const fmt = CARD_FORMAT[c.stat as StatId];
  const up = t(`card.fmt.${fmt}` as I18nKey, { name: t(`stat.${c.stat}` as I18nKey), v: fix(c.total, 1) });
  return c.down ? `${up}${t('card.down', { text: downText(c.down.stat, c.down.total) })}` : up;
}

// ── 暫停（含「已拿到的卡」與「目前的能力」）──
export function buildPause(parent: HTMLElement, onResume: () => void, onQuit: () => void) {
  const o = overlay(
    parent,
    'pause',
    `<div class="panel pause-panel"><h2>${t('pause.title')}</h2><p id="pause-status"></p>
      <div class="sum"><section class="sum-col"><h3>${t('pause.cards')} <span id="sum-slots"></span></h3><ul class="sum-cards" id="sum-cards"></ul><div id="sum-form"></div><div id="sum-evo"></div><div id="sum-ult"></div></section>
      <section class="sum-col"><h3>${t('pause.abilities')}</h3><dl class="sum-stats" id="sum-stats"></dl><div id="sum-curse"></div></section></div>
      <div class="row">${btn('btn-pause-quit', 'pause.quit', 'secondary')}${btn('btn-pause-resume', 'pause.resume')}</div></div>`,
  );
  o.el.querySelector('#btn-pause-resume')!.addEventListener('click', onResume);
  o.el.querySelector('#btn-pause-quit')!.addEventListener('click', onQuit);
  const q = (id: string) => o.el.querySelector<HTMLElement>('#' + id)!;
  return Object.assign(o, {
    render(sum: BuildSummary) {
      q('pause-status').textContent = t('pause.status', { level: sum.level, kills: sum.kills });
      q('sum-slots').textContent = t('pause.slots', { used: sum.slotsUsed, max: sum.slots });
      const cards = q('sum-cards');
      cards.innerHTML = '';
      if (sum.cards.length === 0) cards.innerHTML = `<li class="empty">${t('pause.noCards')}</li>`;
      for (const c of sum.cards) {
        const li = document.createElement('li');
        li.dataset.card = c.id;
        const chips = (['common', 'rare', 'epic', 'legend'] as const).map((r) => `<i class="chip r-${r}"></i>`.repeat(c.byRarity[r])).join('');
        li.innerHTML = `<b>${t('pause.cardRow', { name: t(`card.${c.id}` as I18nKey), lv: c.level, max: c.maxLevel })}</b><span class="chips">${chips}</span><em>${cardEffectText(c)}${cardLinkLines(c.id, sum.yokai).map((x) => `<br><span class="clink">${x}</span>`).join('')}${c.kind === 'weapon' ? `<br>${t('pause.techRow', { name: techName(c.id), lv: c.level, items: sum.baseLikes.map((x) => t(`card.${x}` as I18nKey)).join('、') })}` : ''}${c.kind === 'weapon' ? sum.techs.map((x) => `<br>${t('pause.techRow', { name: techName(x.id), lv: x.level, items: x.likes.map((l) => t(`card.${l}` as I18nKey)).join('、') })}`).join('') : ''}</em>`;
        cards.appendChild(li);
      }
      const fm = q('sum-form');
      fm.innerHTML = `<h3>${t('pause.formTitle')}</h3><ul class="sum-ult"><li data-form="${sum.form.now}"><b>${sum.form.now > 0 ? t(`form.${sum.yokai}.${sum.form.now}` as I18nKey) : t('pause.formNone')}</b><em>${sum.form.nextLevel ? t('pause.formNext', { lv: sum.form.nextLevel }) : t('pause.formMax')}</em>${
        sum.form.locked.length ? `<span>${sum.form.locked.map(([id, n]) => `<i>${t('pause.formLocked', { name: techName(id), n })}</i>`).join('')}</span>` : ''
      }</li></ul>`;
      const evo = q('sum-evo');
      evo.innerHTML = sum.evolutions.length
        ? `<h3>${t('pause.evolutions')}</h3><ul class="sum-ult">${sum.evolutions
            .map(
              (e) =>
                `<li data-evo="${e.id}" class="${e.done ? 'fused' : ''}"><b>${t(`evo.${e.id}` as I18nKey)}${e.done ? ' ✓' : ''}</b><em>${t(`evo.${e.id}.desc` as I18nKey)}</em><span>${e.from
                  .map((m) => `<i class="${m.level >= EVO.minLevel ? 'ok' : ''}">${t('pause.evoPart', { name: techName(m.id), lv: Math.min(m.level, EVO.minLevel), max: EVO.minLevel })}</i>`)
                  .join('')}${e.ready ? `<i class="ok">${t('pause.evoReady')}</i>` : ''}${e.done ? '' : `<i>${t('pause.evoCap', { max: TECH_LEVELS.max })}</i>`}</span>${
                  e.done
                    ? `<span class="evo-form" data-form-level="${e.formLevel}"><i class="ok">${t('pause.evoForm', { lv: e.formLevel, max: TECH_LEVELS.max })}</i></span>`
                    : ''
                }</li>`,
            )
            .join('')}</ul>`
        : '';
      const ult = q('sum-ult');
      ult.innerHTML = sum.ultimates.length
        ? `<h3>${t('pause.ultimates')}</h3><ul class="sum-ult">${sum.ultimates
            .map(
              (u) =>
                `<li data-ult="${u.id}"><b>${t(`ult.${u.id}` as I18nKey)} ${t('ult.level', { lv: u.level, max: u.maxLevel })}</b><em>${t(`ult.${u.id}.desc` as I18nKey)}</em><span>${ultModsText(u.mods)}</span></li>`,
            )
            .join('')}</ul>`
        : '';
      const stats = q('sum-stats');
      const rows = sum.stats.map((s) => `<div data-stat="${s.id}"><dt>${t(`stat.${s.id}` as I18nKey)}</dt><dd>${statText(s.id, s.value, sum)}</dd></div>`);
      rows.push(`<div class="weapon-head"><dt><b>${t(`card.${YOKAI[sum.yokai].weapon.id}` as I18nKey)}</b></dt><dd></dd></div>`);
      // 只列對這隻妖怪的武器有意義的欄位（回力水盤本來就來回穿透、揮擊沒有投射物：D65）
      const wk = YOKAI[sum.yokai].weapon.kind ?? 'projectile';
      const has = (id: string) => (ITEM_WEAPON_KINDS[id] ?? [wk]).includes(wk);
      if (has('volley')) rows.push(`<div data-stat="volley"><dt>${t('sum.volley')}</dt><dd>${fix(sum.weapon.volley)}</dd></div>`);
      if (has('splash')) rows.push(`<div data-stat="splash"><dt>${t('sum.splash')}</dt><dd>${t('sum.meters', { v: fix(sum.weapon.splash, 1) })}</dd></div>`);
      if (has('splash')) rows.push(`<div data-stat="shards"><dt>${t('sum.shards')}</dt><dd>${t('sum.shardsVal', { v: fix(sum.weapon.shards, 1), d: fix(sum.weapon.shardDamage * 100, 0) })}</dd></div>`);
      if (has('pierce')) rows.push(`<div data-stat="pierce"><dt>${t('sum.pierce')}</dt><dd>${fix(sum.weapon.pierce)}</dd></div>`);
      // 取代發射的技法在場：穿透、濺射、碎裂改成別的效果，說明一次（Q56）；碎裂只對少數出手方式有效，也寫清楚
      if (sum.weapon.converted) rows.push(`<div data-stat="converted" class="weapon-note"><dt>${t('sum.converted')}</dt><dd></dd></div>`);
      if (has('splash')) rows.push(`<div data-stat="shardsNote" class="weapon-note"><dt>${t('sum.shardsNote')}</dt><dd></dd></div>`);
      stats.innerHTML = rows.join('');
      const curse = q('sum-curse');
      const diff = sum.difficulty > 0 ? `<h3>${t('pause.difficulty', { d: fix(sum.difficulty * 100, 0) })}</h3><p class="sum-diff">${t('pause.difficultyDesc', { hp: fix(sum.difficulty * DIFFICULTY.hp * 100, 0), dmg: fix(sum.difficulty * DIFFICULTY.damage * 100, 0), n: fix(sum.difficulty * DIFFICULTY.spawn * 100, 0) })}</p>` : '';
      curse.innerHTML = diff + (sum.curses.length ? `<h3>${t('pause.curses')}</h3><ul class="sum-syn">${sum.curses.map((c) => `<li>${t(`curse.${c.id}` as I18nKey)} <b>+${fix(c.v * 100, 0)}%</b></li>`).join('')}</ul>` : '');
    },
  });
}
