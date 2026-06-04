// A guest. Pure state machine over a {x,y} position — no rendering. The view
// reads pos + the render flags (mugVisible, beerLevel, opacity, bob, moving).

import { stepToward, rand, chance, clamp, pick, type Vec } from '../vec.js';
import { SKIN, SHIRTS, TOWEL, GUEST, LITTER, WORLD, STAFF, TOILET, CLOCK, PATH, DECO, DJ, ECONOMY, type Towel } from '../../config.js';
import { FIRST_NAMES, LAST_NAMES } from '../names.js';
import type { SeatRef } from '../seating.js';
import type { Stall, WcHouse } from '../toilets.js';
import type { World } from '../world.js';

/** Frames per in-game minute (used for the toilet-queue malheur roll). */
const MINUTE_FRAMES = CLOCK.secondsPerHour;

export type PersonState =
  | 'arriving'
  | 'looking'
  | 'toReserve'
  | 'toBar'
  | 'queuing'
  | 'ordering'
  | 'toSeat'
  | 'drinking'
  | 'toToilet'
  | 'inToilet'
  | 'goSit'
  | 'chilling'
  | 'toStand'
  | 'eating'
  | 'fetchTowel'
  | 'leaving';

const MOVING_STATES: ReadonlySet<PersonState> = new Set<PersonState>([
  'arriving',
  'looking',
  'toReserve',
  'toBar',
  'toSeat',
  'toToilet',
  'toStand',
  'goSit',
  'fetchTowel',
  'leaving',
]);

// A too-unhappy guest gives up only from these "settled" states — while seated
// (chilling) or still hunting for a seat (looking). In every other state they're
// mid-transaction or in transit (getting beer/food, on the toilet, walking back)
// and about to feel better, so they finish what they're doing first.
const CAN_GIVE_UP: ReadonlySet<PersonState> = new Set<PersonState>(['looking', 'chilling']);

const STATUS_LABEL: Record<PersonState, string> = {
  arriving: 'kommt an',
  looking: 'sucht Platz',
  toReserve: 'geht zum Platz',
  toBar: 'geht zur Theke',
  queuing: 'wartet an der Theke',
  ordering: 'bestellt',
  toSeat: 'geht zum Sitzplatz',
  drinking: 'trinkt',
  toToilet: 'geht zum Klo',
  inToilet: 'auf dem Klo',
  goSit: 'geht zurück',
  chilling: 'entspannt',
  toStand: 'holt sich eine Brezn',
  eating: 'isst eine Brezn',
  fetchTowel: 'holt Handtuch',
  leaving: 'geht',
};

export class Person {
  readonly id: number;
  readonly name: string;
  pos: Vec;
  readonly shirt: string;
  readonly skin: string;
  readonly towel: Towel;

  // render flags (read by the view)
  mugVisible = false;
  beerLevel = 0;
  pretzelVisible = false;
  opacity = 1;
  bob: number;

  private state: PersonState = 'arriving';
  private readonly speed = rand(1.1, 1.9);
  private curSpeed = 1.5; // effective speed this frame (faster on a path, slower off)
  private seat: SeatRef | null = null;
  private targetSeat: SeatRef | null = null;
  private standServeTimer = 0;
  private standServeDuration = 1;
  private eatTimer = 0;
  private eatDuration = 1;
  private drinkTimer = 0;
  private drinkDuration = 1;
  private waitTimer = 0;
  private toiletDuration = 1; // frames of the current toilet visit (dirt is spread over it)
  private toiletWait = 0; // frames spent waiting in the toilet queue (for the malheur roll)
  private toiletStall: Stall | null = null; // the stall currently occupied, if any
  private toiletHouse: WcHouse | null = null; // the WC house being tried right now
  private readonly rejectedStalls = new Set<number>(); // cabins found too dirty this visit
  private pretzelDisappointed = false; // gave up on a pretzel — don't keep pestering the stand
  private decoMood = 0; // net mood drawn from vegetation so far (capped)
  private musicMood = 0; // net mood drawn from music so far (capped)
  private queueTimer = 0;
  private serveTimer = 0;
  private serveDuration = 1;
  // Per-guest appetites: some get thirsty / hungry faster than others.
  private readonly thirstRate = rand(GUEST.thirstPerFrameMin, GUEST.thirstPerFrameMax);
  private readonly hungerRate = rand(GUEST.hungerPerFrameMin, GUEST.hungerPerFrameMax);
  private lookTimer = 0;
  private wanderTarget: Vec = { x: 0, y: 0 };
  private thirstDelta = 0;
  private bladderDelta = 0;
  private pendingAccident = false; // a malheur on the way out after an unusable toilet
  private leaveReason = ''; // why they decided to head home (shown in the guest log)

