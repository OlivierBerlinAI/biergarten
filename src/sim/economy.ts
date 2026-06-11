// The game economy: money, the beer and toilet tanks, the beer price and the
// long-term reputation. Pure logic, no rendering — entities and the UI talk to
// this single source of truth.

import { DOGCATCHER, ECONOMY, GAME_OVER, REPUTATION, STAFF, START, TOILET } from '../config.js';
import { clamp } from './vec.js';
import type { DecoKind } from './deco.js';

export type Outcome = 'win' | 'lose';

/** A simple filling tank (beer to sell, or toilet waste to dispose of). */
export interface Tank {
  current: number;
  capacity: number; // mutable: the toilet tank can be upgraded
}

export class GameState {
  money: number = START.money;
  beerPrice: number = ECONOMY.price.start;
  /** WC usage fee per visit (Nutzungsgebühr), in euros. Set via the WC overlay. */
  wcFee: number = TOILET.fee.start;

  // Long-term reputation: a rolling average over the last REPUTATION.window
  // departing guests. Until the window fills, the empty slots count as the
  // baseline, so the garden ramps up from the starting reputation. Advertising
  // adds a separate, daily-fading boost on top (see runAdvertising).
  private repBaseline: number = START.reputation;
  private repWindow: number[] = []; // satisfaction of the most recent guests
  // Reputation is a *weighted* rolling average: unhappy departures weigh
  // REPUTATION.unhappyWeight× a happy one (bad word-of-mouth travels faster), so
  // we track both Σ(weight·sat) and Σ(weight), kept in sync on push/evict.
  private repWeightedSum = 0;
  private repWeightSum = 0;
  private adBonus = 0; // current advertising boost on top of the guest average

  /** Servicekräfte: the merged beer+pretzel staff, allocated to taps/stands by Game. */
  service: number = START.service;
  cleaners: number = START.cleaners;
  gardeners = 0;
  djWorkers = 0;

  /** Start with a small stock of beer so the garden can sell from the off.
   *  Capacity is the sum of placed beer tanks (Game keeps it in sync). */
  readonly beer: Tank = { current: START.beer, capacity: ECONOMY.beerTankUnit };
  /** How much beer the "Bier bestellen" button orders (set by the slider). */
  restockAmount: number = ECONOMY.restockDefault;
  /** Shared waste tank — fills per use across all WCs, only the Klowagen empties it.
   *  Capacity is the sum of placed waste tanks (Game keeps it in sync). */
  readonly toilet: Tank = { current: 0, capacity: ECONOMY.wasteTankUnit };

  /** Set false outside selling hours (after last call). */
  salesOpen = true;

  /** The most recent hourly wage paid, and a counter that ticks up each payment. */
  lastWage = 0;
  wagePayments = 0;

  // --- pretzels (food) -----------------------------------------------------
  // Stock, order amount and auto-supply now live per stand (see stands.ts).
  // The economy only owns the shared price and the sale bookkeeping.
  /** Price guests pay for a pretzel (set by the slider). */
  pretzelPrice: number = ECONOMY.pretzelPrice.start;

  /** Daily advertising spend (set by the slider); buys a reputation bump at dawn. */
  adBudget: number = ECONOMY.adBudget.start;

  // running totals for the stats display
  beersSold = 0;
  pretzelsSold = 0;
  private totalEarned = 0;
  private guestsDeparted = 0;

  private wageTimer = STAFF.wageIntervalFrames;

  // --- beer ----------------------------------------------------------------

  canPourBeer(): boolean {
    return this.beer.current >= 1 && this.salesOpen;
  }

  /** Serve one beer: empties the beer tank by 1 litre. (The waste tank no longer
   *  fills here — it fills when someone actually uses the loo, see useToilet.) */
  pourBeer(): boolean {
    if (!this.canPourBeer()) return false;
    this.beer.current -= 1;
    this.money += this.beerPrice;
    this.totalEarned += this.beerPrice;
    this.beersSold += 1;
    return true;
  }

  setRestockAmount(n: number): void {
    this.restockAmount = Math.max(0, Math.min(this.beer.capacity, Math.round(n)));
  }

  /** Whole litres the next order will deliver (limited by remaining tank space). */
  plannedRestock(): number {
    return Math.min(this.restockAmount, Math.floor(this.beer.capacity - this.beer.current));
  }

  /** Wholesale price per litre at a given order size (bulk is cheaper). */
  perLitre(amount: number): number {
    const { at1, at10, at100 } = ECONOMY.wholesale;
    const x = Math.log10(Math.max(1, amount)); // 0 at 1L, 1 at 10L, 2 at 100L
    if (x <= 1) return at1 + (at10 - at1) * x;
    return Math.max(at100, at10 + (at100 - at10) * (x - 1));
  }

  /** Cost of the next order at the chosen amount (with the volume discount). */
  restockCost(): number {
    const amount = this.plannedRestock();
    return Math.ceil(amount * this.perLitre(amount));
  }

  /** Add delivered beer to the tank (the truck calls this gradually). */
  addBeer(litres: number): void {
    this.beer.current = Math.min(this.beer.capacity, this.beer.current + litres);
  }

