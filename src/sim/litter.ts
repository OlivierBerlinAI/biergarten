// Pure litter (Unrat) model: mess piles on the ground that cleaners pick up.

import { dist, type Vec } from './vec.js';

export type LitterKind = 'poop' | 'pee';

export interface Litter {
  id: number;
  kind: LitterKind;
  pos: Vec;
  /** A cleaner has been dispatched to this pile. */
  claimed: boolean;
}

export class LitterField {
  readonly items: Litter[] = [];
  private nextId = 1;

  get count(): number {
    return this.items.length;
  }

  add(pos: Vec, kind: LitterKind): Litter {
    const l: Litter = { id: this.nextId++, kind, pos: { x: pos.x, y: pos.y }, claimed: false };
    this.items.push(l);
    return l;
  }

  remove(litter: Litter): void {
    const i = this.items.indexOf(litter);
    if (i >= 0) this.items.splice(i, 1);
  }

  countNear(from: Vec, radius: number): number {
    const r2 = radius * radius;
    let n = 0;
    for (const l of this.items) {
      const dx = l.pos.x - from.x;
      const dy = l.pos.y - from.y;
      if (dx * dx + dy * dy <= r2) n++;
    }
    return n;
  }

  /** Record the ids of every pile within `radius` of `from` into `out`. Lets a
   *  guest tally how many *distinct* messes they've walked past (a set, so the
   *  same pile lingering nearby is only ever counted once). */
  collectNear(from: Vec, radius: number, out: Set<number>): void {
    const r2 = radius * radius;
    for (const l of this.items) {
      const dx = l.pos.x - from.x;
      const dy = l.pos.y - from.y;
      if (dx * dx + dy * dy <= r2) out.add(l.id);
    }
  }

  nearestUnclaimed(from: Vec): Litter | null {
    let best: Litter | null = null;
    let bestDist = Infinity;
    for (const l of this.items) {
      if (l.claimed) continue;
      const d = dist(l.pos, from);
      if (d < bestDist) {
        bestDist = d;
        best = l;
      }
    }
    return best;
  }
}
