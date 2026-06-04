// Placeable storage tanks. Beer tanks hold the (shared) beer supply, waste
// tanks the (shared) toilet waste. There is no plumbing to manage — every tank
// of a kind feeds one common pool, so total capacity is simply the number of
// tanks of that kind times the per-tank unit. Replaces the old tank upgrades.
//
// Pure model: holds positions; the economy owns the actual pool levels, and
// Game keeps eco.beer/eco.toilet capacity in sync with the tank counts.

import { dist, type Vec } from './vec.js';

/** Rough radius of a tank, for placement/overlap checks. */
export const TANK_FOOTPRINT = 30;

export type TankKind = 'beer' | 'waste';

export interface TankObj {
  id: number;
  pos: Vec;
  kind: TankKind;
}

export class Tanks {
  readonly list: TankObj[] = [];
  private nextId = 1;

  add(pos: Vec, kind: TankKind): TankObj {
    const t: TankObj = { id: this.nextId++, pos: { ...pos }, kind };
    this.list.push(t);
    return t;
  }

  count(kind: TankKind): number {
    return this.list.reduce((n, t) => n + (t.kind === kind ? 1 : 0), 0);
  }

  isClear(p: Vec, radius: number): boolean {
    return this.list.every((t) => dist(t.pos, p) > radius + TANK_FOOTPRINT);
  }

  at(p: Vec): TankObj | null {
    return this.list.find((t) => dist(t.pos, p) <= TANK_FOOTPRINT) ?? null;
  }

  remove(id: number): boolean {
    const i = this.list.findIndex((t) => t.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }
}
