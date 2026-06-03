// Headless runner: drives the pure backend with no rendering and no player
// input — a simple auto-player keeps the garden stocked and staffed. Proves the
// game is fully playable without a frontend, and is the basis for test runs.
//
//   node dist/cli.js [ticks]
//
// At 60 ticks/in-game-second and 20s/hour, a full 13h day is ~15600 ticks.

import { WORLD } from './config.js';
import { Game } from './sim/game.js';

// Minimal Node typing so we don't pull @types/node into the browser build.
declare const process: { argv: string[] };

const ticks = Number(process.argv[2] ?? 15600 * 3); // ~3 in-game days by default

const game = new Game();

// A few candidate spots to drop tables on (auto-player keeps expanding seating).
const spots = [
  { x: 360, y: 300 },
  { x: 640, y: 300 },
  { x: 920, y: 300 },
  { x: 360, y: 520 },
  { x: 640, y: 520 },
  { x: 920, y: 520 },
];

function placeBench(g: Game): boolean {
  for (const u of g.seating.units) {
    if (u.kind === 'bench' && u.benches < 2 && g.canPlace('bench', u.center)) {
      g.place('bench', u.center);
      return true;
    }
  }
  return false;
}
function placeTable(g: Game): boolean {
  const spot = spots.find((p) => g.canPlace('table', p));
  return spot ? g.place('table', spot) : false;
}

function autoPlay(g: Game): void {
  const e = g.eco;
  e.setBeerPrice(5);

  // Bootstrap from an empty garden: a first table + bench and a bartender are
  // needed before beer is worth ordering.
  if (g.seating.units.length === 0) { placeTable(g); return; }
  if (g.benchBuyable() && e.canAfford(e.benchCost())) { placeBench(g); return; }
  if (e.bartenders < 1 && e.canAfford(e.bartenderHireCost())) { g.hireBartender(); return; }

  const canSell = g.seating.seatCount > 0 && e.bartenders > 0;
  if (canSell && !g.beerOrderPending() && e.beer.current < 40 && e.money > e.restockCost() + 8) g.orderBeer();
  if (e.toilet.current > e.toilet.capacity * 0.6 && e.money > e.klowagenCost() + 8 && !g.kloPending()) g.callKlowagen();

  // Grow once there's a cushion.
  if (e.bartenders < 2 && e.money > e.bartenderHireCost() + 60) g.hireBartender();
  if (g.litter.count > 4 && e.cleaners < 2 && e.money > e.cleanerHireCost() + 40) g.hireCleaner();
  if (g.seating.seatCount < 24 && g.tableBuyable() && e.money > e.tableCost() + 90) placeTable(g);
  if (g.dogs.length >= 4 && g.dogCatcherAvailable() && e.money > e.dogCatcherCost() + 20) g.callDogCatcher();
}

function pad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

console.log('tick   time   money   rep  guests dogs beer/cap  klo  sold  seats');
for (let i = 0; i < ticks && !game.ended; i++) {
  autoPlay(game);
  game.tick();
  if (i % 1200 === 0) {
    const e = game.eco;
    console.log(
      [
        pad(i, 6),
        pad(game.clock.label(), 6),
        pad(e.money.toFixed(0), 7),
        pad(e.reputation.toFixed(0), 4),
        pad(game.people.length, 6),
        pad(game.dogs.length, 4),
        `${pad(Math.round(e.beer.current), 4)}/${e.beer.capacity}`,
        pad(Math.round(e.toilet.current), 4),
        pad(e.beersSold, 5),
        pad(game.seating.seatCount, 5),
      ].join(' '),
    );
  }
}

const e = game.eco;
console.log(
  `\nDONE: outcome=${game.outcome ?? 'running'} money=${e.money.toFixed(2)} beersSold=${e.beersSold} ` +
    `reputation=${e.reputation.toFixed(1)} seats=${game.seating.seatCount} world=${WORLD.w}x${WORLD.h}`,
);
