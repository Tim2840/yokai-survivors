import { bus, type EventBus } from '../core/bus';
import type { AudioEngine } from '../core/audio';
import type { FixedLoop } from '../core/loop';
import type { Input } from '../core/input';
import type { Renderer } from '../core/renderer';
import { loadSave, writeSave, type SaveData } from '../core/save';
import { Run, subSeed } from './run';
import type { GameStateMachine } from './stateMachine';
import { RunView } from '../render/runView';
import { buildHud, type Hud } from '../ui/hud';
import { buildMenu, toast } from '../ui/menu';
import { summarizeBuild } from './buildSummary';
import { buildCardPicker, buildIntermission, buildPause, buildResultCard, buildRunEnd, buildSetup, type PickerContext } from '../ui/overlays';
import { t } from '../i18n';
import { tuning } from '../data/tuning';
import { CAMERA } from '../data/camera';
import type { buildTuningPanel } from '../ui/tuningPanel';
import { worldMove } from '../core/cameraRig';

export interface GameDeps {
  fsm: GameStateMachine;
  loop: FixedLoop;
  renderer: Renderer;
  audio: AudioEngine;
  input: Input;
  save: SaveData;
  ui: HTMLElement;
  seed: number;
  mobile: boolean;
  /** 測試頁才有（main.ts 在 DEV_TOOLS 時才傳入，主網址的打包不含面板程式）：試玩調整面板的建構函式；有它也代表結算畫面顯示種子 */
  tuneUi?: typeof buildTuningPanel;
  /** 主選單背景（開局時隱藏） */
  backdrop: { visible: boolean };
  bus?: EventBus;
}

/**
 * 把狀態機、模擬（Run）、渲染（RunView）、介面接起來。
 * 規則（docs/06 第 2 節、D15）：COMBAT 內只允許暫停與「升級選卡」兩種覆蓋層；其他選擇都在別的狀態。
 */
export class Game {
  run: Run | null = null;
  view: RunView | null = null;
  runIndex = 0;
  selectedYokai = 'chochin-kozo';
  private readonly b: EventBus;
  private readonly fsm: GameStateMachine;
  private readonly loop: FixedLoop;
  private readonly renderer: Renderer;
  private readonly audio: AudioEngine;
  private readonly input: Input;
  private readonly save: SaveData;
  private readonly hud: Hud;
  private readonly menuEl: HTMLElement;
  private readonly setup;
  private readonly picker;
  private readonly resultCard;
  private readonly inter;
  private readonly end;
  private readonly pause;
  private lastEnd: { result: 'death' | 'victory' | 'abandon'; stage: number; kills: number; level: number; merit: number } | null = null;
  // 每幀音效用的上一次數值
  private lastKills = 0;
  private lastXp = 0;
  private lastHead = 0;
  private time = 0;
  private lastFrameMs = 0;
  private readonly moveOut = new Float32Array(2);
  private readonly lookOut = new Float32Array(2);

