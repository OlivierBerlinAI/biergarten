// The Hundefänger. Pure: walks in, chases the nearest dog (a touch faster than
// they run), catches it, then leaves once the dogs are gone.

import { stepToward, dist, rand, type Vec } from '../vec.js';
import { DOGCATCHER } from '../../config.js';
import type { World } from '../world.js';

export class Dogcatcher {
  readonly id: number;
  pos: Vec;
  bob: number;

  private state: 'chasing' | 'leaving' = 'chasing';
  private readonly speed = DOGCATCHER.speed;

  constructor(id: number, entrance: Vec) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.bob = rand(0, Math.PI * 2);
  }

  get moving(): boolean {
    return true;
  }

  tick(w: World): boolean {
    if (this.state === 'chasing') {
      const dog = w.nearestDog(this.pos);
      if (!dog) {
        this.state = 'leaving';
      } else {
        const r = stepToward(this.pos, dog.pos, this.speed);
        this.pos = r.pos;
        if (dist(this.pos, dog.pos) < DOGCATCHER.catchRadius) w.catchDog(dog);
      }
    } else {
      const r = stepToward(this.pos, w.places.entrance, this.speed);
      this.pos = r.pos;
      if (r.arrived) {
        this.bob += 0.25;
        return false; // reached the exit -> despawn
      }
    }
    this.bob += 0.25;
    return true;
  }
}
