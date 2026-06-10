// Reads the backend Game state and keeps Paper.js sprites in sync with it.
// The backend never touches Paper; this is the only place entities become
// drawable. Sprites are keyed by entity id; created/updated/removed each frame.

import paper from '../scope.js';
import { BAR, WC, DJ, ECONOMY, type Towel } from '../config.js';
import type { Game, Demolishable } from '../sim/game.js';
import type { WcHouse } from '../sim/toilets.js';
import type { Stand } from '../sim/stands.js';
import type { TankObj } from '../sim/tanks.js';
import type { DecoItem, DecoKind } from '../sim/deco.js';
import type { DjObj } from '../sim/djs.js';
import type { Gardener } from '../sim/entities/gardener.js';
import type { Person } from '../sim/entities/person.js';
import type { Dog } from '../sim/entities/dog.js';
import type { Cleaner } from '../sim/entities/cleaner.js';
import type { Dogcatcher } from '../sim/entities/dogcatcher.js';
import type { Truck } from '../sim/entities/truck.js';
import type { Unit } from '../sim/seating.js';
import type { Ausschank } from '../sim/bar.js';
import type { ServiceStaff } from '../sim/entities/service.js';
import type { Litter } from '../sim/litter.js';

interface PersonSprite { g: paper.Group; body: paper.Path; head: paper.Path; skin: paper.Color; mug: paper.Group; glass: paper.Path; pretzel: paper.Group; }
interface DogSprite { g: paper.Group; tail: paper.Path; }
interface SimpleSprite { g: paper.Group; body: paper.Path; }
interface TapGauge { fill: paper.Path; count: paper.PointText; left: number; top: number; w: number; h: number; }
interface DirtBar { fill: paper.Path; left: number; top: number; w: number; h: number; }
interface PlusButton { pill: paper.Path; text: paper.PointText }
interface BarSprite { g: paper.Group; taps: number; gauges: TapGauge[]; plus?: PlusButton }
interface WcSprite { g: paper.Group; stalls: number; gauges: TapGauge[]; dirts: DirtBar[]; plus?: PlusButton }
interface TankSprite { g: paper.Group; fill: paper.Path; kind: 'beer' | 'waste'; left: number; bottom: number; w: number; h: number; }
interface DecoSprite { g: paper.Group; blobs: paper.Path[]; kind: DecoKind; }
interface DjSprite { g: paper.Group; rings: paper.Path[]; }

const col = (c: string): paper.Color => new paper.Color(c);

export class Renderer {
  private readonly pathsG = new paper.Group();
  private readonly tablesG = new paper.Group();
  private readonly standsG = new paper.Group();
  private readonly barsG = new paper.Group();
  private readonly wcsG = new paper.Group();
  private readonly tanksG = new paper.Group();
  private readonly decoG = new paper.Group();
  private readonly djsG = new paper.Group();
  private readonly towelsG = new paper.Group();
  private readonly litterG = new paper.Group();
  private readonly entitiesG = new paper.Group();
  // Parasols are drawn last so they sit ABOVE the guests (declared after
  // entitiesG → higher z-order). Their lifecycle is tied to the table units.
  private readonly umbrellasG = new paper.Group();

  private readonly units = new Map<number, { g: paper.Group; umbrella: paper.Group | null; benches: number }>();
  private readonly pathSprites = new Map<number, paper.Group>();
  private readonly standSprites = new Map<number, { g: paper.Group; gauge: TapGauge; stock: DirtBar; auto: paper.PointText }>();
  private readonly service = new Map<number, SimpleSprite>();
  private readonly djStaffSprites = new Map<number, SimpleSprite>();
  private readonly bars = new Map<number, BarSprite>();
  private readonly wcs = new Map<number, WcSprite>();
  private readonly tankSprites = new Map<number, TankSprite>();
  private readonly decoSprites = new Map<number, DecoSprite>();
  private readonly djSprites = new Map<number, DjSprite>();
  private hoveredDj: number | null = null;
  private readonly gardeners = new Map<number, SimpleSprite>();
  private readonly towels = new Map<string, paper.Group>();
  private readonly litterSprites = new Map<number, paper.Group>();
  private readonly people = new Map<number, PersonSprite>();
  private readonly dogs = new Map<number, DogSprite>();
  private readonly cleaners = new Map<number, SimpleSprite>();
  private readonly trucks = new Map<number, paper.Group>();
  private dogcatcher: { id: number; s: SimpleSprite } | null = null;

  // Highlight ring for the guest selected in the guests window.
  private selectedPerson: number | null = null;
  private highlightRing: paper.Path | null = null;
  private pulse = 0;

  // Floating hearts shown over a guest+dog while they're being petted.
  private readonly hearts = new Map<number, paper.Group>();
  private heartPhase = 0;

  /** Ring this guest in the world so they're easy to spot (null = no ring). */
  setSelected(id: number | null): void {
    this.selectedPerson = id;
  }

  sync(game: Game): void {
    this.syncPaths(game);
    this.syncUnits(game);
    this.syncStands(game);
    this.syncBars(game);
    this.syncWcs(game);
    this.syncTanks(game);
    this.syncDeco(game);
    this.syncDjs(game);
    this.syncTowels(game);
    this.syncLitter(game);
    this.syncPeople(game);
    this.syncService(game);
    this.syncGardeners(game);
    this.syncDjStaff(game);
    this.syncDogs(game);
    this.syncCleaners(game);
    this.syncDogcatcher(game);
    this.syncTrucks(game);
    this.syncHearts(game);
  }

  // --- Ausschank buildings + taps -------------------------------------------

