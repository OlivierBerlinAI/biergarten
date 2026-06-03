// A Putzkraft (cleaner). Pure logic: patrol, walk to the nearest mess and clear
// it, or scrub the toilet when it gets dirty. The view draws the red hat.

import { stepToward, rand, clamp, type Vec } from '../vec.js';
import { WORLD, CLEANER, TOILET, LITTER } from '../../config.js';
import type { Litter } from '../litter.js';
import type { World } from '../world.js';

type CleanerState = 'idle' | 'toLitter' | 'cleaningLitter' | 'toToilet' | 'cleaningToilet';

export class Cleaner {
  readonly id: number;
  pos: Vec;
  bob: number;

  private state: CleanerState = 'idle';
  private readonly speed = rand(CLEANER.speedMin, CLEANER.speedMax);
  private target: Litter | null = null;
  private wander: Vec;
  private cleanTimer = 0;

  constructor(id: number) {
    this.id = id;
    this.pos = { x: rand(200, WORLD.w - 200), y: rand(250, WORLD.h - 160) };
    this.wander = Cleaner.randomSpot();
    this.bob = rand(0, Math.PI * 2);
  }

  get moving(): boolean {
    return this.state !== 'cleaningLitter' && this.state !== 'cleaningToilet';
  }

  tick(w: World): boolean {
    switch (this.state) {
      case 'idle': this.idle(w); break;
      case 'toLitter': this.toLitter(); break;
      case 'cleaningLitter': this.cleaningLitter(w); break;
      case 'toToilet': this.toToilet(w); break;
      case 'cleaningToilet': this.cleaningToilet(w); break;
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
    if (w.eco.toiletDirt > TOILET.cleanThreshold) {
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
    if (this.grabLitter(w)) return;
    if (this.moveTo({ x: w.places.toilet.x, y: w.places.toilet.y + 55 }, this.speed)) {
      this.state = 'cleaningToilet';
    }
  }

  private cleaningToilet(w: World): void {
    w.eco.cleanToiletDirt(TOILET.cleanerDirtPerFrame);
    if (w.eco.toiletDirt <= 0 || w.litter.nearestUnclaimed(this.pos)) this.state = 'idle';
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
    const r = stepToward(this.pos, target, speed);
    this.pos = r.pos;
    return r.arrived;
  }

  private static randomSpot(): Vec {
    return { x: clamp(rand(120, WORLD.w - 120), 0, WORLD.w), y: clamp(rand(220, WORLD.h - 120), 0, WORLD.h) };
  }
}
