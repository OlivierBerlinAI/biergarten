// A Putzkraft (cleaner). Patrols, walks to the nearest mess and clears it, or
// scrubs the dirtiest WC house. Like everyone they occasionally need the toilet
// (they queue at the nearest WC). They walk in at opening and head home at last
// call. The view draws the red hat.

import { stepToward, rand, clamp, type Vec } from '../vec.js';
import { WORLD, CLEANER, STAFF, TOILET, LITTER, PATH } from '../../config.js';
import type { Litter } from '../litter.js';
import type { StallRef, Stall } from '../toilets.js';
import type { World } from '../world.js';

type CleanerState =
  | 'idle'
  | 'toLitter'
  | 'cleaningLitter'
  | 'toToilet'
  | 'cleaningToilet'
  | 'breakToilet'
  | 'onToilet'
  | 'goHome';

export class Cleaner {
  readonly id: number;
  pos: Vec;
  bob: number;

  private state: CleanerState = 'idle';
  private readonly speed = rand(CLEANER.speedMin, CLEANER.speedMax);
  private target: Litter | null = null;
  private targetStall: StallRef | null = null;
  private wander: Vec;
  private cleanTimer = 0;
  private _bladder = rand(0, 30);
  private readonly bladderRate = rand(STAFF.bladderRateMin, STAFF.bladderRateMax);
  private toiletDuration = 1;
  private waitTimer = 0;
  private toiletStall: Stall | null = null;
  // Set when they reach a full WC and can't go: a malheur strikes on the way back.
  private pendingMalheur = false;
  private malheurTimer = 0;
  private pathMult = 1;

