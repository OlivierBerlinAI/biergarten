// A delivery vehicle: the beer truck (refills the tank) or the Klowagen (empties
// the waste tank). It waits off-screen, rolls in shortly before arrival, parks
// at the bar / toilet and services it gradually, then drives off.

import { stepToward, dist, type Vec } from '../vec.js';
import { DELIVERY, PLACES, WORLD } from '../../config.js';
import type { World } from '../world.js';

export type TruckKind = 'beer' | 'klo';
type Phase = 'enroute' | 'arriving' | 'servicing' | 'leaving';

export class Truck {
  readonly id: number;
  readonly kind: TruckKind;
  pos: Vec;
  facing = -1; // driving in from the right
  phase: Phase = 'enroute';

  private enrouteTimer: number;
  private readonly totalToArrival: number;
  private sinceStart = 0;
  private readonly park: Vec;
  private readonly exit: Vec;
  private readonly speed: number;
  private serviceTimer: number;
  private readonly serviceTotal: number;
  private readonly amount: number; // beer litres to deliver
  private delivered = 0;
  private drainRate = 0;

  constructor(id: number, kind: TruckKind, delaySeconds: number, amount: number) {
    this.id = id;
    this.kind = kind;
    this.amount = amount;

    const driveIn = DELIVERY.driveInSeconds * 60;
    const total = Math.max(driveIn + 60, delaySeconds * 60);
    this.enrouteTimer = total - driveIn; // invisible wait, then it drives in
    this.totalToArrival = total;

    if (kind === 'beer') {
      this.park = { x: PLACES.bar.x - 120, y: PLACES.bar.y + 72 };
      this.serviceTotal = Math.round(DELIVERY.beerServiceSeconds * 60);
    } else {
      this.park = { x: PLACES.toilet.x - 95, y: PLACES.toilet.y + 28 };
      this.serviceTotal = Math.round(DELIVERY.kloServiceSeconds * 60);
    }
    this.serviceTimer = this.serviceTotal;

    const spawn: Vec = { x: WORLD.w + 70, y: this.park.y };
    this.exit = { x: WORLD.w + 90, y: this.park.y };
    this.pos = { ...spawn };
    this.speed = Math.max(2.5, dist(spawn, this.park) / driveIn);
  }

  /** The sprite is only shown once it starts driving in. */
  get visible(): boolean {
    return this.phase !== 'enroute';
  }

  /** 0..1 progress until the truck reaches its station (for the button bar). */
  arrivalProgress(): number {
    return Math.min(1, this.sinceStart / this.totalToArrival);
  }

  /** True while it's parked and doing its job. */
  get servicing(): boolean {
    return this.phase === 'servicing';
  }

  tick(w: World): boolean {
    this.sinceStart++;
    switch (this.phase) {
      case 'enroute':
        if (--this.enrouteTimer <= 0) this.phase = 'arriving';
        break;
      case 'arriving': {
        const r = stepToward(this.pos, this.park, this.speed);
        this.pos = r.pos;
        if (r.arrived) {
          this.phase = 'servicing';
          if (this.kind === 'klo') this.drainRate = w.eco.toilet.capacity / this.serviceTotal;
        }
        break;
      }
      case 'servicing': {
        if (this.kind === 'beer') {
          const per = this.amount / this.serviceTotal;
          w.eco.addBeer(per);
          this.delivered += per;
        } else {
          w.eco.drainToilet(this.drainRate);
        }
        if (--this.serviceTimer <= 0) {
          if (this.kind === 'beer') w.eco.addBeer(this.amount - this.delivered); // rounding remainder
          this.facing = 1;
          this.phase = 'leaving';
        }
        break;
      }
      case 'leaving': {
        const r = stepToward(this.pos, this.exit, this.speed);
        this.pos = r.pos;
        if (r.arrived) return false; // gone -> despawn
        break;
      }
    }
    return true;
  }
}
