// A DJ. Stands at one booth for the day; the booth's music only plays while the
// DJ is actually there (booth.hasDj). Walks in at opening, home at last call.
// Faster on a path like everyone else.

import { stepToward, rand, type Vec } from '../vec.js';
import { PATH } from '../../config.js';
import type { World } from '../world.js';
import type { DjObj } from '../djs.js';

export type DjStaffState = 'arriving' | 'working' | 'leaving';

export class DjStaff {
  readonly id: number;
  pos: Vec;
  bob: number;
  booth: DjObj;

  private state: DjStaffState = 'arriving';
  private readonly speed = rand(1.4, 2.0);
  private pathMult = 1;

  constructor(id: number, entrance: Vec, booth: DjObj) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.booth = booth;
    this.bob = rand(0, Math.PI * 2);
  }

  get moving(): boolean {
    return this.state !== 'working';
  }

  get goingHome(): boolean {
    return this.state === 'leaving';
  }

  sendHome(): void {
    if (this.state !== 'leaving') this.state = 'leaving';
  }

  private spot(): Vec {
    return { x: this.booth.pos.x, y: this.booth.pos.y + 16 };
  }

  tick(w: World): boolean {
    this.pathMult = w.paths.onPath(this.pos) ? PATH.onSpeedMult : PATH.offSpeedMult;
    switch (this.state) {
      case 'arriving':
        if (this.moveTo(this.spot())) this.state = 'working';
        break;
      case 'working':
        this.moveTo(this.spot());
        break;
      case 'leaving':
        if (this.moveTo(w.places.entrance)) { this.booth.hasDj = false; return false; }
        break;
    }
    // The music only plays while the DJ is in position at the booth.
    this.booth.hasDj = this.state === 'working';
    this.bob += 0.2;
    return true;
  }

  private moveTo(target: Vec): boolean {
    const r = stepToward(this.pos, target, this.speed * this.pathMult);
    this.pos = r.pos;
    return r.arrived;
  }
}
