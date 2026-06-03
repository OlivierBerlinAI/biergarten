// Static configuration for the beer-garden world and the game economy.
//
// Everything here is plain data (no Paper.js objects), so it can be imported
// anywhere without depending on the rendering scope. Treat this file as the
// central "balancing" sheet — tweak the numbers to tune the game.

import type { Vec } from './sim/vec.js';

/** Size of the design coordinate system. The view is scaled to fit the canvas. */
export const WORLD = { w: 1280, h: 800 } as const;

/** Fixed points of interest, in design coordinates. */
export const PLACES: Record<'entrance' | 'bar' | 'toilet', Vec> = {
  entrance: { x: 40, y: WORLD.h - 120 }, // entrance/exit, bottom left
  bar: { x: WORLD.w - 160, y: 140 }, // the "Ausschank", top right
  toilet: { x: WORLD.w - 110, y: WORLD.h - 130 }, // toilet hut, bottom right
};

/** Grid used for auto-placement and the table cap (cols*rows = 3x3 = 9). */
export const TABLE_LAYOUT = {
  cols: 3,
  rows: 3,
  areaX0: 260,
  areaY0: 210,
  areaX1: WORLD.w - 360,
  areaY1: WORLD.h - 180,
} as const;

/** Skin tones for guests. */
export const SKIN = ['#f1c39b', '#e0a87a', '#c98a5a', '#a86a3c'];

/** Shirt colours for guests. */
export const SHIRTS = ['#d94f4f', '#4f7fd9', '#4fb86b', '#d9b14f', '#9b4fd9', '#4fc7d9', '#d97fb1'];

/** Fur colours for dogs. */
export const DOG_COLORS = ['#6b4a2a', '#3a3a3a', '#c9a16b', '#e8e2d4'];

/** Population caps. */
export const MAX_PEOPLE = 24;
export const MAX_DOGS = 8;

/** How the garden starts out. */
export const START = {
  // Enough seed capital to build the first table + bench, hire a bartender and
  // order beer (the garden now starts completely empty).
  money: 120,
  guests: 3,
  dogs: 2,
  tables: 0, // start empty — the player places the first table themselves
  benchesPerStartTable: 2,
  reputation: 60, // long-term satisfaction (0..100)
  bartenders: 0, // start with no staff — the player hires everyone
  cleaners: 0,
} as const;

/** Staff: one-time hire cost and recurring wage paid every wage interval. */
export const STAFF = {
  bartenderHire: 20,
  bartenderWage: 4, // per wage interval
  cleanerHire: 15,
  cleanerWage: 3, // per wage interval
  /** Frames between wage payments — once per in-game hour (20s × 60fps). */
  wageIntervalFrames: 1200,
  /** Bartender pour time per beer (frames) — slower bartenders = longer queues. */
  serveMin: 60,
  serveMax: 150,
} as const;

/** The toilet: a waste tank (Klowagen empties it) and dirtiness (cleaners). */
export const TOILET = {
  /** Dirtiness (Verschmutzung, 0..100) added per use. */
  dirtPerUse: 9,
  /** Above this dirtiness guests refuse to use the toilet. */
  dirtUsableMax: 85,
  /** Dirtiness a cleaner scrubs away per frame while at the toilet. */
  cleanerDirtPerFrame: 0.08,
  /** Cleaners start scrubbing the toilet once dirtiness rises above this. */
  cleanThreshold: 18,
  /**
   * How readily guests relieve themselves in the garden when the toilet is
   * merely unpleasant (it's unavoidable once it's actually unusable).
   * Probability per decision = unpleasantness (0..1) * this factor. Kept low so
   * garden-peeing stays rare in normal play.
   */
  gardenPeeFactor: 0.22,
} as const;

/** Litter (Unrat): mess on the ground that cleaners must pick up. */
export const LITTER = {
  /** Per-frame chance a dog leaves a mess. */
  dogMessChance: 0.0006,
  /** Per-frame chance a guest drops litter. */
  personMessChance: 0.00006,
  /** Frames a cleaner needs to clear one pile. */
  cleanTime: 80,
  /** A guest within this distance of a pile is bothered by it. */
  nearRadius: 95,
  /** Satisfaction lost per frame for each nearby pile (grossness up close). */
  satPerPileFrame: -0.012,
} as const;

/** Putzkraft (cleaner) entity movement (50% slower than before). */
export const CLEANER = {
  speedMin: 0.8,
  speedMax: 1.2,
} as const;

/** Stray dogs occasionally wander in (so the dog catcher stays useful). */
export const STRAY_DOG = {
  spawnIntervalMin: 1500,
  spawnIntervalMax: 3500,
} as const;

/** The dog catcher: a paid worker who walks in and chases the dogs down. */
export const DOGCATCHER = {
  cost: 25,
  /** Slightly faster than the fastest dog (dogs cap at 3.0). */
  speed: 3.4,
  /** Distance at which a dog is caught. */
  catchRadius: 20,
  /** Satisfaction each current guest loses each time a dog is caught. */
  satPerDog: 5,
} as const;

/** Win / lose thresholds (money in euros). */
export const GAME_OVER = {
  loseMoney: -100,
  winMoney: 1_000_000,
} as const;