  private wallet_ = rand(GUEST.walletMin, GUEST.walletMax);
  private _spent = 0;
  private _thirst = rand(GUEST.thirstStartMin, GUEST.thirstStartMax);
  private _bladder = rand(0, GUEST.bladderStartMax);
  private _hunger = rand(GUEST.hungerStartMin, GUEST.hungerStartMax);
  private _satisfaction: number = GUEST.satisfactionStart;

  // Per-reason accumulated mood change not yet logged. Continuous effects
  // (drinking, queuing, litter) build up here and flush as one "from→to" line
  // once they cross the threshold, so the log isn't spammed every frame.
  private readonly moodAcc = new Map<string, number>();

  constructor(id: number, entrance: Vec) {
    this.id = id;
    this.name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    this.pos = { x: entrance.x, y: entrance.y };
    this.shirt = pick(SHIRTS);
    this.skin = pick(SKIN);
    this.towel = { base: pick(TOWEL.base), accent: pick(TOWEL.accent), pattern: pick(TOWEL.patterns) };
    this.bob = rand(0, Math.PI * 2);
  }

  /** The seat this guest has claimed (towel down), or null. Read by the view. */
  get seatRef(): SeatRef | null {
    return this.seat;
  }
  get satisfaction(): number {
    return this._satisfaction;
  }
  get thirst(): number {
    return this._thirst;
  }
  get bladder(): number {
    return this._bladder;
  }
  get hunger(): number {
    return this._hunger;
  }
  get spent(): number {
    return this._spent;
  }
  /** Money still in the guest's pocket. */
  get wallet(): number {
    return this.wallet_;
  }
  /** Human-readable activity, for the guests window. */
  get statusLabel(): string {
    return STATUS_LABEL[this.state];
  }
  get moving(): boolean {
    return MOVING_STATES.has(this.state);
  }
  get pourProgress(): number {
    if (this.state !== 'ordering') return 0;
    return clamp(1 - this.serveTimer / this.serveDuration, 0, 1);
  }
  /** 0..1 progress of the pretzel sale at the stand (for the stand's gauge). */
  get standServeProgress(): number {
    if (this.state !== 'toStand' || this.standServeTimer <= 0) return 0;
    return clamp(1 - this.standServeTimer / this.standServeDuration, 0, 1);
  }

  upset(w: World, amount: number): void {
    this.changeSat(w, this._satisfaction - amount, 'Hundefänger-Spektakel');
  }

  /**
   * The single funnel for every satisfaction change. Accumulates the change per
   * reason and logs a "von→auf" mood entry once a reason's net change crosses
   * the threshold (continuous effects) or immediately (big discrete jumps).
   */
  private changeSat(w: World, next: number, reason: string): void {
    next = clamp(next, 0, 100);
    const delta = next - this._satisfaction;
    if (delta === 0) return; // clamped to a wall: nothing actually changed
    this._satisfaction = next;
    const acc = (this.moodAcc.get(reason) ?? 0) + delta;
    this.moodAcc.set(reason, acc);
    if (Math.abs(acc) >= GUEST.moodLogThreshold) this.flushMood(w, reason);
  }

