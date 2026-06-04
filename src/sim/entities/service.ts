// A Servicekraft: one merged front-of-house worker that can pour beer at a tap
// OR sell pretzels at a stand, switching to whatever Game decides is most needed
// right now (see Game.allocateService). With no post to work they loaf about —
// petting dogs, admiring the flowers, checking the beer tank — and everyone needs
// the loo now and then. Pure state machine; merges the old Bartender + Seller.

import { stepToward, rand, clamp, dist, type Vec } from '../vec.js';
import { STAFF, TOILET, PATH } from '../../config.js';
import type { World } from '../world.js';
import type { Ausschank } from '../bar.js';
import type { Stand } from '../stands.js';
import type { Stall } from '../toilets.js';
import type { Dog } from './dog.js';

/** Where a Servicekraft is currently posted (null = idle / loafing). */
export type ServiceAssignment =
  | { kind: 'tap'; building: Ausschank; index: number }
  | { kind: 'stand'; stand: Stand };

export type ServiceState = 'arriving' | 'working' | 'idle' | 'toToilet' | 'inToilet' | 'leaving';

export class ServiceStaff {
  readonly id: number;
  pos: Vec;
  bob: number;
  /** Current post (tap or stand), or null when there's nothing to staff. */
  assignment: ServiceAssignment | null = null;

  private state: ServiceState = 'idle';
  private readonly speed = rand(1.5, 2.1);
  private _bladder = rand(0, 30);
  private readonly bladderRate = rand(STAFF.bladderRateMin, STAFF.bladderRateMax);
  private toiletDuration = 1;
  private waitTimer = 0;
  private toiletStall: Stall | null = null;
  private idleTarget: Vec | null = null;
  private idleDog: Dog | null = null;
  private idlePause = 0;
  private pathMult = 1;

  constructor(id: number, entrance: Vec) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.bob = rand(0, Math.PI * 2);
  }

  /** A post serves only while its worker is actually standing at the counter. */
  get atCounter(): boolean {
    return this.state === 'working';
  }

  get moving(): boolean {
    return this.state !== 'working' && this.state !== 'inToilet';
  }

  get goingHome(): boolean {
    return this.state === 'leaving';
  }

  /** Loafing about with no post (Game can hand them one). */
  get isIdle(): boolean {
    return this.assignment === null && this.state !== 'leaving';
  }

  /** (Re)assign to a tap, a stand, or nothing. Walks to the new post. */
  assignTo(a: ServiceAssignment | null): void {
    if (this.sameAssignment(a)) return; // already there — don't restart the walk
    this.assignment = a;
    this.idleTarget = null;
    this.idleDog = null;
    this.idlePause = 0;
    // Mid-toilet / leaving: let that finish; it picks the post back up afterwards.
    if (this.state === 'leaving' || this.state === 'toToilet' || this.state === 'inToilet') return;
    this.state = a ? 'arriving' : 'idle';
  }

  sendHome(): void {
    if (this.state !== 'leaving') this.state = 'leaving';
  }

  tick(w: World): boolean {
    this.pathMult = w.paths.onPath(this.pos) ? PATH.onSpeedMult : PATH.offSpeedMult;
    switch (this.state) {
      case 'arriving': {
        const spot = this.workSpot(w);
        if (!spot) { this.state = 'idle'; break; }
        if (this.moveTo(spot)) this.state = 'working';
        break;
      }
      case 'working': {
        const spot = this.workSpot(w);
        if (!spot) { this.state = 'idle'; break; } // post vanished (reassigned/torn down)
        this.moveTo(spot); // settle onto the spot
        if (this.needsToilet(w)) this.state = 'toToilet';
        break;
      }
      case 'idle': {
        if (this.assignment) { this.state = 'arriving'; break; }
        if (this.needsToilet(w)) { this.state = 'toToilet'; break; }
        if (this.idlePause > 0) { this.idlePause--; break; }
        if (this.idleDog) {
          if (this.moveTo(this.idleDog.pos) || dist(this.pos, this.idleDog.pos) < 24) {
            const dur = Math.floor(rand(60, 150));
            this.idleDog.pet(dur);
            this.idlePause = dur;
            this.idleDog = null;
            this.idleTarget = null;
          }
        } else if (this.idleTarget) {
          if (this.moveTo(this.idleTarget)) { this.idleTarget = null; this.idlePause = Math.floor(rand(40, 150)); }
        } else {
          this.chooseIdle(w);
        }
        break;
      }
      case 'toToilet': {
        if (!w.toilets.has(this) && !w.toilets.join(this, this.pos)) {
          this._bladder = 0;
          this.state = this.assignment ? 'arriving' : 'idle';
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
          this.state = this.assignment ? 'arriving' : 'idle';
        }
        break;
      }
      case 'leaving': {
        w.toilets.leave(this);
        if (this.moveTo(w.places.entrance)) return false;
        break;
      }
    }
    this.bob += 0.2;
    return true;
  }

  private workSpot(w: World): Vec | null {
    const a = this.assignment;
    if (!a) return null;
    return a.kind === 'tap' ? w.bar.attendantSpot(a.building, a.index) : w.stands.sellerSpot(a.stand);
  }

  private sameAssignment(a: ServiceAssignment | null): boolean {
    const c = this.assignment;
    if (!c || !a) return c === a; // both null
    if (c.kind === 'tap' && a.kind === 'tap') return c.building === a.building && c.index === a.index;
    if (c.kind === 'stand' && a.kind === 'stand') return c.stand === a.stand;
    return false;
  }

  private needsToilet(w: World): boolean {
    this._bladder = clamp(this._bladder + this.bladderRate, 0, 100);
    return this._bladder >= STAFF.bladderToilet && w.toilets.count > 0;
  }

  /** Decide what to mosey toward while idle: a dog to pet, flowers, a tank, or random. */
  private chooseIdle(w: World): void {
    const roll = Math.random();
    if (roll < 0.3) {
      const dog = w.nearestDog(this.pos);
      if (dog) { this.idleDog = dog; return; }
    }
    if (roll < 0.55 && w.deco.list.length > 0) {
      this.idleTarget = { ...w.deco.list[Math.floor(Math.random() * w.deco.list.length)]!.pos };
      return;
    }
    if (roll < 0.78) {
      const beer = w.tanks.list.filter((t) => t.kind === 'beer');
      if (beer.length > 0) { this.idleTarget = { ...beer[Math.floor(Math.random() * beer.length)]!.pos }; return; }
    }
    this.idleTarget = { x: rand(160, 1120), y: rand(240, 640) };
  }

  private moveTo(target: Vec): boolean {
    const r = stepToward(this.pos, target, this.speed * this.pathMult);
    this.pos = r.pos;
    return r.arrived;
  }
}
