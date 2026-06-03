// Furniture placement input: a ghost preview follows the cursor, a click drops
// the item. Uses a Paper.js Tool (reliable mouse events) and asks the backend
// whether a spot is valid (canPlace) and to place it (place).

import paper from '../scope.js';
import type { Game, PlaceKind } from '../sim/game.js';

export class Placement {
  private kind: PlaceKind | null = null;
  private ghost: paper.Group | null = null;
  private ghostShape: paper.Path | null = null;
  private last: paper.Point | null = null;

  constructor(private readonly game: Game) {
    const tool = new paper.Tool();
    tool.onMouseMove = (e: paper.ToolEvent) => this.onMove(e.point);
    tool.onMouseDown = (e: paper.ToolEvent) => this.onDown(e.point);
  }

  active(): PlaceKind | null {
    return this.kind;
  }

  /** Start placing `kind`; clicking the same kind again cancels. */
  begin(kind: PlaceKind): void {
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
    if (this.kind) this.refresh(pt);
  }

  private onDown(pt: paper.Point): void {
    if (!this.kind) return;
    if (this.game.place(this.kind, { x: pt.x, y: pt.y })) this.cancel();
    // invalid spot: stay in placement so the player can try again
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
    const r = kind === 'stand' ? 30 : kind === 'bench' ? 22 : 50;
    const shape = new paper.Path.Circle(new paper.Point(0, 0), r);
    shape.fillColor = new paper.Color(0.3, 0.85, 0.3, 0.4);
    shape.strokeColor = new paper.Color(1, 1, 1, 0.85);
    shape.strokeWidth = 2;
    shape.dashArray = [6, 4];
    const label = new paper.PointText({
      point: [0, -r - 8],
      content: kind === 'stand' ? 'Stehtisch' : kind === 'bench' ? 'Bank' : 'Tisch',
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