  private flushMood(w: World, reason: string): void {
    const acc = this.moodAcc.get(reason);
    if (acc === undefined || acc === 0) {
      this.moodAcc.delete(reason);
      return;
    }
    const to = this._satisfaction;
    const from = clamp(to - acc, 0, 100);
    w.log('mood', `#${this.id} ${reason}: ${from.toFixed(0)}→${to.toFixed(0)}`, acc, this.id);
    this.moodAcc.delete(reason);
  }

  private flushAllMood(w: World): void {
    for (const reason of [...this.moodAcc.keys()]) this.flushMood(w, reason);
  }

  tick(w: World): boolean {
    // Paths speed guests up; off the path they trudge along slower.
    this.curSpeed = this.speed * (w.paths.onPath(this.pos) ? PATH.onSpeedMult : PATH.offSpeedMult);
    this._thirst = clamp(this._thirst + this.thirstRate, 0, 100);
    this._hunger = clamp(this._hunger + this.hungerRate, 0, 100);

    // Unmet thirst/hunger past the comfort level sour the mood — the further
    // past, the faster. No hard cap yanks them out any more; they just grow
    // unhappy and leave below the general satisfaction floor (checked below).
    const tExcess = (this._thirst - GUEST.thirstComfort) / (100 - GUEST.thirstComfort);
    const hExcess = (this._hunger - GUEST.hungerComfort) / (100 - GUEST.hungerComfort);
    if (tExcess > 0) this.changeSat(w, this._satisfaction - GUEST.satDiscomfortPerFrame * tExcess, 'großer Durst');
    if (hExcess > 0) this.changeSat(w, this._satisfaction - GUEST.satDiscomfortPerFrame * hExcess, 'großer Hunger');

    const piles = w.litter.countNear(this.pos, LITTER.nearRadius);
    if (piles > 0) {
      this.changeSat(w, this._satisfaction + LITTER.satPerPileFrame * Math.min(piles, 6), 'Unrat in der Nähe');
    }
    if (chance(LITTER.personMessChance)) w.litter.add(this.pos, 'poop');

    // Ambience: nearby greenery and music nudge the mood, but each guest's total
    // gain/loss from either source is capped, so spamming them doesn't stack.
    const greenery = w.deco.perceptionAt(this.pos);
    const gd = this.capAmbience(greenery, this.decoMood, DECO.moodCap);
    this.decoMood = gd.applied;
    if (gd.delta !== 0) {
      this.changeSat(w, this._satisfaction + gd.delta, greenery > 0 ? 'schöne Bepflanzung' : 'verwelkte Pflanzen');
    }
    const music = w.djs.perceptionAt(this.pos);
    const md = this.capAmbience(music, this.musicMood, DJ.moodCap);
    this.musicMood = md.applied;
    if (md.delta !== 0) {
      this.changeSat(w, this._satisfaction + md.delta, music > 0 ? 'gute Musik' : 'störende Musik');
    }

    // Too unhappy, whatever the cause (thirst, hunger, dirt, waiting, …) → leave.
    if (this._satisfaction <= GUEST.satLeave && CAN_GIVE_UP.has(this.state)) {
      this.frustratedLeave(w, this._satisfaction, 'zu unzufrieden');
    }

    let alive = true;
    switch (this.state) {
      case 'arriving': alive = this.arriving(w); break;
      case 'looking': this.looking(w); break;
      case 'toReserve': this.toReserve(w); break;
      case 'toBar': this.toBar(w); break;
      case 'queuing': this.queuing(w); break;
      case 'ordering': this.ordering(w); break;
      case 'toSeat': this.toSeat(w); break;
      case 'drinking': this.drinking(w); break;
      case 'toToilet': this.toToilet(w); break;
      case 'inToilet': this.inToilet(w); break;
      case 'goSit': this.goSit(w); break;
      case 'chilling': this.chilling(w); break;
      case 'toStand': this.toStand(w); break;
      case 'eating': this.eating(w); break;
      case 'fetchTowel': this.fetchTowel(w); break;
      case 'leaving': alive = this.leaving(w); break;
    }

    this.bob += 0.2;
    return alive;
  }

