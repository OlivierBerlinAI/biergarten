// The backend simulation: owns the economy, clock, seating, litter and all
// entities, and advances them one tick at a time. Pure — no Paper.js, no DOM —
// so it runs headlessly (tests, CLI) and is driven by command methods.

import { rand, type Vec } from './vec.js';
import { ARRIVALS, BAR, CLOCK, DELIVERY, DJ, DOGCATCHER, ECONOMY, GUEST, MAX_DOGS, MAX_PEOPLE, PLACES, START, STRAY_DOG, WC, WORLD } from '../config.js';
import { GameState, type Outcome } from './economy.js';
import { Clock } from './clock.js';
import { Seating } from './seating.js';
import { Stands, type Stand } from './stands.js';
import { Toilets, type WcHouse } from './toilets.js';
import { Tanks } from './tanks.js';
import { Deco } from './deco.js';
import { DJs, type DjObj } from './djs.js';
import { Paths } from './paths.js';
import { LitterField } from './litter.js';
import { Bar, type Ausschank } from './bar.js';
import { Person } from './entities/person.js';
import { ServiceStaff, type ServiceAssignment } from './entities/service.js';
import { Gardener } from './entities/gardener.js';
import { DjStaff } from './entities/djstaff.js';
import { Dog } from './entities/dog.js';
import { Cleaner } from './entities/cleaner.js';
import { Dogcatcher } from './entities/dogcatcher.js';
import { Truck } from './entities/truck.js';
import { EventLog, type LogCat, type LogEntry } from './log.js';
import type { Places, World } from './world.js';
import type { SfxName } from './sound.js';

export type PlaceKind =
  | 'table' | 'stand' | 'bench' | 'pretzel' | 'ausschank' | 'wc'
  | 'beertank' | 'wastetank' | 'bush' | 'flower' | 'tree' | 'dj' | 'path';

/** A removable object found under the cursor in demolish mode. */
export interface Demolishable {
  kind: PlaceKind;
  id: number;
  pos: Vec;
  radius: number;
  /** Teardown cost (half the build price) — the player pays this to remove it. */
  cost: number;
}

export interface Aggregates {
  people: number;
  dogs: number;
  avgSatisfaction: number;
  avgThirst: number;
  avgBladder: number;
  avgHunger: number;
  toiletDirt: number;
  moneyPerVisitor: number;
  litter: number;
  /** Combined pretzel stock across all stands (for the overview). */
  pretzelStock: number;
  /** Whether any stand auto-supplies itself (overview badge). */
  pretzelAuto: boolean;
  time: string;
  salesOpen: boolean;
}

export class Game implements World {
  readonly eco = new GameState();
  readonly clock = new Clock();
  readonly seating = new Seating();
  readonly stands = new Stands();
  readonly toilets = new Toilets();
  readonly tanks = new Tanks();
  readonly deco = new Deco();
  readonly djs = new DJs();
  readonly paths = new Paths();
  readonly litter = new LitterField();
  readonly places: Places = {
    entrance: { ...PLACES.entrance },
    bar: { ...PLACES.bar },
    toilet: { ...PLACES.toilet },
  };
  readonly bar = new Bar();

  readonly people: Person[] = [];
  readonly service: ServiceStaff[] = [];
  readonly gardeners: Gardener[] = [];
  readonly djStaff: DjStaff[] = [];
  readonly dogs: Dog[] = [];
  readonly cleaners: Cleaner[] = [];
  readonly trucks: Truck[] = [];
  dogcatcher: Dogcatcher | null = null;

  private beerTruck: Truck | null = null;
  private kloTruck: Truck | null = null;
  // Pretzel deliveries are tracked per stand (stand.delivery), so several can be
  // in flight at once — no single shared truck reference here.

  ended = false;
  outcome: Outcome | null = null;
  private winClaimed = false; // set once the player keeps playing past a win

  /** Total guests that have arrived (for stats / tests). */
  arrivalsTotal = 0;

  private nextId = 1;
  private allocTimer = 0; // frames until the next service-staff reallocation
  private dogSpawnTimer = rand(STRAY_DOG.spawnIntervalMin, STRAY_DOG.spawnIntervalMax);
  private sfx: SfxName[] = [];
  private readonly events = new EventLog();

  // Hourly arrival schedule: at each new hour we pick how many guests come and
  // when (random) within the hour.
  private lastHour = -1;
  private hourTick = 0;
  private arrivals: number[] = [];

  // Tracks the in-game day so we can bin stale pretzels (and auto-deliver fresh
  // ones) when the clock wraps to a new day.
  private lastDay = 0;
  // Whether staff are currently on shift (present in the garden). Flipping this
  // sends bartenders home at night and brings them back (re-assigned) at dawn.
  private onShift = false;

  // Sales income is batched into periodic green pop-ups (drained by the view).
  pendingIncomePop = 0;
  private lastEarnings = 0;
  private incomeTimer = 0;

