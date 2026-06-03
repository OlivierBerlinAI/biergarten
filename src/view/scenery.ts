// The static stage: ground, paths, the toilet hut, the Ausschank and trees.
// Drawn once into a single group that sits below the tables and entities.
//
// Tables, benches and umbrellas are NOT drawn here — each Table renders itself
// (see Tables.ts) so they can be bought at runtime.

import paper from '../scope.js';
import { PLACES, WORLD } from '../config.js';

export class Scenery {
  readonly group: paper.Group;

  constructor() {
    this.group = new paper.Group();
    this.buildGround();
    this.buildPaths();
    this.buildToilet();
    this.buildBar();
    this.buildEntranceSign();
    this.buildTrees();
  }

  private add(...items: paper.Item[]): void {
    this.group.addChildren(items);
  }

  private buildGround(): void {
    const ground = new paper.Path.Rectangle(new paper.Rectangle(0, 0, WORLD.w, WORLD.h));
    ground.fillColor = new paper.Color({
      gradient: {
        stops: [
          ['#4d6e35', 0],
          ['#3c5a2a', 0.6],
          ['#2e4a1f', 1],
        ],
        radial: true,
      },
      origin: new paper.Point(WORLD.w / 2, WORLD.h / 2 - 60),
      destination: new paper.Point(WORLD.w, WORLD.h),
    });
    this.add(ground);
  }

  private buildPaths(): void {
    const path1 = new paper.Path.Rectangle(new paper.Rectangle(0, WORLD.h - 200, WORLD.w, 90));
    path1.fillColor = new paper.Color('#b7a07a');
    this.add(path1);
  }

  private buildToilet(): void {
    const { x, y } = PLACES.toilet;
    const wcWall = new paper.Path.Rectangle(
      new paper.Rectangle(x - 50, y - 70, 100, 120),
      new paper.Size(8, 8),
    );
    wcWall.fillColor = new paper.Color('#6d4c33');
    const wcRoof = new paper.Path([
      new paper.Point(x - 60, y - 70),
      new paper.Point(x, y - 110),
      new paper.Point(x + 60, y - 70),
    ]);
    wcRoof.closed = true;
    wcRoof.fillColor = new paper.Color('#4a3122');
    const wcSign = new paper.PointText({
      point: [x, y],
      content: 'WC',
      fillColor: '#ffd34d',
      fontSize: 24,
      fontWeight: 'bold',
      justification: 'center',
    });
    this.add(wcWall, wcRoof, wcSign);
  }

  private buildBar(): void {
    const { x, y } = PLACES.bar;
    const barBody = new paper.Path.Rectangle(
      new paper.Rectangle(x - 90, y - 50, 180, 100),
      new paper.Size(10, 10),
    );
    barBody.fillColor = new paper.Color('#7a4a1f');
    const barTop = new paper.Path.Rectangle(
      new paper.Rectangle(x - 95, y - 55, 190, 22),
      new paper.Size(6, 6),
    );
    barTop.fillColor = new paper.Color('#caa472');
    const barSign = new paper.PointText({
      point: [x, y + 12],
      content: 'AUSSCHANK 🍺',
      fillColor: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
      justification: 'center',
    });
    this.add(barBody, barTop, barSign);
  }

  private buildEntranceSign(): void {
    const { x, y } = PLACES.entrance;
    const gate = new paper.PointText({
      point: [x + 10, y - 40],
      content: '→ EINGANG',
      fillColor: '#ffd34d',
      fontSize: 16,
      fontWeight: 'bold',
    });
    this.add(gate);
  }

  private buildTrees(): void {
    const spots = [
      new paper.Point(120, 120),
      new paper.Point(WORLD.w - 60, WORLD.h - 360),
      new paper.Point(180, WORLD.h - 60),
      new paper.Point(WORLD.w / 2, 70),
    ];
    for (const p of spots) {
      const shadow = new paper.Path.Ellipse(new paper.Rectangle(p.x - 34, p.y + 30, 68, 22));
      shadow.fillColor = new paper.Color('#000');
      shadow.opacity = 0.15;
      this.add(shadow);
      const trunk = new paper.Path.Rectangle(new paper.Rectangle(p.x - 8, p.y, 16, 40));
      trunk.fillColor = new paper.Color('#5a3d22');
      const crown = new paper.Path.Circle(new paper.Point(p.x, p.y - 10), 38);
      crown.fillColor = new paper.Color('#2f6d2f');
      const crown2 = new paper.Path.Circle(new paper.Point(p.x - 22, p.y + 8), 26);
      crown2.fillColor = new paper.Color('#388a38');
      const crown3 = new paper.Path.Circle(new paper.Point(p.x + 22, p.y + 8), 26);
      crown3.fillColor = new paper.Color('#357d35');
      this.add(trunk, crown2, crown3, crown);
    }
  }
}