  /** Free a held bar slot + seat when removed (safety net). */
  onRemove(w: World): void {
    this.flushAllMood(w); // log any leftover sub-threshold mood change
    this.releaseSlot(w);
    this.releaseSeat(w);
    w.toilets.leave(this); // free any held stall / queue spot
    w.stands.leave(this); // ...and any pretzel-stand queue spot
  }

  // --- states ---------------------------------------------------------------

  private arriving(w: World): boolean {
    if (this.seat || this.aimForFreeSeat(w)) {
      this.state = 'toReserve';
    } else {
      this.startLooking();
    }
    return true;
  }

  private looking(w: World): void {
    if (this.aimForFreeSeat(w)) {
      this.state = 'toReserve';
      return;
    }
    this.lookTimer--;
    if (this.moveTo(this.wanderTarget)) this.wanderTarget = Person.randomSpot();
    if (this.lookTimer <= 0) {
      this.changeSat(w, GUEST.satNoSeat, 'kein Platz frei');
      this.depart('kein Platz frei');
    }
  }

  private toReserve(w: World): void {
    const target = this.targetSeat;
    if (!target) {
      this.startLooking();
      return;
    }
    if (!this.moveTo(w.seating.seatPoint(target))) return;

    if (w.seating.isFree(target)) {
      w.seating.claim(target); // place the towel — first one wins
      this.seat = target;
      this.targetSeat = null;
      this.enterChilling();
    } else if (!this.aimForFreeSeat(w)) {
      this.startLooking();
    }
  }

  private toBar(w: World): void {
    if (!w.bar.has(this)) {
      // Join the nearest staffed queue. A dry tank doesn't stop them lining up:
      // they only discover the empty tank once they reach the counter (see
      // queuing), so they actually walk over to find out — not from the seat.
      if (!w.bar.join(this)) {
        this.noBeerAtBar(w);
        return;
      }
      this.queueTimer = 0;
    }
    // Walk to the back of the queue; once there, start waiting.
    if (this.moveTo(w.bar.positionOf(this))) this.state = 'queuing';
  }

  private queuing(w: World): void {
    const atSpot = this.moveTo(w.bar.positionOf(this)); // shuffle up as the line advances
    if (atSpot && w.bar.isFront(this) && !w.eco.canPourBeer()) {
      // At the head of the queue they finally see the tap is dry — only now do
      // they learn the tank is empty, then give up the spot.
      w.bar.leave(this);
      this.noBeerAtBar(w);
      return;
    }
    if (atSpot && w.bar.atCounter(this)) {
      this.serveDuration = Math.floor(rand(STAFF.serveMin, STAFF.serveMax));
      this.serveTimer = this.serveDuration;
      this.state = 'ordering';
      return;
    }
    this.queueTimer++;
    this.changeSat(w, this._satisfaction + GUEST.satPerQueueFrame, 'wartet an der Theke');
    if (this.queueTimer > GUEST.queueGiveUp) {
      this.changeSat(w, this._satisfaction + GUEST.satQueueGiveUp, 'Warteschlange aufgegeben');
      w.bar.leave(this);
      this.depart('Warteschlange aufgegeben'); // disappointed at the bar -> towel, then leave
    }
  }