  constructor() {
    this.bar.add(this.places.bar); // start with one Ausschank at the usual spot
    this.toilets.add(this.places.toilet); // ...and one WC house
    // ...and one beer tank + one waste tank (capacity = sum of placed tanks).
    this.tanks.add({ x: this.places.bar.x - 10, y: this.places.bar.y - 110 }, 'beer');
    this.tanks.add({ x: this.places.toilet.x - 130, y: this.places.toilet.y - 30 }, 'waste');
    this.syncTankCapacity();
    // ...and a starter bench table (2 benches) plus a standing table.
    const benchCenter = { x: 380, y: 360 };
    this.seating.addBenchTable(benchCenter);
    this.seating.addBenchNear(benchCenter);
    this.seating.addBenchNear(benchCenter);
    this.seating.addStandTable({ x: 560, y: 360 });
    // The initial trees are real (collidable, demolishable) assets.
    for (const p of [
      { x: 120, y: 120 },
      { x: WORLD.w - 60, y: WORLD.h - 360 },
      { x: 180, y: WORLD.h - 60 },
      { x: WORLD.w / 2, y: 70 },
    ]) {
      this.deco.add(p, 'tree');
    }
    // A starter path: across the bottom, with a branch up to the middle.
    for (let x = 60; x <= WORLD.w - 60; x += 36) this.paths.add({ x, y: WORLD.h - 160 });
    for (let y = WORLD.h - 160; y >= 360; y -= 36) this.paths.add({ x: 640, y });
    for (let i = 0; i < START.guests; i++) this.spawnPerson();
    for (let i = 0; i < START.dogs; i++) this.spawnDog();
    // Staff (bartenders + cleaners) are spawned by the shift system at opening.
  }

  /** Testing helper: drop 1000 € into the till (wired to the Spiel menu). */
  cheatMoney(): void {
    this.eco.money += 1000;
    this.log('money', 'Testgeld', 1000);
  }

  /** Strip the garden bare for a "blank field" start: nothing built, low repute. */
  makeBlank(): void {
    this.seating.units.length = 0;
    this.bar.list.length = 0;
    this.toilets.list.length = 0;
    this.tanks.list.length = 0;
    this.stands.list.length = 0;
    this.deco.list.length = 0;
    this.djs.list.length = 0;
    this.paths.list.length = 0;
    this.people.length = 0;
    // No staff to begin with either — hire them once you've built something.
    this.eco.service = 0;
    this.eco.cleaners = 0;
    this.eco.gardeners = 0;
    this.service.length = 0;
    this.cleaners.length = 0;
    this.gardeners.length = 0;
    this.syncTankCapacity(); // capacities → 0
    this.eco.djWorkers = 0;
    this.djStaff.length = 0;
    this.eco.beer.current = 0; // no tank, no stock
    this.eco.resetReputation(START.blankReputation); // so guests trickle in slowly
    // Hand over the cash equivalent of everything the "basics" start gives you,
    // so both starts begin with the same total wealth.
    const basicsValue =
      ECONOMY.ausschankCost + ECONOMY.wcHouseCost + ECONOMY.beerTankCost + ECONOMY.wasteTankCost +
      ECONOMY.tableCost + 2 * ECONOMY.benchCost + ECONOMY.standCost + 4 * ECONOMY.treeCost;
    this.eco.money = START.money + basicsValue;
  }

  // --- the one tick ---------------------------------------------------------

