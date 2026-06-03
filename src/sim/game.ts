// The backend simulation: owns the economy, clock, seating, litter and all
// entities, and advances them one tick at a time. Pure — no Paper.js, no DOM —
// so it runs headlessly (tests, CLI) and is driven by command methods.

import { rand, type Vec } from './vec.js';
import { ARRIVALS, CLOCK, DELIVERY, DOGCATCHER, MAX_DOGS, MAX_PEOPLE, PLACES, START, STRAY_DOG, WORLD } from '../config.js';
import { GameState, type Outcome } from './economy.js';
import { Clock } from './clock.js';
import { Seating } from './seating.js';
import { LitterField } from './litter.js';
import { Person } from './entities/person.js';
import { Dog } from './entities/dog.js';
import { Cleaner } from './entities/cleaner.js';
import { Dogcatcher } from './entities/dogcatcher.js';
import { Truck } from './entities/truck.js';
import type { Places, World } from './world.js';
import type { SfxName } from './sound.js';

export type PlaceKind = 'table' | 'stand' | 'bench';

export interface Aggregates {
  people: number;
  dogs: number;
  avgSatisfaction: number;
  avgThirst: number;
  avgBladder: number;
  moneyPerVisitor: number;
  litter: number;
  beerPour: number;
  time: string;
  salesOpen: boolean;
}

export class Game implements World {
  readonly eco = new GameState();
  readonly clock = new Clock();
  readonly seating = new Seating();
  readonly litter = new LitterField();
  readonly places: Places = {
    entrance: { ...PLACES.entrance },
    bar: { ...PLACES.bar },
    toilet: { ...PLACES.toilet },
  };

  readonly people: Person[] = [];
  readonly dogs: Dog[] = [];
  readonly cleaners: Cleaner[] = [];
  readonly trucks: Truck[] = [];
  dogcatcher: Dogcatcher | null = null;

  private beerTruck: Truck | null = null;
  private kloTruck: Truck | null = null;

  ended = false;
  outcome: Outcome | null = null;

  /** Total guests that have arrived (for stats / tests). */
  arrivalsTotal = 0;

  private nextId = 1;
  private dogSpawnTimer = rand(STRAY_DOG.spawnIntervalMin, STRAY_DOG.spawnIntervalMax);
  private sfx: SfxName[] = [];

  // Hourly arrival schedule: at each new hour we pick how many guests come and
  // when (random) within the hour.
  private lastHour = -1;
  private hourTick = 0;
  private arrivals: number[] = [];

  constructor() {
    for (let i = 0; i < START.guests; i++) this.spawnPerson();
    for (let i = 0; i < START.dogs; i++) this.spawnDog();
    for (let i = 0; i < START.cleaners; i++) this.cleaners.push(new Cleaner(this.nextId++));
  }

  // --- the one tick ---------------------------------------------------------

  tick(): void {
    if (this.ended) return;

    this.clock.tick();
    this.eco.salesOpen = this.clock.isOpenForBusiness();
    this.eco.tick();

    this.updateArrivals();

    this.dogSpawnTimer--;
    if (this.dogSpawnTimer <= 0) {
      if (this.dogs.length < MAX_DOGS) this.spawnDog();
      this.dogSpawnTimer = rand(STRAY_DOG.spawnIntervalMin, STRAY_DOG.spawnIntervalMax);
    }

    for (let i = this.people.length - 1; i >= 0; i--) {
      const p = this.people[i]!;
      if (!p.tick(this)) {
        p.onRemove(this);
        this.people.splice(i, 1);
      }
    }
    for (const d of this.dogs) d.tick(this);
    for (const c of this.cleaners) c.tick(this);
    if (this.dogcatcher && !this.dogcatcher.tick(this)) this.dogcatcher = null;

    for (let i = this.trucks.length - 1; i >= 0; i--) {
      const t = this.trucks[i]!;
      if (!t.tick(this)) {
        this.trucks.splice(i, 1);
        if (t === this.beerTruck) this.beerTruck = null;
        if (t === this.kloTruck) this.kloTruck = null;
      }
    }

    const o = this.eco.outcome();
    if (o) {
      this.ended = true;
      this.outcome = o;
    }
  }

