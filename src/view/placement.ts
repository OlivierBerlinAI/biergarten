// Furniture placement input: a ghost preview follows the cursor, a click drops
// the item. Uses a Paper.js Tool (reliable mouse events) and asks the backend
// whether a spot is valid (canPlace) and to place it (place).

import paper from '../scope.js';
import { DJ, PATH } from '../config.js';
import type { Game, PlaceKind } from '../sim/game.js';
import type { Renderer } from './renderer.js';

export class Placement {
  private kind: PlaceKind | null = null;
  private demolishMode = false;
  private ghost: paper.Group | null = null;
  private ghostShape: paper.Path | null = null;
  private last: paper.Point | null = null;
  private lastPaint: { x: number; y: number } | null = null; // for drag-painting paths
  private lastButton = 0; // which mouse button started the current interaction

  constructor(
    private readonly game: Game,
    private readonly renderer: Renderer,
    private readonly onGuestPick: (id: number) => void,
    private readonly onStandPick: () => void,
  ) {
    const tool = new paper.Tool();
    tool.onMouseMove = (e: paper.ToolEvent) => this.onMove(e.point);
    tool.onMouseDown = (e: paper.ToolEvent) => this.onDown(e.point);
    tool.onMouseDrag = (e: paper.ToolEvent) => this.onDrag(e.point);
    // Record which button started the gesture (capture phase = before Paper.js),
    // so only left-clicks place; right/middle clicks never place anything.
    document.getElementById('stage')?.addEventListener('pointerdown', (e) => { this.lastButton = e.button; }, true);
  }

  /** Drag to paint a continuous path (throttled by tile spacing). */
  private onDrag(pt: paper.Point): void {
    if (this.lastButton !== 0) return; // only the left button paints
    if (this.kind !== 'path') return;
    const far = !this.lastPaint || Math.hypot(pt.x - this.lastPaint.x, pt.y - this.lastPaint.y) >= PATH.tileSpacing;
    if (!far) return;
    this.game.place('path', { x: pt.x, y: pt.y });
    this.lastPaint = { x: pt.x, y: pt.y };
    this.refresh(pt);
  }

  active(): PlaceKind | null {
    return this.kind;
  }

  /** Turn demolish mode on/off (mutually exclusive with placement). */
  setDemolish(on: boolean): void {
    this.demolishMode = on;
    if (on) this.cancel(); // leaving placement
    else this.renderer.setDemolishHover(null);
  }

  /** Start placing `kind`; clicking the same kind again cancels. */
  begin(kind: PlaceKind): void {
    this.demolishMode = false;
    this.renderer.setDemolishHover(null);
    if (this.kind === kind) {
      this.cancel();
      return;
    }
    this.cancel();
    this.kind = kind;
    this.ghost = this.makeGhost(kind);
    if (this.last) this.refresh(this.last);
  }

  cancel(): void {
    this.kind = null;
    this.ghost?.remove();
    this.ghost = null;
    this.ghostShape = null;
  }

  private onMove(pt: paper.Point): void {
    this.last = pt;
    if (this.demolishMode) {
      const d = this.game.demolishableAt({ x: pt.x, y: pt.y });
      this.renderer.setDemolishHover(d, !d || this.game.eco.canAfford(d.cost));
      return;
    }
    if (this.kind) {
      this.refresh(pt);
      this.renderer.setHoveredDj(null);
      return;
    }
    // Not placing: reveal a DJ booth's range rings while hovering over it.
    let hovered: number | null = null;
    for (const dj of this.game.djs.list) {
      if (Math.hypot(dj.pos.x - pt.x, dj.pos.y - pt.y) <= DJ.footprint) { hovered = dj.id; break; }
    }
    this.renderer.setHoveredDj(hovered);
  }