  tick(): void {
    if (this.ended) return;

    this.clock.tick();
    if (this.clock.day !== this.lastDay) {
      this.lastDay = this.clock.day;
      const discarded = this.stands.binAll(); // yesterday's pretzels go stale
      if (discarded > 0) this.log('money', `Brezn vom Vortag entsorgt: ${discarded} 🥨`);
      this.autoDeliverPretzels(); // each auto-stand's van rolls in (stock on arrival)
      const ad = this.eco.runAdvertising();
      if (ad.spent > 0) this.log('money', `Werbung geschaltet (Ruf +${ad.repGain.toFixed(1)})`, -ad.spent);
    }
    this.eco.salesOpen = this.clock.isOpenForBusiness();
    this.manageShift();
    const wagesBefore = this.eco.wagePayments;
    this.eco.tick();
    if (this.eco.wagePayments !== wagesBefore && this.eco.lastWage > 0) {
      this.log(
        'staff',
        `Stundenlohn (${this.eco.service}×Service, ${this.eco.cleaners}×Putz, ${this.eco.gardeners}×Gärtner, ${this.eco.djWorkers}×DJ)`,
        -this.eco.lastWage,
      );
    }

    // Batch sales income into a green pop-up every few seconds (drained by the view).
    this.incomeTimer++;
    if (this.incomeTimer >= 180) {
      this.incomeTimer = 0;
      const inc = this.eco.earnings - this.lastEarnings;
      this.lastEarnings = this.eco.earnings;
      if (inc > 0) this.pendingIncomePop += inc;
    }

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
    this.deco.decay();
    for (const d of this.dogs) d.tick(this);
    for (let i = this.cleaners.length - 1; i >= 0; i--) {
      if (!this.cleaners[i]!.tick(this)) this.cleaners.splice(i, 1);
    }
    for (let i = this.service.length - 1; i >= 0; i--) {
      if (!this.service[i]!.tick(this)) this.service.splice(i, 1);
    }
    if (this.onShift && --this.allocTimer <= 0) { this.allocTimer = 30; this.allocateService(); }
    for (let i = this.gardeners.length - 1; i >= 0; i--) {
      if (!this.gardeners[i]!.tick(this)) this.gardeners.splice(i, 1);
    }
    for (let i = this.djStaff.length - 1; i >= 0; i--) {
      if (!this.djStaff[i]!.tick(this)) this.djStaff.splice(i, 1);
    }
    if (this.dogcatcher && !this.dogcatcher.tick(this)) this.dogcatcher = null;

    for (let i = this.trucks.length - 1; i >= 0; i--) {
      const t = this.trucks[i]!;
      if (!t.tick(this)) {
        this.trucks.splice(i, 1);
        if (t === this.beerTruck) this.beerTruck = null;
        if (t === this.kloTruck) this.kloTruck = null;
        if (t.target && t.target.delivery === t) t.target.delivery = null;
      }
    }

    const o = this.eco.outcome();
    // A win only stops the game once — after "keep playing" it never re-fires
    // (the player keeps the same garden as a sandbox); a loss always stops it.
    if (o === 'lose' || (o === 'win' && !this.winClaimed)) {
      this.ended = true;
      this.outcome = o;
    }
  }

  /** Player chose to keep playing after winning: resume the same garden. */
  continueAfterWin(): void {
    this.winClaimed = true;
    this.ended = false;
    this.outcome = null;
  }

  // --- World impl -----------------------------------------------------------

  play(name: SfxName): void {
    this.sfx.push(name);
  }

  log(cat: LogCat, msg: string, delta?: number, who?: number): void {
    this.events.push(cat, msg, this.clock.label(), delta, who);
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
    for (const p of this.people) p.upset(this, DOGCATCHER.satPerDog); // guests dislike the spectacle
  }

  /** Food is on offer only when a staffed stand has pretzels in stock. */
  foodAvailable(): boolean {
    return this.stands.anyServable();
  }

  /** Drain queued sound effects (the view plays them; CLI ignores). */
  drainSounds(): SfxName[] {
    const s = this.sfx;
    this.sfx = [];
    return s;
  }

  /** Drain queued debug-log entries (the view renders them; CLI ignores). */
  drainLogs(): LogEntry[] {
    return this.events.drain();
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
    const cost = this.eco.restockCost();
    if (!this.eco.spend(cost)) return false;
    const secs = DELIVERY.minSeconds + Math.random() * (DELIVERY.maxSeconds - DELIVERY.minSeconds);
    this.beerTruck = this.spawnTruck('beer', secs, amount);
    this.play('pour');
    this.log('money', `Bier bestellt: ${amount} L`, -cost);
    return true;
  }

  /** Call the Klowagen: pay now; it arrives after a delay and empties the tank. */
  callKlowagen(): boolean {
    if (this.kloTruck) return false;
    if (this.eco.toilet.current <= 0) return false;
    const cost = this.eco.klowagenCost();
    if (!this.eco.spend(cost)) return false;
    const secs = DELIVERY.kloMinSeconds + Math.random() * (DELIVERY.kloMaxSeconds - DELIVERY.kloMinSeconds);
    this.kloTruck = this.spawnTruck('klo', secs, 0);
    this.play('toilet');
    this.log('money', 'Klowagen gerufen', -cost);
    return true;
  }

