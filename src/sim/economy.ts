// The game economy: money, the beer and toilet tanks, the beer price and the
// long-term reputation. Pure logic, no rendering — entities and the UI talk to
// this single source of truth.

import { DOGCATCHER, ECONOMY, GAME_OVER, REPUTATION, STAFF, START, TOILET } from '../config.js';

export type Outcome = 'win' | 'lose';

/** A simple filling tank (beer to sell, or toilet waste to dispose of). */
export interface Tank {
  current: number;
  capacity: number; // mutable: the toilet tank can be upgraded
}

export class GameState {
  money: number = START.money;
  beerPrice: number = ECONOMY.price.start;
  reputation: number = START.reputation; // long-term satisfaction, 0..100

  bartenders: number = START.bartenders;
  cleaners: number = START.cleaners;

  /** Start with an empty beer tank — you must order beer before you can sell it. */
  readonly beer: Tank = { current: 0, capacity: ECONOMY.beerTankCapacity };
  /** How much beer the "Bier bestellen" button orders (set by the slider). */
  restockAmount: number = ECONOMY.restockDefault;
  /** Waste tank — fills per use, only the Klowagen empties it. */
  readonly toilet: Tank = { current: 0, capacity: ECONOMY.toiletCapacity };
  /** Dirtiness (Verschmutzung, 0..100) — rises per use, only cleaners reduce it. */
  toiletDirt = 0;
  /** How many waste-tank upgrades have been bought (each doubles capacity). */
  toiletUpgradeLevel = 0;

  /** Set false outside selling hours (after last call). */
  salesOpen = true;

  /** The most recent hourly wage paid, and a counter that ticks up each payment. */
  lastWage = 0;
  wagePayments = 0;

  // running totals for the stats display
  beersSold = 0;
  private totalEarned = 0;
  private guestsDeparted = 0;

  // bar service: how many guests are being served right now (<= bartenders)
  private serving = 0;
  private wageTimer = STAFF.wageIntervalFrames;

  // --- beer ----------------------------------------------------------------

  canPourBeer(): boolean {
    return this.beer.current >= 1 && this.salesOpen;
  }

  /** Serve one beer: empties the tank by 1 litre (which becomes 1 litre of waste). */
  pourBeer(): boolean {
    if (!this.canPourBeer()) return false;
    this.beer.current -= 1;
    this.toilet.current = Math.min(this.toilet.capacity, this.toilet.current + 1); // 1L in -> 1L out
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

  /** Pump waste out of the tank (the Klowagen calls this gradually). */
  drainToilet(litres: number): void {
    this.toilet.current = Math.max(0, this.toilet.current - litres);
  }

  // --- toilet --------------------------------------------------------------

  /** Hard block: the waste tank has no room. (Dirtiness is handled per guest.) */
  toiletTankFull(): boolean {
    return this.toilet.current >= this.toilet.capacity;
  }

  /** Record a toilet visit: it only makes the toilet dirtier. */
  useToilet(): void {
    this.toiletDirt = Math.min(100, this.toiletDirt + TOILET.dirtPerUse);
  }

  /** A cleaner scrubs the toilet (reduces dirtiness). */
  cleanToiletDirt(amount: number): void {
    this.toiletDirt = Math.max(0, this.toiletDirt - amount);
  }

  klowagenCost(): number {
    return ECONOMY.klowagenCost;
  }

  /** Cost of the next toilet-tank upgrade, or null if maxed out. */
  toiletUpgradeCost(): number | null {
    const costs = ECONOMY.toiletUpgradeCosts;
    return this.toiletUpgradeLevel < costs.length ? costs[this.toiletUpgradeLevel]! : null;
  }

  canUpgradeToilet(): boolean {
    const c = this.toiletUpgradeCost();
    return c !== null && this.money >= c;
  }

  /** Buy the next upgrade: doubles the waste-tank capacity. */
  upgradeToilet(): boolean {
    const c = this.toiletUpgradeCost();
    if (c === null || !this.spend(c)) return false;
    this.toilet.capacity *= 2;
    this.toiletUpgradeLevel += 1;
    return true;
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

  bartenderHireCost(): number {
    return STAFF.bartenderHire;
  }

  cleanerHireCost(): number {
    return STAFF.cleanerHire;
  }

  bartenderWage(): number {
    return STAFF.bartenderWage;
  }

  cleanerWage(): number {
    return STAFF.cleanerWage;
  }

  hireBartender(): boolean {
    if (!this.spend(STAFF.bartenderHire)) return false;
    this.bartenders += 1;
    return true;
  }

  fireBartender(): boolean {
    if (this.bartenders <= 0) return false;
    this.bartenders -= 1;
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

  /** Try to grab a free bartender. Returns false if all are busy (guest waits). */
  requestBarSlot(): boolean {
    if (this.serving < this.bartenders) {
      this.serving += 1;
      return true;
    }
    return false;
  }

  releaseBarSlot(): void {
    if (this.serving > 0) this.serving -= 1;
  }

  /** Per-tick upkeep: draw staff wages once per in-game hour. */
  tick(): void {
    this.wageTimer -= 1;
    if (this.wageTimer <= 0) {
      this.wageTimer = STAFF.wageIntervalFrames;
      this.lastWage = this.bartenders * STAFF.bartenderWage + this.cleaners * STAFF.cleanerWage;
      this.money -= this.lastWage;
      this.wagePayments += 1;
    }
  }

  // --- price & reputation --------------------------------------------------

  setBeerPrice(price: number): void {
    this.beerPrice = Math.max(ECONOMY.price.min, Math.min(ECONOMY.price.max, price));
  }

  /**
   * Fold a departing guest's final satisfaction into the long-term reputation.
   * Unhappy guests are weighted much more heavily, so they hurt the rep hard.
   */
  recordDeparture(satisfaction: number): void {
    this.guestsDeparted += 1;
    const weight =
      satisfaction < REPUTATION.unhappyThreshold ? REPUTATION.unhappyWeight : REPUTATION.happyWeight;
    this.reputation = (this.reputation * weight + satisfaction) / (weight + 1);
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