  private ordering(w: World): void {
    this.serveTimer--;
    if (this.serveTimer > 0) return;
    this.releaseSlot(w);

    if (w.eco.canPourBeer() && this.wallet_ >= w.eco.beerPrice) {
      const price = w.eco.beerPrice;
      w.eco.pourBeer();
      this.wallet_ -= price;
      this._spent += price;
      this.mugVisible = true;
      this.beerLevel = 1;
      w.log('money', `#${this.id} kauft ein Bier (${price.toFixed(2)} €)`, price, this.id);
      // Mood depends on how far the price strays from what guests expect to pay:
      // a bargain pleases (positive delta), a rip-off annoys (negative delta).
      const moodVsExpected = (ECONOMY.expectedPrice - price) * GUEST.satPerEuroVsExpected;
      this.changeSat(w, this._satisfaction + moodVsExpected, 'Bier bezahlt');
      this.bladderDelta = rand(GUEST.bladderPerBeerMin, GUEST.bladderPerBeerMax);
      this.state = 'toSeat';
      w.play('pour');
    } else {
      // Rare race: the last beer went to another bartender mid-pour.
      this.noBeerAtBar(w);
    }
  }

  /** No beer at the bar: disappointed (only during open hours), then head home. */
  private noBeerAtBar(w: World): void {
    this.mugVisible = false;
    if (w.eco.salesOpen) this.changeSat(w, Math.min(this._satisfaction, GUEST.satNoBeer), 'kein Bier am Tresen');
    this.depart(w.eco.salesOpen ? 'kein Bier am Tresen' : 'Feierabend');
  }

  private toSeat(w: World): void {
    if (this.moveTo(w.seating.seatPoint(this.seat!))) {
      this.drinkDuration = Math.floor(rand(180, 420));
      this.drinkTimer = this.drinkDuration;
      this.thirstDelta = this._thirst; // one beer fully quenches: drain to 0 over the drink
      this.state = 'drinking';
      w.play('cheers');
    }
  }

  private drinking(w: World): void {
    this.drinkTimer--;
    const frac = 1 / this.drinkDuration;
    this._thirst = clamp(this._thirst - this.thirstDelta * frac, 0, 100);
    this._bladder = clamp(this._bladder + this.bladderDelta * frac, 0, 100);
    this.changeSat(w, this._satisfaction + GUEST.satDrinkPerBeer * frac, 'genießt das Bier');
    this.beerLevel = Math.max(0, this.drinkTimer / this.drinkDuration);
    if (chance(0.008)) w.play('sip');
    if (this.drinkTimer <= 0) {
      this._thirst = 0; // a finished beer leaves the guest fully refreshed
      this.mugVisible = false;
      this.enterChilling();
    }
  }

  private toToilet(w: World): void {
    // Pick the nearest WC the first time, then try its cabins one at a time.
    if (!w.toilets.has(this) && this.toiletHouse === null) {
      const h = w.toilets.nearest(this.pos);
      if (!h || w.eco.toiletTankFull()) {
        this.toiletUnusable(w);
        return;
      }
      this.toiletHouse = h;
      this.rejectedStalls.clear();
      this.toiletWait = 0;
    }
    // Make sure we're queued at a cabin we haven't already rejected.
    if (!w.toilets.has(this)) {
      const idx = this.pickStall();
      if (idx === null) {
        this.toiletGiveUp(w); // every cabin here was too dirty
        return;
      }
      w.toilets.joinStall(this, this.toiletHouse!, idx);
      this.toiletWait = 0;
    }
    const atSpot = this.moveTo(w.toilets.positionOf(this));
    if (w.eco.toiletTankFull()) {
      w.toilets.leave(this);
      this.toiletUnusable(w);
      return;
    }
    if (atSpot && w.toilets.isQueueHead(this)) {
      const ref = w.toilets.stallRefOf(this);
      const stall = ref ? ref.house.stalls[ref.index] : null;
      if (ref && stall) {
        // Being scrubbed, or too filthy once they look in → try another cabin.
        if (stall.cleaning || (!stall.occupant && stall.dirt >= TOILET.dirtUsableMax)) {
          this.rejectedStalls.add(ref.index);
          w.toilets.leave(this);
          if (this.pickStall() === null) this.toiletGiveUp(w); // tried them all
          return;
        }
        // Free and clean enough → go in.
        if (!stall.occupant) {
          this.toiletStall = w.toilets.enter(this);
          this.toiletDuration = Math.floor(rand(60, 140));
          this.waitTimer = this.toiletDuration;
          this.state = 'inToilet';
          this.opacity = 0.25;
          return;
        }
        // Otherwise a guest is inside — wait it out (malheur roll below).
      }
    }
    // Still queuing: 1% chance of a malheur for every in-game minute of waiting.
    if (++this.toiletWait >= MINUTE_FRAMES) {
      this.toiletWait = 0;
      if (chance(TOILET.queueMalheurChance)) {
        w.toilets.leave(this);
        this.queueMalheur(w);
      }
    }
  }

