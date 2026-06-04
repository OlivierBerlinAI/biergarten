// A pretzel seller (Brezelverkäufer). Stands at one stand for the day serving
// the queue, walks in at opening and home at last call. Like everyone, they
// occasionally need the toilet — they break off, queue at the nearest WC, and
// come back (their stand pauses while they're away). Faster on a path.

import { stepToward, rand, clamp, type Vec } from '../vec.js';
import { STAFF, TOILET, PATH } from '../../config.js';
import type { World } from '../world.js';
import type { Stand } from '../stands.js';
import type { Stall } from '../toilets.js';

export type SellerState = 'arriving' | 'working' | 'toToilet' | 'inToilet' | 'leaving';

export class PretzelSeller {
  readonly id: number;
  pos: Vec;
  bob: number;
  stand: Stand;

  private state: SellerState = 'arriving';
  private readonly speed = rand(1.4, 2.0);
  private pathMult = 1;
  private _bladder = rand(0, 30);
  private readonly bladderRate = rand(STAFF.bladderRateMin, STAFF.bladderRateMax);
  private toiletDuration = 1;
  private waitTimer = 0;
  private toiletStall: Stall | null = null;

  constructor(id: number, entrance: Vec, stand: Stand) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.stand = stand;
    this.bob = rand(0, Math.PI * 2);
  }

  /** A stand sells only while its seller is standing at the counter. */
  get atCounter(): boolean {
    return this.state === 'working';
  }

  get moving(): boolean {
    return this.state !== 'working' && this.state !== 'inToilet';
  }

  get goingHome(): boolean {
    return this.state === 'leaving';
  }

  sendHome(): void {
    if (this.state !== 'leaving') this.state = 'leaving';
  }

  tick(w: World): boolean {
    this.pathMult = w.paths.onPath(this.pos) ? PATH.onSpeedMult : PATH.offSpeedMult;
    switch (this.state) {
      case 'arriving':
        if (this.moveTo(w.stands.sellerSpot(this.stand))) this.state = 'working';
        break;
      case 'working':
        this.moveTo(w.stands.sellerSpot(this.stand)); // settle onto the spot
        if (this.needsToilet(w)) this.state = 'toToilet';
        break;
      case 'toToilet': {
        if (!w.toilets.has(this) && !w.toilets.join(this, this.pos)) {
          this._bladder = 0;
          this.state = 'arriving';
          break;
        }
        const atSpot = this.moveTo(w.toilets.positionOf(this));
        if (atSpot && w.toilets.atStallFront(this)) {
          this.toiletStall = w.toilets.enter(this);
          this.toiletDuration = Math.floor(rand(STAFF.toiletMin, STAFF.toiletMax));
          this.waitTimer = this.toiletDuration;
          this.state = 'inToilet';
        }
        break;
      }
      case 'inToilet': {
        if (this.toiletStall) w.toilets.soilStall(this.toiletStall, TOILET.dirtPerUse / this.toiletDuration);
        this.waitTimer--;
        if (this.toiletStall) w.toilets.setProgress(this.toiletStall, 1 - this.waitTimer / this.toiletDuration);
        if (this.waitTimer <= 0) {
          this._bladder = 0;
          w.toilets.leave(this);
          this.toiletStall = null;
          this.state = 'arriving'; // walk back to the stand
        }
        break;
      }
      case 'leaving':
        w.toilets.leave(this);
        if (this.moveTo(w.places.entrance)) return false; // home -> despawn
        break;
    }
    this.bob += 0.2;
    return true;
  }

  private needsToilet(w: World): boolean {
    this._bladder = clamp(this._bladder + this.bladderRate, 0, 100);
    return this._bladder >= STAFF.bladderToilet && w.toilets.count > 0;
  }

  private moveTo(target: Vec): boolean {
    const r = stepToward(this.pos, target, this.speed * this.pathMult);
    this.pos = r.pos;
    return r.arrived;
  }
}
