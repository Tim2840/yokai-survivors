import type { Rng } from '../lib/random';
import { t } from '../i18n';
import { buildMinimap } from './minimap';
import { FEEL, BUFF_HUD } from '../data/feel';
import { feel } from '../core/feel';
import { describeCard } from './overlays';
import type { I18nKey } from '../i18n/zh-TW';
import type { Run } from '../game/run';
import type { CurseId } from '../data/altar';
import type { StatId } from '../data/stats';
import type { ElementSlot } from '../systems/elements';
import { ULT } from '../data/ultimates';
import { STAGE } from '../data/stage';
import { ENEMIES, ENEMY_IDS } from '../data/enemies';
import { PICKUPS } from '../data/pickups';
import { DOSOJIN, KANAME, TRIAL, JIZO, OFFERING, trialNeeds, SUMMIT, OFFERING_TECH } from '../data/elements';
import { EVO } from '../data/techniques';
import { TOD_BONUS } from '../data/timeOfDay';
import type { TimeOfDay } from '../data/ambience';

const TOD_NOTE_SECONDS = 6;
const pct = (v: number): string => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
/** 時段的開局字幕：全部從 TOD_BONUS 算（改數字不用改文字） */
function todNote(tod: TimeOfDay): string {
  const b = TOD_BONUS[tod];
  if (tod === 'night') return t('hud.todNote.night', { ult: pct(b.ultCharge), pick: pct(b.pct.pickup ?? 0) });
  if (tod === 'dusk') return t('hud.todNote.dusk', { xp: pct(b.xp), chest: Math.round(b.chestUp * 100) });
  return t('hud.todNote.day', { s: pct(b.pct.speed ?? 0), r: b.regen, f: pct(b.spawn) }); // 人類與經驗同一個數（單元測試守著）
}

let coarse: boolean | null = null;
/** 觸控為主的裝置（只查一次）：提示不寫鍵盤鍵 */
const touchUi = (): boolean => (coarse ??= window.matchMedia('(pointer: coarse)').matches);


/**
 * 戰鬥 HUD（docs/08 第 5 節）：左上生命、上中波數與倒數、右上暫停鈕、下方魂火條與等級、左下虛擬搖桿（觸控裝置）。
 * 只在值變了才改 DOM（每幀呼叫 update，不重排版）。
 */
export interface Hud {
  root: HTMLElement;
  stickBase: HTMLElement;
  stickKnob: HTMLElement;
  jumpButton: HTMLButtonElement;
  /** 互動鈕（D99）：只在要素旁出現 */
  interactButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  abilitiesButton: HTMLButtonElement;
  ultButton: HTMLButtonElement;
  /** yaw = 鏡頭的 yaw（傳送門箭頭要相對鏡頭轉） */
  update(run: Run, yaw: number): void;
  show(visible: boolean): void;
  /** 受傷暈邊（D69）：strength 0～1，之後每秒淡出 */
  flashHurt(strength: number): void;
}

