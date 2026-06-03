// Reads the backend Game state and keeps Paper.js sprites in sync with it.
// The backend never touches Paper; this is the only place entities become
// drawable. Sprites are keyed by entity id; created/updated/removed each frame.

import paper from '../scope.js';
import { WorldGauges } from './gauges.js';
import type { Game, Aggregates } from '../sim/game.js';
import type { Person } from '../sim/entities/person.js';
import type { Dog } from '../sim/entities/dog.js';
import type { Cleaner } from '../sim/entities/cleaner.js';
import type { Dogcatcher } from '../sim/entities/dogcatcher.js';
import type { Truck } from '../sim/entities/truck.js';
import type { Unit } from '../sim/seating.js';
import type { Litter } from '../sim/litter.js';

interface PersonSprite { g: paper.Group; body: paper.Path; mug: paper.Group; glass: paper.Path; }
interface DogSprite { g: paper.Group; head: paper.Path; tail: paper.Path; }
interface SimpleSprite { g: paper.Group; body: paper.Path; }

const col = (c: string): paper.Color => new paper.Color(c);

export class Renderer {
  private readonly tablesG = new paper.Group();
  private readonly towelsG = new paper.Group();
  private readonly litterG = new paper.Group();
  private readonly gauges = new WorldGauges();
  private readonly entitiesG = new paper.Group();

  private readonly units = new Map<number, { g: paper.Group; benches: number }>();
  private readonly towels = new Map<string, paper.Group>();
  private readonly litterSprites = new Map<number, paper.Group>();
  private readonly people = new Map<number, PersonSprite>();
  private readonly dogs = new Map<number, DogSprite>();
  private readonly cleaners = new Map<number, SimpleSprite>();
  private readonly trucks = new Map<number, paper.Group>();
  private dogcatcher: { id: number; s: SimpleSprite } | null = null;

  sync(game: Game, agg: Aggregates): void {
    this.syncUnits(game);
    this.syncTowels(game);
    this.syncLitter(game);
    this.syncPeople(game);
    this.syncDogs(game);
    this.syncCleaners(game);
    this.syncDogcatcher(game);
    this.syncTrucks(game);

    this.gauges.setBeer(agg.beerPour);
    this.gauges.setToilet(game.eco.toiletDirt / 100);
  }

  // --- tables ---------------------------------------------------------------

  private syncUnits(game: Game): void {
    const live = new Set<number>();
    for (const u of game.seating.units) {
      live.add(u.id);
      const existing = this.units.get(u.id);
      if (!existing) {
        const g = this.buildUnit(u);
        this.units.set(u.id, { g, benches: u.benches });
      } else if (existing.benches !== u.benches) {
        existing.g.remove();
        const g = this.buildUnit(u);
        this.units.set(u.id, { g, benches: u.benches });
      }
    }
    for (const [id, s] of this.units) if (!live.has(id)) { s.g.remove(); this.units.delete(id); }
  }

  private buildUnit(u: Unit): paper.Group {
    const g = new paper.Group();
    this.tablesG.addChild(g);
    if (u.kind === 'stand') this.drawStand(g, u);
    else this.drawBenchTable(g, u);
    return g;
  }

  private drawBenchTable(g: paper.Group, u: Unit): void {
    const { x, y } = u.center;
    if (u.benches >= 1) this.drawBench(g, x, y - 44);
    if (u.benches >= 2) this.drawBench(g, x, y + 32);
    const top = new paper.Path.Rectangle(new paper.Rectangle(x - 45, y - 22, 90, 44), new paper.Size(6, 6));
    top.fillColor = col('#c99a5b');
    top.strokeColor = col('#8a6a3a');
    top.strokeWidth = 2;
    g.addChild(top);
    // umbrella
    const cx = x, cy = y - 4, R = 56;
    for (let s = 0; s < 8; s++) {
      const a0 = (s / 8) * Math.PI * 2;
      const a1 = ((s + 1) / 8) * Math.PI * 2;
      const wedge = new paper.Path([
        new paper.Point(cx, cy),
        new paper.Point(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R * 0.55),
        new paper.Point(cx + Math.cos((a0 + a1) / 2) * (R + 6), cy + Math.sin((a0 + a1) / 2) * (R + 6) * 0.55),
        new paper.Point(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R * 0.55),
      ]);
      wedge.closed = true;
      wedge.fillColor = col(s % 2 === 0 ? '#d94f4f' : '#f4f0e8');
      wedge.strokeColor = new paper.Color(0, 0, 0, 0.13);
      wedge.strokeWidth = 1;
      g.addChild(wedge);
    }
    const knob = new paper.Path.Circle(new paper.Point(cx, cy), 5);
    knob.fillColor = col('#8a6a3a');
    g.addChild(knob);
  }

