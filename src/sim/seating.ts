// Pure seating model: bench tables (3 seats per bench, up to 2 benches) and
// standing tables (4 stools). No rendering — the view reads `units` and draws
// them; reserved/occupied seats (taken[]) are where the view puts towels.

import { dist, type Vec } from './vec.js';
import { TABLE_LAYOUT, START } from '../config.js';
// No table cap — the player can fill the whole field (placement still needs
// clear space, see Game.canPlace).

export type UnitKind = 'bench' | 'stand';

export interface SeatRef {
  /** The unit's stable id (not its array index), so removals don't break refs. */
  table: number;
  seat: number;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  center: Vec;
  /** Benches installed (bench tables only, 0..2). */
  benches: number;
  taken: boolean[];
  /** Rough radius for placement/overlap checks. */
  footprint: number;
}

function unitSeatCount(u: Unit): number {
  return u.kind === 'stand' ? 4 : u.benches * 3;
}

function seatPositions(u: Unit): Vec[] {
  const { x, y } = u.center;
  if (u.kind === 'stand') {
    return [
      { x: x - 34, y },
      { x: x + 34, y },
      { x, y: y - 30 },
      { x, y: y + 30 },
    ];
  }
  // bench: 0..2 top bench, 3..5 bottom bench
  return [
    { x: x - 30, y: y - 44 },
    { x, y: y - 44 },
    { x: x + 30, y: y - 44 },
    { x: x - 30, y: y + 44 },
    { x, y: y + 44 },
    { x: x + 30, y: y + 44 },
  ];
}

export class Seating {
  readonly units: Unit[] = [];
  private nextId = 1;
  private readonly slots: Vec[];

  constructor() {
    this.slots = Seating.buildSlots();
    // Start with one usable bench table.
    for (let i = 0; i < START.tables; i++) {
      const u = this.addBenchTable();
      if (u) for (let b = 0; b < START.benchesPerStartTable; b++) this.addBenchToUnit(u);
    }
  }

  get seatCount(): number {
    return this.units.reduce((sum, u) => sum + unitSeatCount(u), 0);
  }

  seatCountOf(u: Unit): number {
    return unitSeatCount(u);
  }

  seatPositionsOf(u: Unit): Vec[] {
    return seatPositions(u);
  }

  canAddTable(): boolean {
    return true; // no cap — limited only by free space on the field
  }

  addBenchTable(center?: Vec): Unit | null {
    if (!this.canAddTable()) return null;
    const u: Unit = {
      id: this.nextId++,
      kind: 'bench',
      center: center ?? this.slots[this.units.length % this.slots.length]!,
      benches: 0,
      taken: [false, false, false, false, false, false],
      footprint: 62,
    };
    this.units.push(u);
    return u;
  }

  addStandTable(center?: Vec): Unit | null {
    if (!this.canAddTable()) return null;
    const u: Unit = {
      id: this.nextId++,
      kind: 'stand',
      center: center ?? this.slots[this.units.length % this.slots.length]!,
      benches: 0,
      taken: [false, false, false, false],
      footprint: 44,
    };
    this.units.push(u);
    return u;
  }

  canAddBench(): boolean {
    return this.units.some((u) => u.kind === 'bench' && u.benches < 2);
  }

  /** Add a bench to the first bench table with a free slot. */
  addBench(): boolean {
    const u = this.units.find((x) => x.kind === 'bench' && x.benches < 2);
    return u ? this.addBenchToUnit(u) : false;
  }

  addBenchNear(p: Vec): boolean {
    const u = this.unitNear(p);
    return u && u.kind === 'bench' && u.benches < 2 ? this.addBenchToUnit(u) : false;
  }

  canAddBenchNear(p: Vec): boolean {
    const u = this.unitNear(p);
    return !!u && u.kind === 'bench' && u.benches < 2;
  }

  unitNear(p: Vec): Unit | null {
    for (const u of this.units) if (dist(u.center, p) <= u.footprint) return u;
    return null;
  }

  isClear(p: Vec, radius: number): boolean {
    return this.units.every((u) => dist(u.center, p) > u.footprint + radius);
  }

  findFreeSeat(): SeatRef | null {
    const order = this.units.map((_, i) => i).sort(() => 0.5 - Math.random());
    for (const ti of order) {
      const u = this.units[ti]!;
      const n = unitSeatCount(u);
      for (let si = 0; si < n; si++) if (!u.taken[si]) return { table: u.id, seat: si };
    }
    return null;
  }

  /** Look a unit up by its stable id (null if it has been removed). */
  private byId(id: number): Unit | null {
    return this.units.find((u) => u.id === id) ?? null;
  }

  isFree(ref: SeatRef): boolean {
    const u = this.byId(ref.table);
    return !!u && ref.seat < unitSeatCount(u) && !u.taken[ref.seat];
  }

  claim(ref: SeatRef): void {
    const u = this.byId(ref.table);
    if (u) u.taken[ref.seat] = true;
  }

  release(ref: SeatRef): void {
    const u = this.byId(ref.table);
    if (u) u.taken[ref.seat] = false;
  }

  seatPoint(ref: SeatRef): Vec {
    const u = this.byId(ref.table);
    return u ? seatPositions(u)[ref.seat]! : { x: 0, y: 0 };
  }

  /** Remove a unit (table/stand) by id. Returns true if it existed. */
  removeUnit(id: number): boolean {
    const i = this.units.findIndex((u) => u.id === id);
    if (i < 0) return false;
    this.units.splice(i, 1);
    return true;
  }

  /** The unit at `p` (within its footprint), for demolition hit-testing. */
  unitAt(p: Vec): Unit | null {
    return this.unitNear(p);
  }

  private addBenchToUnit(u: Unit): boolean {
    if (u.kind !== 'bench' || u.benches >= 2) return false;
    u.benches += 1;
    return true;
  }

  private static buildSlots(): Vec[] {
    const { cols, rows, areaX0, areaY0, areaX1, areaY1 } = TABLE_LAYOUT;
    const slots: Vec[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        slots.push({
          x: areaX0 + (areaX1 - areaX0) * (c / (cols - 1)),
          y: areaY0 + (areaY1 - areaY0) * (r / (rows - 1)),
        });
      }
    }
    return slots;
  }
}