  /** Shortest non-rejected cabin queue in the chosen house, or null if none left. */
  private pickStall(): number | null {
    const h = this.toiletHouse;
    if (!h) return null;
    let best: number | null = null;
    let bestLoad = Infinity;
    for (let i = 0; i < h.stalls.length; i++) {
      if (this.rejectedStalls.has(i)) continue;
      const s = h.stalls[i]!;
      const load = s.queue.length + (s.occupant ? 1 : 0);
      if (load < bestLoad) {
        bestLoad = load;
        best = i;
      }
    }
    return best;
  }

  private inToilet(w: World): void {
    if (this.toiletStall) w.toilets.soilStall(this.toiletStall, TOILET.dirtPerUse / this.toiletDuration);
    this.waitTimer--;
    if (this.toiletStall) w.toilets.setProgress(this.toiletStall, 1 - this.waitTimer / this.toiletDuration);
    if (this.waitTimer <= 0) {
      this.opacity = 1;
      this._bladder = 0;
      w.toilets.leave(this);
      this.toiletStall = null;
      this.toiletHouse = null;
      this.rejectedStalls.clear();
      this.changeSat(w, this._satisfaction + GUEST.satToiletRelief, 'Klo: Erleichterung');
      w.play('toilet');
      this.state = 'goSit';
    }
  }

  /** No usable toilet at all: disappointed, head home, maybe with a malheur. */
  private toiletUnusable(w: World): void {
    this.toiletHouse = null;
    this.rejectedStalls.clear();
    this.changeSat(w, this._satisfaction + GUEST.satToiletUnusable, 'Klo unbenutzbar');
    this.pendingAccident = chance(GUEST.accidentChance);
    this.depart('Klo unbenutzbar');
  }

  /** Every cabin in the nearest WC was too dirty: grab the towel and go home. */
  private toiletGiveUp(w: World): void {
    this.toiletHouse = null;
    this.rejectedStalls.clear();
    this.changeSat(w, this._satisfaction + GUEST.satToiletUnusable, 'alle Kabinen zu schmutzig');
    this.pendingAccident = chance(GUEST.accidentChance);
    this.depart('alle Kabinen zu schmutzig');
  }

  /** A malheur strikes while waiting in the queue: a puddle, then home in shame. */
  private queueMalheur(w: World): void {
    this.toiletHouse = null;
    this.rejectedStalls.clear();
    w.litter.add(this.pos, 'pee');
    this._bladder = 0;
    this.changeSat(w, this._satisfaction + GUEST.satGardenPee, 'Malheur in der Warteschlange');
    this.depart('Malheur in der Warteschlange');
  }

  private goSit(w: World): void {
    if (this.moveTo(w.seating.seatPoint(this.seat!))) this.enterChilling();
  }