  /**
   * Dynamically post each Servicekraft to whatever's most needed right now: a
   * tap with a queue / thirsty crowd, or a stocked stand with hungry guests.
   * Recomputed periodically (and on any structural change), so workers float
   * between the bar and the pretzel stands as demand shifts through the day.
   */
  private allocateService(): void {
    if (!this.onShift) return;
    // Drop all current posts; we rebuild them from the chosen assignments below.
    for (const a of this.bar.list) for (const t of a.taps) t.attendant = null;
    for (const s of this.stands.list) s.seller = null;

    const workers = this.service.filter((s) => !s.goingHome);
    if (workers.length === 0) return;

    // Demand signals: how many guests want beer vs. a pretzel right now.
    const thirsty = this.people.filter((p) => p.thirst >= GUEST.thirstWantBeer).length;
    const canPretzel = this.stands.list.some((s) => s.stock >= 1);
    const hungry = canPretzel ? this.people.filter((p) => p.hunger >= GUEST.hungerWantPretzel).length : 0;

    interface Station { id: string; need: number; make: () => ServiceAssignment }
    const stations: Station[] = [];
    for (const a of this.bar.list) {
      for (let i = 0; i < a.taps.length; i++) {
        const q = a.taps[i]!.queue.length;
        const index = i;
        stations.push({ id: `tap-${a.id}-${i}`, need: 2 + q * 6 + thirsty * 0.5, make: () => ({ kind: 'tap', building: a, index }) });
      }
    }
    for (const st of this.stands.list) {
      if (st.stock < 1) continue; // an empty stand needs no seller
      stations.push({ id: `stand-${st.id}`, need: st.queue.length * 6 + hungry * 0.7, make: () => ({ kind: 'stand', stand: st }) });
    }
    // Highest-need posts first; stable tie-break keeps things from flapping.
    stations.sort((x, y) => y.need - x.need || (x.id < y.id ? -1 : 1));
    const chosen = stations.slice(0, workers.length);
    const chosenById = new Map(chosen.map((s) => [s.id, s]));

    // Keep workers already on a chosen post (no needless walking); collect the rest.
    const taken = new Set<string>();
    const free: ServiceStaff[] = [];
    for (const w of workers) {
      const id = this.assignmentId(w.assignment);
      if (id && chosenById.has(id) && !taken.has(id)) {
        taken.add(id);
        this.applyAssignment(w, chosenById.get(id)!.make());
      } else {
        free.push(w);
      }
    }
    // Fill the still-uncovered chosen posts with the free workers; the rest loaf.
    let fi = 0;
    for (const s of chosen) {
      if (taken.has(s.id)) continue;
      const w = free[fi++];
      if (!w) break;
      this.applyAssignment(w, s.make());
    }
    for (; fi < free.length; fi++) free[fi]!.assignTo(null);
  }

  private applyAssignment(w: ServiceStaff, a: ServiceAssignment): void {
    w.assignTo(a);
    if (a.kind === 'tap') a.building.taps[a.index]!.attendant = w;
    else a.stand.seller = w;
  }

  private assignmentId(a: ServiceAssignment | null): string | null {
    if (!a) return null;
    return a.kind === 'tap' ? `tap-${a.building.id}-${a.index}` : `stand-${a.stand.id}`;
  }

  /** Spawn/retire DJs so each booth has one, up to the hired count. */
  private reconcileDjs(): void {
    if (!this.onShift) return;
    for (const d of this.djStaff) {
      if (!d.goingHome && !this.djs.list.includes(d.booth)) d.sendHome();
    }
    const active = (): DjStaff[] => this.djStaff.filter((d) => !d.goingHome);
    const staffed = new Set(active().map((d) => d.booth));
    for (const booth of this.djs.list) {
      if (active().length >= this.eco.djWorkers) break;
      if (!staffed.has(booth)) { this.spawnDjStaff(booth); staffed.add(booth); }
    }
    while (active().length > this.eco.djWorkers) active().pop()!.sendHome();
  }

  /** Recompute the shared pool capacities from the number of placed tanks. */
  private syncTankCapacity(): void {
    this.eco.beer.capacity = this.tanks.count('beer') * ECONOMY.beerTankUnit;
    this.eco.toilet.capacity = this.tanks.count('waste') * ECONOMY.wasteTankUnit;
  }

  // --- pretzels -------------------------------------------------------------

  setAdBudget(amount: number): void {
    this.eco.setAdBudget(amount);
  }
  setPretzelPrice(price: number): void {
    this.eco.setPretzelPrice(price);
  }
  setPretzelOrderAmount(standId: number, amount: number): void {
    const s = this.stands.byId(standId);
    if (s) s.orderAmount = this.eco.clampPretzelOrder(amount);
  }

  /** What a fresh order would actually deliver to this stand (capped by room). */
  private plannedStandOrder(s: Stand): number {
    return Math.max(0, Math.min(s.orderAmount, ECONOMY.pretzelCapacity - s.stock));
  }

  /** Snapshot of one stand's pretzel controls for the management overlay. */
  standInfo(standId: number): {
    stock: number; orderAmount: number; planned: number; cost: number; pending: boolean; progress: number; auto: boolean;
  } | null {
    const s = this.stands.byId(standId);
    if (!s) return null;
    const planned = this.plannedStandOrder(s);
    return {
      stock: s.stock,
      orderAmount: s.orderAmount,
      planned,
      cost: this.eco.pretzelOrderCost(planned),
      pending: !!s.delivery,
      progress: s.delivery?.arrivalProgress() ?? 0,
      auto: s.autoDeliver,
    };
  }

  /** Order pretzels for one stand: pay now; the van delivers after ~1–2 h. */
  orderPretzels(standId: number): boolean {
    const s = this.stands.byId(standId);
    if (!s || s.delivery) return false; // gone, or a delivery is already inbound
    const amount = this.plannedStandOrder(s);
    if (amount <= 0) return false;
    const cost = this.eco.pretzelOrderCost(amount);
    if (!this.eco.spend(cost)) return false;
    s.delivery = this.spawnPretzelTruck(s, amount);
    this.play('cheers');
    this.log('money', `Brezn bestellt: ${amount} 🥨 (Lieferung unterwegs)`, -cost);
    return true;
  }