  private onDown(pt: paper.Point): void {
    if (this.lastButton !== 0) return; // ignore right/middle clicks entirely
    if (this.demolishMode) {
      const d = this.game.demolishableAt({ x: pt.x, y: pt.y });
      if (d) {
        this.game.demolish(d); // no-ops if unaffordable (highlight already shows it greyed)
        const next = this.game.demolishableAt({ x: pt.x, y: pt.y }); // refresh after removal
        this.renderer.setDemolishHover(next, !next || this.game.eco.canAfford(next.cost));
      }
      return;
    }
    if (!this.kind) {
      const p = { x: pt.x, y: pt.y };
      // Not placing: a click might hit a building's "+" button (e.g. add a tap)…
      if (this.game.handleWorldClick(p)) return;
      // …a pretzel stand, opening its management overlay…
      if (this.game.stands.at(p)) { this.onStandPick(); return; }
      // …or a guest, in which case we follow them and open their panel.
      const id = this.nearestGuest(pt);
      if (id !== null) this.onGuestPick(id);
      return;
    }
    // Stay in placement mode after dropping one, so the player can place more
    // of the same in a row. Refresh the ghost (the just-used spot is now taken).
    this.game.place(this.kind, { x: pt.x, y: pt.y });
    this.lastPaint = { x: pt.x, y: pt.y }; // start of a path-paint stroke
    this.refresh(pt);
  }

  /** Id of a guest within click range of `pt`, nearest first, or null. */
  private nearestGuest(pt: paper.Point): number | null {
    let best: number | null = null;
    let bestDist = 20; // click radius (guest body ≈ 14px)
    for (const p of this.game.people) {
      const d = Math.hypot(p.pos.x - pt.x, p.pos.y - pt.y);
      if (d < bestDist) { bestDist = d; best = p.id; }
    }
    return best;
  }

  private refresh(pt: paper.Point): void {
    if (!this.ghost || !this.kind) return;
    this.ghost.position = pt;
    const valid = this.game.canPlace(this.kind, { x: pt.x, y: pt.y });
    if (this.ghostShape) {
      this.ghostShape.fillColor = valid
        ? new paper.Color(0.3, 0.85, 0.3, 0.4)
        : new paper.Color(0.9, 0.25, 0.25, 0.4);
    }
  }

  private makeGhost(kind: PlaceKind): paper.Group {
    const g = new paper.Group();
    g.applyMatrix = false;
    const r =
      kind === 'stand' ? 30
      : kind === 'bench' ? 22
      : kind === 'pretzel' ? 34
      : kind === 'ausschank' ? 70
      : kind === 'wc' ? 56
      : kind === 'beertank' || kind === 'wastetank' ? 26
      : kind === 'bush' || kind === 'flower' ? 18
      : kind === 'tree' ? 38
      : kind === 'dj' ? 22
      : kind === 'path' ? 26
      : 50;
    const shape = new paper.Path.Circle(new paper.Point(0, 0), r);
    shape.fillColor = new paper.Color(0.3, 0.85, 0.3, 0.4);
    shape.strokeColor = new paper.Color(1, 1, 1, 0.85);
    shape.strokeWidth = 2;
    shape.dashArray = [6, 4];
    const label = new paper.PointText({
      point: [0, -r - 8],
      content:
        kind === 'stand'
          ? 'Stehtisch'
          : kind === 'bench'
            ? 'Bank'
            : kind === 'pretzel'
              ? 'Brezelstand'
              : kind === 'ausschank'
                ? 'Bar'
                : kind === 'wc'
                  ? 'WC-Haus'
                  : kind === 'beertank'
                    ? 'Bier-Tank'
                    : kind === 'wastetank'
                      ? 'Klo-Tank'
                      : kind === 'bush'
                        ? 'Busch'
                        : kind === 'flower'
                          ? 'Blumen'
                          : kind === 'tree'
                            ? 'Baum'
                            : kind === 'dj'
                              ? 'DJ'
                              : kind === 'path'
                                ? 'Weg'
                                : 'Tisch',
      fillColor: '#fff',
      fontSize: 13,
      fontWeight: 'bold',
      justification: 'center',
    });
    g.addChildren([shape, label]);
    this.ghostShape = shape;
    return g;
  }
}
