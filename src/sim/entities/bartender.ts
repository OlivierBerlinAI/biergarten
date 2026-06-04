// A bartender (Schankkraft). Assigned to a tap for the day they walk in, stand
// at the counter pouring for the queue, and head home in the evening. A bartender
// with no free tap to work just loafs about — petting dogs, admiring the flowers,
// checking the beer tank or wandering — until a tap frees up. Everyone needs the
// loo now and then. Pure state machine.

import { stepToward, rand, clamp, dist, type Vec } from '../vec.js';
import { STAFF, TOILET, PATH } from '../../config.js';
import type { World } from '../world.js';
import type { Ausschank } from '../bar.js';
import type { Stall } from '../toilets.js';
import type { Dog } from './dog.js';

export type BartenderState = 'arriving' | 'working' | 'idle' | 'toToilet' | 'inToilet' | 'leaving';

export class Bartender {
  readonly id: number;
  pos: Vec;
  bob: number;
  /** The tap this bartender works, or null when there's no tap to staff (idle). */
  building: Ausschank | null;
  tapIndex: number;

  private state: BartenderState;
  private readonly speed = rand(1.6, 2.2);
  private _bladder = rand(0, 30);
  private readonly bladderRate = rand(STAFF.bladderRateMin, STAFF.bladderRateMax);
  private toiletDuration = 1;
  private waitTimer = 0;
  private toiletStall: Stall | null = null;
  private idleTarget: Vec | null = null;
  private idleDog: Dog | null = null;
  private idlePause = 0;
  private pathMult = 1;

  constructor(id: number, entrance: Vec, building: Ausschank | null, tapIndex: number) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.building = building;
    this.tapIndex = tapIndex;
    this.bob = rand(0, Math.PI * 2);
    this.state = 'arriving';
  }

  /** A tap pours only while its bartender is actually standing at the counter. */
  get atCounter(): boolean {
    return this.state === 'working';
  }

  get moving(): boolean {
    return this.state !== 'working' && this.state !== 'inToilet';
  }

  get goingHome(): boolean {
    return this.state === 'leaving';
  }

  /** Loafing about with no tap (a free tap can be handed to them). */
  get isIdle(): boolean {
    return this.building === null && this.state !== 'leaving';
  }

  /** Put an idle bartender onto a freshly opened tap. */
  assignTap(building: Ausschank, tapIndex: number): void {
    this.building = building;
    this.tapIndex = tapIndex;
    this.idleTarget = null;
    if (this.state === 'idle') this.state = 'arriving';
  }

  sendHome(): void {
    if (this.state !== 'leaving') this.state = 'leaving';
  }

  /** Their bar was torn down — become an idle, loafing bartender. */
  unassign(): void {
    this.building = null;
    this.tapIndex = -1;
    if (this.state !== 'leaving') this.state = 'idle';
  }

  tick(w: World): boolean {
    this.pathMult = w.paths.onPath(this.pos) ? PATH.onSpeedMult : PATH.offSpeedMult;
    switch (this.state) {
      case 'arriving': {
        if (!this.building) { this.state = 'idle'; break; }
        if (this.moveTo(w.bar.attendantSpot(this.building, this.tapIndex))) this.state = 'working';
        break;
      }
      case 'working': {
        this.moveTo(w.bar.attendantSpot(this.building!, this.tapIndex)); // settle onto the spot
        if (this.needsToilet(w)) this.state = 'toToilet';
        break;
      }
      case 'idle': {
        if (this.needsToilet(w)) { this.state = 'toToilet'; break; }
        if (this.idlePause > 0) { this.idlePause--; break; }
        if (this.idleDog) {
          // Chase the dog down, then pet it — it holds still while petted.
          if (this.moveTo(this.idleDog.pos) || dist(this.pos, this.idleDog.pos) < 24) {
            const dur = Math.floor(rand(60, 150));
            this.idleDog.pet(dur);
            this.idlePause = dur; // the bartender stays to pet it
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
          this.state = this.building ? 'arriving' : 'idle';
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
          this.state = this.building ? 'arriving' : 'idle';
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