  /** Dawn: send a van to every auto-supply stand (each arrives ~1–2 h later). */
  private autoDeliverPretzels(): void {
    for (const s of this.stands.list) {
      if (!s.autoDeliver || s.delivery) continue;
      const amount = this.plannedStandOrder(s);
      if (amount <= 0) continue;
      const cost = this.eco.pretzelOrderCost(amount);
      if (!this.eco.spend(cost)) continue; // can't afford this stand's batch — skip
      s.delivery = this.spawnPretzelTruck(s, amount);
      this.log('money', `Brezn-Tageslieferung: ${amount} 🥨 (unterwegs)`, -cost);
    }
  }
  /** Toggle one stand's daily auto-supply of fresh pretzels. */
  togglePretzelAutoDeliver(standId: number): boolean {
    const s = this.stands.byId(standId);
    if (!s) return false;
    s.autoDeliver = !s.autoDeliver;
    this.log('money', `Brezn-Auto-Lieferung ${s.autoDeliver ? 'an' : 'aus'}`);
    return s.autoDeliver;
  }

  /** Toggle whether gardeners replant dead decorations for money. */
  toggleDecoAutoReplace(): boolean {
    const on = this.deco.toggleAutoReplace();
    this.log('money', `Deko-Auto-Austausch ${on ? 'an' : 'aus'}`);
    return on;
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
    const t = new Truck(this.nextId++, kind, delaySeconds, amount, this.tankPark(kind));
    this.trucks.push(t);
    return t;
  }

  private spawnPretzelTruck(stand: Stand, amount: number): Truck {
    const secs = (DELIVERY.pretzelMinHours + Math.random() * (DELIVERY.pretzelMaxHours - DELIVERY.pretzelMinHours)) * CLOCK.secondsPerHour;
    const t = new Truck(this.nextId++, 'pretzel', secs, amount, this.pretzelPark(stand), stand);
    this.trucks.push(t);
    return t;
  }

  /** Where the baker's van parks: just below the stand it's restocking. */
  private pretzelPark(stand: Stand): Vec {
    return { x: stand.pos.x, y: stand.pos.y + 36 };
  }

