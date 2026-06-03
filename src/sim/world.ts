// What an entity is allowed to see of the simulation while ticking. Game
// implements this; using an interface keeps entities free of a hard dependency
// on Game and avoids runtime import cycles.

import type { Vec } from './vec.js';
import type { Seating } from './seating.js';
import type { LitterField } from './litter.js';
import type { GameState } from './economy.js';
import type { SfxName } from './sound.js';
import type { Dog } from './entities/dog.js';

export interface Places {
  entrance: Vec;
  bar: Vec;
  toilet: Vec;
}

export interface World {
  readonly places: Places;
  readonly seating: Seating;
  readonly litter: LitterField;
  readonly eco: GameState;
  play(name: SfxName): void;
  nearestDog(from: Vec): Dog | null;
  catchDog(dog: Dog): void;
}
