// What an entity is allowed to see of the simulation while ticking. Game
// implements this; using an interface keeps entities free of a hard dependency
// on Game and avoids runtime import cycles.

import type { Vec } from './vec.js';
import type { Seating } from './seating.js';
import type { Stands } from './stands.js';
import type { Toilets } from './toilets.js';
import type { Tanks } from './tanks.js';
import type { Deco } from './deco.js';
import type { DJs } from './djs.js';
import type { Paths } from './paths.js';
import type { LitterField } from './litter.js';
import type { Bar } from './bar.js';
import type { GameState } from './economy.js';
import type { SfxName } from './sound.js';
import type { LogCat } from './log.js';
import type { Dog } from './entities/dog.js';

export interface Places {
  entrance: Vec;
  bar: Vec;
  toilet: Vec;
}

export interface World {
  readonly places: Places;
  readonly seating: Seating;
  readonly stands: Stands;
  readonly toilets: Toilets;
  readonly tanks: Tanks;
  readonly deco: Deco;
  readonly djs: DJs;
  readonly paths: Paths;
  readonly litter: LitterField;
  readonly bar: Bar;
  readonly eco: GameState;
  /** True when a guest can actually get a pretzel: a stand exists and stock > 0. */
  foodAvailable(): boolean;
  play(name: SfxName): void;
  /** Record a debugging event (drained by the on-screen log window). */
  log(cat: LogCat, msg: string, delta?: number, who?: number): void;
  nearestDog(from: Vec): Dog | null;
  catchDog(dog: Dog): void;
}
