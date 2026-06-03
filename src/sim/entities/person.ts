// A guest. Pure state machine over a {x,y} position — no rendering. The view
// reads pos + the render flags (mugVisible, beerLevel, opacity, bob, moving).

import { stepToward, rand, chance, clamp, pick, type Vec } from '../vec.js';
import { SKIN, SHIRTS, GUEST, LITTER, WORLD, STAFF } from '../../config.js';
import type { SeatRef } from '../seating.js';
import type { World } from '../world.js';

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
  | 'fetchTowel'
  | 'leaving';

const MOVING_STATES: ReadonlySet<PersonState> = new Set<PersonState>([
  'arriving',
  'looking',
  'toReserve',
  'toBar',
  'toSeat',
  'toToilet',
  'goSit',
  'fetchTowel',
  'leaving',
]);

const BEER_SECURED: ReadonlySet<PersonState> = new Set<PersonState>(['ordering', 'toSeat', 'drinking']);

export class Person {
  readonly id: number;
  pos: Vec;
  readonly shirt: string;
  readonly skin: string;

  // render flags (read by the view)
  mugVisible = false;
  beerLevel = 0;
  opacity = 1;
  bob: number;

  private state: PersonState = 'arriving';
  private readonly speed = rand(1.1, 1.9);
  private seat: SeatRef | null = null;
  private targetSeat: SeatRef | null = null;
  private drinkTimer = 0;
  private drinkDuration = 1;
  private waitTimer = 0;
  private queueTimer = 0;
  private serveTimer = 0;
  private serveDuration = 1;
  private hasBarSlot = false;
  private lookTimer = 0;
  private wanderTarget: Vec = { x: 0, y: 0 };
  private thirstDelta = 0;
  private bladderDelta = 0;
  private pendingAccident = false; // a malheur on the way out after an unusable toilet

  private wallet = rand(GUEST.walletMin, GUEST.walletMax);
  private _spent = 0;
  private _thirst = rand(GUEST.thirstStartMin, GUEST.thirstStartMax);
  private _bladder = rand(0, GUEST.bladderStartMax);
  private _satisfaction: number = GUEST.satisfactionStart;

  constructor(id: number, entrance: Vec) {
    this.id = id;
    this.pos = { x: entrance.x, y: entrance.y };
    this.shirt = pick(SHIRTS);
    this.skin = pick(SKIN);
    this.bob = rand(0, Math.PI * 2);
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
  get spent(): number {
    return this._spent;
  }
  get moving(): boolean {
    return MOVING_STATES.has(this.state);
  }
  get pourProgress(): number {
    if (this.state !== 'ordering') return 0;
    return clamp(1 - this.serveTimer / this.serveDuration, 0, 1);
  }

  upset(amount: number): void {
    this._satisfaction = clamp(this._satisfaction - amount, 0, 100);
  }

  tick(w: World): boolean {
    this._thirst = clamp(this._thirst + GUEST.thirstPerFrame, 0, 100);
    if (
      this._thirst >= 100 &&
      this.state !== 'leaving' &&
      this.state !== 'fetchTowel' &&
      !BEER_SECURED.has(this.state)
    ) {
      this.frustratedLeave(w, GUEST.satMaxThirst);
    }

    const piles = w.litter.countNear(this.pos, LITTER.nearRadius);
    if (piles > 0) {
      this._satisfaction = clamp(this._satisfaction + LITTER.satPerPileFrame * Math.min(piles, 6), 0, 100);
    }
    if (chance(LITTER.personMessChance)) w.litter.add(this.pos, 'poop');

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
      case 'fetchTowel': this.fetchTowel(w); break;
      case 'leaving': alive = this.leaving(w); break;
    }

    this.bob += 0.2;
    return alive;
  }

  /** Free a held bar slot + seat when removed (safety net). */
  onRemove(w: World): void {
    this.releaseSlot(w);
    this.releaseSeat(w);
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
      this._satisfaction = GUEST.satNoSeat;
      this.state = 'leaving';
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
    if (!this.moveTo({ x: w.places.bar.x, y: w.places.bar.y + 60 })) return;
    if (!w.eco.canPourBeer()) {
      // Empty tank: no pour, no waiting — turn around right away.
      this.noBeerAtBar(w);
      return;
    }
    this.queueTimer = 0;
    this.state = 'queuing';
  }

  private queuing(w: World): void {
    if (w.eco.requestBarSlot()) {
      if (!w.eco.canPourBeer()) {
        // Tank ran dry while queuing — free the bartender, don't start pouring.
        w.eco.releaseBarSlot();
        this.noBeerAtBar(w);
        return;
      }
      this.hasBarSlot = true;
      this.serveDuration = Math.floor(rand(STAFF.serveMin, STAFF.serveMax));
      this.serveTimer = this.serveDuration;
      this.state = 'ordering';
      return;
    }
    this.queueTimer++;
    this._satisfaction = clamp(this._satisfaction + GUEST.satPerQueueFrame, 0, 100);
    if (this.queueTimer > GUEST.queueGiveUp) {
      this._satisfaction = clamp(this._satisfaction + GUEST.satQueueGiveUp, 0, 100);
      this.depart(); // disappointed at the bar -> go back for the towel, then leave
    }
  }

