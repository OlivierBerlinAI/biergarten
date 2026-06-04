// Player-laid paths. A path is a set of tiles painted onto the ground. Paths
// don't block building (you can build right on top of them); they only affect
// movement — guests travel faster on a path and slower off it. Pure model;
// the view draws a sandy tile per point.

import { PATH } from '../config.js';
import { dist, type Vec } from './vec.js';

export interface PathTile {
  id: number;
  pos: Vec;
}

export class Paths {
  readonly list: PathTile[] = [];
  private nextId = 1;

  add(pos: Vec): PathTile {
    const t: PathTile = { id: this.nextId++, pos: { ...pos } };
    this.list.push(t);
    return t;
  }

  /** True if `p` sits on (within tileRadius of) any path tile. */
  onPath(p: Vec): boolean {
    return this.list.some((t) => dist(t.pos, p) <= PATH.tileRadius);
  }

  /** True if a tile already sits right here — used to avoid stacking duplicates. */
  occupied(p: Vec): boolean {
    return this.list.some((t) => dist(t.pos, p) <= PATH.minGap);
  }

  /** The path tile under `p` (for demolition), or null. */
  at(p: Vec): PathTile | null {
    return this.list.find((t) => dist(t.pos, p) <= PATH.tileRadius) ?? null;
  }

  remove(id: number): boolean {
    const i = this.list.findIndex((t) => t.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }
}