  // --- World impl -----------------------------------------------------------

  play(name: SfxName): void {
    this.sfx.push(name);
  }

  nearestDog(from: Vec): Dog | null {
    let best: Dog | null = null;
    let bestDist = Infinity;
    for (const d of this.dogs) {
      const dd = d.distanceTo(from);
      if (dd < bestDist) {
        bestDist = dd;
        best = d;
      }
    }
    return best;
  }

  catchDog(dog: Dog): void {
    const i = this.dogs.indexOf(dog);
    if (i < 0) return;
    this.dogs.splice(i, 1);
    for (const p of this.people) p.upset(DOGCATCHER.satPerDog); // guests dislike the spectacle
  }

  /** Drain queued sound effects (the view plays them; CLI ignores). */
  drainSounds(): SfxName[] {
    const s = this.sfx;
    this.sfx = [];
    return s;
  }

  // --- commands -------------------------------------------------------------

  setBeerPrice(price: number): void {
    this.eco.setBeerPrice(price);
  }
  setRestockAmount(amount: number): void {
    this.eco.setRestockAmount(amount);
  }
  /** Order beer: pay now; a truck delivers it after a delay (gradual fill). */
  orderBeer(): boolean {
    if (this.beerTruck) return false;
    const amount = this.eco.plannedRestock();
    if (amount <= 0) return false;
    if (!this.eco.spend(this.eco.restockCost())) return false;
    const secs = DELIVERY.minSeconds + Math.random() * (DELIVERY.maxSeconds - DELIVERY.minSeconds);
    this.beerTruck = this.spawnTruck('beer', secs, amount);
    this.play('pour');
    return true;
  }

  /** Call the Klowagen: pay now; it arrives after a delay and empties the tank. */
  callKlowagen(): boolean {
    if (this.kloTruck) return false;
    if (this.eco.toilet.current <= 0) return false;
    if (!this.eco.spend(this.eco.klowagenCost())) return false;
    const secs = DELIVERY.kloMinSeconds + Math.random() * (DELIVERY.kloMaxSeconds - DELIVERY.kloMinSeconds);
    this.kloTruck = this.spawnTruck('klo', secs, 0);
    this.play('toilet');
    return true;
  }

  /** Buy the next toilet-tank upgrade (doubles its capacity). */
  upgradeToilet(): boolean {
    return this.eco.upgradeToilet();
  }

  beerOrderPending(): boolean {
    return !!this.beerTruck;
  }
  beerOrderProgress(): number {
    return this.beerTruck ? this.beerTruck.arrivalProgress() : 0;
  }
  kloPending(): boolean {
    return !!this.kloTruck;
  }
  kloProgress(): number {
    return this.kloTruck ? this.kloTruck.arrivalProgress() : 0;
  }

  private spawnTruck(kind: 'beer' | 'klo', delaySeconds: number, amount: number): Truck {
    const t = new Truck(this.nextId++, kind, delaySeconds, amount);
    this.trucks.push(t);
    return t;
  }
  hireBartender(): boolean {
    return this.eco.hireBartender();
  }
  fireBartender(): boolean {
    return this.eco.fireBartender();
  }
  hireCleaner(): boolean {
    if (!this.eco.hireCleaner()) return false;
    this.cleaners.push(new Cleaner(this.nextId++));
    return true;
  }
  fireCleaner(): boolean {
    if (!this.eco.fireCleaner()) return false;
    this.cleaners.pop()?.onRemove();
    return true;
  }
  callDogCatcher(): boolean {
    if (!this.dogCatcherAvailable()) return false;
    if (!this.eco.spend(this.eco.dogCatcherCost())) return false;
    this.dogcatcher = new Dogcatcher(this.nextId++, this.places.entrance);
    return true;
  }
  dogCatcherAvailable(): boolean {
    return this.dogs.length > 0 && this.eco.canAfford(this.eco.dogCatcherCost()) && !this.dogcatcher;
  }

  // --- furniture placement (pure: validity + place) -------------------------

