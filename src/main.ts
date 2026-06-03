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

window.onload = (): void => {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  paper.setup(canvas);

  const game = new Game();
  new Scenery(); // static backdrop, drawn first (bottom)
  const renderer = new Renderer();
  const sound = new SoundEngine();
  const hud = new Hud();
  const placement = new Placement(game);

  let speed = 1;
  let paused = false;
  let outcomeShown = false;

  const actions: ViewActions = {
    beginPlace: (k) => placement.begin(k),
    cancelPlace: () => placement.cancel(),
    setSpeed: (m) => {
      speed = m;
      paused = false;
      const pb = document.getElementById('btn-pause');
      if (pb) pb.textContent = '⏸ Pause';
    },
    getSpeed: () => (paused ? 0 : speed),
    togglePause: () => {
      paused = !paused;
      return paused;
    },
  };
  const controls = new Controls(game, sound, actions);

  fitWorld();
  paper.view.onResize = fitWorld;

  paper.view.onFrame = (): void => {
    if (!paused && !game.ended) {
      for (let i = 0; i < speed; i++) game.tick();
    }
    // Play (deduped) sound effects the backend queued this frame.
    for (const s of new Set(game.drainSounds())) sound.play(s);

    const agg = game.aggregates();
    renderer.sync(game, agg);
    hud.render(game.eco, agg);
    controls.update();

    if (game.ended && game.outcome && !outcomeShown) {
      outcomeShown = true;
      hud.showOutcome(game.outcome);
    }
  };

  function fitWorld(): void {
    const { width: vw, height: vh } = paper.view.viewSize;
    paper.view.zoom = Math.min(vw / WORLD.w, vh / WORLD.h);
    paper.view.center = new paper.Point(WORLD.w / 2, WORLD.h / 2);
  }
};
