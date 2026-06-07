// A Gärtner (gardener). Walks to the most-wilted plant, waters it back to lush,
// and moves on. Comes in at opening, goes home at last call. The view draws the
// green hat. Pure state machine.

import { stepToward, rand, clamp, type Vec } from '../vec.js';
import { WORLD, DECO, PATH } from '../../config.js';
import type { DecoItem } from '../deco.js';
import type { World } from '../world.js';

type GardenerState = 'idle' | 'roaming' | 'toPlant' | 'watering' | 'replacing' | 'goHome';

export class Gardener {
  readonly id: number;
  pos: Vec;
  bob: number;

  private state: GardenerState = 'idle';
  private readonly speed = rand(1.0, 1.4);
  private target: DecoItem | null = null;
  private replantTimer = 0;
  private wander: Vec;
  private pathMult = 1;

  constructor(id: number, entrance: Vec) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.wander = Gardener.randomSpot();
    this.bob = rand(0, Math.PI * 2);
  }

  get moving(): boolean {
    return this.state !== 'watering' && this.state !== 'replacing';
  }

  get goingHome(): boolean {
    return this.state === 'goHome';
  }

  sendHome(): void {
    if (this.state !== 'goHome') {
      this.target = null;
      this.state = 'goHome';
    }
  }

  tick(w: World): boolean {
    this.pathMult = w.paths.onPath(this.pos) ? PATH.onSpeedMult : PATH.offSpeedMult;
    switch (this.state) {
      case 'idle': {
        // First save a wilting plant; only then (if auto-replace is on and we can
        // afford it) head for a dead one to tear out and replant.
        const thirsty = w.deco.thirstiest();
        const dead = !thirsty && w.deco.autoReplace ? w.deco.firstDead() : null;
        const t = thirsty ?? (dead && w.eco.canAfford(w.eco.plantCost(dead.kind)) ? dead : null);
        if (t && rand(0, 1) < DECO.gardenerWanderChance) {
          // Now and then, take a detour to a random spot before tending a plant.
          this.wander = Gardener.randomSpot();
          this.state = 'roaming';
        } else if (t) {
          this.target = t;
          this.state = 'toPlant';
        } else if (this.moveTo(this.wander, this.speed * 0.5)) {
          this.wander = Gardener.randomSpot();
        }
        break;
      }
      case 'roaming':
        if (this.moveTo(this.wander, this.speed)) this.state = 'idle';
        break;
      case 'toPlant': {
        const t = this.target;
        if (!t || !w.deco.list.includes(t)) {
          this.target = null;
          this.state = 'idle';
          break;
        }
        if (this.moveTo(t.pos, this.speed)) {
          // Arrived. A plant that died on the way can't be watered — replant it if
          // that mode is on and we can pay, otherwise drop it and move on (no more
          // standing forever over a corpse).
          if (t.dead) {
            if (w.deco.autoReplace && w.eco.canAfford(w.eco.plantCost(t.kind))) {
              this.replantTimer = DECO.replantFrames;
              this.state = 'replacing';
            } else {
              this.target = null;
              this.state = 'idle';
            }
          } else {
            this.state = 'watering';
          }
        }
        break;
      }
      case 'watering': {
        const t = this.target;
        if (!t || !w.deco.list.includes(t) || t.dead) {
          this.target = null;
          this.state = 'idle';
          break;
        }
        w.deco.water(t, DECO.waterPerFrame);
        if (t.condition >= 100) {
          this.target = null;
          this.state = 'idle';
        }
        break;
      }
      case 'replacing': {
        const t = this.target;
        if (!t || !w.deco.list.includes(t) || !t.dead) {
          this.target = null;
          this.state = 'idle';
          break;
        }
        if (--this.replantTimer <= 0) {
          // Tear out the dead plant and pay for a fresh one of the same kind in its spot.
          const cost = w.eco.plantCost(t.kind);
          if (w.eco.spend(cost)) {
            const { pos, kind } = t;
            w.deco.remove(t.id);
            w.deco.add(pos, kind);
            w.log('money', `Gärtner ersetzt eine tote Pflanze`, -cost);
          }
          this.target = null;
          this.state = 'idle';
        }
        break;
      }
      case 'goHome':
        return !this.moveTo(w.places.entrance, this.speed);
    }
    this.bob += 0.2;
    return true;
  }

  private moveTo(target: Vec, speed: number): boolean {
    const r = stepToward(this.pos, target, speed * this.pathMult);
    this.pos = r.pos;
    return r.arrived;
  }

  private static randomSpot(): Vec {
    return { x: clamp(rand(120, WORLD.w - 120), 0, WORLD.w), y: clamp(rand(220, WORLD.h - 120), 0, WORLD.h) };
  }
}