  tableBuyable(): boolean {
    return this.seating.canAddTable() && this.eco.canAfford(this.eco.tableCost());
  }
  standBuyable(): boolean {
    return this.seating.canAddTable() && this.eco.canAfford(this.eco.standCost());
  }
  benchBuyable(): boolean {
    return this.seating.canAddBench() && this.eco.canAfford(this.eco.benchCost());
  }

  /** Whether `kind` may be placed at `point` (for ghost colour + placement). */
  canPlace(kind: PlaceKind, point: Vec): boolean {
    if (kind === 'bench') {
      return this.seating.canAddBenchNear(point) && this.eco.canAfford(this.eco.benchCost());
    }
    const cost = kind === 'stand' ? this.eco.standCost() : this.eco.tableCost();
    const radius = kind === 'stand' ? 44 : 62;
    return (
      this.inField(point) &&
      this.seating.isClear(point, radius) &&
      this.seating.canAddTable() &&
      this.eco.canAfford(cost)
    );
  }

  /** Place `kind` at `point`. Returns false (no charge) if invalid. */
  place(kind: PlaceKind, point: Vec): boolean {
    if (!this.canPlace(kind, point)) return false;
    if (kind === 'bench') {
      this.eco.spend(this.eco.benchCost());
      this.seating.addBenchNear(point);
    } else if (kind === 'stand') {
      this.eco.spend(this.eco.standCost());
      this.seating.addStandTable(point);
    } else {
      this.eco.spend(this.eco.tableCost());
      this.seating.addBenchTable(point);
    }
    this.play('cheers');
    return true;
  }

  // --- view model -----------------------------------------------------------

  aggregates(): Aggregates {
    const n = this.people.length;
    let sat = 0;
    let thirst = 0;
    let bladder = 0;
    let pour = 0;
    for (const p of this.people) {
      sat += p.satisfaction;
      thirst += p.thirst;
      bladder += p.bladder;
      if (p.pourProgress > pour) pour = p.pourProgress;
    }
    return {
      people: n,
      dogs: this.dogs.length,
      avgSatisfaction: n ? sat / n : 0,
      avgThirst: n ? thirst / n : 0,
      avgBladder: n ? bladder / n : 0,
      moneyPerVisitor: this.eco.moneyPerVisitor(),
      litter: this.litter.count,
      beerPour: pour,
      time: this.clock.label(),
      salesOpen: this.clock.isOpenForBusiness(),
    };
  }

  // --- internals ------------------------------------------------------------

  private inField(p: Vec): boolean {
    return p.x > 90 && p.x < WORLD.w - 90 && p.y > 150 && p.y < WORLD.h - 110;
  }

  /**
   * Guests arrive on an hourly budget: per in-game hour roughly reputation/10
   * guests come (50% popularity -> 5), ±30%, at random times within the hour.
   */
  private updateArrivals(): void {
    if (this.clock.hour !== this.lastHour) {
      this.lastHour = this.clock.hour;
      this.hourTick = 0;
      this.scheduleArrivals();
    } else {
      this.hourTick++;
    }
    while (this.arrivals.length > 0 && this.arrivals[0]! <= this.hourTick) {
      this.arrivals.shift();
      this.spawnPerson();
    }
  }

  private scheduleArrivals(): void {
    this.arrivals = [];
    if (!this.clock.isOpenForBusiness()) return; // no new guests after last call
    const jittered = (this.eco.reputation / ARRIVALS.divisor) * rand(1 - ARRIVALS.jitter, 1 + ARRIVALS.jitter);
    const target = Math.max(ARRIVALS.minPerHour, Math.round(jittered));
    const hourFrames = CLOCK.secondsPerHour * 60;
    for (let i = 0; i < target; i++) this.arrivals.push(Math.floor(rand(0, hourFrames)));
    this.arrivals.sort((a, b) => a - b);
  }

  private spawnPerson(): void {
    if (this.people.length >= MAX_PEOPLE) return;
    this.people.push(new Person(this.nextId++, this.places.entrance));
    this.arrivalsTotal++;
  }

  private spawnDog(): void {
    if (this.dogs.length >= MAX_DOGS) return;
    this.dogs.push(new Dog(this.nextId++));
  }
}
