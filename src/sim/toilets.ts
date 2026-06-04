// WC houses: placeable buildings holding 1..maxStalls toilets. Every toilet is
// its own serving point with its own queue; guests AND staff line up at the
// nearest house and shuffle forward. Each house tracks its own dirtiness; the
// waste volume itself lives in the shared economy tank (the tanks are linked).
//
// Pure logic. Queue members are referenced by identity (Person / Cleaner /
// Bartender all qualify) so the model stays decoupled from the entity types.

import { WC } from '../config.js';
import { dist, type Vec } from './vec.js';

/** Anything that can stand in a toilet queue — referenced by identity only. */
export type Member = object;

export interface Stall {
  queue: Member[];
  /** Who is currently inside (null = free). */
  occupant: Member | null;
  /** 0..1 visit progress, for the loading bar (driven by the occupant). */
  progress: number;
  /** This cabin's own dirtiness, 0..100. */
  dirt: number;
  /** True while a cleaner is scrubbing it — guests look for another cabin. */
  cleaning: boolean;
}

export interface WcHouse {
  id: number;
  pos: Vec;
  stalls: Stall[];
}

/** Points at one cabin by its house and index. */
export interface StallRef {
  house: WcHouse;
  index: number;
}

export class Toilets {
  readonly list: WcHouse[] = [];
  private nextId = 1;

  add(pos: Vec): WcHouse {
    const h: WcHouse = { id: this.nextId++, pos: { ...pos }, stalls: [newStall()] };
    this.list.push(h);
    return h;
  }

  get count(): number {
    return this.list.length;
  }

  private halfWidth(h: WcHouse): number {
    return WC.halfWidth + (h.stalls.length - 1) * (WC.stallSpacing / 2);
  }

  canAddStall(h: WcHouse): boolean {
    return h.stalls.length < WC.maxStalls;
  }

  addStall(h: WcHouse): boolean {
    if (!this.canAddStall(h)) return false;
    h.stalls.push(newStall());
    return true;
  }

  buildingAtPlus(point: Vec): WcHouse | null {
    for (const h of this.list) if (dist(this.plusPos(h), point) <= WC.plusHitRadius) return h;
    return null;
  }

  isClear(point: Vec, radius: number): boolean {
    return this.list.every((h) => dist(h.pos, point) > radius + WC.footprint);
  }

  /** The WC house covering `point` (for demolition), or null. */
  at(point: Vec): WcHouse | null {
    return this.list.find((h) => dist(h.pos, point) <= WC.footprint) ?? null;
  }