export function buildHud(parent: HTMLElement): Hud {
  const root = document.createElement('div');
  root.className = 'hud hidden';
  root.dataset.screen = 'hud';
  root.innerHTML = `
    <div class="hurt-vignette" id="hurt-vignette" aria-hidden="true"></div>
    <div class="hud-top">
      <div class="hud-left">
        <div class="hud-hp" aria-label="${t('hud.hp')}">
          <div class="bar"><i id="hp-fill"></i></div>
          <span id="hp-text"></span>
        </div>
        <div class="hud-res hidden" id="res-box"><span id="res-label"></span><div class="pips" id="res-pips"></div></div>
        <div class="hud-buffs" id="buff-box" aria-label="${t('hud.buffs')}"></div>
      </div>
      <div class="hud-wave"><b id="wave-text"></b><span id="wave-timer"></span><i id="wave-diff" class="hidden"></i><em id="wave-note"></em></div>
      <div class="hud-btns"><button class="hud-abilities" id="btn-abilities" type="button">${t('hud.abilities')}</button><button class="hud-pause" id="btn-pause" type="button" aria-label="${t('pause.button')}">II</button></div>
    </div>
    <div class="hud-boss hidden" id="boss-bar"><span id="boss-name">${t('hud.boss')}</span><div class="bar"><i id="boss-fill"></i></div></div>
    <div class="hud-element hidden" id="element-box"><b id="element-title"></b><span id="element-desc"></span><div class="bar"><i id="element-fill"></i></div><em id="element-act"></em></div>
    <div class="hud-trial hidden" id="trial-box"></div>
    <div class="hud-synergy hidden" id="synergy-box"></div>
    <div class="hud-portal hidden" id="portal-box"><b id="portal-arrow">▲</b><span id="portal-text"></span></div>
    <div class="hud-bottom">
      <div class="xp"><i id="xp-fill"></i></div>
      <span id="lv-text"></span>
    </div>
    <div class="stick" id="stick-base"><div class="knob" id="stick-knob"></div></div>
    <button class="ult hidden" id="btn-ult" type="button"><span class="ult-fill" id="ult-fill"></span><b>${t('hud.ult')}</b><em id="ult-key">F</em></button>
    <button class="jump" id="btn-jump" type="button" aria-label="${t('hud.jump')}">${t('hud.jump')}</button>
    <button class="interact hidden" id="btn-interact" type="button"><b>${t('hud.interact')}</b><em>E</em></button>`;
  parent.appendChild(root);
  const minimap = buildMinimap(root);
  let lastMapTime = performance.now();
  let vig = 0;
  let vigShown = -1;
  const vigEl = root.querySelector<HTMLElement>('#hurt-vignette')!;
  const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const buffBox = q('buff-box');
  let lastBuffs = '';
  const compact = typeof matchMedia === 'function' ? matchMedia('(max-width: 640px), (max-height: 520px)') : null;
  // 手機直式：血條下方是關卡提示與指路，標籤改排在小地圖下方（右側）
  const portrait = typeof matchMedia === 'function' ? matchMedia('(max-width: 640px) and (orientation: portrait)') : null;
  const placeBuffs = (): void => {
    const side = !!portrait?.matches;
    buffBox.classList.toggle('side', side);
    if (!side) {
      buffBox.style.top = '';
      buffBox.style.right = '';
      return;
    }
    const mm = minimap.root;
    const visible = !mm.classList.contains('hidden');
    const top = visible ? mm.offsetTop + mm.offsetHeight + 6 : mm.offsetTop;
    buffBox.style.top = `${top}px`;
    buffBox.style.right = `${Math.max(0, root.clientWidth - (mm.offsetLeft + mm.offsetWidth))}px`;
  };
  const hpFill = q('hp-fill');
  const hpText = q('hp-text');
  const waveText = q('wave-text');
  const timer = q('wave-timer');
  const note = q('wave-note');
  const waveDiff = q('wave-diff');
  const bossBar = q('boss-bar');
  const bossFill = q('boss-fill');
  const bossName = q('boss-name');
  const resBox = q('res-box');
  const resLabel = q('res-label');
  const resPips = q('res-pips');
  let resKind = '';
  let resShown = -1;
  const portalBox = q('portal-box');
  const portalArrow = q('portal-arrow');
  const portalText = q('portal-text');
  const elBox = q('element-box');
  const elTitle = q('element-title');
  const elDesc = q('element-desc');
  const elFill = q('element-fill');
  const elAct = q('element-act');
  const ultBtn = q('btn-ult');
  const interactBtn = q('btn-interact');
  const ultFill = q('ult-fill');
  const ultKey = q('ult-key');
  let lastUlt = '';
  const synBox = q('synergy-box');
  const trialBox = q('trial-box');
  let lastTrial = '';
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
  let lastBossKind = -1;
  let lastBoss = false;
  let lastPortal = -1;
  return {
    root,
    stickBase: q('stick-base'),
    stickKnob: q('stick-knob'),
    jumpButton: q<HTMLButtonElement>('btn-jump'),
    interactButton: q<HTMLButtonElement>('btn-interact'),
    pauseButton: q<HTMLButtonElement>('btn-pause'),
    abilitiesButton: q<HTMLButtonElement>('btn-abilities'),
    ultButton: q<HTMLButtonElement>('btn-ult'),
    show(v) {
      root.classList.toggle('hidden', !v);
      minimap.setVisible(v);
    },
    flashHurt(strength) {
      vig = Math.max(vig, Math.min(FEEL.vignette.max, strength * feel.vignette));
    },
    update(run, yaw) {
      const nowT = performance.now();
      const realDt = Math.min(0.25, (nowT - lastMapTime) / 1000);
      minimap.update(run, yaw, realDt);
      lastMapTime = nowT;
      // 淡出每幀最多用 0.05 秒（低幀率或被切到背景回來時不會一幀就消失）
      if (vig > 0) vig = Math.max(0, vig - FEEL.vignette.fade * Math.min(0.05, realDt));
      const vs = Math.round(vig * 100) / 100;
      if (vs !== vigShown) {
        vigShown = vs;
        vigEl.style.opacity = String(vs);
      }
      const hp = Math.max(0, Math.ceil(run.hp));
      const key = `${hp}/${Math.round(run.maxHp)}`;
      if (key !== lastHp) {
        lastHp = key;
        hpText.textContent = key;
        hpFill.style.width = `${Math.max(0, Math.min(1, run.hp / run.maxHp)) * 100}%`;
      }
      // 限時效果的倒數標籤（D78）：只有內容或秒數變了才重寫
      const nb = run.collectBuffs();
      const cap = compact?.matches ? BUFF_HUD.maxShownCompact : BUFF_HUD.maxShown;
      let bk = '';
      for (let i = 0; i < nb; i++) bk += `${run.buffs[i].label}:${Math.ceil(run.buffs[i].left)}|`;
      if (bk !== lastBuffs) {
        lastBuffs = bk;
        let html = '';
        for (let i = 0; i < Math.min(nb, cap); i++) {
          const b = run.buffs[i];
          const p = Math.max(0, Math.min(1, b.left / b.total));
          html += `<span class="buff${b.bad ? ' bad' : ''}" data-buff="${b.label}"><b>${t(b.label as I18nKey)}</b><em>${t('hud.buffSec', { s: Math.ceil(b.left) })}</em><i style="width:${Math.round(p * 100)}%"></i></span>`;
        }
        if (nb > cap) html += `<span class="buff more">+${nb - cap}</span>`;
        buffBox.innerHTML = html;
        if (nb > 0) placeBuffs();
      }
      const diff = Math.round(run.difficulty * 100);
      const waveKey = run.stageNumber * 10000 + diff + (run.tod === 'day' ? 0.2 : run.tod === 'dusk' ? 0.1 : 0);
      if (waveKey !== lastWave) {
        lastWave = waveKey;
        // 時段標籤（D96）：關卡名稱旁常駐一個小標籤（夜晚／黃昏／白天）
        waveText.innerHTML = `${t('hud.stage', { n: run.stageNumber })}<small class="tod tod-${run.tod}">${t(`hud.tod.${run.tod}` as I18nKey)}</small>`;
        // 難度另起一行（中間欄要窄，不把血條與右上的鈕擠壞）
        waveDiff.textContent = diff > 0 ? t('hud.diff', { d: diff }) : '';
        waveDiff.classList.toggle('hidden', diff <= 0);
        // 第 2 關起多一行「難度 +n%」：下面的提示框（頭目血條、要素說明、箭頭）跟著往下讓一行，不蓋到波數旁的提示字
        root.style.setProperty('--diff-shift', diff > 0 ? '16px' : '0px');
      }
      const left = Math.ceil(run.timeLeft);
      if (left !== lastTimer) {
        lastTimer = left;
        timer.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      }
      const altar = run.elements.summonSlot;
      const shrine = run.elements.fuseSlot;
      // 山頂神社（E2）：頭目出現前、還沒用過才指路；開局前 15 秒另外在頂端提示一次
      const sslot = run.elements.summitSlot;
      const summit = sslot && sslot.announce <= 0 && !run.director.bossSpawned ? sslot : null;
      // 道祖神（D47）：只在出現後 hintSeconds 秒內提示、指路（不想換的人不會一直被叫過去）
      const dslot = run.elements.dosojinSlot;
      const dosojin = dslot && dslot.announce <= 0 && dslot.age < DOSOJIN.hintSeconds ? dslot : null;
      const intro = run.enemyIntro && run.clock < run.enemyIntro.until ? run.enemyIntro.key : '';
      const fnote = run.formNote && run.clock < run.formNote.until ? t('hud.formNote', { name: t(`form.${run.yokai.id}.${run.formNote.form}` as I18nKey) }) : '';
      const wnote = run.weaponNote && run.clock < run.weaponNote.until ? t('hud.weaponNote', { weapon: t(`tech.${run.weaponItemId}` as I18nKey), lv: run.weaponNote.level }) : '';
      const gnote = run.gemNote && run.clock < run.gemNote.until ? t('hud.gemNote', { lv: EVO.minLevel }) : '';
      const hnote = run.highNote && run.clock < run.highNote.until ? t('hud.highGround') : '';
      // 開局前幾秒：這一關的時段與加成（D96，數字從 TOD_BONUS 算）
      const tnote = run.time < TOD_NOTE_SECONDS ? todNote(run.tod) : '';
      const noteText = run.director.swarm ? t('hud.swarm') : fnote ? fnote : gnote ? gnote : wnote ? wnote : hnote ? hnote : intro ? t(intro as I18nKey) : tnote ? tnote : run.portal.active ? t('hud.bossDown') : altar ? t('hud.summonNote') : shrine ? t('hud.fuseNote') : dosojin ? t('hud.dosojinNote') : summit && run.time < TOD_NOTE_SECONDS + 15 ? t('hud.summitNote') : '';
      if (noteText !== lastNote) {
        lastNote = noteText;
        note.textContent = noteText;
        note.classList.toggle('alarm', run.director.swarm);
      }
      // 角色資源條（docs/35：赤鬼的怒氣；沒有被動資源的妖怪不顯示）
      const res = run.resource;
      const rk = res ? res.kind : '';
      if (rk !== resKind) {
        resKind = rk;
        resBox.classList.toggle('hidden', !res);
        if (res) {
          resLabel.textContent = t(`hud.res.${res.kind}` as I18nKey);
          resPips.innerHTML = '<i></i>'.repeat(res.max);
        }
        resShown = -1;
      }
      if (res && res.value !== resShown) {
        resShown = res.value;
        const pips = resPips.children;
        for (let k = 0; k < pips.length; k++) pips[k].classList.toggle('on', k < res.value);
        resBox.classList.toggle('full', res.value >= res.max);
      }
      // 頭目血條
      const bi = run.director.bossIndex;
      const bossAlive = bi >= 0 && run.enemies.alive[bi] === 1 && run.enemies.variant[bi] === 2;
      if (bossAlive !== lastBoss) {
        lastBoss = bossAlive;
        bossBar.classList.toggle('hidden', !bossAlive);
      }
      // 頭目名字（D95：每關各自的頭目）：種類變了就換（不能只靠血條出現／消失，兩隻頭目之間可能沒畫到「沒有頭目」那一幀）
      const bossKind = bossAlive ? run.enemies.kind[bi] : -1;
      if (bossAlive && bossKind !== lastBossKind) bossName.textContent = t(ENEMIES[ENEMY_IDS[bossKind]].name as I18nKey);
      lastBossKind = bossKind;
      if (bossAlive) bossBar.classList.toggle('phase2', run.boss.phase2);
      if (bossAlive) bossFill.style.width = `${Math.max(0, run.enemies.hp[bi] / run.enemies.maxHp[bi]) * 100}%`;
      // 傳送門箭頭：相對鏡頭的方向與距離
      // 傳送門優先；還沒開的召喚祭壇也用同一個箭頭（D34）
      // 箭頭：傳送門 > 召喚祭壇 > 合魂祠 > 道祖神 > 山頂神社；走到旁邊就不顯示
      const near = (e: { x: number; z: number; announce: number } | null) => !!e && e.announce <= 0 && Math.hypot(e.x - run.px, e.z - run.pz) > ALTAR_ARROW_HIDE;
      const arrowKind = run.portal.active ? 'portal' : near(altar) ? 'summon' : near(shrine) ? 'fuse' : near(dosojin) ? 'dosojin' : near(summit) ? 'summit' : '';
      const target = arrowKind === 'portal' ? run.portal : arrowKind === 'summon' ? altar : arrowKind === 'fuse' ? shrine : arrowKind === 'dosojin' ? dosojin : arrowKind === 'summit' ? summit : null;
      if (target) {
        portalBox.classList.remove('hidden');
        portalBox.dataset.kind = arrowKind;
        const dx = target.x - run.px;
        const dz = target.z - run.pz;
        const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
        const fwd = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
        portalArrow.style.transform = `rotate(${Math.round((Math.atan2(right, fwd) * 180) / Math.PI)}deg)`;
        const kindNo = arrowKind === 'portal' ? 0 : arrowKind === 'summon' ? 1 : arrowKind === 'fuse' ? 2 : arrowKind === 'dosojin' ? 3 : 4;
        const m = Math.round(Math.hypot(dx, dz)) * 8 + kindNo; // 低 3 位放種類、其餘是公尺數（種類最多 8 種）
        if (m !== lastPortal) {
          lastPortal = m;
          portalText.textContent = t((['hud.portal', 'hud.summon', 'hud.fuse', 'hud.dosojin', 'hud.summit'] as const)[kindNo], { m: m >> 3 });
        }
      } else if (lastPortal !== -1) {
        lastPortal = -1;
        portalBox.classList.add('hidden');
      }
      // 提示框：補給品、可以進化了、技法換了、進化成功，誰最近發生就顯示誰（4 秒；不是彈窗，不暫停）
      let synText = '';
      let synAt = -1;
      // 神籤的結果改由結果卡顯示（D36），這裡不再重複
      const pk = run.lastPickup;
      if (pk && run.clock - pk.at < 3 && pk.at >= synAt) {
        synAt = pk.at;
        synText = t('hud.pickup', { name: t(`pickup.${pk.kind}` as I18nKey), fx: t(`pickup.fx.${PICKUPS[pk.kind].type}` as I18nKey, { v: Math.round(pk.v) }) });
      }
      const rd = run.lastReady;
      if (rd && run.clock - rd.at < 6 && rd.at >= synAt && !run.tech.evolved.includes(rd.id)) {
        synAt = rd.at;
        synText = t('hud.evolveReady', { name: t(`evo.${rd.id}` as I18nKey) });
      }
      const vc = run.lastTechChange;
      if (vc && run.clock - vc.at < 4 && vc.at >= synAt) {
        synAt = vc.at;
        synText = t('hud.techChanged', { name: t(`tech.${vc.to}` as I18nKey) });
      }
      const ev = run.lastEvolve;
      if (ev && run.clock - ev.at < 6 && ev.at >= synAt) {
        synAt = ev.at;
        synText = t('hud.evolve', { name: t(`evo.${ev.id}` as I18nKey) });
      }
      // 百鬼試煉碑（E1）：進行中顯示打倒數與剩餘秒數（每秒或數字變了才改字）
      const tr = run.elements.trial;
      const trText = tr.active ? t('hud.trial', { k: tr.kills, n: tr.needs.find((x) => x > tr.kills) ?? tr.needs[2], s: Math.ceil(tr.left) }) : '';
      if (trText !== lastTrial) {
        lastTrial = trText;
        trialBox.textContent = trText;
        trialBox.classList.toggle('hidden', trText === '');
      }
      // 大招鈕：有裝配大招才顯示；量表滿了會發亮
      const hasUlt = run.ults.length > 0;
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
      // 互動鈕（D99）：腳邊有可以按的要素才出現（選卡、結果卡開著時不出現）
      interactBtn.classList.toggle('hidden', !(run.elements.canInteract && !run.offer && !run.elementResult));
      // 地圖要素：走近時顯示名稱、效果（要石顯示撐住的進度）
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
          elDesc.textContent = f.kind === 'summon' ? t('element.summon.desc', { mult: mult.toFixed(1) }) : f.kind === 'fox' ? describeFox(f, run.cardCounts) : f.kind === 'fuse' ? t(f.blocked ? 'element.fuse.none' : 'element.fuse.desc') : f.kind === 'dosojin' ? t('element.dosojin.desc') : f.kind === 'summit' ? t(f.blocked ? 'element.summit.none' : 'element.summit.desc', { m: SUMMIT.bossMult, n: SUMMIT.extraChests }) : f.kind === 'trial' ? trialHint(f.rarity, run.time / run.director.duration) : f.kind === 'kaname' ? t('element.kaname.desc', { s: KANAME.seconds[f.rarity], pct: Math.round(KANAME.bonus[f.rarity] * 100) }) : describeElement(f, run.tech.offerUp(DESC_RNG, 1).length > 0);
          elAct.textContent = f.kind === 'fox' ? t('element.fox.act') : f.kind === 'kaname' ? t('element.kaname.act') : t(touchUi() ? 'element.hold.touch' : 'element.hold');
        }
        // D99：只有要石有進度（撐住的秒數）；其他要素按一下就取得，不顯示進度條
        elFill.parentElement!.classList.toggle('hidden', f.kind !== 'kaname');
        elFill.style.width = `${Math.round(f.progress * 100)}%`;
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
/** 試煉碑的提示：玩法＋現在的三段門檻與寶箱 */
function trialHint(rarity: ElementSlot['rarity'], progress: number): string {
  const n = trialNeeds(rarity, progress);
  const r = TRIAL.rewards[rarity].map((x) => t(`rarity.${x}` as I18nKey));
  return (
    t('element.trial.desc', { s: TRIAL.seconds }) +
    t('element.trial.hint', { a: n[0], b: n[1], c: n[2], r1: r[0], r2: r[1], r3: r[2] }) +
    '\n' +
    t('element.trial.zone', { pct: Math.round(TRIAL.zoneBuff[rarity] * 100) })
  );
}

/** 賽錢箱說明用：只看「有沒有可以升級的技法」，不影響模擬的亂數 */
const DESC_RNG = { next: () => 0 } as unknown as Rng;

function describeElement(f: ElementSlot, canUpTech = true): string {
  if (f.kind === 'jizo') {
    const j = JIZO[f.rarity];
    return t(f.rarity === 'legend' ? 'element.jizo.descLegend' : 'element.jizo.desc', { heal: Math.round(j.healFrac * 100), armor: j.armor });
  }
  if (f.kind === 'offering') {
    const o = OFFERING[f.rarity];
    if (f.blocked) return t('element.offering.poor');
    return t(OFFERING_TECH.on && canUpTech ? 'element.offering.desc' : 'element.offering.descCard', { cost: Math.round(o.costFrac * 100), rarity: t(`rarity.${o.reward}`), more: o.picks > 1 ? t('element.offering.more', { n: o.picks }) : '' });
  }
  if (f.kind === 'chest') return t('element.chest.desc', { rarity: t(`rarity.${f.rarity}`) });
  if (f.kind === 'omikuji') return t('element.omikuji.desc');
  // 詛咒祭壇：把抽到的每個效果列出來，詛咒（敵人變強）與好處（自己變強）用 +％ 寫在一起
  const parts: string[] = [];
  for (let k = 0; k < f.effectCount; k++) {
    const x = f.effects[k];
    const name = x.curse ? t(`curse.${x.id as CurseId}`) : t(`stat.${x.id as StatId}`);
    parts.push(t('element.altar.effect', { name, pct: Math.round(x.v * 100) }));
  }
  return parts.join('\n');
}