  private chilling(w: World): void {
    if (this._bladder >= GUEST.bladderToilet) {
      w.log('mood', `#${this.id} muss mal – geht aufs Klo`, undefined, this.id);
      this.state = 'toToilet'; // walk to the toilet; find out there if it's usable
      return;
    }
    if (this._hunger >= GUEST.hungerWantPretzel && w.foodAvailable() && !this.pretzelDisappointed) {
      this.goEat(w); // peckish and a stand is open — go grab a pretzel
      return;
    }
    if (this.wantsAnotherBeer(w)) {
      // From the seat a guest can't tell whether there's beer — they walk to
      // the bar to find out (and only learn of an empty tank there). At closing
      // time it's known, so they just head home.
      if (w.eco.salesOpen) {
        this.mugVisible = false;
        this.state = 'toBar';
      } else {
        this.depart('Feierabend – kein Bier mehr'); // wants another but it's past last call
      }
      return;
    }
    this.waitTimer--;
    if (this.waitTimer <= 0) this.depart('hatte einen schönen Tag'); // content, head home
  }

  /** Walk to the pretzel stand; on arrival pay and eat (or bail if sold out). */
  /** Queue at a pretzel stand, get served (10× faster than a beer), pay and eat. */
  private toStand(w: World): void {
    if (!w.stands.has(this)) {
      if (!w.foodAvailable() || !w.stands.join(this)) {
        this.standDisappointed(w); // no seller / sold out before we even queued
        return;
      }
      this.standServeTimer = 0;
    }
    const atSpot = this.moveTo(w.stands.positionOf(this));
    if (!w.eco.canSellPretzel()) {
      w.stands.leave(this); // ran out while we were in line
      this.standDisappointed(w);
      return;
    }
    if (atSpot && w.stands.atCounter(this)) {
      if (this.standServeTimer <= 0) {
        this.standServeDuration = Math.max(1, Math.floor(rand(STAFF.serveMin, STAFF.serveMax) / STAFF.pretzelServeDivisor));
        this.standServeTimer = this.standServeDuration;
      }
      this.standServeTimer--;
      if (this.standServeTimer <= 0) this.buyPretzel(w);
    }
  }

  private buyPretzel(w: World): void {
    if (w.eco.canSellPretzel() && this.wallet_ >= w.eco.pretzelPrice) {
      const price = w.eco.pretzelPrice;
      w.eco.sellPretzel();
      this.wallet_ -= price;
      this._spent += price;
      this.pretzelVisible = true;
      // Like the beer, the pretzel price is judged against what guests expect.
      const moodVsExpected = (ECONOMY.expectedPretzelPrice - price) * GUEST.satPerEuroVsExpectedPretzel;
      this.changeSat(w, this._satisfaction + moodVsExpected, 'Brezn bezahlt');
      w.stands.leave(this); // free the counter — they step aside to eat
      this.eatDuration = Math.floor(rand(GUEST.eatMin, GUEST.eatMax));
      this.eatTimer = this.eatDuration;
      this.state = 'eating';
      w.play('cheers');
    } else {
      w.stands.leave(this);
      this.standDisappointed(w);
    }
  }

  /** Sold out / can't afford: one pang of disappointment, then stop pestering. */
  private standDisappointed(w: World): void {
    if (!this.pretzelDisappointed) {
      this.changeSat(w, this._satisfaction + GUEST.satNoPretzel, 'keine Brezn mehr');
      this.pretzelDisappointed = true;
    }
    this.backToSeat();
  }

  private eating(w: World): void {
    this.eatTimer--;
    const frac = 1 / this.eatDuration;
    this._hunger = clamp(this._hunger - GUEST.hungerPerPretzel * frac, 0, 100);
    this.changeSat(w, this._satisfaction + GUEST.satEatPretzel * frac, 'genießt die Brezn');
    if (this.eatTimer <= 0) {
      this.pretzelVisible = false;
      this.backToSeat();
    }
  }

  /** Walk back to the reserved seat, pick up the towel (free the seat), then go. */
  private fetchTowel(w: World): void {
    if (this.moveTo(w.seating.seatPoint(this.seat!))) {
      this.releaseSeat(w); // towel gone -> the seat can be taken by someone else
      this.state = 'leaving';
    }
  }