  private drawBench(g: paper.Group, cx: number, top: number): void {
    const b = new paper.Path.Rectangle(new paper.Rectangle(cx - 45, top, 90, 12));
    b.fillColor = col('#a9793f');
    g.addChild(b);
  }

  private drawStand(g: paper.Group, u: Unit): void {
    const { x, y } = u.center;
    for (const p of [[x - 34, y], [x + 34, y], [x, y - 30], [x, y + 30]]) {
      const stool = new paper.Path.Circle(new paper.Point(p[0]!, p[1]!), 7);
      stool.fillColor = col('#8a6a3a');
      stool.strokeColor = col('#5a4424');
      stool.strokeWidth = 1;
      g.addChild(stool);
    }
    const shadow = new paper.Path.Circle(new paper.Point(x, y + 2), 16);
    shadow.fillColor = col('#000');
    shadow.opacity = 0.12;
    g.addChild(shadow);
    const post = new paper.Path.Rectangle(new paper.Rectangle(x - 3, y - 4, 6, 10));
    post.fillColor = col('#6a4a26');
    g.addChild(post);
    const tableTop = new paper.Path.Circle(new paper.Point(x, y - 4), 15);
    tableTop.fillColor = col('#c99a5b');
    tableTop.strokeColor = col('#8a6a3a');
    tableTop.strokeWidth = 2;
    g.addChild(tableTop);
  }

  // --- towels (one per taken seat) ------------------------------------------

  private syncTowels(game: Game): void {
    const live = new Set<string>();
    game.seating.units.forEach((u, ti) => {
      const seats = game.seating.seatPositionsOf(u);
      u.taken.forEach((taken, si) => {
        if (!taken) return;
        const key = `${ti}-${si}`;
        live.add(key);
        if (!this.towels.has(key)) this.towels.set(key, this.buildTowel(seats[si]!));
      });
    });
    for (const [key, g] of this.towels) if (!live.has(key)) { g.remove(); this.towels.delete(key); }
  }

  private buildTowel(p: { x: number; y: number }): paper.Group {
    const g = new paper.Group();
    this.towelsG.addChild(g);
    const base = new paper.Path.Rectangle(new paper.Rectangle(p.x - 10, p.y - 5, 20, 11), new paper.Size(2, 2));
    base.fillColor = col('#eef0f2');
    base.strokeColor = col('#b9bdc2');
    base.strokeWidth = 1;
    const s1 = new paper.Path.Rectangle(new paper.Rectangle(p.x - 9, p.y - 5, 4, 11));
    s1.fillColor = col('#d94f4f');
    const s2 = new paper.Path.Rectangle(new paper.Rectangle(p.x + 5, p.y - 5, 4, 11));
    s2.fillColor = col('#4f7fd9');
    g.addChildren([base, s1, s2]);
    return g;
  }

  // --- litter ---------------------------------------------------------------

  private syncLitter(game: Game): void {
    const live = new Set<number>();
    for (const l of game.litter.items) {
      live.add(l.id);
      if (!this.litterSprites.has(l.id)) this.litterSprites.set(l.id, this.buildLitter(l));
    }
    for (const [id, g] of this.litterSprites) if (!live.has(id)) { g.remove(); this.litterSprites.delete(id); }
  }

  private buildLitter(l: Litter): paper.Group {
    const g = new paper.Group();
    this.litterG.addChild(g);
    const { x, y } = l.pos;
    if (l.kind === 'pee') {
      const puddle = new paper.Path.Ellipse(new paper.Rectangle(x - 9, y - 4, 18, 9));
      puddle.fillColor = new paper.Color(0.86, 0.78, 0.28, 0.55);
      const sheen = new paper.Path.Ellipse(new paper.Rectangle(x - 3, y - 2, 5, 3));
      sheen.fillColor = new paper.Color(1, 1, 0.7, 0.5);
      g.addChildren([puddle, sheen]);
    } else {
      const base = new paper.Path.Ellipse(new paper.Rectangle(x - 7, y - 2, 14, 7));
      base.fillColor = col('#4a3122');
      const mid = new paper.Path.Ellipse(new paper.Rectangle(x - 5, y - 5, 10, 6));
      mid.fillColor = col('#5a3d22');
      const tp = new paper.Path.Ellipse(new paper.Rectangle(x - 3, y - 8, 6, 5));
      tp.fillColor = col('#6b4a2a');
      g.addChildren([base, mid, tp]);
    }
    return g;
  }