  /** Add waste to the shared tank (capped at full) — a toilet visit passes the
   *  litres the person drank (guests: their beer; staff: a small fixed amount). */
  addWaste(litres: number): void {
    this.toilet.current = Math.min(this.toilet.capacity, this.toilet.current + litres);
  }

  /** Pump waste out of the tank (the Klowagen calls this gradually). */
  drainToilet(litres: number): void {
    this.toilet.current = Math.max(0, this.toilet.current - litres);
  }

  // --- pretzels (food) -----------------------------------------------------

  setPretzelPrice(price: number): void {
    this.pretzelPrice = Math.max(ECONOMY.pretzelPrice.min, Math.min(ECONOMY.pretzelPrice.max, price));
  }

  /** Clamp a per-stand order amount to [0, one stand's capacity]. */
  clampPretzelOrder(n: number): number {
    return Math.max(0, Math.min(ECONOMY.pretzelCapacity, Math.round(n)));
  }

  /** Baker cost of an order of `amount` pretzels. */
  pretzelOrderCost(amount: number): number {
    return Math.ceil(Math.max(0, amount) * ECONOMY.pretzelWholesale);
  }

  /** Book one pretzel sale at the current price (caller decremented the stand). */
  recordPretzelSale(): void {
    this.money += this.pretzelPrice;
    this.totalEarned += this.pretzelPrice;
    this.pretzelsSold += 1;
  }

  pretzelStandCost(): number {
    return ECONOMY.pretzelStandCost;
  }

  ausschankCost(): number {
    return ECONOMY.ausschankCost;
  }

  tapCost(): number {
    return ECONOMY.tapCost;
  }

  wcHouseCost(): number {
    return ECONOMY.wcHouseCost;
  }

  stallCost(): number {
    return ECONOMY.stallCost;
  }

  setAdBudget(n: number): void {
    this.adBudget = Math.max(ECONOMY.adBudget.min, Math.min(ECONOMY.adBudget.max, Math.round(n)));
  }

  /**
   * Spend the daily advertising budget for a reputation bump (capped at 100).
   * Spends only what's actually affordable. Returns what happened, to log it.
   */
  runAdvertising(): { spent: number; repGain: number } {
    this.adBonus *= REPUTATION.adBonusDailyDecay; // yesterday's boost fades a little
    const spend = Math.min(this.adBudget, Math.max(0, this.money));
    if (spend <= 0) return { spent: 0, repGain: 0 };
    this.money -= spend;
    const repGain = Math.max(0, Math.min(100 - this.reputation, spend * ECONOMY.adRepPerEuro));
    this.adBonus += repGain;
    return { spent: spend, repGain };
  }

  // --- toilet --------------------------------------------------------------

  /** Hard block: the shared waste tank has no room. (Dirtiness is per WC house.) */
  toiletTankFull(): boolean {
    return this.toilet.current >= this.toilet.capacity;
  }

  klowagenCost(): number {
    const tanks = Math.round(this.toilet.capacity / ECONOMY.wasteTankUnit);
    return tanks * ECONOMY.klowagenPerTank;
  }

  beerTankCost(): number {
    return ECONOMY.beerTankCost;
  }

  wasteTankCost(): number {
    return ECONOMY.wasteTankCost;
  }

  bushCost(): number {
    return ECONOMY.bushCost;
  }

  flowerCost(): number {
    return ECONOMY.flowerCost;
  }

  treeCost(): number {
    return ECONOMY.treeCost;
  }

  /** What one plant of the given kind costs to buy/replant. */
  plantCost(kind: DecoKind): number {
    return kind === 'tree' ? this.treeCost() : kind === 'flower' ? this.flowerCost() : this.bushCost();
  }

  djCost(): number {
    return ECONOMY.djCost;
  }

  pathCost(): number {
    return ECONOMY.pathCost;
  }

  dogCatcherCost(): number {
    return DOGCATCHER.cost;
  }

  // --- furniture (charged here; placement handled by TableArea) -------------

  tableCost(): number {
    return ECONOMY.tableCost;
  }

  benchCost(): number {
    return ECONOMY.benchCost;
  }

  standCost(): number {
    return ECONOMY.standCost;
  }

  canAfford(cost: number): boolean {
    return this.money >= cost;
  }

  spend(cost: number): boolean {
    if (this.money < cost) return false;
    this.money -= cost;
    return true;
  }

  // --- staff ---------------------------------------------------------------

  serviceHireCost(): number {
    return STAFF.serviceHire;
  }

  cleanerHireCost(): number {
    return STAFF.cleanerHire;
  }

  serviceWage(): number {
    return STAFF.serviceWage;
  }

  cleanerWage(): number {
    return STAFF.cleanerWage;
  }

  gardenerHireCost(): number {
    return STAFF.gardenerHire;
  }

  gardenerWage(): number {
    return STAFF.gardenerWage;
  }

  djHireCost(): number {
    return STAFF.djHire;
  }

  djWage(): number {
    return STAFF.djWage;
  }

  hireDj(): boolean {
    if (!this.spend(STAFF.djHire)) return false;
    this.djWorkers += 1;
    return true;
  }

