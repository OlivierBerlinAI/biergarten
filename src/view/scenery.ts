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
    this.buildEntranceSign();
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
}