  /** Where a delivery truck parks: at the first tank of the matching kind. */
  private tankPark(kind: 'beer' | 'klo'): Vec {
    const want = kind === 'beer' ? 'beer' : 'waste';
    const tank = this.tanks.list.find((t) => t.kind === want);
    if (tank) return { x: tank.pos.x, y: tank.pos.y + 40 };
    // Fallback (e.g. all tanks demolished): the old fixed depot spot.
    return kind === 'beer'
      ? { x: PLACES.bar.x - 120, y: PLACES.bar.y + 72 }
      : { x: PLACES.toilet.x - 95, y: PLACES.toilet.y + 28 };
  }
  hireService(): boolean {
    const cost = this.eco.serviceHireCost();
    if (!this.eco.hireService()) return false;
    this.log('staff', `Servicekraft eingestellt → ${this.eco.service}`, -cost);
    if (this.onShift) {
      this.service.push(new ServiceStaff(this.nextId++, this.places.entrance));
      this.allocateService(); // put them wherever they're needed most
    }
    return true;
  }
  fireService(): boolean {
    if (!this.eco.fireService()) return false;
    this.log('staff', `Servicekraft entlassen → ${this.eco.service}`);
    if (this.onShift) {
      // Send a loafing worker home first; only pull one off a post if we must.
      const s = this.service.find((x) => x.isIdle && !x.goingHome) ?? this.service.find((x) => !x.goingHome);
      if (s) s.sendHome();
      this.allocateService(); // re-cover any post that just opened up
    }
    return true;
  }
  hireCleaner(): boolean {
    const cost = this.eco.cleanerHireCost();
    if (!this.eco.hireCleaner()) return false;
    // Only actually on the field during the shift; otherwise they arrive at dawn.
    if (this.onShift) this.cleaners.push(new Cleaner(this.nextId++, this.places.entrance));
    this.log('staff', `Putzkraft eingestellt → ${this.eco.cleaners}`, -cost);
    return true;
  }
  fireCleaner(): boolean {
    if (!this.eco.fireCleaner()) return false;
    if (this.onShift) {
      const c = this.cleaners.find((x) => !x.goingHome);
      if (c) c.sendHome(this);
    }
    this.log('staff', `Putzkraft entlassen → ${this.eco.cleaners}`);
    return true;
  }
  hireGardener(): boolean {
    const cost = this.eco.gardenerHireCost();
    if (!this.eco.hireGardener()) return false;
    if (this.onShift) this.gardeners.push(new Gardener(this.nextId++, this.places.entrance));
    this.log('staff', `Gärtner eingestellt → ${this.eco.gardeners}`, -cost);
    return true;
  }
  fireGardener(): boolean {
    if (!this.eco.fireGardener()) return false;
    if (this.onShift) {
      const gr = this.gardeners.find((x) => !x.goingHome);
      if (gr) gr.sendHome();
    }
    this.log('staff', `Gärtner entlassen → ${this.eco.gardeners}`);
    return true;
  }
  hireDj(): boolean {
    const cost = this.eco.djHireCost();
    if (!this.eco.hireDj()) return false;
    this.log('staff', `DJ eingestellt → ${this.eco.djWorkers}`, -cost);
    this.reconcileDjs();
    return true;
  }
  fireDj(): boolean {
    if (!this.eco.fireDj()) return false;
    this.log('staff', `DJ entlassen → ${this.eco.djWorkers}`);
    this.reconcileDjs();
    return true;
  }
  callDogCatcher(): boolean {
    if (!this.dogCatcherAvailable()) return false;
    const cost = this.eco.dogCatcherCost();
    if (!this.eco.spend(cost)) return false;
    this.dogcatcher = new Dogcatcher(this.nextId++, this.places.entrance);
    this.log('money', 'Hundefänger gerufen', -cost);
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
  pretzelStandBuyable(): boolean {
    return this.eco.canAfford(this.eco.pretzelStandCost());
  }
  ausschankBuyable(): boolean {
    return this.eco.canAfford(this.eco.ausschankCost());
  }
  wcBuyable(): boolean {
    return this.eco.canAfford(this.eco.wcHouseCost());
  }
  beerTankBuyable(): boolean {
    return this.eco.canAfford(this.eco.beerTankCost());
  }
  wasteTankBuyable(): boolean {
    return this.eco.canAfford(this.eco.wasteTankCost());
  }
  bushBuyable(): boolean {
    return this.eco.canAfford(this.eco.bushCost());
  }
  flowerBuyable(): boolean {
    return this.eco.canAfford(this.eco.flowerCost());
  }
  treeBuyable(): boolean {
    return this.eco.canAfford(this.eco.treeCost());
  }
  djBuyable(): boolean {
    return this.eco.canAfford(this.eco.djCost());
  }
  pathBuyable(): boolean {
    return this.eco.canAfford(this.eco.pathCost());
  }

  /** No furniture, stand, bar, WC, tank, plant or DJ overlaps `point`. */
  private spotClear(point: Vec, radius: number): boolean {
    return (
      this.seating.isClear(point, radius) &&
      this.stands.isClear(point, radius) &&
      this.bar.isClear(point, radius) &&
      this.toilets.isClear(point, radius) &&
      this.tanks.isClear(point, radius) &&
      this.deco.isClear(point, radius) &&
      this.djs.isClear(point, radius)
    );
  }

  /** Whether `kind` may be placed at `point` (for ghost colour + placement). */
  canPlace(kind: PlaceKind, point: Vec): boolean {
    if (kind === 'bench') {
      return this.seating.canAddBenchNear(point) && this.eco.canAfford(this.eco.benchCost());
    }
    if (kind === 'pretzel') {
      return this.inField(point) && this.spotClear(point, 44) && this.eco.canAfford(this.eco.pretzelStandCost());
    }
    if (kind === 'ausschank') {
      return this.inField(point) && this.spotClear(point, 80) && this.eco.canAfford(this.eco.ausschankCost());
    }
    if (kind === 'wc') {
      return this.inField(point) && this.spotClear(point, 70) && this.eco.canAfford(this.eco.wcHouseCost());
    }
    if (kind === 'beertank') {
      return this.inField(point) && this.spotClear(point, 32) && this.eco.canAfford(this.eco.beerTankCost());
    }
    if (kind === 'wastetank') {
      return this.inField(point) && this.spotClear(point, 32) && this.eco.canAfford(this.eco.wasteTankCost());
    }
    if (kind === 'bush') {
      return this.inField(point) && this.spotClear(point, 22) && this.eco.canAfford(this.eco.bushCost());
    }
    if (kind === 'flower') {
      return this.inField(point) && this.spotClear(point, 22) && this.eco.canAfford(this.eco.flowerCost());
    }
    if (kind === 'tree') {
      return this.inField(point) && this.spotClear(point, 40) && this.eco.canAfford(this.eco.treeCost());
    }
    if (kind === 'dj') {
      return this.inField(point) && this.spotClear(point, 26) && this.eco.canAfford(this.eco.djCost());
    }
    if (kind === 'path') {
      // Paths sit on the ground — they overlap buildings freely, but don't stack
      // on top of an existing path tile (painting over it just does nothing).
      return this.inField(point) && !this.paths.occupied(point) && this.eco.canAfford(this.eco.pathCost());
    }
    const cost = kind === 'stand' ? this.eco.standCost() : this.eco.tableCost();
    const radius = kind === 'stand' ? 44 : 62;
    return this.inField(point) && this.spotClear(point, radius) && this.seating.canAddTable() && this.eco.canAfford(cost);
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
    } else if (kind === 'pretzel') {
      this.eco.spend(this.eco.pretzelStandCost());
      this.stands.add(point);
      if (this.onShift) this.allocateService(); // a spare Servicekraft can take it
    } else if (kind === 'ausschank') {
      this.eco.spend(this.eco.ausschankCost());
      this.bar.add(point);
      if (this.onShift) this.allocateService(); // staff the new tap if there's a spare
    } else if (kind === 'wc') {
      this.eco.spend(this.eco.wcHouseCost());
      this.toilets.add(point);
    } else if (kind === 'beertank') {
      this.eco.spend(this.eco.beerTankCost());
      this.tanks.add(point, 'beer');
      this.syncTankCapacity();
    } else if (kind === 'wastetank') {
      this.eco.spend(this.eco.wasteTankCost());
      this.tanks.add(point, 'waste');
      this.syncTankCapacity();
    } else if (kind === 'bush') {
      this.eco.spend(this.eco.bushCost());
      this.deco.add(point, 'bush');
    } else if (kind === 'flower') {
      this.eco.spend(this.eco.flowerCost());
      this.deco.add(point, 'flower');
    } else if (kind === 'tree') {
      this.eco.spend(this.eco.treeCost());
      this.deco.add(point, 'tree');
    } else if (kind === 'dj') {
      this.eco.spend(this.eco.djCost());
      this.djs.add(point);
      this.reconcileDjs(); // a hired-but-spare DJ takes the new booth
    } else if (kind === 'path') {
      this.eco.spend(this.eco.pathCost());
      this.paths.add(point);
    } else {
      this.eco.spend(this.eco.tableCost());
      this.seating.addBenchTable(point);
    }
    if (kind !== 'path') this.play('cheers'); // painting a path would spam the sound
    return true;
  }

