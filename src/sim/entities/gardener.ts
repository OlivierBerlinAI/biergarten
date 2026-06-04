// A Gärtner (gardener). Walks to the most-wilted plant, waters it back to lush,
// and moves on. Comes in at opening, goes home at last call. The view draws the
// green hat. Pure state machine.

import { stepToward, rand, clamp, type Vec } from '../vec.js';
import { WORLD, DECO, PATH } from '../../config.js';
import type { DecoItem } from '../deco.js';
import type { World } from '../world.js';

type GardenerState = 'idle' | 'toPlant' | 'watering' | 'goHome';

export class Gardener {
  readonly id: number;
  pos: Vec;
  bob: number;

  private state: GardenerState = 'idle';
  private readonly speed = rand(1.0, 1.4);
  private target: DecoItem | null = null;
  private wander: Vec;
  private pathMult = 1;

  constructor(id: number, entrance: Vec) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.wander = Gardener.randomSpot();
    this.bob = rand(0, Math.PI * 2);
  }

  get moving(): boolean {
    return this.state !== 'watering';
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
        const t = w.deco.thirstiest();
        if (t) {
          this.target = t;
          this.state = 'toPlant';
        } else if (this.moveTo(this.wander, this.speed * 0.5)) {
          this.wander = Gardener.randomSpot();
        }
        break;
      }
      case 'toPlant': {
        const t = this.target;
        if (!t || !w.deco.list.includes(t)) {
          this.state = 'idle';
          break;
        }
        if (this.moveTo(t.pos, this.speed)) this.state = 'watering';
        break;
      }
      case 'watering': {
        const t = this.target;
        if (!t || !w.deco.list.includes(t)) {
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