  private syncBars(game: Game): void {
    const live = new Set<number>();
    for (const a of game.bar.list) {
      live.add(a.id);
      let s = this.bars.get(a.id);
      if (!s || s.taps !== a.taps.length) {
        // New building, or a tap was added → rebuild the counter at the new width.
        s?.g.remove();
        s = this.buildBar(game, a);
        this.bars.set(a.id, s);
      }
      for (let i = 0; i < a.taps.length; i++) {
        const tg = s.gauges[i]!;
        const p = game.bar.tapProgress(a, i);
        tg.fill.visible = p > 0.001;
        if (tg.fill.visible) tg.fill.bounds = new paper.Rectangle(tg.left, tg.top, tg.w * p, tg.h);
        const len = game.bar.tapQueueLen(a, i);
        const txt = len > 0 ? String(len) : '';
        if (tg.count.content !== txt) tg.count.content = txt;
      }
      this.stylePlusButton(s.plus, game.eco.canAfford(game.eco.tapCost()));
    }
    for (const [id, s] of this.bars) if (!live.has(id)) { s.g.remove(); this.bars.delete(id); }
  }

  private buildBar(game: Game, a: Ausschank): BarSprite {
    const g = new paper.Group();
    this.barsG.addChild(g);
    const first = game.bar.tapPoint(a, 0);
    const last = game.bar.tapPoint(a, a.taps.length - 1);
    const left = first.x - 34, right = last.x + 34, y = a.pos.y;
    const w = right - left;
    const body = new paper.Path.Rectangle(new paper.Rectangle(left, y - 50, w, 100), new paper.Size(10, 10));
    body.fillColor = col('#7a4a1f');
    const top = new paper.Path.Rectangle(new paper.Rectangle(left - 5, y - 62, w + 10, 24), new paper.Size(6, 6));
    top.fillColor = col('#caa472');
    // Label sits up on the roof band, above the bartender at the counter.
    const sign = new paper.PointText({
      point: [(left + right) / 2, y - 45], content: 'BAR 🍺',
      fillColor: '#5a3a14', fontSize: 15, fontWeight: 'bold', justification: 'center',
    });
    g.addChildren([body, top, sign]);
    // taps along the counter + a queue-gauge under each
    const gauges: TapGauge[] = [];
    for (let i = 0; i < a.taps.length; i++) {
      const tp = game.bar.tapPoint(a, i);
      const tap = new paper.Path.Rectangle(new paper.Rectangle(tp.x - 3, y - 40, 6, 14), new paper.Size(2, 2));
      tap.fillColor = col('#d9b14f');
      tap.strokeColor = col('#8a6a1a');
      g.addChild(tap);
      gauges.push(this.buildTapGauge(g, tp.x, game.bar.gaugeY(a)));
    }
    // "+" add-tap button with its price (omitted once the building is full)
    const plus = a.taps.length < BAR.maxTaps
      ? this.buildPlusButton(g, game.bar.plusPos(a), `＋ ${game.eco.tapCost()} €`)
      : undefined;
    return { g, taps: a.taps.length, gauges, plus };
  }

  private buildTapGauge(g: paper.Group, cx: number, cy: number): TapGauge {
    const w = 34, h = 8;
    const left = cx - w / 2, top = cy - h / 2;
    const bg = new paper.Path.Rectangle(new paper.Rectangle(left, top, w, h), new paper.Size(2, 2));
    bg.fillColor = new paper.Color(0, 0, 0, 0.5);
    bg.strokeColor = new paper.Color(1, 1, 1, 0.35);
    bg.strokeWidth = 1;
    const fill = new paper.Path.Rectangle(new paper.Rectangle(left, top, 0.001, h), new paper.Size(2, 2));
    fill.fillColor = col('#f5b531');
    fill.visible = false;
    const count = new paper.PointText({
      point: [cx, top - 4], content: '', fillColor: '#fff',
      fontSize: 11, fontWeight: 'bold', justification: 'center',
    });
    g.addChildren([bg, fill, count]);
    return { fill, count, left, top, w, h };
  }

  // --- WC houses + toilets --------------------------------------------------

  private syncWcs(game: Game): void {
    const live = new Set<number>();
    for (const h of game.toilets.list) {
      live.add(h.id);
      let s = this.wcs.get(h.id);
      if (!s || s.stalls !== h.stalls.length) {
        s?.g.remove();
        s = this.buildWcHouse(game, h);
        this.wcs.set(h.id, s);
      }
      for (let i = 0; i < h.stalls.length; i++) {
        const tg = s.gauges[i]!;
        const p = game.toilets.stallProgress(h, i);
        tg.fill.visible = p > 0.001;
        if (tg.fill.visible) tg.fill.bounds = new paper.Rectangle(tg.left, tg.top, tg.w * p, tg.h);
        const len = game.toilets.stallQueueLen(h, i);
        const txt = len > 0 ? String(len) : '';
        if (tg.count.content !== txt) tg.count.content = txt;
        const db = s.dirts[i]!;
        const d = Math.max(0, Math.min(1, h.stalls[i]!.dirt / 100));
        db.fill.visible = d > 0.001;
        if (db.fill.visible) db.fill.bounds = new paper.Rectangle(db.left, db.top, db.w * d, db.h);
      }
      this.stylePlusButton(s.plus, game.eco.canAfford(game.eco.stallCost()));
    }
    for (const [id, s] of this.wcs) if (!live.has(id)) { s.g.remove(); this.wcs.delete(id); }
  }