  // --- demolition -----------------------------------------------------------

  /** The removable object under `point` (topmost/smallest first), or null. */
  demolishableAt(point: Vec): Demolishable | null {
    const half = (c: number): number => Math.ceil(c / 2);
    const dj = this.djs.at(point);
    if (dj) return { kind: 'dj', id: dj.id, pos: dj.pos, radius: DJ.footprint, cost: half(this.eco.djCost()) };
    const d = this.deco.at(point);
    if (d) {
      const base = d.kind === 'flower' ? this.eco.flowerCost() : d.kind === 'tree' ? this.eco.treeCost() : this.eco.bushCost();
      return { kind: d.kind, id: d.id, pos: d.pos, radius: d.kind === 'tree' ? 40 : 22, cost: half(base) };
    }
    const t = this.tanks.at(point);
    if (t) {
      const beer = t.kind === 'beer';
      const cost = half(beer ? this.eco.beerTankCost() : this.eco.wasteTankCost());
      return { kind: beer ? 'beertank' : 'wastetank', id: t.id, pos: t.pos, radius: 30, cost };
    }
    const st = this.stands.at(point);
    if (st) return { kind: 'pretzel', id: st.id, pos: st.pos, radius: 38, cost: half(this.eco.pretzelStandCost()) };
    const bar = this.bar.at(point);
    if (bar) return { kind: 'ausschank', id: bar.id, pos: bar.pos, radius: BAR.footprint, cost: half(this.eco.ausschankCost()) };
    const wc = this.toilets.at(point);
    if (wc) return { kind: 'wc', id: wc.id, pos: wc.pos, radius: WC.footprint, cost: half(this.eco.wcHouseCost()) };
    const u = this.seating.unitAt(point);
    if (u && u.taken.every((x) => !x)) {
      const stand = u.kind === 'stand';
      const cost = half(stand ? this.eco.standCost() : this.eco.tableCost());
      return { kind: stand ? 'stand' : 'table', id: u.id, pos: u.center, radius: u.footprint, cost };
    }
    const pt = this.paths.at(point);
    if (pt) return { kind: 'path', id: pt.id, pos: pt.pos, radius: 18, cost: half(this.eco.pathCost()) };
    return null;
  }

