// Pretzel stands placed on the field. Each stand is staffed by a pretzel seller
// and has its own queue — guests line up like at the bar or the WC. The pretzel
// stock, price and ordering live in the economy (one shared supply).
// No rendering — the view reads `list`, queue lengths and serve progress.

import { dist, type Vec } from './vec.js';
import type { Person } from './entities/person.js';
import type { PretzelSeller } from './entities/pretzelseller.js';

/** Rough radius of a stand, for placement/overlap checks. */
export const STAND_FOOTPRINT = 38;

export interface Stand {
  id: number;
  pos: Vec;
  /** Guests waiting to be served, head of the list at the counter. */
  queue: Person[];
  /** The seller working this stand (null = unstaffed). */
  seller: PretzelSeller | null;
}

const FRONT_OFFSET_Y = 46;
const QUEUE_SPACING = 28;

export class Stands {
  readonly list: Stand[] = [];
  private nextId = 1;

  add(pos: Vec): Stand {
    const s: Stand = { id: this.nextId++, pos: { ...pos }, queue: [], seller: null };
    this.list.push(s);
    return s;
  }

  get count(): number {
    return this.list.length;
  }

  /** At least one stand currently has a seller standing at it. */
  hasSeller(): boolean {
    return this.list.some((s) => s.seller !== null);
  }

  isClear(p: Vec, radius: number): boolean {
    return this.list.every((s) => dist(s.pos, p) > radius + STAND_FOOTPRINT);
  }

  nearest(p: Vec): Stand | null {
    let best: Stand | null = null;
    let bestDist = Infinity;
    for (const s of this.list) {
      const d = dist(s.pos, p);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  at(p: Vec): Stand | null {
    return this.list.find((s) => dist(s.pos, p) <= STAND_FOOTPRINT) ?? null;
  }

  remove(id: number): boolean {
    const i = this.list.findIndex((s) => s.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }

  // --- queueing (mirrors the bar) ------------------------------------------

  /** Join the nearest staffed stand's queue. False if none has a seller. */
  join(p: Person): boolean {
    let best: Stand | null = null;
    let bestDist = Infinity;
    for (const s of this.list) {
      if (!s.seller) continue;
      const d = dist(s.pos, p.pos);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    if (!best) return false;
    best.queue.push(p);
    return true;
  }

  has(p: Person): boolean {
    return this.standOf(p) !== null;
  }

  leave(p: Person): void {
    const s = this.standOf(p);
    if (s) s.queue.splice(s.queue.indexOf(p), 1);
  }

  /** True when p is at the head of its stand and the seller is at the counter. */
  atCounter(p: Person): boolean {
    const s = this.standOf(p);
    return !!s && s.queue[0] === p && !!s.seller?.atCounter;
  }

  positionOf(p: Person): Vec {
    const found = this.locate(p);
    if (!found) return this.list[0]?.pos ?? { x: 0, y: 0 };
    return { x: found.s.pos.x, y: found.s.pos.y + FRONT_OFFSET_Y + found.depth * QUEUE_SPACING };
  }

  // --- view helpers ---------------------------------------------------------

  /** Where the seller stands (behind the counter). */
  sellerSpot(s: Stand): Vec {
    return { x: s.pos.x, y: s.pos.y - 16 };
  }

  gaugeY(s: Stand): number {
    return s.pos.y + 22;
  }

  queueLen(s: Stand): number {
    return s.queue.length;
  }

  /** 0..1 serve progress of the guest being served (0 if none / no seller). */
  serveProgress(s: Stand): number {
    if (!s.seller?.atCounter) return 0;
    return s.queue[0]?.standServeProgress ?? 0;
  }

  // --- internals ------------------------------------------------------------

  private standOf(p: Person): Stand | null {
    return this.list.find((s) => s.queue.includes(p)) ?? null;
  }

  private locate(p: Person): { s: Stand; depth: number } | null {
    for (const s of this.list) {
      const depth = s.queue.indexOf(p);
      if (depth >= 0) return { s, depth };
    }
    return null;
  }
}
