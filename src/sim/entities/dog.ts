// A dog. Pure wander/sniff/bark logic; occasionally leaves a mess.

import { stepToward, dist, rand, chance, pick, type Vec } from '../vec.js';
import { DOG_COLORS, WORLD, LITTER } from '../../config.js';
import type { World } from '../world.js';

export class Dog {
  readonly id: number;
  pos: Vec;
  readonly fur: string;
  facing = 1; // +1 right, -1 left (head/ear flip)
  wag: number;

  private target: Vec;
  private readonly speed = rand(1.6, 3.0);
  private pauseTimer = 0;

  constructor(id: number) {
    this.id = id;
    this.fur = pick(DOG_COLORS);
    this.pos = { x: rand(200, WORLD.w - 200), y: rand(250, WORLD.h - 150) };
    this.target = Dog.randomTarget();
    this.wag = rand(0, 6);
  }

  tick(w: World): boolean {
    if (this.pauseTimer > 0) {
      this.pauseTimer--;
    } else {
      const r = stepToward(this.pos, this.target, this.speed);
      this.pos = r.pos;
      if (r.arrived) {
        if (chance(0.4)) {
          this.pauseTimer = Math.floor(rand(20, 90)); // sniff
          if (chance(0.5)) w.play('bark');
        }
        this.target = Dog.randomTarget();
      }
    }

    const dx = this.target.x - this.pos.x;
    if (Math.abs(dx) > 1) this.facing = dx >= 0 ? 1 : -1;
    this.wag += 0.5;

    if (chance(LITTER.dogMessChance)) w.litter.add(this.pos, 'poop');
    return true; // dogs never leave on their own
  }

  /** Distance helper for the dog catcher. */
  distanceTo(p: Vec): number {
    return dist(this.pos, p);
  }

  private static randomTarget(): Vec {
    return { x: rand(120, WORLD.w - 120), y: rand(200, WORLD.h - 120) };
  }
}