  constructor(id: number, entrance: Vec) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.wander = Cleaner.randomSpot();
    this.bob = rand(0, Math.PI * 2);
  }

  get moving(): boolean {
    return this.state !== 'cleaningLitter' && this.state !== 'cleaningToilet' && this.state !== 'onToilet';
  }

  get goingHome(): boolean {
    return this.state === 'goHome';
  }

  /** End of shift: drop whatever they're doing and walk home. */
  sendHome(w: World): void {
    if (this.state === 'goHome') return;
    if (this.target) this.target.claimed = false;
    this.target = null;
    this.releaseCleaning(w);
    w.toilets.leave(this);
    this.toiletStall = null;
    this.state = 'goHome';
  }

  /** Let go of any cabin we'd claimed for scrubbing. */
  private releaseCleaning(w: World): void {
    if (this.targetStall) {
      w.toilets.releaseCleaning(this.targetStall.house, this.targetStall.index, this);
      this.targetStall = null;
    }
  }

  tick(w: World): boolean {
    this.pathMult = w.paths.onPath(this.pos) ? PATH.onSpeedMult : PATH.offSpeedMult;
    // A malheur from a full WC catches up with them while they carry on cleaning.
    if (this.pendingMalheur && --this.malheurTimer <= 0) {
      w.litter.add(this.pos, 'pee');
      this._bladder = 0;
      this.pendingMalheur = false;
    }
    // Everyone needs the loo now and then — but not mid-clean or already going,
    // and not while a malheur is still pending (bladder hasn't let go yet).
    if (this.state !== 'goHome' && this.state !== 'breakToilet' && this.state !== 'onToilet') {
      this._bladder = clamp(this._bladder + this.bladderRate, 0, 100);
      if (!this.pendingMalheur && this._bladder >= STAFF.bladderToilet && w.toilets.count > 0) {
        if (this.target) this.target.claimed = false;
        this.target = null;
        this.releaseCleaning(w); // free any cabin we were scrubbing
        this.state = 'breakToilet';
      }
    }

    switch (this.state) {
      case 'idle': this.idle(w); break;
      case 'toLitter': this.toLitter(); break;
      case 'cleaningLitter': this.cleaningLitter(w); break;
      case 'toToilet': this.toToilet(w); break;
      case 'cleaningToilet': this.cleaningToilet(w); break;
      case 'breakToilet': this.breakToilet(w); break;
      case 'onToilet': this.onToilet(w); break;
      case 'goHome': return this.goHome(w);
    }
    this.bob += 0.2;
    return true;
  }

  /** Release any claimed pile when fired. */
  onRemove(): void {
    if (this.target) this.target.claimed = false;
  }

  private idle(w: World): void {
    if (this.grabLitter(w)) return;
    const dirty = w.toilets.dirtiestStall(TOILET.cleanThreshold);
    if (dirty) {
      this.targetStall = dirty;
      this.state = 'toToilet';
      return;
    }
    if (this.moveTo(this.wander, this.speed * 0.5)) this.wander = Cleaner.randomSpot();
  }

  private toLitter(): void {
    const t = this.target;
    if (!t) {
      this.state = 'idle';
      return;
    }
    if (this.moveTo(t.pos, this.speed)) {
      this.cleanTimer = 0;
      this.state = 'cleaningLitter';
    }
  }

  private cleaningLitter(w: World): void {
    this.cleanTimer++;
    if (this.cleanTimer >= LITTER.cleanTime) {
      if (this.target) w.litter.remove(this.target);
      this.target = null;
      this.state = 'idle';
    }
  }

  private toToilet(w: World): void {
    const ref = this.targetStall;
    if (!ref) {
      this.state = 'idle';
      return;
    }
    // Walk to right in front of the specific cabin, then start scrubbing.
    if (this.moveTo(w.toilets.stallFront(ref.house, ref.index), this.speed)) this.state = 'cleaningToilet';
  }

  private cleaningToilet(w: World): void {
    const ref = this.targetStall;
    const stall = ref?.house.stalls[ref.index];
    if (!ref || !stall) {
      this.targetStall = null;
      this.state = 'idle';
      return;
    }
    // Claim the cabin (blocking guests). If a guest is inside, wait out front.
    if (!w.toilets.blockForCleaning(ref.house, ref.index, this)) return;
    w.toilets.cleanStall(stall, TOILET.cleanerDirtPerFrame);
    if (stall.dirt <= 0) {
      w.toilets.releaseCleaning(ref.house, ref.index, this);
      this.targetStall = null;
      this.state = 'idle';
    }
  }

  // --- the cleaner's own toilet break --------------------------------------

  private breakToilet(w: World): void {
    if (!w.toilets.has(this) && !w.toilets.join(this, this.pos)) {
      this._bladder = 0; // no WC reachable — carry on
      this.state = 'idle';
      return;
    }
    const atSpot = this.moveTo(w.toilets.positionOf(this), this.speed);
    // Only on arrival do they notice the tank is full and can't go — back to
    // work, and a malheur strikes somewhere along the way (like the guests/service).
    if (atSpot && w.eco.toiletTankFull()) {
      w.toilets.leave(this);
      this.pendingMalheur = true;
      this.malheurTimer = Math.floor(rand(20, 60));
      this.state = 'idle';
      return;
    }
    if (atSpot && w.toilets.atStallFront(this)) {
      this.toiletStall = w.toilets.enter(this);
      this.toiletDuration = Math.floor(rand(STAFF.toiletMin, STAFF.toiletMax));
      this.waitTimer = this.toiletDuration;
      this.state = 'onToilet';
    }
  }

  private onToilet(w: World): void {
    if (this.toiletStall) w.toilets.soilStall(this.toiletStall, TOILET.dirtPerUse / this.toiletDuration);
    this.waitTimer--;
    if (this.toiletStall) w.toilets.setProgress(this.toiletStall, 1 - this.waitTimer / this.toiletDuration);
    if (this.waitTimer <= 0) {
      this._bladder = 0;
      w.eco.useToilet(); // adds to the shared waste tank
      w.toilets.leave(this);
      this.toiletStall = null;
      this.state = 'idle';
    }
  }

  private goHome(w: World): boolean {
    return !this.moveTo(w.places.entrance, this.speed); // arrived home -> despawn
  }

  private grabLitter(w: World): boolean {
    const l = w.litter.nearestUnclaimed(this.pos);
    if (!l) return false;
    l.claimed = true;
    this.target = l;
    this.state = 'toLitter';
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