  private buildWcHouse(game: Game, h: WcHouse): WcSprite {
    const g = new paper.Group();
    this.wcsG.addChild(g);
    const first = game.toilets.stallPoint(h, 0);
    const last = game.toilets.stallPoint(h, h.stalls.length - 1);
    const left = first.x - 26, right = last.x + 26, y = h.pos.y;
    const w = right - left;
    const wall = new paper.Path.Rectangle(new paper.Rectangle(left, y - 34, w, 80), new paper.Size(8, 8));
    wall.fillColor = col('#6d4c33');
    const roof = new paper.Path([
      new paper.Point(left - 8, y - 34),
      new paper.Point((left + right) / 2, y - 64),
      new paper.Point(right + 8, y - 34),
    ]);
    roof.closed = true;
    roof.fillColor = col('#4a3122');
    // Label sits up in the roof, above the queue/occupants.
    const sign = new paper.PointText({
      point: [(left + right) / 2, y - 42], content: 'WC',
      fillColor: '#ffd34d', fontSize: 17, fontWeight: 'bold', justification: 'center',
    });
    g.addChildren([wall, roof, sign]);
    // toilets along the front, each with a progress gauge + its own dirt bar
    const gauges: TapGauge[] = [];
    const dirts: DirtBar[] = [];
    for (let i = 0; i < h.stalls.length; i++) {
      const sp = game.toilets.stallPoint(h, i);
      const door = new paper.Path.Rectangle(new paper.Rectangle(sp.x - 11, y - 4, 22, 46), new paper.Size(3, 3));
      door.fillColor = col('#8a6a45');
      door.strokeColor = col('#5a4128');
      door.strokeWidth = 1.5;
      const icon = new paper.PointText({ point: [sp.x, y + 26], content: '🚽', fontSize: 15, justification: 'center' });
      g.addChildren([door, icon]);
      gauges.push(this.buildTapGauge(g, sp.x, game.toilets.gaugeY(h)));
      dirts.push(this.buildDirtBar(g, sp.x, game.toilets.gaugeY(h) + 10));
    }
    // "+" add-toilet button with its price (omitted once the house is full)
    const plus = h.stalls.length < WC.maxStalls
      ? this.buildPlusButton(g, game.toilets.plusPos(h), `＋ ${game.eco.stallCost()} €`)
      : undefined;
    return { g, stalls: h.stalls.length, gauges, dirts, plus };
  }

  /** A small green pill button showing "+ <price> €", clickable in the world.
   *  Returns its parts so the sync pass can grey it out when it's unaffordable. */
  private buildPlusButton(g: paper.Group, pos: { x: number; y: number }, label: string): PlusButton {
    const w = 52, h = 22;
    const pill = new paper.Path.Rectangle(new paper.Rectangle(pos.x - w / 2, pos.y - h / 2, w, h), new paper.Size(11, 11));
    pill.fillColor = col('#3f9d57');
    pill.strokeColor = col('#fff');
    pill.strokeWidth = 2;
    const text = new paper.PointText({
      point: [pos.x, pos.y + 4], content: label, fillColor: '#fff',
      fontSize: 11, fontWeight: 'bold', justification: 'center',
    });
    g.addChildren([pill, text]);
    return { pill, text };
  }

  /** Green when affordable, muted grey when the player can't pay for it. */
  private stylePlusButton(plus: PlusButton | undefined, affordable: boolean): void {
    if (!plus) return;
    plus.pill.fillColor = col(affordable ? '#3f9d57' : '#5b5f63');
    plus.pill.opacity = affordable ? 1 : 0.6;
    plus.text.opacity = affordable ? 1 : 0.7;
  }

  /** A slim brown dirtiness bar under a cabin's progress gauge. */
  private buildDirtBar(g: paper.Group, cx: number, cy: number): DirtBar {
    const w = 28, h = 5;
    const left = cx - w / 2, top = cy - h / 2;
    const bg = new paper.Path.Rectangle(new paper.Rectangle(left, top, w, h), new paper.Size(2, 2));
    bg.fillColor = new paper.Color(0, 0, 0, 0.45);
    bg.strokeColor = new paper.Color(1, 1, 1, 0.25);
    bg.strokeWidth = 1;
    const fill = new paper.Path.Rectangle(new paper.Rectangle(left, top, 0.001, h), new paper.Size(2, 2));
    fill.fillColor = col('#8a5a2a');
    fill.visible = false;
    g.addChildren([bg, fill]);
    return { fill, left, top, w, h };
  }

  // --- storage tanks --------------------------------------------------------

  private syncTanks(game: Game): void {
    const live = new Set<number>();
    const beerFrac = game.eco.beer.capacity > 0 ? game.eco.beer.current / game.eco.beer.capacity : 0;
    const wasteFrac = game.eco.toilet.capacity > 0 ? game.eco.toilet.current / game.eco.toilet.capacity : 0;
    for (const t of game.tanks.list) {
      live.add(t.id);
      let s = this.tankSprites.get(t.id);
      if (!s) { s = this.buildTank(t); this.tankSprites.set(t.id, s); }
      const frac = Math.max(0, Math.min(1, s.kind === 'beer' ? beerFrac : wasteFrac));
      const fh = s.h * frac;
      s.fill.visible = fh > 0.5;
      if (s.fill.visible) s.fill.bounds = new paper.Rectangle(s.left, s.bottom - fh, s.w, fh);
    }
    for (const [id, s] of this.tankSprites) if (!live.has(id)) { s.g.remove(); this.tankSprites.delete(id); }
  }

