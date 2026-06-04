// The Ausschank: placeable bar buildings, each holding 1..maxTaps taps. Every
// tap is its own little serving point with its own queue; guests line up at the
// nearest building that has a staffed tap and shuffle forward. Bartenders are
// assigned to taps once per day (see assign), and a tap only actually pours
// while its bartender is standing at the counter (attendant.atCounter).
//
// Pure logic — holds Person/Bartender references and computes where everyone
// should stand; the renderer reads tap positions, queue lengths and progress.

import { BAR } from '../config.js';
import { dist, type Vec } from './vec.js';
import type { Person } from './entities/person.js';
import type { ServiceStaff } from './entities/service.js';

export interface Tap {
  /** Guests waiting at this tap, head of the list at the counter. */
  queue: Person[];
  /** The Servicekraft posted to this tap right now (null = unstaffed). */
  attendant: ServiceStaff | null;
}

export interface Ausschank {
  id: number;
  pos: Vec;
  taps: Tap[];
}

/** Points at one tap by its building and index (for assignment / staffing). */
export interface TapRef {
  building: Ausschank;
  index: number;
}

export class Bar {
  readonly list: Ausschank[] = [];
  private nextId = 1;

  /** Build a new Ausschank (starts with a single tap). */
  add(pos: Vec): Ausschank {
    const a: Ausschank = { id: this.nextId++, pos: { ...pos }, taps: [{ queue: [], attendant: null }] };
    this.list.push(a);
    return a;
  }

  get buildingCount(): number {
    return this.list.length;
  }

  /** Half the counter width, widened for each extra tap. */
  private halfWidth(a: Ausschank): number {
    return BAR.halfWidth + (a.taps.length - 1) * (BAR.laneSpacing / 2);
  }

  canAddTap(a: Ausschank): boolean {
    return a.taps.length < BAR.maxTaps;
  }

  addTap(a: Ausschank): boolean {
    if (!this.canAddTap(a)) return false;
    a.taps.push({ queue: [], attendant: null });
    return true;
  }

  /** Building whose "+" button is within click range of `point`, or null. */
  buildingAtPlus(point: Vec): Ausschank | null {
    for (const a of this.list) {
      if (dist(this.plusPos(a), point) <= BAR.plusHitRadius) return a;
    }
    return null;
  }

  /** No building footprint overlaps `point` within `radius` (placement check). */
  isClear(point: Vec, radius: number): boolean {
    return this.list.every((a) => dist(a.pos, point) > radius + BAR.footprint);
  }

  /** The Ausschank whose body covers `point` (for demolition), or null. */
  at(point: Vec): Ausschank | null {
    return this.list.find((a) => dist(a.pos, point) <= BAR.footprint) ?? null;
  }

  remove(id: number): boolean {
    const i = this.list.findIndex((a) => a.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }

  // --- staffing -------------------------------------------------------------

  /** Clear all attendants (Game re-posts the Servicekräfte via allocateService). */
  clearAttendants(): void {
    for (const a of this.list) for (const t of a.taps) t.attendant = null;
  }

  // --- guest queueing ------------------------------------------------------

  /** Assign p to the nearest building's shortest staffed queue. False if none. */
  join(p: Person): boolean {
    let best: Ausschank | null = null;
    let bestDist = Infinity;
    for (const a of this.list) {
      if (!a.taps.some((t) => t.attendant !== null)) continue;
      const d = dist(a.pos, p.pos);
      if (d < bestDist) {
        bestDist = d;
        best = a;
      }
    }
    if (!best) return false;
    let lane: Tap | null = null;
    for (const t of best.taps) {
      if (t.attendant === null) continue;
      if (!lane || t.queue.length < lane.queue.length) lane = t;
    }
    if (!lane) return false;
    lane.queue.push(p);
    return true;
  }

  leave(p: Person): void {
    const tap = this.tapOf(p);
    if (!tap) return;
    tap.queue.splice(tap.queue.indexOf(p), 1);
  }

  has(p: Person): boolean {
    return this.tapOf(p) !== null;
  }

  /** True once p has reached the head of its tap's queue (the counter spot),
   *  regardless of whether a bartender is currently standing there. */
  isFront(p: Person): boolean {
    const tap = this.tapOf(p);
    return !!tap && tap.queue[0] === p;
  }

  /** True when p is at the head of its tap and the bartender is at the counter. */
  atCounter(p: Person): boolean {
    const tap = this.tapOf(p);
    return !!tap && tap.queue[0] === p && !!tap.attendant?.atCounter;
  }

  /** Where p should stand right now (front of the lane = at the counter). */
  positionOf(p: Person): Vec {
    const found = this.locate(p);
    if (!found) return this.list[0] ? this.tapFront(this.list[0], 0, 0) : { x: 0, y: 0 };
    return this.tapFront(found.a, found.ti, found.depth);
  }

  // --- view helpers ---------------------------------------------------------

  /** Counter point of tap i (where its progress gauge sits). */
  tapPoint(a: Ausschank, i: number): Vec {
    const span = (a.taps.length - 1) * BAR.laneSpacing;
    return { x: a.pos.x - span / 2 + i * BAR.laneSpacing, y: a.pos.y };
  }

  gaugeY(a: Ausschank): number {
    return a.pos.y + BAR.gaugeOffsetY;
  }

  /** 0..1 pour progress of the guest being served at tap i (0 if none/unstaffed). */
  tapProgress(a: Ausschank, i: number): number {
    const t = a.taps[i]!;
    if (!t.attendant?.atCounter) return 0;
    return t.queue[0]?.pourProgress ?? 0;
  }

  tapQueueLen(a: Ausschank, i: number): number {
    return a.taps[i]!.queue.length;
  }

  /** Where the building's "+" add-tap button sits. */
  plusPos(a: Ausschank): Vec {
    return { x: a.pos.x + this.halfWidth(a) + 8, y: a.pos.y + BAR.plusOffset.y };
  }

  /** Counter point of a tap (the spot a bartender stands at). */
  attendantSpot(a: Ausschank, i: number): Vec {
    const p = this.tapPoint(a, i);
    return { x: p.x, y: p.y - 24 };
  }

  // --- internals ------------------------------------------------------------

  private tapFront(a: Ausschank, i: number, depth: number): Vec {
    const p = this.tapPoint(a, i);
    return { x: p.x, y: p.y + BAR.frontOffsetY + depth * BAR.queueSpacing };
  }

  private tapOf(p: Person): Tap | null {
    for (const a of this.list) for (const t of a.taps) if (t.queue.includes(p)) return t;
    return null;
  }

  private locate(p: Person): { a: Ausschank; ti: number; depth: number } | null {
    for (const a of this.list) {
      for (let ti = 0; ti < a.taps.length; ti++) {
        const depth = a.taps[ti]!.queue.indexOf(p);
        if (depth >= 0) return { a, ti, depth };
      }
    }
    return null;
  }
}
