import './ui/theme.css';
import { bus } from './core/bus';
import { FixedLoop } from './core/loop';
import { Renderer } from './core/renderer';
import { loadSave, writeSave } from './core/save';
import { GameStateMachine } from './game/stateMachine';
import { SIMULATED_STATES } from './game/states';
import { t } from './i18n';
import { buildMenu, toast } from './ui/menu';
import { buildStage } from './world/stage';

/** 開發工具（__game）只在開發模式與測試頁（build:single）帶上；主網址與正式 build 不帶 */
const DEV_TOOLS = import.meta.env.DEV || import.meta.env.MODE === 'single';

function pickSeed(): number {
  const q = new URLSearchParams(location.search).get('seed');
  if (q && /^\d+$/.test(q)) return Number(q) >>> 0;
  return Date.now() >>> 0;
}

function boot(): void {
  const app = document.getElementById('app')!;
  const ui = document.getElementById('ui')!;
  const seed = pickSeed();
  const save = loadSave();

  const fsm = new GameStateMachine(bus);
  const renderer = new Renderer(app);
  const { lantern } = buildStage(renderer.scene);

  let time = 0;
  const loop = new FixedLoop(
    (dt) => {
      time += dt;
      fsm.update(dt);
      lantern.position.y = Math.sin(time * 2) * 0.08;
      renderer.follow(lantern.position.x, lantern.position.z, dt);
    },
    () => renderer.render(),
  );

  bus.on('saveFailed', () => toast(t('save.failed')));

  // 分頁失焦：只在模擬中的狀態自動暫停（docs/06 第 5 節）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && SIMULATED_STATES.includes(fsm.state) && !loop.paused) {
      loop.paused = true;
      bus.emit('paused', { paused: true, reason: 'hidden' });
    }
  });

  buildMenu(
    ui,
    () => toast(t('menu.notReady')),
    () => toast(t('menu.notReady')),
  );

  if (DEV_TOOLS) {
    void import('./dev/devApi').then((m) => m.installDevApi({ loop, fsm, seed }));
  }

  writeSave(save);
  fsm.go('MENU');
  const tick = (now: number) => {
    loop.frame(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot();