  fireDj(): boolean {
    if (this.djWorkers <= 0) return false;
    this.djWorkers -= 1;
    return true;
  }

  hireGardener(): boolean {
    if (!this.spend(STAFF.gardenerHire)) return false;
    this.gardeners += 1;
    return true;
  }

  fireGardener(): boolean {
    if (this.gardeners <= 0) return false;
    this.gardeners -= 1;
    return true;
  }

  hireService(): boolean {
    if (!this.spend(STAFF.serviceHire)) return false;
    this.service += 1;
    return true;
  }

  fireService(): boolean {
    if (this.service <= 0) return false;
    this.service -= 1;
    return true;
  }

  hireCleaner(): boolean {
    if (!this.spend(STAFF.cleanerHire)) return false;
    this.cleaners += 1;
    return true;
  }

  fireCleaner(): boolean {
    if (this.cleaners <= 0) return false;
    this.cleaners -= 1;
    return true;
  }

  /** Per-tick upkeep: draw staff wages once per in-game hour. */
  tick(): void {
    this.wageTimer -= 1;
    if (this.wageTimer <= 0) {
      this.wageTimer = STAFF.wageIntervalFrames;
      this.lastWage =
        this.service * STAFF.serviceWage +
        this.cleaners * STAFF.cleanerWage +
        this.gardeners * STAFF.gardenerWage +
        this.djWorkers * STAFF.djWage;
      this.money -= this.lastWage;
      this.wagePayments += 1;
    }
  }

  // --- price & reputation --------------------------------------------------

  setBeerPrice(price: number): void {
    this.beerPrice = Math.max(ECONOMY.price.min, Math.min(ECONOMY.price.max, price));
  }

  setWcFee(fee: number): void {
    this.wcFee = Math.max(TOILET.fee.min, Math.min(TOILET.fee.max, fee));
  }

  /** Collect one WC usage fee into the till (no-op when the fee is 0). */
  chargeWcFee(): void {
    if (this.wcFee <= 0) return;
    this.money += this.wcFee;
    this.totalEarned += this.wcFee;
  }

  /**
   * Long-term reputation (0..100): the average satisfaction of the last
   * REPUTATION.window departing guests, with any not-yet-seen slots counting as
   * the baseline, plus the current advertising boost.
   */
  get reputation(): number {
    // Not-yet-seen slots count as one baseline guest each (weight 1).
    const seedSlots = Math.max(0, REPUTATION.window - this.repWindow.length);
    const mean =
      (this.repWeightedSum + this.repBaseline * seedSlots) / (this.repWeightSum + seedSlots);
    return clamp(mean + this.adBonus, 0, 100);
  }

  /** Reset reputation to a fresh baseline (e.g. the low "blank field" start),
   *  clearing the rolling window and any advertising boost. */
  resetReputation(value: number): void {
    this.repBaseline = value;
    this.repWindow = [];
    this.repWeightedSum = 0;
    this.repWeightSum = 0;
    this.adBonus = 0;
  }

  /**
   * Fold a departing guest's final satisfaction into the long-term reputation:
   * push it onto the rolling window of the last REPUTATION.window guests (evicting
   * the oldest once full). Returns the before/after reputation so callers can log
   * why it moved.
   */
  recordDeparture(satisfaction: number): { before: number; after: number; happy: boolean } {
    const before = this.reputation;
    this.guestsDeparted += 1;
    const w = GameState.repWeight(satisfaction);
    this.repWindow.push(satisfaction);
    this.repWeightedSum += w * satisfaction;
    this.repWeightSum += w;
    if (this.repWindow.length > REPUTATION.window) {
      const old = this.repWindow.shift()!; // drop the oldest guest from the average
      const ow = GameState.repWeight(old);
      this.repWeightedSum -= ow * old;
      this.repWeightSum -= ow;
    }
    const happy = satisfaction >= REPUTATION.unhappyThreshold;
    return { before, after: this.reputation, happy };
  }

  /** Weight a departure carries in the rolling reputation average. Happy guests
   *  weigh 1; below the unhappy threshold the weight ramps from `unhappyWeight`
   *  up to `severeWeight` as satisfaction falls to 0, so the angriest guests bite
   *  hardest into the long-term reputation. */
  private static repWeight(satisfaction: number): number {
    if (satisfaction >= REPUTATION.unhappyThreshold) return 1;
    const severity = (REPUTATION.unhappyThreshold - satisfaction) / REPUTATION.unhappyThreshold; // 0..1
    return REPUTATION.unhappyWeight + (REPUTATION.severeWeight - REPUTATION.unhappyWeight) * severity;
  }

  /** Average money earned per guest that has been through the garden. */
  moneyPerVisitor(): number {
    return this.guestsDeparted > 0 ? this.totalEarned / this.guestsDeparted : 0;
  }

  /** Win when rich enough, lose when too deep in debt; otherwise null. */
  outcome(): Outcome | null {
    if (this.money >= GAME_OVER.winMoney) return 'win';
    if (this.money <= GAME_OVER.loseMoney) return 'lose';
    return null;
  }
}
