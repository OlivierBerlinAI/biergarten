// Pretzel stands placed on the field. Each stand is staffed by a pretzel seller
// and has its own queue — guests line up like at the bar or the WC. Each stand
// also carries its OWN pretzel stock, order amount, auto-supply toggle and any
// pending delivery; the price stays shared (in the economy).
// No rendering — the view reads `list`, queue lengths and serve progress.

import { ECONOMY } from '../config.js';
import { dist, type Vec } from './vec.js';
import type { Person } from './entities/person.js';
import type { ServiceStaff } from './entities/service.js';
import type { Truck } from './entities/truck.js';

/** Rough radius of a stand, for placement/overlap checks. */
export const STAND_FOOTPRINT = 38;

export interface Stand {
  id: number;
  pos: Vec;
  /** Guests waiting to be served, head of the list at the counter. */
  queue: Person[];
  /** The Servicekraft working this stand right now (null = unstaffed). */
  seller: ServiceStaff | null;
  /** Fresh pretzels in stock at this stand (binned overnight). */
  stock: number;
  /** How many this stand's order button / auto-supply fetches. */
  orderAmount: number;
  /** When on, this stand restocks itself each morning. */
  autoDeliver: boolean;
  /** The baker's van currently bringing this stand a batch (null = none). */
  delivery: Truck | null;
}

const FRONT_OFFSET_Y = 46;
const QUEUE_SPACING = 28;
/** Virtual distance (px) added per queued guest when picking a stand, so two
 *  equally-near stands even out instead of one taking the whole crowd. */
const QUEUE_PENALTY_PX = 10;

export class Stands {
  readonly list: Stand[] = [];
  private nextId = 1;

  add(pos: Vec): Stand {
    const s: Stand = {
      id: this.nextId++,
      pos: { ...pos },
      queue: [],
      seller: null,
      stock: 0,
      orderAmount: ECONOMY.pretzelOrderDefault,
      autoDeliver: false,
      delivery: null,
    };
    this.list.push(s);
    return s;
  }

  get count(): number {
    return this.list.length;
  }

  byId(id: number): Stand | null {
    return this.list.find((s) => s.id === id) ?? null;
  }

  /** Combined pretzel stock across every stand (for the overview). */
  totalStock(): number {
    return this.list.reduce((sum, s) => sum + s.stock, 0);
  }

  /** Whether any stand currently auto-supplies itself (for the overview badge). */
  anyAutoDeliver(): boolean {
    return this.list.some((s) => s.autoDeliver);
  }

  /** Bin every stand's leftover stock at day's end; returns the total binned. */
  binAll(): number {
    let discarded = 0;
    for (const s of this.list) {
      discarded += s.stock;
      s.stock = 0;
    }
    return discarded;
  }

  /** Which stand a guest is queued at (null if none). */
  standOf(p: Person): Stand | null {
    return this.list.find((s) => s.queue.includes(p)) ?? null;
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

  /**
   * Queue the guest at a stand. Prefer the nearest one that can actually serve
   * (staffed + stock); if none can, fall back to the nearest stand at all, so the
   * guest walks over and only there discovers it's empty. False only if there are
   * no stands to walk to.
   */
  join(p: Person): boolean {
    const best =
      this.pickNearest(p.pos, (s) => s.seller !== null && s.stock >= 1) ??
      this.pickNearest(p.pos, () => true);
    if (!best) return false;
    best.queue.push(p);
    return true;
  }

  private pickNearest(from: Vec, ok: (s: Stand) => boolean): Stand | null {
    let best: Stand | null = null;
    let bestScore = Infinity;
    for (const s of this.list) {
      if (!ok(s)) continue;
      const score = dist(s.pos, from) + s.queue.length * QUEUE_PENALTY_PX;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
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

  private locate(p: Person): { s: Stand; depth: number } | null {
    for (const s of this.list) {
      const depth = s.queue.indexOf(p);
      if (depth >= 0) return { s, depth };
    }
    return null;
  }
}
