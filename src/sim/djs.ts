// DJs: placeable music sources. Each has a sweet spot — guests too close find it
// too loud, guests in range enjoy it, guests out of range don't hear it. Where
// two DJs' ranges overlap, the clashing music is felt as very annoying.
// Pure model; the view reads positions (and draws the range ring).

import { DJ } from '../config.js';
import { dist, type Vec } from './vec.js';

export interface DjObj {
  id: number;
  pos: Vec;
  /** True while a DJ is standing at the booth — only then does the music play. */
  hasDj: boolean;
}

export class DJs {
  readonly list: DjObj[] = [];
  private nextId = 1;

  add(pos: Vec): DjObj {
    const d: DjObj = { id: this.nextId++, pos: { ...pos }, hasDj: false };
    this.list.push(d);
    return d;
  }

  isClear(p: Vec, radius: number): boolean {
    return this.list.every((d) => dist(d.pos, p) > radius + DJ.footprint);
  }

  at(p: Vec): DjObj | null {
    return this.list.find((d) => dist(d.pos, p) <= DJ.footprint) ?? null;
  }

  remove(id: number): boolean {
    const i = this.list.findIndex((d) => d.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }

  /** Per-frame mood for a guest at `p` from the staffed DJ(s) within earshot. */
  perceptionAt(p: Vec): number {
    let inRange = 0;
    let tooClose = false;
    for (const d of this.list) {
      if (!d.hasDj) continue; // silent without a DJ at the booth
      const dd = dist(d.pos, p);
      if (dd > DJ.range) continue;
      inRange++;
      if (dd < DJ.tooClose) tooClose = true;
    }
    if (inRange === 0) return 0;
    if (inRange >= 2) return DJ.satOverlap; // clashing music from overlapping DJs
    return tooClose ? DJ.satTooClose : DJ.satSweet;
  }
}