  // --- people ---------------------------------------------------------------

  private syncPeople(game: Game): void {
    const live = new Set<number>();
    for (const p of game.people) {
      live.add(p.id);
      let s = this.people.get(p.id);
      if (!s) { s = this.buildPerson(p); this.people.set(p.id, s); }
      s.g.position = new paper.Point(p.pos.x, p.pos.y);
      s.g.opacity = p.opacity;
      if (p.moving) s.body.position = new paper.Point(0, 6 + Math.sin(p.bob) * 1.5);
      s.mug.visible = p.mugVisible;
      if (p.mugVisible) s.glass.bounds.height = 2 + 12 * p.beerLevel;
    }
    for (const [id, s] of this.people) if (!live.has(id)) { s.g.remove(); this.people.delete(id); }
  }

  private buildPerson(p: Person): PersonSprite {
    const g = new paper.Group();
    g.applyMatrix = false;
    this.entitiesG.addChild(g);
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(-10, 14, 20, 8));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.18;
    const body = new paper.Path.Circle(new paper.Point(0, 6), 11);
    body.fillColor = col(p.shirt);
    const head = new paper.Path.Circle(new paper.Point(0, -10), 8);
    head.fillColor = col(p.skin);
    const mug = new paper.Group();
    const glass = new paper.Path.Rectangle(new paper.Rectangle(14, -6, 9, 14), new paper.Size(2, 2));
    glass.fillColor = col('#f5b531');
    glass.strokeColor = col('#b6831a');
    const foam = new paper.Path.Rectangle(new paper.Rectangle(14, -8, 9, 4), new paper.Size(2, 2));
    foam.fillColor = col('#fff');
    mug.addChildren([glass, foam]);
    mug.visible = false;
    g.addChildren([shadow, body, head, mug]);
    g.position = new paper.Point(p.pos.x, p.pos.y);
    return { g, body, mug, glass };
  }

  // --- dogs -----------------------------------------------------------------

  private syncDogs(game: Game): void {
    const live = new Set<number>();
    for (const d of game.dogs) {
      live.add(d.id);
      let s = this.dogs.get(d.id);
      if (!s) { s = this.buildDog(d); this.dogs.set(d.id, s); }
      s.g.position = new paper.Point(d.pos.x, d.pos.y);
      s.head.position = new paper.Point(d.facing >= 0 ? 12 : -12, -3);
      s.tail.segments[1]!.point = new paper.Point(-20, -8 + Math.sin(d.wag) * 4);
    }
    for (const [id, s] of this.dogs) if (!live.has(id)) { s.g.remove(); this.dogs.delete(id); }
  }

  private buildDog(d: Dog): DogSprite {
    const g = new paper.Group();
    g.applyMatrix = false;
    this.entitiesG.addChild(g);
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(-13, 4, 26, 7));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.16;
    const body = new paper.Path.Ellipse(new paper.Rectangle(-12, -6, 24, 12));
    body.fillColor = col(d.fur);
    const head = new paper.Path.Circle(new paper.Point(12, -3), 6);
    head.fillColor = col(d.fur);
    const ear = new paper.Path.Circle(new paper.Point(15, -8), 3);
    ear.fillColor = col('#000');
    ear.opacity = 0.4;
    const tail = new paper.Path([new paper.Point(-12, -2), new paper.Point(-20, -8)]);
    tail.strokeColor = col(d.fur);
    tail.strokeWidth = 3;
    g.addChildren([shadow, tail, body, head, ear]);
    g.position = new paper.Point(d.pos.x, d.pos.y);
    return { g, head, tail };
  }

  // --- cleaners + dog catcher ----------------------------------------------

  private syncCleaners(game: Game): void {
    const live = new Set<number>();
    for (const c of game.cleaners) {
      live.add(c.id);
      let s = this.cleaners.get(c.id);
      if (!s) { s = this.buildCleaner(c); this.cleaners.set(c.id, s); }
      s.g.position = new paper.Point(c.pos.x, c.pos.y);
      if (c.moving) s.body.position = new paper.Point(0, 6 + Math.sin(c.bob) * 1.5);
    }
    for (const [id, s] of this.cleaners) if (!live.has(id)) { s.g.remove(); this.cleaners.delete(id); }
  }

  private buildCleaner(c: Cleaner): SimpleSprite {
    const g = new paper.Group();
    g.applyMatrix = false;
    this.entitiesG.addChild(g);
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(-10, 14, 20, 8));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.18;
    const body = new paper.Path.Circle(new paper.Point(0, 6), 11);
    body.fillColor = col('#4a6b7a');
    const head = new paper.Path.Circle(new paper.Point(0, -10), 8);
    head.fillColor = col('#e0a87a');
    const brim = new paper.Path.Ellipse(new paper.Rectangle(-9, -17, 18, 6));
    brim.fillColor = col('#c11');
    const cap = new paper.Path.Circle(new paper.Point(0, -17), 6);
    cap.fillColor = col('#e11');
    g.addChildren([shadow, body, head, brim, cap]);
    g.position = new paper.Point(c.pos.x, c.pos.y);
    void c;
    return { g, body };
  }

  // --- delivery trucks ------------------------------------------------------

  private syncTrucks(game: Game): void {
    const live = new Set<number>();
    for (const t of game.trucks) {
      if (!t.visible) continue;
      live.add(t.id);
      let g = this.trucks.get(t.id);
      if (!g) { g = this.buildTruck(t); this.trucks.set(t.id, g); }
      g.position = new paper.Point(t.pos.x, t.pos.y);
      g.scaling = new paper.Point(t.facing >= 0 ? -1 : 1, 1); // face travel direction
    }
    for (const [id, g] of this.trucks) if (!live.has(id)) { g.remove(); this.trucks.delete(id); }
  }

  private buildTruck(t: Truck): paper.Group {
    const g = new paper.Group();
    g.applyMatrix = false;
    this.entitiesG.addChild(g);
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(-26, 12, 52, 8));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.15;
    const body = new paper.Path.Rectangle(new paper.Rectangle(-26, -14, 52, 24), new paper.Size(4, 4));
    body.fillColor = col(t.kind === 'beer' ? '#9c5a2a' : '#4f7fa6');
    const roof = new paper.Path.Rectangle(new paper.Rectangle(-26, -18, 52, 8), new paper.Size(3, 3));
    roof.fillColor = col(t.kind === 'beer' ? '#7a4420' : '#3c6486');
    const sign = new paper.Path.Rectangle(new paper.Rectangle(-12, -10, 24, 16), new paper.Size(2, 2));
    sign.fillColor = col('#fff');
    const icon = new paper.PointText({
      point: [0, 3],
      content: t.kind === 'beer' ? '🍺' : '🚽',
      fontSize: 14,
      justification: 'center',
    });
    const w1 = new paper.Path.Circle(new paper.Point(-16, 12), 5);
    const w2 = new paper.Path.Circle(new paper.Point(16, 12), 5);
    w1.fillColor = w2.fillColor = col('#1a1a1a');
    g.addChildren([shadow, body, roof, sign, icon, w1, w2]);
    g.position = new paper.Point(t.pos.x, t.pos.y);
    return g;
  }

  private syncDogcatcher(game: Game): void {
    const dc = game.dogcatcher;
    if (dc) {
      if (!this.dogcatcher || this.dogcatcher.id !== dc.id) {
        this.dogcatcher?.s.g.remove();
        this.dogcatcher = { id: dc.id, s: this.buildDogcatcher(dc) };
      }
      const s = this.dogcatcher.s;
      s.g.position = new paper.Point(dc.pos.x, dc.pos.y);
      s.body.position = new paper.Point(0, 6 + Math.sin(dc.bob) * 1.5);
    } else if (this.dogcatcher) {
      this.dogcatcher.s.g.remove();
      this.dogcatcher = null;
    }
  }

  private buildDogcatcher(dc: Dogcatcher): SimpleSprite {
    const g = new paper.Group();
    g.applyMatrix = false;
    this.entitiesG.addChild(g);
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(-10, 14, 20, 8));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.18;
    const body = new paper.Path.Circle(new paper.Point(0, 6), 11);
    body.fillColor = col('#3a5a3a');
    const head = new paper.Path.Circle(new paper.Point(0, -10), 8);
    head.fillColor = col('#e0a87a');
    const cap = new paper.Path.Ellipse(new paper.Rectangle(-8, -19, 16, 7));
    cap.fillColor = col('#2a402a');
    const handle = new paper.Path([new paper.Point(7, 2), new paper.Point(20, -14)]);
    handle.strokeColor = col('#6b4a2a');
    handle.strokeWidth = 2;
    const hoop = new paper.Path.Circle(new paper.Point(22, -18), 7);
    hoop.strokeColor = col('#dddddd');
    hoop.strokeWidth = 2;
    hoop.fillColor = new paper.Color(1, 1, 1, 0.18);
    g.addChildren([shadow, body, head, cap, handle, hoop]);
    g.position = new paper.Point(dc.pos.x, dc.pos.y);
    return { g, body };
  }
}