/** How a departing guest's satisfaction moves the long-term reputation. */
export const REPUTATION = {
  /** Smoothing weight for content guests (higher = slower drift). */
  happyWeight: 8,
  /** Much smaller weight for unhappy guests, so they hurt reputation hard. */
  unhappyWeight: 2,
  /** A guest leaving below this satisfaction counts as "unhappy". */
  unhappyThreshold: 35,
} as const;

/** Economy knobs. All money values are in euros; 1 beer = 1 litre. */
export const ECONOMY = {
  /** Beer price the player sets (slider bounds), in euros. */
  price: { min: 1, max: 8, start: 4, step: 0.5 },
  /** What guests consider a "fair" price — they compare against this. */
  expectedPrice: 4,
  /**
   * Volume discount when restocking: cost per litre at given order sizes.
   * Interpolated on a log scale between these anchors.
   */
  wholesale: { at1: 1.0, at10: 0.8, at100: 0.5 },
  /** Beer tank capacity, in litres. */
  beerTankCapacity: 200,
  /** Default amount the restock slider starts at. */
  restockDefault: 40,
  /** Toilet waste-tank capacity, in litres (fills 1:1 with beer sold). */
  toiletCapacity: 40,
  /** Flat cost to call the toilet truck (empties the waste tank). */
  klowagenCost: 15,
  /** Cost to buy a new (empty) bench table. */
  tableCost: 30,
  /** Cost to buy a bench (adds 3 seats to a table that has a free bench slot). */
  benchCost: 12,
  /** Cost to buy a standing table (comes with 4 stools). */
  standCost: 22,
  /** Toilet tank upgrades: each doubles the waste-tank capacity. */
  toiletUpgradeCosts: [200, 400],
} as const;

/** Deliveries: a truck rolls in after a delay, then services the bar/toilet. */
export const DELIVERY = {
  /** Beer truck time until it arrives (seconds, random in range). */
  minSeconds: 10,
  maxSeconds: 45,
  /** Klowagen time until it arrives. */
  kloMinSeconds: 8,
  kloMaxSeconds: 25,
  /** How long the truck is visibly driving in just before it arrives. */
  driveInSeconds: 3.5,
  /** Gradual fill of the beer tank once the beer truck is parked. */
  beerServiceSeconds: 4,
  /** Gradual emptying of the waste tank once the Klowagen is parked. */
  kloServiceSeconds: 3,
} as const;

/** How guests arrive each in-game hour. */
export const ARRIVALS = {
  /** Guests per hour ≈ reputation / divisor (rep 50 → 5). */
  divisor: 10,
  /** ± this fraction of random variation around that number. */
  jitter: 0.3,
  /** Floor: at least this many guests per open hour, even at a bad reputation. */
  minPerHour: 2,
} as const;

/** In-game clock. 20 real seconds = 1 in-game hour; the day loops. */
export const CLOCK = {
  secondsPerHour: 20,
  openHour: 10, // opens at 10:00
  closeHour: 23, // last hour shown is 22:xx, wraps at 23:00 -> 10:00
  lastCallHour: 22, // from 22:00 no beer is sold and no new guests arrive
} as const;

/** Per-guest behaviour ranges (0..100 scales for thirst/bladder/satisfaction). */
export const GUEST = {
  /** Money a single guest is willing to spend in total. */
  walletMin: 8,
  walletMax: 26,
  /** Guests arrive with little thirst; it builds up while they sit. */
  thirstStartMin: 10,
  thirstStartMax: 35,
  thirstPerBeerMin: 25,
  thirstPerBeerMax: 45,
  /** Above this thirst a seated guest gets up for (another) beer. */
  thirstWantBeer: 30,
  /** Passive thirst gained per frame while not drinking. */
  thirstPerFrame: 0.05,
  /** Frames a guest relaxes at the table before getting thirsty enough / leaving. */
  relaxMin: 500,
  relaxMax: 1100,
  bladderStartMax: 20,
  bladderPerBeerMin: 22,
  bladderPerBeerMax: 42,
  /** Above this bladder level a guest needs the toilet. */
  bladderToilet: 70,
  satisfactionStart: 70,
  /** Satisfaction lost per frame while queuing at the bar (waiting = unhappy). */
  satPerQueueFrame: -0.05,
  /** Frames a guest will queue at the bar before giving up. */
  queueGiveUp: 360,
  /** Satisfaction hit when giving up the bar queue. */
  satQueueGiveUp: -25,
  /** Satisfaction a guest leaves with when no seat ever frees up. */
  satNoSeat: 45,
  /** Frames a seatless guest wanders around looking before giving up. */
  lookMin: 200,
  lookMax: 480,
  /** Satisfaction a guest is left with when there's no beer (frustrated). */
  satNoBeer: 20,
  /** Satisfaction a guest is left with when maxed-out thirsty and still dry. */
  satMaxThirst: 18,
  /** Satisfaction hit on finding the toilet full/too dirty to use. */
  satToiletUnusable: -12,
  /** Chance of a "malheur" (an accident) on the way out after an unusable toilet. */
  accidentChance: 0.5,
  /** Satisfaction hit when an accident happens (relieving in the garden). */
  satGardenPee: -28,
  /** Satisfaction lost per euro paid (paying = unhappy; pricier = unhappier). */
  satPerEuroPaid: 1.5,
  /** Satisfaction gained over the course of drinking one beer (drinking = happy). */
  satDrinkPerBeer: 12,
  /** Satisfaction gained from a toilet visit (relief = happy). */
  satToiletRelief: 8,
} as const;