  private buildTank(t: TankObj): TankSprite {
    const g = new paper.Group();
    this.tanksG.addChild(g);
    const { x, y } = t.pos;
    const w = 34, h = 46;
    const left = x - w / 2, topY = y - h / 2, bottom = y + h / 2;
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(x - 20, bottom - 4, 40, 12));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.15;
    const body = new paper.Path.Rectangle(new paper.Rectangle(left, topY, w, h), new paper.Size(7, 7));
    body.fillColor = col('#3a3f44');
    body.strokeColor = col('#22262a');
    body.strokeWidth = 2;
    // shared-pool fill level (drawn behind a clipping-free simple rect)
    const fill = new paper.Path.Rectangle(new paper.Rectangle(left, bottom - 0.001, w, 0.001));
    fill.fillColor = col(t.kind === 'beer' ? '#f5b531' : '#6a8fbf');
    fill.visible = false;
    const band = new paper.Path.Rectangle(new paper.Rectangle(left, y - 3, w, 6));
    band.fillColor = new paper.Color(0, 0, 0, 0.25);
    const icon = new paper.PointText({
      point: [x, topY - 4], content: t.kind === 'beer' ? '🍺' : '🚽',
      fontSize: 13, justification: 'center',
    });
    g.addChildren([shadow, body, fill, band, icon]);
    return { g, fill, kind: t.kind, left, bottom, w, h };
  }

  // --- decoration (bushes + flowers) ----------------------------------------

  private syncDeco(game: Game): void {
    const live = new Set<number>();
    for (const d of game.deco.list) {
      live.add(d.id);
      let s = this.decoSprites.get(d.id);
      if (!s) { s = this.buildDeco(d); this.decoSprites.set(d.id, s); }
      if (s.blobs.length > 0) {
        const t = Math.max(0, Math.min(1, d.condition / 100));
        const c = this.decoColor(s.kind, t);
        for (const blob of s.blobs) blob.fillColor = c;
      }
    }
    for (const [id, s] of this.decoSprites) if (!live.has(id)) { s.g.remove(); this.decoSprites.delete(id); }
  }

  private decoColor(kind: DecoKind, t: number): paper.Color {
    const dead = kind === 'flower' ? [0.5, 0.46, 0.32] : [0.42, 0.38, 0.24];
    const lush = kind === 'flower' ? [0.85, 0.31, 0.56] : [0.18, 0.56, 0.25];
    return new paper.Color(
      dead[0]! + (lush[0]! - dead[0]!) * t,
      dead[1]! + (lush[1]! - dead[1]!) * t,
      dead[2]! + (lush[2]! - dead[2]!) * t,
    );
  }

  private buildDeco(d: DecoItem): DecoSprite {
    const g = new paper.Group();
    this.decoG.addChild(g);
    const { x, y } = d.pos;
    if (d.kind === 'tree') {
      const shadow = new paper.Path.Ellipse(new paper.Rectangle(x - 34, y + 30, 68, 22));
      shadow.fillColor = col('#000');
      shadow.opacity = 0.15;
      const trunk = new paper.Path.Rectangle(new paper.Rectangle(x - 8, y, 16, 40));
      trunk.fillColor = col('#5a3d22');
      const crown2 = new paper.Path.Circle(new paper.Point(x - 22, y + 8), 26);
      crown2.fillColor = col('#388a38');
      const crown3 = new paper.Path.Circle(new paper.Point(x + 22, y + 8), 26);
      crown3.fillColor = col('#357d35');
      const crown = new paper.Path.Circle(new paper.Point(x, y - 10), 38);
      crown.fillColor = col('#2f6d2f');
      g.addChildren([shadow, trunk, crown2, crown3, crown]);
      return { g, blobs: [], kind: d.kind };
    }
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(x - 14, y + 8, 28, 8));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.13;
    g.addChild(shadow);
    const blobs: paper.Path[] = [];
    if (d.kind === 'bush') {
      const b2 = new paper.Path.Circle(new paper.Point(x - 9, y + 3), 9);
      const b3 = new paper.Path.Circle(new paper.Point(x + 9, y + 3), 9);
      const b1 = new paper.Path.Circle(new paper.Point(x, y - 3), 13);
      blobs.push(b1, b2, b3);
      g.addChildren([b2, b3, b1]);
    } else {
      const stem = new paper.Path.Rectangle(new paper.Rectangle(x - 1.5, y - 2, 3, 14));
      stem.fillColor = col('#2f7d35');
      g.addChild(stem);
      for (const a of [0, 1, 2, 3, 4]) {
        const ang = (a / 5) * Math.PI * 2;
        const petal = new paper.Path.Circle(new paper.Point(x + Math.cos(ang) * 6, y - 4 + Math.sin(ang) * 6), 5);
        blobs.push(petal);
        g.addChild(petal);
      }
      const center = new paper.Path.Circle(new paper.Point(x, y - 4), 3.5);
      center.fillColor = col('#ffd34d');
      g.addChild(center);
    }
    return { g, blobs, kind: d.kind };
  }

  // --- DJs ------------------------------------------------------------------

  /** Show the range rings of only the hovered DJ booth (null = none). */
  setHoveredDj(id: number | null): void {
    this.hoveredDj = id;
  }

  // --- demolish highlight ---------------------------------------------------

  private demolishHi: { g: paper.Group; ring: paper.Path; label: paper.PointText } | null = null;

  /** Highlight the object about to be torn down: red when affordable, grey +
   *  "zu teuer" when the teardown cost can't be paid. Pass null to clear it. */
  setDemolishHover(d: Demolishable | null, affordable = true): void {
    if (!d) {
      if (this.demolishHi) this.demolishHi.g.visible = false;
      return;
    }
    if (!this.demolishHi) {
      const g = new paper.Group();
      const ring = new paper.Path.Circle(new paper.Point(0, 0), 1);
      ring.strokeWidth = 3;
      ring.dashArray = [7, 5];
      const label = new paper.PointText({
        point: [0, 0], content: '',
        fontSize: 13, fontWeight: 'bold', justification: 'center',
      });
      g.addChildren([ring, label]);
      this.demolishHi = { g, ring, label };
    }
    const hi = this.demolishHi;
    // Red = ready to tear down; grey = you can't afford the teardown cost.
    hi.ring.strokeColor = affordable ? new paper.Color(0.95, 0.25, 0.25, 0.95) : new paper.Color(0.6, 0.62, 0.64, 0.9);
    hi.ring.fillColor = affordable ? new paper.Color(0.95, 0.25, 0.25, 0.2) : new paper.Color(0.6, 0.62, 0.64, 0.18);
    hi.label.fillColor = col(affordable ? '#ff7a7a' : '#b9bdc2');
    hi.g.visible = true;
    hi.g.bringToFront();
    hi.ring.bounds = new paper.Rectangle(d.pos.x - d.radius, d.pos.y - d.radius, d.radius * 2, d.radius * 2);
    hi.label.content = affordable ? `🗑 ${d.cost} €` : `🗑 ${d.cost} € (zu teuer)`;
    hi.label.position = new paper.Point(d.pos.x, d.pos.y - d.radius - 10);
  }

  private syncDjs(game: Game): void {
    const live = new Set<number>();
    for (const dj of game.djs.list) {
      live.add(dj.id);
      let s = this.djSprites.get(dj.id);
      if (!s) { s = this.buildDj(dj); this.djSprites.set(dj.id, s); }
      const show = this.hoveredDj === dj.id;
      for (const r of s.rings) r.visible = show;
    }
    for (const [id, s] of this.djSprites) if (!live.has(id)) { s.g.remove(); this.djSprites.delete(id); }
  }

  private buildDj(dj: DjObj): DjSprite {
    const g = new paper.Group();
    this.djsG.addChild(g);
    const { x, y } = dj.pos;
    const ring = new paper.Path.Circle(new paper.Point(x, y), DJ.range);
    ring.fillColor = new paper.Color(0.6, 0.3, 0.9, 0.05);
    ring.strokeColor = new paper.Color(0.7, 0.4, 0.95, 0.5);
    ring.strokeWidth = 1.5;
    ring.dashArray = [8, 6];
    ring.visible = false;
    const close = new paper.Path.Circle(new paper.Point(x, y), DJ.tooClose);
    close.strokeColor = new paper.Color(0.9, 0.3, 0.3, 0.5);
    close.strokeWidth = 1.5;
    close.dashArray = [4, 4];
    close.visible = false;
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(x - 16, y + 8, 32, 9));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.16;
    const deck = new paper.Path.Rectangle(new paper.Rectangle(x - 16, y - 10, 32, 20), new paper.Size(4, 4));
    deck.fillColor = col('#222730');
    deck.strokeColor = col('#11141a');
    deck.strokeWidth = 2;
    const icon = new paper.PointText({ point: [x, y + 5], content: '🎧', fontSize: 15, justification: 'center' });
    g.addChildren([ring, close, shadow, deck, icon]);
    return { g, rings: [ring, close] };
  }

  // --- gardeners ------------------------------------------------------------

  private syncGardeners(game: Game): void {
    const live = new Set<number>();
    for (const gr of game.gardeners) {
      live.add(gr.id);
      let s = this.gardeners.get(gr.id);
      if (!s) { s = this.buildGardener(gr); this.gardeners.set(gr.id, s); }
      s.g.position = new paper.Point(gr.pos.x, gr.pos.y);
      if (gr.moving) s.body.position = new paper.Point(0, 6 + Math.sin(gr.bob) * 1.5);
    }
    for (const [id, s] of this.gardeners) if (!live.has(id)) { s.g.remove(); this.gardeners.delete(id); }
  }

  private buildGardener(gr: Gardener): SimpleSprite {
    const g = new paper.Group();
    g.applyMatrix = false;
    this.entitiesG.addChild(g);
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(-10, 14, 20, 8));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.18;
    const body = new paper.Path.Circle(new paper.Point(0, 6), 11);
    body.fillColor = col('#4a6b3a'); // earthy green overalls
    const head = new paper.Path.Circle(new paper.Point(0, -10), 8);
    head.fillColor = col('#e0a87a');
    const brim = new paper.Path.Ellipse(new paper.Rectangle(-9, -17, 18, 6));
    brim.fillColor = col('#2f8f3f'); // green hat
    const cap = new paper.Path.Circle(new paper.Point(0, -17), 6);
    cap.fillColor = col('#3fbf57');
    g.addChildren([shadow, body, head, brim, cap]);
    g.position = new paper.Point(gr.pos.x, gr.pos.y);
    return { g, body };
  }

  // --- Servicekräfte (merged beer + pretzel staff) --------------------------

  private syncService(game: Game): void {
    const live = new Set<number>();
    for (const s of game.service) {
      live.add(s.id);
      let sp = this.service.get(s.id);
      if (!sp) { sp = this.buildService(s); this.service.set(s.id, sp); }
      sp.g.position = new paper.Point(s.pos.x, s.pos.y);
      // Walking: bob up/down. At a post: sway gently side to side.
      sp.body.position = s.moving
        ? new paper.Point(0, 6 + Math.sin(s.bob) * 1.5)
        : new paper.Point(Math.sin(s.bob) * 2, 6);
    }
    for (const [id, sp] of this.service) if (!live.has(id)) { sp.g.remove(); this.service.delete(id); }
  }

  private buildService(s: ServiceStaff): SimpleSprite {
    const g = new paper.Group();
    g.applyMatrix = false;
    this.entitiesG.addChild(g);
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(-10, 14, 20, 8));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.18;
    const body = new paper.Path.Circle(new paper.Point(0, 6), 11);
    body.fillColor = col('#3b3b46'); // dark shirt
    const apron = new paper.Path.Rectangle(new paper.Rectangle(-7, 2, 14, 12), new paper.Size(2, 2));
    apron.fillColor = col('#d9b14f'); // beer-yellow apron
    const head = new paper.Path.Circle(new paper.Point(0, -10), 8);
    head.fillColor = col('#e0a87a');
    const brim = new paper.Path.Ellipse(new paper.Rectangle(-9, -17, 18, 6));
    brim.fillColor = col('#e0b400'); // yellow hat
    const cap = new paper.Path.Circle(new paper.Point(0, -17), 6);
    cap.fillColor = col('#ffd34d');
    g.addChildren([shadow, body, apron, head, brim, cap]);
    g.position = new paper.Point(s.pos.x, s.pos.y);
    return { g, body };
  }

  // --- paths ----------------------------------------------------------------

  private syncPaths(game: Game): void {
    const live = new Set<number>();
    for (const t of game.paths.list) {
      live.add(t.id);
      if (!this.pathSprites.has(t.id)) {
        const tile = new paper.Path.Circle(new paper.Point(t.pos.x, t.pos.y), 26);
        tile.fillColor = col('#b7a07a');
        const g = new paper.Group([tile]);
        this.pathsG.addChild(g);
        this.pathSprites.set(t.id, g);
      }
    }
    for (const [id, g] of this.pathSprites) if (!live.has(id)) { g.remove(); this.pathSprites.delete(id); }
  }

  // --- tables ---------------------------------------------------------------

  private syncUnits(game: Game): void {
    const live = new Set<number>();
    for (const u of game.seating.units) {
      live.add(u.id);
      const existing = this.units.get(u.id);
      if (!existing) {
        this.units.set(u.id, this.buildUnit(u));
      } else if (existing.benches !== u.benches) {
        existing.g.remove();
        existing.umbrella?.remove();
        this.units.set(u.id, this.buildUnit(u));
      }
    }
    for (const [id, s] of this.units) {
      if (!live.has(id)) { s.g.remove(); s.umbrella?.remove(); this.units.delete(id); }
    }
  }

  private buildUnit(u: Unit): { g: paper.Group; umbrella: paper.Group | null; benches: number } {
    const g = new paper.Group();
    this.tablesG.addChild(g);
    let umbrella: paper.Group | null = null;
    if (u.kind === 'stand') {
      this.drawStand(g, u);
    } else {
      this.drawBenchTable(g, u);
      // Drawn into the top-most group so the parasol covers the guests beneath it.
      umbrella = new paper.Group();
      this.umbrellasG.addChild(umbrella);
      this.drawUmbrella(umbrella, u.center.x, u.center.y - 4);
    }
    return { g, umbrella, benches: u.benches };
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
  }

  /** The parasol canopy. Drawn into its own top-most group so it floats above
   *  the guests sitting at the table. */
  private drawUmbrella(g: paper.Group, cx: number, cy: number): void {
    const R = 56;
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

  // --- pretzel stands -------------------------------------------------------

  private syncStands(game: Game): void {
    const live = new Set<number>();
    for (const s of game.stands.list) {
      live.add(s.id);
      let sp = this.standSprites.get(s.id);
      if (!sp) { sp = this.buildStand(game, s); this.standSprites.set(s.id, sp); }
      const p = game.stands.serveProgress(s);
      sp.gauge.fill.visible = p > 0.001;
      if (sp.gauge.fill.visible) sp.gauge.fill.bounds = new paper.Rectangle(sp.gauge.left, sp.gauge.top, sp.gauge.w * p, sp.gauge.h);
      const len = game.stands.queueLen(s);
      const txt = len > 0 ? String(len) : '';
      if (sp.gauge.count.content !== txt) sp.gauge.count.content = txt;
      // Remaining-stock bar: green → yellow → red as it runs low.
      const frac = ECONOMY.pretzelCapacity > 0 ? s.stock / ECONOMY.pretzelCapacity : 0;
      sp.stock.fill.visible = frac > 0.001;
      if (sp.stock.fill.visible) sp.stock.fill.bounds = new paper.Rectangle(sp.stock.left, sp.stock.top, sp.stock.w * frac, sp.stock.h);
      sp.stock.fill.fillColor = col(frac > 0.5 ? '#5fbf57' : frac > 0.2 ? '#e0b53a' : '#d65a4a');
      // Auto-resupply badge: shown only while this stand restocks itself.
      sp.auto.visible = s.autoDeliver;
    }
    for (const [id, sp] of this.standSprites) if (!live.has(id)) { sp.g.remove(); this.standSprites.delete(id); }
  }

  private buildStand(game: Game, s: Stand): { g: paper.Group; gauge: TapGauge; stock: DirtBar; auto: paper.PointText } {
    const g = new paper.Group();
    this.standsG.addChild(g);
    const { x, y } = s.pos;
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(x - 30, y + 18, 60, 14));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.15;
    // counter / booth body
    const body = new paper.Path.Rectangle(new paper.Rectangle(x - 28, y - 8, 56, 30), new paper.Size(5, 5));
    body.fillColor = col('#9c5a2a');
    body.strokeColor = col('#6e3e1c');
    body.strokeWidth = 2;
    // striped awning
    for (let i = 0; i < 6; i++) {
      const stripe = new paper.Path.Rectangle(new paper.Rectangle(x - 30 + i * 10, y - 22, 10, 14));
      stripe.fillColor = col(i % 2 === 0 ? '#d94f4f' : '#f4f0e8');
      stripe.strokeColor = new paper.Color(0, 0, 0, 0.12);
      stripe.strokeWidth = 1;
      g.addChild(stripe);
    }
    const roof = new paper.Path.Rectangle(new paper.Rectangle(x - 32, y - 24, 64, 6), new paper.Size(2, 2));
    roof.fillColor = col('#7a4420');
    const sign = new paper.PointText({
      point: [x, y + 12],
      content: '🥨',
      fontSize: 18,
      justification: 'center',
    });
    // Auto-resupply badge above the awning (toggled in syncStands).
    const auto = new paper.PointText({
      point: [x + 22, y - 26], content: '🔁', fontSize: 13, justification: 'center',
    });
    auto.visible = false;
    g.insertChild(0, shadow);
    g.addChildren([body, roof, sign, auto]);
    // A remaining-stock bar above the booth, and the serve/queue gauge below it.
    const stock = this.buildStockBar(g, x, y - 30);
    const gauge = this.buildTapGauge(g, x, game.stands.gaugeY(s));
    return { g, gauge, stock, auto };
  }

  /** A slim bar above a stand showing how much pretzel stock is left. */
  private buildStockBar(g: paper.Group, cx: number, cy: number): DirtBar {
    const w = 34, h = 6;
    const left = cx - w / 2, top = cy - h / 2;
    const bg = new paper.Path.Rectangle(new paper.Rectangle(left, top, w, h), new paper.Size(2, 2));
    bg.fillColor = new paper.Color(0, 0, 0, 0.5);
    bg.strokeColor = new paper.Color(1, 1, 1, 0.35);
    bg.strokeWidth = 1;
    const fill = new paper.Path.Rectangle(new paper.Rectangle(left, top, 0.001, h), new paper.Size(2, 2));
    fill.fillColor = col('#5fbf57');
    fill.visible = false;
    g.addChildren([bg, fill]);
    return { fill, left, top, w, h };
  }

  // --- DJ staff -------------------------------------------------------------

  private syncDjStaff(game: Game): void {
    const live = new Set<number>();
    for (const dj of game.djStaff) {
      live.add(dj.id);
      let s = this.djStaffSprites.get(dj.id);
      if (!s) { s = this.buildStaffFigure(dj.pos, '#2a2a33', '#11141a', true); this.djStaffSprites.set(dj.id, s); }
      s.g.position = new paper.Point(dj.pos.x, dj.pos.y);
      // Walking: bob. At the booth: bob to the beat.
      s.body.position = dj.moving
        ? new paper.Point(0, 6 + Math.sin(dj.bob) * 1.5)
        : new paper.Point(0, 6 + Math.sin(dj.bob * 1.7) * 1.8);
    }
    for (const [id, s] of this.djStaffSprites) if (!live.has(id)) { s.g.remove(); this.djStaffSprites.delete(id); }
  }

  /** A staff figure: body + head, optional cap colour and/or headphones (DJ). */
  private buildStaffFigure(
    pos: { x: number; y: number }, shirt: string, trim: string, headphones = false, cap?: string,
  ): SimpleSprite {
    const g = new paper.Group();
    g.applyMatrix = false;
    this.entitiesG.addChild(g);
    const shadow = new paper.Path.Ellipse(new paper.Rectangle(-10, 14, 20, 8));
    shadow.fillColor = col('#000');
    shadow.opacity = 0.18;
    const body = new paper.Path.Circle(new paper.Point(0, 6), 11);
    body.fillColor = col(shirt);
    body.strokeColor = col(trim);
    body.strokeWidth = 1;
    const head = new paper.Path.Circle(new paper.Point(0, -10), 8);
    head.fillColor = col('#e0a87a');
    g.addChildren([shadow, body, head]);
    if (cap) {
      const brim = new paper.Path.Ellipse(new paper.Rectangle(-9, -17, 18, 6));
      const top = new paper.Path.Circle(new paper.Point(0, -17), 6);
      brim.fillColor = top.fillColor = col(cap);
      g.addChildren([brim, top]);
    }
    if (headphones) {
      const band = new paper.Path.Arc(new paper.Point(-8, -10), new paper.Point(0, -19), new paper.Point(8, -10));
      band.strokeColor = col('#111');
      band.strokeWidth = 2;
      const earL = new paper.Path.Circle(new paper.Point(-8, -10), 2.6);
      const earR = new paper.Path.Circle(new paper.Point(8, -10), 2.6);
      earL.fillColor = earR.fillColor = col('#111');
      g.addChildren([band, earL, earR]);
    }
    g.position = new paper.Point(pos.x, pos.y);
    return { g, body };
  }

  // --- towels (one per taken seat) ------------------------------------------

  private syncTowels(game: Game): void {
    // Which guest sits on which claimed seat, so each towel uses their design.
    const occupant = new Map<string, Person>();
    for (const p of game.people) {
      const ref = p.seatRef;
      if (ref) occupant.set(`${ref.table}-${ref.seat}`, p);
    }
    const live = new Set<string>();
    for (const u of game.seating.units) {
      const seats = game.seating.seatPositionsOf(u);
      u.taken.forEach((taken, si) => {
        if (!taken) return;
        const who = occupant.get(`${u.id}-${si}`);
        // Key by occupant too, so a fresh guest on the same seat gets a new towel.
        const key = `${u.id}-${si}-${who ? who.id : 'x'}`;
        live.add(key);
        if (!this.towels.has(key)) this.towels.set(key, this.buildTowel(seats[si]!, who?.towel));
      });
    }
    for (const [key, g] of this.towels) if (!live.has(key)) { g.remove(); this.towels.delete(key); }
  }

  private buildTowel(p: { x: number; y: number }, towel?: Towel): paper.Group {
    const g = new paper.Group();
    this.towelsG.addChild(g);
    const t: Towel = towel ?? { base: '#eef0f2', accent: '#d94f4f', pattern: 'vstripe2' };
    const left = p.x - 10, top = p.y - 5, w = 20, h = 11;
    const base = new paper.Path.Rectangle(new paper.Rectangle(left, top, w, h), new paper.Size(2, 2));
    base.fillColor = col(t.base);
    base.strokeColor = col('#b9bdc2');
    base.strokeWidth = 1;
    g.addChild(base);
    const acc = col(t.accent);
    const vStripe = (cx: number): void => {
      const s = new paper.Path.Rectangle(new paper.Rectangle(cx - 2, top, 4, h));
      s.fillColor = acc;
      g.addChild(s);
    };
    const hStripe = (cy: number): void => {
      const s = new paper.Path.Rectangle(new paper.Rectangle(left + 1, cy - 2, w - 2, 4));
      s.fillColor = acc;
      g.addChild(s);
    };
    const midY = p.y + 0.5; // vertical centre of the towel
    switch (t.pattern) {
      case 'plain': break;
      case 'vstripe1': vStripe(p.x); break;
      case 'vstripe2': vStripe(p.x - 6); vStripe(p.x + 6); break;
      case 'hstripe': hStripe(midY); break;
      case 'cross': vStripe(p.x); hStripe(midY); break;
      case 'circle': {
        const dot = new paper.Path.Circle(new paper.Point(p.x, midY), 3.4);
        dot.fillColor = acc;
        g.addChild(dot);
        break;
      }
    }
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

  /** A few hearts drifting up over each guest currently petting a dog. */
  private syncHearts(game: Game): void {
    this.heartPhase += 1;
    const PERIOD = 48; // frames for one heart to rise and fade
    const live = new Set<number>();
    for (const p of game.people) {
      const spot = p.petSpot;
      if (!spot) continue;
      live.add(p.id);
      let g = this.hearts.get(p.id);
      if (!g) { g = this.buildHearts(); this.hearts.set(p.id, g); }
      g.children.forEach((h, i) => {
        // Each heart is offset in time + sideways so they stagger and sway.
        const phase = ((this.heartPhase + i * (PERIOD / 3)) % PERIOD) / PERIOD; // 0..1
        h.position = new paper.Point(
          spot.x + (i - 1) * 7 + Math.sin(phase * Math.PI * 2) * 3,
          spot.y - 12 - phase * 30,
        );
        h.opacity = 1 - phase;
        h.scaling = new paper.Point(0.7 + phase * 0.3, 0.7 + phase * 0.3);
      });
      g.bringToFront();
    }
    for (const [id, g] of this.hearts) if (!live.has(id)) { g.remove(); this.hearts.delete(id); }
  }

  private buildHearts(): paper.Group {
    const g = new paper.Group();
    for (let i = 0; i < 3; i++) {
      const heart = new paper.PointText({
        point: [0, 0],
        content: '💗',
        justification: 'center',
        fontSize: 14,
      });
      heart.applyMatrix = false;
      g.addChild(heart);
    }
    this.entitiesG.addChild(g);
    return g;
  }

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
      s.pretzel.visible = p.pretzelVisible;
      // The head reddens as the guest grows unhappy (normal skin at ≥50 satisfaction).
      const t = Math.max(0, Math.min(1, p.satisfaction / 50));
      s.head.fillColor = new paper.Color(
        0.86 + (s.skin.red - 0.86) * t,
        0.22 + (s.skin.green - 0.22) * t,
        0.22 + (s.skin.blue - 0.22) * t,
      );
    }
    for (const [id, s] of this.people) if (!live.has(id)) { s.g.remove(); this.people.delete(id); }
    this.updateHighlight(game);
  }

  /** Position + pulse the highlight ring on the selected guest, if present. */
  private updateHighlight(game: Game): void {
    const target = this.selectedPerson === null ? undefined : game.people.find((p) => p.id === this.selectedPerson);
    if (!target) {
      if (this.highlightRing) this.highlightRing.visible = false;
      return;
    }
    if (!this.highlightRing) {
      const ring = new paper.Path.Circle(new paper.Point(0, 0), 20);
      ring.applyMatrix = false;
      ring.strokeColor = col('#ffd34d');
      ring.strokeWidth = 3;
      ring.fillColor = new paper.Color(1, 0.83, 0.3, 0.12);
      this.entitiesG.addChild(ring);
      this.highlightRing = ring;
    }
    this.pulse += 0.15;
    const s = 1 + Math.sin(this.pulse) * 0.12;
    this.highlightRing.visible = true;
    this.highlightRing.position = new paper.Point(target.pos.x, target.pos.y - 2);
    this.highlightRing.scaling = new paper.Point(s, s);
    this.highlightRing.bringToFront();
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
    const skin = col(p.skin);
    head.fillColor = skin;
    const mug = new paper.Group();
    const glass = new paper.Path.Rectangle(new paper.Rectangle(14, -6, 9, 14), new paper.Size(2, 2));
    glass.fillColor = col('#f5b531');
    glass.strokeColor = col('#b6831a');
    const foam = new paper.Path.Rectangle(new paper.Rectangle(14, -8, 9, 4), new paper.Size(2, 2));
    foam.fillColor = col('#fff');
    mug.addChildren([glass, foam]);
    mug.visible = false;
    // a little pretzel held in the other hand while eating
    const pretzel = new paper.Group();
    const ring = new paper.Path.Circle(new paper.Point(-18, 2), 6);
    ring.strokeColor = col('#8a5a25');
    ring.strokeWidth = 3;
    ring.fillColor = new paper.Color(0, 0, 0, 0); // hollow, so it reads as a pretzel
    const knot = new paper.Path.Circle(new paper.Point(-18, 2), 1.6);
    knot.fillColor = col('#8a5a25');
    pretzel.addChildren([ring, knot]);
    pretzel.visible = false;
    g.addChildren([shadow, body, head, mug, pretzel]);
    g.position = new paper.Point(p.pos.x, p.pos.y);
    return { g, body, head, skin, mug, glass, pretzel };
  }

  // --- dogs -----------------------------------------------------------------

  private syncDogs(game: Game): void {
    const live = new Set<number>();
    for (const d of game.dogs) {
      live.add(d.id);
      let s = this.dogs.get(d.id);
      if (!s) { s = this.buildDog(d); this.dogs.set(d.id, s); }
      // Reflect by writing the matrix directly (built facing right). Setting
      // `scaling = -1` each frame is unstable: paper re-decomposes the reflected
      // matrix ambiguously and flips it back, which glitches.
      const sx = d.facing >= 0 ? 1 : -1;
      s.g.matrix = new paper.Matrix(sx, 0, 0, 1, d.pos.x, d.pos.y);
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
    return { g, tail };
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
      // Built facing left; reflect to face right via an explicit matrix.
      // (Setting `scaling = -1` glitches — see syncDogs for why.)
      const sx = t.facing >= 0 ? -1 : 1;
      g.matrix = new paper.Matrix(sx, 0, 0, 1, t.pos.x, t.pos.y);
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
    const bodyCol = t.kind === 'beer' ? '#9c5a2a' : t.kind === 'klo' ? '#4f7fa6' : '#caa46a';
    const roofCol = t.kind === 'beer' ? '#7a4420' : t.kind === 'klo' ? '#3c6486' : '#a37f44';
    const body = new paper.Path.Rectangle(new paper.Rectangle(-26, -14, 52, 24), new paper.Size(4, 4));
    body.fillColor = col(bodyCol);
    const roof = new paper.Path.Rectangle(new paper.Rectangle(-26, -18, 52, 8), new paper.Size(3, 3));
    roof.fillColor = col(roofCol);
    const sign = new paper.Path.Rectangle(new paper.Rectangle(-12, -10, 24, 16), new paper.Size(2, 2));
    sign.fillColor = col('#fff');
    const icon = new paper.PointText({
      point: [0, 3],
      content: t.kind === 'beer' ? '🍺' : t.kind === 'klo' ? '🚽' : '🥨',
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
