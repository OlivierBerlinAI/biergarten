// 🍺 Frontend entry point. Wires the pure backend (Game) to the Paper.js
// renderer + DOM UI, and runs the render loop: each animation frame advances
// the simulation by `speed` ticks (1×/2×/4×/8×), then draws the current state.

import paper from './scope.js';
import { WORLD } from './config.js';
import { Game } from './sim/game.js';
import { Scenery } from './view/scenery.js';
import { Renderer } from './view/renderer.js';
import { Hud } from './view/hud.js';
import { Controls, type ViewActions } from './view/controls.js';
import { Placement } from './view/placement.js';
import { SoundEngine } from './view/sound.js';
import { LogView } from './view/logview.js';
import { GuestsPanel } from './view/guests.js';

window.onload = (): void => {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  paper.setup(canvas);

  const game = new Game();
  new Scenery(); // static backdrop, drawn first (bottom)
  const renderer = new Renderer();
  const sound = new SoundEngine();
  const hud = new Hud();
  const guests = new GuestsPanel(renderer);
  const logview = new LogView((id) => guests.openFor(id));

  let speed = 1;
  let paused = false;
  let started = false; // the start dialog gates the simulation until a mode is picked
  let outcomeShown = false;
  let baseZoom = 1;
  let followId: number | null = null;
  let demolishOn = false;
  const stopFollow = (): void => { followId = null; };

  // Clicking a guest in the world: follow them and open their panel, zoomed in.
  const placement = new Placement(
    game,
    renderer,
    (id) => {
      followId = id;
      guests.openFor(id);
      paper.view.zoom = Math.max(baseZoom, Math.min(baseZoom * 8, baseZoom * 2.6));
    },
    () => document.getElementById('pretzelwin')?.classList.remove('hidden'),
  );

  const actions: ViewActions = {
    beginPlace: (k) => { demolishOn = false; placement.begin(k); },
    cancelPlace: () => placement.cancel(),
    setSpeed: (m) => {
      speed = m;
      paused = false;
      const pb = document.getElementById('btn-pause');
      if (pb) pb.textContent = '⏸';
    },
    getSpeed: () => (paused ? 0 : speed),
    togglePause: () => {
      paused = !paused;
      return paused;
    },
    toggleDemolish: () => {
      demolishOn = !demolishOn;
      placement.setDemolish(demolishOn);
      return demolishOn;
    },
    isDemolish: () => demolishOn,
  };
  const controls = new Controls(game, sound, actions);

  fitWorld();
  paper.view.onResize = fitWorld;
  enableZoomPan();

  // Right-click ends building / demolishing (and suppresses the context menu).
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    placement.cancel();
    if (demolishOn) {
      demolishOn = false;
      placement.setDemolish(false);
    }
  });

  // Start dialog: pick "basics" (the pre-built garden) or a blank field.
  const startWin = document.getElementById('startwin');
  const beginGame = (blank: boolean): void => {
    if (blank) game.makeBlank();
    started = true;
    startWin?.classList.add('hidden');
  };
  document.getElementById('btn-start-basics')?.addEventListener('click', () => beginGame(false));
  document.getElementById('btn-start-blank')?.addEventListener('click', () => beginGame(true));
  document.getElementById('btn-restart')?.addEventListener('click', () => location.reload());
  document.getElementById('btn-game-restart')?.addEventListener('click', () => location.reload());

  paper.view.onFrame = (): void => {
    if (started && !paused && !game.ended) {
      for (let i = 0; i < speed; i++) game.tick();
    }
    // Play (deduped) sound effects the backend queued this frame.
    for (const s of new Set(game.drainSounds())) sound.play(s);
    // Drain debug-log entries into the log + guests windows.
    const logs = game.drainLogs();
    logview.append(logs);
    guests.ingest(logs);
    guests.update(game.people);

    // Float money deltas above the clock: expenses (money/staff logs) and income.
    for (const e of logs) {
      if ((e.cat === 'money' || e.cat === 'staff') && e.delta) {
        const reason = e.msg.split(/[:(→]/)[0]!.trim(); // short reason before any detail
        hud.popMoney(e.delta, reason);
      }
    }
    if (game.pendingIncomePop > 0) {
      hud.popMoney(game.pendingIncomePop, 'Einnahmen');
      game.pendingIncomePop = 0;
    }

    const agg = game.aggregates();
    renderer.sync(game);
    hud.render(game.eco, agg);
    controls.update();

    // Keep the camera locked on the followed guest until they leave (or the
    // player pans/zooms away, which clears the follow).
    if (followId !== null) {
      const p = game.people.find((x) => x.id === followId);
      if (p) paper.view.center = new paper.Point(p.pos.x, p.pos.y);
      else followId = null;
    }

    if (game.ended && game.outcome && !outcomeShown) {
      outcomeShown = true;
      hud.showOutcome(game.outcome);
    }
  };

  function fitWorld(): void {
    const { width: vw, height: vh } = paper.view.viewSize;
    baseZoom = Math.min(vw / WORLD.w, vh / WORLD.h);
    paper.view.zoom = baseZoom;
    paper.view.center = new paper.Point(WORLD.w / 2, WORLD.h / 2);
  }

  /** Scroll wheel zooms toward the cursor; holding the middle button pans. */
  function enableZoomPan(): void {
    canvas.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        stopFollow();
        const rect = canvas.getBoundingClientRect();
        const mouse = new paper.Point(e.clientX - rect.left, e.clientY - rect.top);
        const before = paper.view.viewToProject(mouse);
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        // Allow three steps further out than fit-to-screen, and a good way in.
        const minZoom = baseZoom / Math.pow(1.1, 3);
        paper.view.zoom = Math.max(minZoom, Math.min(baseZoom * 8, paper.view.zoom * factor));
        const after = paper.view.viewToProject(mouse);
        paper.view.center = paper.view.center.add(before.subtract(after));
      },
      { passive: false },
    );

    let panning = false;
    let last: paper.Point | null = null;
    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 1) return; // middle button only
      panning = true;
      stopFollow();
      last = new paper.Point(e.clientX, e.clientY);
      e.preventDefault(); // suppress the browser's middle-click autoscroll
    });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!panning || !last) return;
      const cur = new paper.Point(e.clientX, e.clientY);
      paper.view.center = paper.view.center.subtract(cur.subtract(last).divide(paper.view.zoom));
      last = cur;
    });
    const stop = (e: MouseEvent): void => {
      if (e.button === 1) panning = false;
    };
    window.addEventListener('mouseup', stop);
  }
};