  remove(id: number): boolean {
    const i = this.list.findIndex((h) => h.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }

  // --- dirtiness (per cabin) ------------------------------------------------

  soilStall(stall: Stall, amount: number): void {
    stall.dirt = Math.min(100, stall.dirt + amount);
  }

  cleanStall(stall: Stall, amount: number): void {
    stall.dirt = Math.max(0, stall.dirt - amount);
  }

  /** Average dirtiness across every cabin (for the combined HUD meter). */
  combinedDirt(): number {
    let sum = 0;
    let n = 0;
    for (const h of this.list) for (const s of h.stalls) { sum += s.dirt; n++; }
    return n === 0 ? 0 : sum / n;
  }

  /** The dirtiest cabin above `threshold`, for a cleaner to head to. */
  dirtiestStall(threshold: number): StallRef | null {
    let best: StallRef | null = null;
    let bestDirt = threshold;
    for (const h of this.list) {
      for (let i = 0; i < h.stalls.length; i++) {
        if (h.stalls[i]!.dirt > bestDirt) {
          bestDirt = h.stalls[i]!.dirt;
          best = { house: h, index: i };
        }
      }
    }
    return best;
  }

  // --- queueing -------------------------------------------------------------

  /** Nearest WC house to a point (any house — all have at least one stall). */
  nearest(point: Vec): WcHouse | null {
    let best: WcHouse | null = null;
    let bestDist = Infinity;
    for (const h of this.list) {
      const d = dist(h.pos, point);
      if (d < bestDist) {
        bestDist = d;
        best = h;
      }
    }
    return best;
  }

  /** Join the nearest house's shortest stall queue. False if there are no WCs. */
  join(token: Member, point: Vec): boolean {
    const h = this.nearest(point);
    if (!h) return false;
    let stall: Stall | null = null;
    for (const s of h.stalls) if (!stall || queueLoad(s) < queueLoad(stall)) stall = s;
    if (!stall) return false;
    stall.queue.push(token);
    return true;
  }

  /** Join a specific cabin's queue (used by guests trying cabins one by one). */
  joinStall(token: Member, house: WcHouse, index: number): boolean {
    const stall = house.stalls[index];
    if (!stall) return false;
    stall.queue.push(token);
    return true;
  }

  has(token: Member): boolean {
    return this.stallOf(token) !== null;
  }

  /** Which cabin a token is queued at / occupying (house + index), or null. */
  stallRefOf(token: Member): StallRef | null {
    const found = this.locate(token);
    return found ? { house: found.h, index: found.si } : null;
  }

  /** Remove a member from wherever they are (queue or stall). Safe on any exit. */
  leave(token: Member): void {
    for (const h of this.list) {
      for (const s of h.stalls) {
        const qi = s.queue.indexOf(token);
        if (qi >= 0) s.queue.splice(qi, 1);
        if (s.occupant === token) {
          s.occupant = null;
          s.progress = 0;
        }
      }
    }
  }

  houseOf(token: Member): WcHouse | null {
    for (const h of this.list) for (const s of h.stalls) if (s.queue.includes(token) || s.occupant === token) return h;
    return null;
  }

  /** True when token is at the head of its queue and the stall is free. */
  atStallFront(token: Member): boolean {
    const found = this.locate(token);
    if (!found) return false;
    const stall = found.h.stalls[found.si]!;
    return stall.occupant === null && stall.queue[0] === token;
  }

  /** Move token from the queue head into the stall. Returns the stall, or null. */
  enter(token: Member): Stall | null {
    const found = this.locate(token);
    if (!found) return null;
    const stall = found.h.stalls[found.si]!;
    if (stall.occupant !== null || stall.queue[0] !== token) return null;
    stall.queue.shift();
    stall.occupant = token;
    stall.progress = 0;
    return stall;
  }

  setProgress(stall: Stall, frac: number): void {
    stall.progress = Math.max(0, Math.min(1, frac));
  }

  /** Where token should stand (inside the stall if occupying, else its queue spot). */
  positionOf(token: Member): Vec {
    const found = this.locate(token);
    if (!found) return this.list[0]?.pos ?? { x: 0, y: 0 };
    const { h, si, depth } = found;
    if (depth < 0) return this.stallInside(h, si); // occupant
    return this.queueSpot(h, si, depth);
  }

  // --- view helpers ---------------------------------------------------------

  stallPoint(h: WcHouse, i: number): Vec {
    const span = (h.stalls.length - 1) * WC.stallSpacing;
    return { x: h.pos.x - span / 2 + i * WC.stallSpacing, y: h.pos.y };
  }

  stallInside(h: WcHouse, i: number): Vec {
    const p = this.stallPoint(h, i);
    return { x: p.x, y: p.y - 6 };
  }

  /** Spot right in front of a cabin's door (where a cleaner stands to scrub). */
  stallFront(h: WcHouse, i: number): Vec {
    const p = this.stallPoint(h, i);
    return { x: p.x, y: p.y + 30 };
  }

  /**
   * A cleaner claims a cabin to scrub it, blocking guests — but only if no guest
   * is currently inside. Returns true once the cleaner holds it.
   */
  blockForCleaning(h: WcHouse, i: number, token: Member): boolean {
    const stall = h.stalls[i];
    if (!stall) return false;
    if (stall.occupant && stall.occupant !== token) return false; // a guest is inside
    stall.occupant = token;
    stall.cleaning = true;
    stall.progress = 0;
    return true;
  }

  releaseCleaning(h: WcHouse, i: number, token: Member): void {
    const stall = h.stalls[i];
    if (stall && stall.occupant === token) {
      stall.occupant = null;
      stall.cleaning = false;
      stall.progress = 0;
    }
  }

  /** True if token is at the very front of its cabin's queue. */
  isQueueHead(token: Member): boolean {
    const found = this.locate(token);
    return !!found && found.depth === 0;
  }

  gaugeY(h: WcHouse): number {
    return h.pos.y + WC.gaugeOffsetY;
  }

  stallProgress(h: WcHouse, i: number): number {
    return h.stalls[i]!.occupant ? h.stalls[i]!.progress : 0;
  }

  stallQueueLen(h: WcHouse, i: number): number {
    return h.stalls[i]!.queue.length;
  }

  plusPos(h: WcHouse): Vec {
    return { x: h.pos.x + this.halfWidth(h) + 8, y: h.pos.y + WC.plusOffset.y };
  }

  // --- internals ------------------------------------------------------------

  private queueSpot(h: WcHouse, i: number, depth: number): Vec {
    const p = this.stallPoint(h, i);
    return { x: p.x, y: p.y + WC.frontOffsetY + depth * WC.queueSpacing };
  }

  private stallOf(token: Member): Stall | null {
    for (const h of this.list) for (const s of h.stalls) if (s.queue.includes(token) || s.occupant === token) return s;
    return null;
  }

  /** Locate a token: its house, stall index, and queue depth (-1 = occupant). */
  private locate(token: Member): { h: WcHouse; si: number; depth: number } | null {
    for (const h of this.list) {
      for (let si = 0; si < h.stalls.length; si++) {
        const s = h.stalls[si]!;
        if (s.occupant === token) return { h, si, depth: -1 };
        const depth = s.queue.indexOf(token);
        if (depth >= 0) return { h, si, depth };
      }
    }
    return null;
  }
}

function newStall(): Stall {
  return { queue: [], occupant: null, progress: 0, dirt: 0, cleaning: false };
}

/** Occupied stalls count as one longer so guests prefer a free stall's queue. */
function queueLoad(s: Stall): number {
  return s.queue.length + (s.occupant ? 1 : 0);
}
