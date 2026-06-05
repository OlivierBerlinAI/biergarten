// Decoration: placeable bushes and flowers. Each has a condition (0..100) that
// slowly declines — flowers wilt faster than bushes. A gardener waters them back
// up. Guests near healthy greenery feel a little better; near wilted/dead plants,
// a little worse. Pure model; the view reads pos/kind/condition.

import { DECO } from '../config.js';
import { dist, rand, type Vec } from './vec.js';

export type DecoKind = 'bush' | 'flower' | 'tree';

export interface DecoItem {
  id: number;
  pos: Vec;
  kind: DecoKind;
  /** Health, 0 (dead) .. 100 (lush). */
  condition: number;
  /** Once it hits 0 it's beyond saving — must be torn out and replanted. */
  dead: boolean;
  /** Condition below which this plant asks for water (randomised per plant). */
  waterAt: number;
}

/** Trees are big; bushes/flowers small. Used for placement + hit-testing. */
function footprintOf(kind: DecoKind): number {
  return kind === 'tree' ? 40 : 22;
}

export function decoFootprint(kind: DecoKind): number {
  return footprintOf(kind);
}

export class Deco {
  readonly list: DecoItem[] = [];
  private nextId = 1;
  /** When on, gardeners tear out dead plants and replant fresh ones for money. */
  autoReplace = false;

  /** Flip auto-replace on/off; returns the new state. */
  toggleAutoReplace(): boolean {
    this.autoReplace = !this.autoReplace;
    return this.autoReplace;
  }

  /** The first dead plant still standing — a gardener's replant candidate. */
  firstDead(): DecoItem | null {
    return this.list.find((d) => d.dead) ?? null;
  }

  add(pos: Vec, kind: DecoKind): DecoItem {
    const d: DecoItem = {
      id: this.nextId++,
      pos: { ...pos },
      kind,
      condition: 100,
      dead: false,
      waterAt: rand(DECO.waterAtMin, DECO.waterAtMax),
    };
    this.list.push(d);
    return d;
  }

  isClear(p: Vec, radius: number): boolean {
    return this.list.every((d) => dist(d.pos, p) > radius + footprintOf(d.kind));
  }

  at(p: Vec): DecoItem | null {
    return this.list.find((d) => dist(d.pos, p) <= footprintOf(d.kind)) ?? null;
  }

  remove(id: number): boolean {
    const i = this.list.findIndex((d) => d.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }

  /** Decline every plant's condition by its per-kind rate (called each tick). */
  decay(): void {
    for (const d of this.list) {
      if (d.dead || d.kind === 'tree') continue; // trees are evergreen; dead is a goner
      const rate = d.kind === 'flower' ? DECO.flowerDecayPerFrame : DECO.bushDecayPerFrame;
      d.condition = Math.max(0, d.condition - rate);
      if (d.condition <= 0) d.dead = true; // hit zero → beyond saving
    }
  }

  /** Water a plant — but a fully dead plant can no longer be revived. */
  water(d: DecoItem, amount: number): void {
    if (d.dead) return;
    d.condition = Math.min(100, d.condition + amount);
  }

  /** True once a plant has wilted past the dead threshold (read as negative). */
  private isWilted(d: DecoItem): boolean {
    return d.condition < DECO.deadThreshold;
  }

  /**
   * The most-wilted *savable* plant that has dropped below its own water-me
   * threshold, for a gardener to head to. Plants above their threshold are left
   * be, and the per-plant threshold keeps them from all asking at once.
   */
  thirstiest(): DecoItem | null {
    let best: DecoItem | null = null;
    for (const d of this.list) {
      if (d.dead || d.condition >= d.waterAt) continue;
      if (!best || d.condition < best.condition) best = d;
    }
    return best;
  }

  /**
   * Net per-frame mood contribution for a guest standing at `p`: nearby healthy
   * plants help, wilted/dead ones hurt (weighted by how close and how lush).
   */
  perceptionAt(p: Vec): number {
    let sum = 0;
    for (const d of this.list) {
      if (dist(d.pos, p) > DECO.perceptionRadius) continue;
      sum += d.dead || this.isWilted(d) ? DECO.satDeadPerFrame : DECO.satLivingPerFrame * (d.condition / 100);
    }
    return sum;
  }
}