  /** Tear down `d` (charging the teardown cost). False if it can't be afforded. */
  demolish(d: Demolishable): boolean {
    if (!this.eco.spend(d.cost)) return false;
    switch (d.kind) {
      case 'dj': {
        this.djs.remove(d.id);
        this.reconcileDjs(); // free its DJ, restaff another booth if one is bare
        break;
      }
      case 'bush': case 'flower': case 'tree': this.deco.remove(d.id); break;
      case 'beertank': case 'wastetank': this.tanks.remove(d.id); this.syncTankCapacity(); break;
      case 'pretzel': {
        this.stands.remove(d.id);
        if (this.onShift) this.allocateService(); // free its worker, restaff elsewhere
        break;
      }
      case 'ausschank': {
        this.bar.remove(d.id);
        if (this.onShift) this.allocateService(); // free its worker, restaff elsewhere
        break;
      }
      case 'wc': this.toilets.remove(d.id); break;
      case 'path': this.paths.remove(d.id); break;
      case 'table': case 'stand': this.seating.removeUnit(d.id); break;
      default: break;
    }
    this.play('cheers');
    this.log('money', `Abgerissen (${d.kind})`, -d.cost);
    return true;
  }

  /** A click in the world (not in placement mode): try the buildings' "+" buttons. */
  handleWorldClick(point: Vec): boolean {
    const a = this.bar.buildingAtPlus(point);
    if (a) return this.addTap(a);
    const h = this.toilets.buildingAtPlus(point);
    if (h) return this.addStall(h);
    return false;
  }

  /** Buy another tap for an Ausschank (charged here). */
  private addTap(a: Ausschank): boolean {
    if (!this.bar.canAddTap(a) || !this.eco.canAfford(this.eco.tapCost())) return false;
    const cost = this.eco.tapCost();
    if (!this.eco.spend(cost)) return false;
    this.bar.addTap(a);
    if (this.onShift) this.allocateService(); // a spare Servicekraft can take the fresh tap
    this.play('cheers');
    this.log('money', `Zapfhahn hinzugefügt (Bar #${a.id})`, -cost);
    return true;
  }

  /** Buy another toilet for a WC house (charged here). */
  private addStall(h: WcHouse): boolean {
    if (!this.toilets.canAddStall(h) || !this.eco.canAfford(this.eco.stallCost())) return false;
    const cost = this.eco.stallCost();
    if (!this.eco.spend(cost)) return false;
    this.toilets.addStall(h);
    this.play('toilet');
    this.log('money', `Toilette hinzugefügt (WC #${h.id})`, -cost);
    return true;
  }

  // --- view model -----------------------------------------------------------

  aggregates(): Aggregates {
    const n = this.people.length;
    let sat = 0;
    let thirst = 0;
    let bladder = 0;
    let hunger = 0;
    for (const p of this.people) {
      sat += p.satisfaction;
      thirst += p.thirst;
      bladder += p.bladder;
      hunger += p.hunger;
    }
    return {
      people: n,
      dogs: this.dogs.length,
      avgSatisfaction: n ? sat / n : 0,
      avgThirst: n ? thirst / n : 0,
      avgBladder: n ? bladder / n : 0,
      avgHunger: n ? hunger / n : 0,
      toiletDirt: this.toilets.combinedDirt(),
      moneyPerVisitor: this.eco.moneyPerVisitor(),
      litter: this.litter.count,
      pretzelStock: this.stands.totalStock(),
      pretzelAuto: this.stands.anyAutoDeliver(),
      time: this.clock.label(),
      salesOpen: this.clock.isOpenForBusiness(),
    };
  }

  // --- internals ------------------------------------------------------------

  private inField(p: Vec): boolean {
    // Buildable almost to the very edge of the world (small margin for footprints).
    return p.x > 24 && p.x < WORLD.w - 24 && p.y > 24 && p.y < WORLD.h - 24;
  }

  // --- staff shifts ---------------------------------------------------------

  /** Bring staff in at opening and send them home an hour after last call. */
  private manageShift(): void {
    const want = this.clock.isStaffOnShift();
    if (want && !this.onShift) {
      this.onShift = true;
      this.startShift();
    } else if (!want && this.onShift) {
      this.onShift = false;
      this.endShift();
    }
  }

  /** Morning: bring the staff in — cleaners, gardeners, DJs, and the
   *  Servicekräfte (allocated to taps/stands by need once they're in). */
  private startShift(): void {
    for (let i = 0; i < this.eco.cleaners; i++) this.cleaners.push(new Cleaner(this.nextId++, this.places.entrance));
    for (let i = 0; i < this.eco.gardeners; i++) this.gardeners.push(new Gardener(this.nextId++, this.places.entrance));
    for (let i = 0; i < this.eco.service; i++) this.service.push(new ServiceStaff(this.nextId++, this.places.entrance));
    this.reconcileDjs();
    this.bar.clearAttendants();
    this.allocateService();
  }

  /** Evening: all staff pack up and head home; counters go unstaffed. */
  private endShift(): void {
    this.bar.clearAttendants();
    for (const s of this.service) s.sendHome();
    for (const c of this.cleaners) c.sendHome(this);
    for (const gr of this.gardeners) gr.sendHome();
    for (const st of this.stands.list) st.seller = null;
    for (const d of this.djStaff) d.sendHome();
  }

  private spawnDjStaff(booth: DjObj): void {
    this.djStaff.push(new DjStaff(this.nextId++, this.places.entrance, booth));
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
