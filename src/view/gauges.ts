// Small in-world progress bars drawn onto the buildings:
//   • the Ausschank shows the current beer's pour progress
//   • the WC house shows the current toilet dirtiness
//
// Both are updated every frame by the simulation.

import paper from '../scope.js';
import { PLACES } from '../config.js';

interface Gauge {
  fill: paper.Path;
  left: number;
  top: number;
  width: number;
  height: number;
}

export class WorldGauges {
  readonly group: paper.Group;
  private readonly beer: Gauge;
  private readonly toilet: Gauge;

  constructor() {
    this.group = new paper.Group();
    this.beer = this.build(PLACES.bar.x, PLACES.bar.y + 30, 130, 12, '#f5b531', 'Zapfhahn');
    this.toilet = this.build(PLACES.toilet.x, PLACES.toilet.y + 32, 88, 12, '#8a5a2a', 'Verschmutzung');
  }

  /** 0..1 progress of the beer currently being poured. */
  setBeer(progress: number): void {
    this.setFill(this.beer, progress);
  }

  /** 0..1 toilet dirtiness. */
  setToilet(fraction: number): void {
    this.setFill(this.toilet, fraction);
  }

  // --- internals ------------------------------------------------------------

  private build(cx: number, cy: number, width: number, height: number, color: string, label: string): Gauge {
    const left = cx - width / 2;
    const top = cy - height / 2;

    const caption = new paper.PointText({
      point: [cx, top - 4],
      content: label,
      fillColor: '#fff',
      fontSize: 10,
      fontWeight: 'bold',
      justification: 'center',
    });
    const bg = new paper.Path.Rectangle(new paper.Rectangle(left, top, width, height), new paper.Size(3, 3));
    bg.fillColor = new paper.Color(0, 0, 0, 0.45);
    bg.strokeColor = new paper.Color(255, 255, 255, 0.35);
    bg.strokeWidth = 1;

    const fill = new paper.Path.Rectangle(new paper.Rectangle(left, top, 0.001, height), new paper.Size(3, 3));
    fill.fillColor = new paper.Color(color);
    fill.visible = false;

    this.group.addChildren([caption, bg, fill]);
    return { fill, left, top, width, height };
  }

  private setFill(g: Gauge, value: number): void {
    const p = Math.max(0, Math.min(1, value));
    if (p <= 0.001) {
      g.fill.visible = false;
      return;
    }
    g.fill.visible = true;
    g.fill.bounds = new paper.Rectangle(g.left, g.top, g.width * p, g.height);
  }
}