  constructor(private readonly d: GameDeps) {
    this.b = d.bus ?? bus;
    this.fsm = d.fsm;
    this.loop = d.loop;
    this.renderer = d.renderer;
    this.audio = d.audio;
    this.input = d.input;
    this.save = d.save;
    const ui = d.ui;

    const tune = d.tuneUi ? d.tuneUi(ui) : null;
    tune?.onDone(() => {
      tune.hide();
      this.audio.sfx('confirm');
    });
    this.menuEl = buildMenu(
      ui,
      () => this.go('RUN_SETUP'),
      () => this.notReady(),
      tune ? [tune.button(() => (this.audio.sfx('click'), tune.show()))] : [],
    );
    this.setup = buildSetup(
      ui,
      (id) => {
        this.selectedYokai = id;
        this.audio.sfx('confirm');
        this.go('COMBAT');
      },
      () => this.go('MENU'),
    );
    this.picker = buildCardPicker(ui, (i) => this.pickCard(i));
    this.resultCard = buildResultCard(ui, () => this.closeResult());
    this.inter = buildIntermission(
      ui,
      () => {
        this.audio.sfx('confirm');
        this.go('COMBAT');
      },
      () => this.quitRun(),
    );
    this.end = buildRunEnd(
      ui,
      () => this.go('RUN_SETUP'),
      () => this.go('MENU'),
      () => this.notReady(),
    );
    this.pause = buildPause(ui, () => this.closePause(), () => this.quitRun());
    this.hud = buildHud(ui);
    this.hud.pauseButton.addEventListener('click', () => this.togglePause());
    this.hud.abilitiesButton.addEventListener('click', () => this.openPause());
    this.input.attachTouch({ stickBase: this.hud.stickBase, stickKnob: this.hud.stickKnob, jumpButton: this.hud.jumpButton, commandButton: this.hud.ultButton });
    this.input.attachLook(this.renderer.pipeline.renderer.domElement);

    window.addEventListener('keydown', (e) => {
      // 結果卡開著：只有 Enter 能關（空白鍵是跳躍、E 是轉視角，不拿來關，免得帶進操作）
      if (this.resultCard.visible) {
        if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) this.resultCard.tryClose();
        return;
      }
      if (e.code === 'Escape' && !e.repeat) this.togglePause();
      else if (e.code === 'KeyC' && !e.repeat && this.fsm.state === 'COMBAT' && !this.picker.visible) this.togglePause();
      if (this.picker.visible && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) this.pickCard(Number(e.code.slice(5)) - 1);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.fsm.state === 'COMBAT' && !this.pause.visible && !this.picker.visible && !this.resultCard.visible) this.openPause();
    });

    this.registerStates();
    this.wireEvents();
  }

  private go(to: Parameters<GameStateMachine['go']>[0]): void {
    this.b.emit('request:state', { to });
  }

  private notReady(): void {
    this.audio.sfx('click');
    toast(t('menu.notReady'));
  }

  // ── 狀態 ──
  private registerStates(): void {
    const f = this.fsm;
    f.register('MENU', {
      enter: () => {
        this.disposeRun();
        this.menuEl.classList.remove('hidden');
        this.audio.setMusic({ theme: 'title' });
      },
      exit: () => this.menuEl.classList.add('hidden'),
    });
    f.register('RUN_SETUP', {
      enter: () => {
        this.disposeRun();
        this.setup.show();
        this.audio.setMusic({ theme: 'title' });
      },
      exit: () => this.setup.hide(),
    });
    f.register('COMBAT', {
      enter: (from) => {
        if (from === 'RUN_SETUP') this.startRun();
        else if (from === 'INTERMISSION') this.run?.continueFromIntermission();
        this.hud.show(true);
        this.input.enabled = true;
        this.audio.setMusic({ theme: 'battle' });
      },
      update: (dt) => {
        const run = this.run;
        if (!run) return;
        this.input.poll();
        worldMove(this.input.moveX, this.input.moveZ, this.renderer.rig.yaw, this.moveOut);
        run.setMove(this.moveOut[0], this.moveOut[1]);
        if (this.input.consumeJump()) run.requestJump();
        if (this.input.consumeCommand()) run.castUltimate();
        run.step(dt);
      },
      exit: () => {
        this.input.reset();
      },
    });
    f.register('INTERMISSION', {
      enter: () => {
        const r = this.run!;
        this.inter.render(r.stageNumber, r.kills, r.level);
        this.inter.show();
        this.audio.setMusic({ theme: 'intermission' });
      },
      exit: () => this.inter.hide(),
    });
    f.register('RUN_END', {
      enter: () => {
        this.hud.show(false);
        this.view?.freeze();
        this.picker.hide();
        this.resultCard.hide();
        this.loop.release('result');
        this.closePause();
        if (this.lastEnd) this.end.render(this.lastEnd, this.d.tuneUi ? this.run?.seed : undefined);
        this.end.show();
        this.audio.setMusic({ theme: 'title' });
      },
      exit: () => this.end.hide(),
    });
    f.register('META_SHOP', {});
  }

  private startRun(): void {
    this.disposeRun();
    this.d.backdrop.visible = false;
    this.renderer.rig.reset();
    const seed = subSeed(this.d.seed, this.runIndex++);
    this.run = new Run({ seed, yokaiId: this.selectedYokai, mobile: this.d.mobile, bus: this.b, meritStat: 0 });
    this.view = new RunView(this.run, this.renderer);
    this.lastKills = 0;
    this.lastXp = 0;
    this.lastHead = this.run.feed.head;
    this.renderer.precompile();
  }

  private disposeRun(): void {
    this.view?.dispose();
    this.view = null;
    this.run = null;
    this.d.backdrop.visible = true;
    this.hud.show(false);
  }

  // ── 事件 ──
  private wireEvents(): void {
    const b = this.b;
    b.on('elementResult', () => {
      const run = this.run;
      if (!run || !run.elementResult) return;
      this.loop.hold('result');
      // 同時有待選的升級：先看結果卡，關掉後再選卡（D36）
      if (this.picker.visible) this.picker.hide();
      this.resultCard.render(run.elementResult, run.cardCounts);
      this.resultCard.open();
      this.audio.sfx('cardFlip', ['common', 'rare', 'epic', 'legend'].indexOf(run.elementResult.rarity));
    });
    b.on('levelUp', () => {
      const run = this.run;
      if (!run || !run.offer) return;
      this.loop.hold('levelup');
      if (this.resultCard.visible) return; // 結果卡關掉後才開選卡
      this.picker.render(run.offer, run.picksLeft, run.offerKind, this.pickerCtx(run));
      this.picker.show();
      this.audio.sfx('levelUp');
    });
    b.on('stageStart', () => {
      this.audio.sfx('waveStart');
      // 換關：地圖不同，3D 外觀整個重建（第一關的外觀在 startRun 建）
      if (this.view && this.run) {
        this.view.dispose();
        this.view = new RunView(this.run, this.renderer);
        this.lastHead = this.run.feed.head;
        this.renderer.precompile();
      }
    });
    b.on('stageClear', ({ last }) => {
      this.audio.sfx('waveEnd');
      if (!last) this.go('INTERMISSION');
    });
    b.on('bossDown', () => this.audio.sfx('levelUp'));
    b.on('playerHurt', () => this.audio.sfx('hurt'));
    b.on('runEnd', (e) => {
      this.lastEnd = { result: e.result, stage: e.stage, kills: e.kills, level: e.level, merit: e.merit };
      this.save.merit += e.merit;
      this.save.stats.runs++;
      this.save.stats.bestStage = Math.max(this.save.stats.bestStage, e.stage);
      writeSave(this.save);
      if (e.result === 'death') this.audio.sfx('death');
      this.go('RUN_END');
    });
  }

  /** 選卡面板要用的玩家狀態 */
  private pickerCtx(run: Run): PickerContext {
    return { yokai: run.yokai.id, counts: run.cardCounts, fused: run.fused, techs: run.tech.owned, techLevels: run.tech.levels, techMode: run.techMode };
  }

  private pickCard(i: number): void {
    const run = this.run;
    if (!run || !run.offer) return;
    this.audio.sfx('cardFlip', ['common', 'rare', 'epic', 'legend'].indexOf(run.offer[i]?.rarity ?? 'common'));
    const more = run.chooseCard(i);
    if (more && run.offer) {
      this.picker.render(run.offer, run.picksLeft, run.offerKind, this.pickerCtx(run));
    } else {
      this.picker.hide();
      this.loop.release('levelup');
    }
  }

  private closeResult(): void {
    const run = this.run;
    run?.dismissResult();
    this.resultCard.hide();
    this.loop.release('result');
    if (run && run.offer) {
      this.picker.render(run.offer, run.picksLeft, run.offerKind, this.pickerCtx(run));
      this.picker.show();
    }
  }

  // ── 暫停 ──
  private openPause(): void {
    if (this.fsm.state !== 'COMBAT' || this.picker.visible || this.resultCard.visible) return;
    this.loop.hold('user');
    if (this.run) this.pause.render(summarizeBuild(this.run));
    this.pause.show();
  }

  private closePause(): void {
    this.loop.release('user');
    this.loop.release('hidden');
    this.pause.hide();
  }

  private togglePause(): void {
    if (this.pause.visible) this.closePause();
    else this.openPause();
  }

  private quitRun(): void {
    this.closePause();
    this.picker.hide();
    this.resultCard.hide();
    this.loop.release('result');
    this.loop.release('levelup');
    this.run?.abandon();
  }

  // ── 每個畫面幀 ──
  /** forceDt：測試用，用指定的秒數當這一幀的 dt（讓鏡頭一次追上，不受無頭瀏覽器低幀率影響） */
  frame(forceDt?: number): void {
    const now = performance.now();
    const dt = forceDt ?? (this.lastFrameMs === 0 ? 0 : Math.min(0.1, (now - this.lastFrameMs) / 1000));
    this.lastFrameMs = now;
    this.time += this.loop.paused ? 0 : dt;
    const run = this.run;
    if (run && this.view && this.fsm.state !== 'RUN_END') {
      // 轉視角（只在沒有被暫停或選卡擋住時）：拖曳與 Q／E 鍵
      if (!this.loop.paused && this.fsm.state === 'COMBAT') {
        this.input.consumeLook(this.lookOut);
        this.renderer.rig.rotate(this.lookOut[0] + this.input.rotateKey * CAMERA.keySpeed * dt, this.lookOut[1]);
      } else this.input.consumeLook(this.lookOut);
      this.view.update(dt, this.time);
      this.hud.update(run, this.renderer.rig.yaw);
      // 音效（節流在 audio 內）
      if (run.feed.head !== this.lastHead) {
        this.audio.sfx('hit');
        this.lastHead = run.feed.head;
      }
      if (run.kills !== this.lastKills) {
        this.audio.sfx('enemyDown');
        this.lastKills = run.kills;
      }
      if (run.xp !== this.lastXp) {
        this.audio.sfx('pickup');
        this.lastXp = run.xp;
      }
    }
  }

  /** 開發介面用：目前畫面上看得到的畫面名稱 */
  get screens(): string[] {
    return [...this.d.ui.querySelectorAll<HTMLElement>('[data-screen]')]
      .filter((el) => !el.classList.contains('hidden'))
      .map((el) => el.dataset.screen!);
  }

  get tuningInfo() {
    return { ...tuning };
  }

  reloadSave(): SaveData {
    return loadSave();
  }
}