  private leaving(w: World): boolean {
    this.releaseSlot(w);
    this.mugVisible = false;
    this.pretzelVisible = false;
    if (this.pendingAccident) {
      // ...a little malheur on the way out.
      w.litter.add(this.pos, 'pee');
      this._bladder = 0;
      this.changeSat(w, this._satisfaction + GUEST.satGardenPee, 'Malheur im Garten');
      this.pendingAccident = false;
    }
    if (this.moveTo(w.places.entrance)) {
      this.flushAllMood(w); // emit any leftover mood before the departure summary
      const r = w.eco.recordDeparture(this._satisfaction);
      const why = this.leaveReason ? ` – ${this.leaveReason}` : '';
      w.log(
        'reputation',
        `#${this.id} geht ${r.happy ? 'zufrieden' : 'unzufrieden'}${why} (Zufr. ${Math.round(this._satisfaction)}) · Ruf ${r.before.toFixed(1)}→${r.after.toFixed(1)}`,
        r.after - r.before,
        this.id,
      );
      return false;
    }
    return true;
  }

  /** Head home; if a seat is still reserved, walk back for the towel first.
   *  `reason` is recorded for the departure line in the guest log. */
  private depart(reason = ''): void {
    if (reason) this.leaveReason = reason;
    this.mugVisible = false;
    this.pretzelVisible = false;
    this.state = this.seat ? 'fetchTowel' : 'leaving';
  }

  // --- helpers --------------------------------------------------------------

  private wantsAnotherBeer(w: World): boolean {
    return this._thirst >= GUEST.thirstWantBeer && this.wallet_ >= w.eco.beerPrice;
  }

  /** Head off to queue at a pretzel stand (no-op without a seat). */
  private goEat(w: World): void {
    if (!this.seat || w.stands.count === 0) return;
    this.mugVisible = false;
    this.standServeTimer = 0;
    this.state = 'toStand';
  }

  /** After eating (or a bust trip to the stand): return to the seat, or leave. */
  private backToSeat(): void {
    this.standServeTimer = 0;
    this.state = this.seat ? 'goSit' : 'leaving';
  }

  private aimForFreeSeat(w: World): boolean {
    const free = w.seating.findFreeSeat();
    if (!free) return false;
    this.targetSeat = free;
    return true;
  }

  private startLooking(): void {
    this.targetSeat = null;
    this.lookTimer = Math.floor(rand(GUEST.lookMin, GUEST.lookMax));
    this.wanderTarget = Person.randomSpot();
    this.state = 'looking';
  }

  private releaseSeat(w: World): void {
    if (this.seat) {
      w.seating.release(this.seat);
      this.seat = null;
    }
  }

  /** Leave the bar queue (no-op if not in it). Safe to call on any exit path. */
  private releaseSlot(w: World): void {
    w.bar.leave(this);
  }

  private enterChilling(): void {
    this.waitTimer = Math.floor(rand(GUEST.relaxMin, GUEST.relaxMax));
    this.state = 'chilling';
  }

  private frustratedLeave(w: World, satisfaction: number, reason: string): void {
    this.changeSat(w, Math.min(this._satisfaction, satisfaction), reason);
    this.releaseSlot(w);
    w.stands.leave(this);
    this.depart(reason);
  }

  /**
   * Apply a per-frame ambience nudge while keeping the running total within
   * [-cap, +cap]. Returns the part that actually fits and the new total.
   */
  private capAmbience(raw: number, applied: number, cap: number): { delta: number; applied: number } {
    const next = clamp(applied + raw, -cap, cap);
    return { delta: next - applied, applied: next };
  }

  private moveTo(target: Vec): boolean {
    const r = stepToward(this.pos, target, this.curSpeed);
    this.pos = r.pos;
    return r.arrived;
  }

  private static randomSpot(): Vec {
    return { x: rand(160, WORLD.w - 200), y: rand(240, WORLD.h - 160) };
  }
}