  private ordering(w: World): void {
    this.serveTimer--;
    if (this.serveTimer > 0) return;
    this.releaseSlot(w);

    if (w.eco.canPourBeer() && this.wallet >= w.eco.beerPrice) {
      const price = w.eco.beerPrice;
      w.eco.pourBeer();
      this.wallet -= price;
      this._spent += price;
      this.mugVisible = true;
      this.beerLevel = 1;
      this._satisfaction = clamp(this._satisfaction - price * GUEST.satPerEuroPaid, 0, 100);
      this.thirstDelta = rand(GUEST.thirstPerBeerMin, GUEST.thirstPerBeerMax);
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
    if (w.eco.salesOpen) this._satisfaction = Math.min(this._satisfaction, GUEST.satNoBeer);
    this.depart();
  }

  private toSeat(w: World): void {
    if (this.moveTo(w.seating.seatPoint(this.seat!))) {
      this.drinkDuration = Math.floor(rand(180, 420));
      this.drinkTimer = this.drinkDuration;
      this.state = 'drinking';
      w.play('cheers');
    }
  }

  private drinking(w: World): void {
    this.drinkTimer--;
    const frac = 1 / this.drinkDuration;
    this._thirst = clamp(this._thirst - this.thirstDelta * frac, 0, 100);
    this._bladder = clamp(this._bladder + this.bladderDelta * frac, 0, 100);
    this._satisfaction = clamp(this._satisfaction + GUEST.satDrinkPerBeer * frac, 0, 100);
    this.beerLevel = Math.max(0, this.drinkTimer / this.drinkDuration);
    if (chance(0.008)) w.play('sip');
    if (this.drinkTimer <= 0) {
      this.mugVisible = false;
      this.enterChilling();
    }
  }

  private toToilet(w: World): void {
    if (!this.moveTo({ x: w.places.toilet.x, y: w.places.toilet.y + 55 })) return;
    // Tank full = hard block. Otherwise dirtiness linearly puts guests off:
    // 10% dirty -> 10% refuse, 50% -> 50% … 0% -> everyone is happy to use it.
    const refuse = w.eco.toiletTankFull() || chance(w.eco.toiletDirt / 100);
    if (!refuse) {
      w.eco.useToilet();
      this.waitTimer = Math.floor(rand(60, 140));
      this.state = 'inToilet';
      this.opacity = 0.25;
    } else {
      // Disappointed at the toilet: walk back for the towel and head home —
      // maybe with a malheur on the way out.
      this._satisfaction = clamp(this._satisfaction + GUEST.satToiletUnusable, 0, 100);
      this.pendingAccident = chance(GUEST.accidentChance);
      this.depart();
    }
  }

  private inToilet(w: World): void {
    this.waitTimer--;
    if (this.waitTimer <= 0) {
      this.opacity = 1;
      this._bladder = 0;
      this._satisfaction = clamp(this._satisfaction + GUEST.satToiletRelief, 0, 100);
      w.play('toilet');
      this.state = 'goSit';
    }
  }

  private goSit(w: World): void {
    if (this.moveTo(w.seating.seatPoint(this.seat!))) this.enterChilling();
  }

  private chilling(w: World): void {
    if (this._bladder >= GUEST.bladderToilet) {
      this.state = 'toToilet'; // walk to the toilet; find out there if it's usable
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
        this.depart();
      }
      return;
    }
    this.waitTimer--;
    if (this.waitTimer <= 0) this.depart(); // had a nice time, head home
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
    if (this.pendingAccident) {
      // ...a little malheur on the way out.
      w.litter.add(this.pos, 'pee');
      this._bladder = 0;
      this._satisfaction = clamp(this._satisfaction + GUEST.satGardenPee, 0, 100);
      this.pendingAccident = false;
    }
    if (this.moveTo(w.places.entrance)) {
      w.eco.recordDeparture(this._satisfaction);
      return false;
    }
    return true;
  }

  /** Head home; if a seat is still reserved, walk back for the towel first. */
  private depart(): void {
    this.mugVisible = false;
    this.state = this.seat ? 'fetchTowel' : 'leaving';
  }

  // --- helpers --------------------------------------------------------------

  private wantsAnotherBeer(w: World): boolean {
    return this._thirst >= GUEST.thirstWantBeer && this.wallet >= w.eco.beerPrice;
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

  private releaseSlot(w: World): void {
    if (this.hasBarSlot) {
      w.eco.releaseBarSlot();
      this.hasBarSlot = false;
    }
  }

  private enterChilling(): void {
    this.waitTimer = Math.floor(rand(GUEST.relaxMin, GUEST.relaxMax));
    this.state = 'chilling';
  }

  private frustratedLeave(w: World, satisfaction: number): void {
    this._satisfaction = Math.min(this._satisfaction, satisfaction);
    this.releaseSlot(w);
    this.depart();
  }

  private moveTo(target: Vec): boolean {
    const r = stepToward(this.pos, target, this.speed);
    this.pos = r.pos;
    return r.arrived;
  }

  private static randomSpot(): Vec {
    return { x: rand(160, WORLD.w - 200), y: rand(240, WORLD.h - 160) };
  }
}
