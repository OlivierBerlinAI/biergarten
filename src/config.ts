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

/** Ausschank buildings: each holds 1..maxTaps taps, each tap its own queue. */
export const BAR = {
  /** Most taps a single Ausschank building can hold. */
  maxTaps: 4,
  /** Horizontal distance between taps within a building. */
  laneSpacing: 44,
  /** Distance between people standing in the same queue. */
  queueSpacing: 30,
  /** Y offset of the first (front) queue spot, below the bar counter. */
  frontOffsetY: 58,
  /** Y offset of each tap's progress bar (on the counter face). */
  gaugeOffsetY: 28,
  /** Half-width of the counter, plus per-extra-tap growth (for the footprint). */
  halfWidth: 70,
  /** Placement/overlap radius of a building. */
  footprint: 80,
  /** Where the "+" add-tap button sits, relative to the building centre. */
  plusOffset: { x: 92, y: -44 },
  /** Click radius around the "+" button. */
  plusHitRadius: 30,
} as const;

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

/**
 * Beach towels: each guest rolls a base colour, an accent (stripe/motif)
 * colour, and a pattern, so everyone's towel on the bench looks a bit different.
 */
export const TOWEL = {
  base: ['#eef0f2', '#f3e6c8', '#cfe3f5', '#ead2ea', '#d8eccf', '#f6d6c4', '#e3e3e3', '#fbe9aa', '#cfeae6'],
  accent: ['#d94f4f', '#4f7fd9', '#4fb86b', '#d9a23f', '#9b4fd9', '#3bbac9', '#d97fb1', '#2f3a2c', '#e8743b'],
  /** plain = no stripes; v=vertical, h=horizontal; cross = both; circle = centre dot. */
  patterns: ['plain', 'vstripe1', 'vstripe2', 'hstripe', 'cross', 'circle'],
} as const;

export type TowelPattern = (typeof TOWEL.patterns)[number];

/** A single guest's towel design (plain data, generated in the Person ctor). */
export interface Towel {
  base: string;
  accent: string;
  pattern: TowelPattern;
}

/** Population caps. */
export const MAX_PEOPLE = 100;
export const MAX_DOGS = 8;

/** How the garden starts out. */
export const START = {
  // Seed capital to build the first table + bench and keep things running.
  money: 120,
  guests: 3,
  dogs: 2,
  tables: 0, // start empty — the player places the first table themselves
  benchesPerStartTable: 2,
  reputation: 60, // long-term satisfaction (0..100)
  blankReputation: 15, // a "blank field" start opens with a low reputation
  beer: 25, // litres in the tank at the start
  service: 1, // start with one Servicekraft already on shift
  cleaners: 1, // ...and one cleaner
} as const;

/** Staff: one-time hire cost and recurring wage paid every wage interval. */
export const STAFF = {
  /** Servicekraft: one merged role that pours beer AND sells pretzels, doing
   *  whatever's most needed right now (Game allocates them dynamically). */
  serviceHire: 20,
  serviceWage: 4, // per wage interval
  cleanerHire: 15,
  cleanerWage: 3, // per wage interval
  gardenerHire: 18,
  gardenerWage: 3, // per wage interval
  djHire: 20, // one-time hire (via the Personal panel)
  djWage: 4, // per wage interval
  /** Frames between wage payments — once per in-game hour (20s × 60fps). */
  wageIntervalFrames: 1200,
  /** Bartender pour time per beer (frames) — slower bartenders = longer queues. */
  serveMin: 90,
  serveMax: 225,
  /** Pretzel selling is this many times faster than pouring a beer. */
  pretzelServeDivisor: 10,
  /**
   * Staff slowly need the toilet too. Each worker rolls their own fill rate in
   * this range, so they don't all need to go at the same time.
   */
  bladderRateMin: 0.007,
  bladderRateMax: 0.018,
  /** Above this bladder a staff member breaks off to queue for the toilet. */
  bladderToilet: 75,
  /** Frames a staff toilet visit takes. */
  toiletMin: 60,
  toiletMax: 120,
} as const;

/** The toilet: a shared waste tank (Klowagen empties it) and per-house dirtiness. */
export const TOILET = {
  /** Dirtiness (Verschmutzung, 0..100) added per use. */
  dirtPerUse: 9,
  /** Above this dirtiness guests refuse to use the toilet. */
  dirtUsableMax: 85,
  /** Dirtiness a cleaner scrubs away per frame while at the toilet. */
  cleanerDirtPerFrame: 0.04,
  /** Cleaners start scrubbing a WC once its dirtiness rises above this. */
  cleanThreshold: 18,
  /**
   * How readily guests relieve themselves in the garden when the toilet is
   * merely unpleasant (it's unavoidable once it's actually unusable).
   * Probability per decision = unpleasantness (0..1) * this factor. Kept low so
   * garden-peeing stays rare in normal play.
   */
  gardenPeeFactor: 0.22,
  /** Chance, per in-game minute spent waiting in the toilet queue, of a malheur. */
  queueMalheurChance: 0.01,
} as const;

/** WC houses: placeable buildings holding 1..maxStalls toilets, each its own queue. */
export const WC = {
  /** Most toilets a single WC house can hold. */
  maxStalls: 3,
  /** Horizontal distance between toilets within a house. */
  stallSpacing: 40,
  /** Distance between people standing in the same queue. */
  queueSpacing: 28,
  /** Y offset of the first (front) queue spot, below the WC. */
  frontOffsetY: 78,
  /** Y offset of each toilet's progress bar. */
  gaugeOffsetY: 50,
  /** Half-width of the house, plus per-extra-toilet growth (for the footprint). */
  halfWidth: 56,
  /** Placement/overlap radius of a WC house. */
  footprint: 70,
  /** Where the "+" add-toilet button sits, relative to the house centre. */
  plusOffset: { x: 64, y: -52 },
  /** Click radius around the "+" button. */
  plusHitRadius: 16,
} as const;

/** Decoration: bushes and flowers that need a gardener to keep them alive. */
export const DECO = {
  /** Condition lost per frame (flowers wilt faster than bushes). */
  bushDecayPerFrame: 0.004,
  flowerDecayPerFrame: 0.011,
  /** Condition a gardener restores per frame while watering. */
  waterPerFrame: 0.7,
  /** Below this condition a plant counts as dead (perceived negatively). */
  deadThreshold: 25,
  /**
   * A plant only "asks" for water once its condition drops below its own
   * threshold, rolled per plant in this range so they don't all wilt in sync.
   */
  waterAtMin: 45,
  waterAtMax: 80,
  /** Guests within this radius of a plant feel its effect. */
  perceptionRadius: 110,
  /** Per-frame mood from a fully lush plant nearby (scaled by its condition). */
  satLivingPerFrame: 0.01,
  /** Per-frame mood from a dead/wilted plant nearby. */
  satDeadPerFrame: -0.013,
  /** Cap on a guest's total mood swing from vegetation (so spam can't stack). */
  moodCap: 10,
} as const;

/** DJs: placeable music sources with a sweet-spot range. */
export const DJ = {
  /** Closer than this is too loud → annoying. */
  tooClose: 80,
  /** Out to here the music is enjoyed; beyond it, not heard at all. */
  range: 240,
  /** Per-frame mood when a guest is uncomfortably close to a DJ (halved). */
  satTooClose: -0.01,
  /** Per-frame mood in the sweet spot (one DJ in range, not too close; halved). */
  satSweet: 0.008,
  /** Per-frame mood when two or more DJ ranges overlap on the guest (halved). */
  satOverlap: -0.015,
  /** Cap on a guest's total mood swing from music (so spam can't stack). */
  moodCap: 10,
  /** Placement/overlap radius. */
  footprint: 26,
} as const;

/** Paths the player lays down. Guests move faster on them, slower off them. */
export const PATH = {
  /** A guest within this radius of a path tile counts as "on the path". */
  tileRadius: 30,
  /** While dragging to paint a path, drop a new tile every this many px. */
  tileSpacing: 22,
  /** Don't place a new tile if one already sits within this radius (no stacking). */
  minGap: 16,
  /** Speed multipliers on / off the path (±25%). */
  onSpeedMult: 1.25,
  offSpeedMult: 0.75,
} as const;

/** Litter (Unrat): mess on the ground that cleaners must pick up. */
export const LITTER = {
  /** Per-frame chance a dog leaves a mess. */
  dogMessChance: 0.0003,
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
  satPerDog: 2.5,
} as const;

/** Win / lose thresholds (money in euros). */
export const GAME_OVER = {
  loseMoney: -100,
  winMoney: 10_000,
} as const;

/** How a departing guest's satisfaction moves the long-term reputation. */
export const REPUTATION = {
  /** Smoothing weight for content guests (higher = slower drift). */
  happyWeight: 24,
  /** Much smaller weight for unhappy guests, so they hurt reputation hard. */
  unhappyWeight: 6,
  /** A guest leaving below this satisfaction counts as "unhappy". */
  unhappyThreshold: 35,
} as const;

/** Economy knobs. All money values are in euros; 1 beer = 1 litre. */
export const ECONOMY = {
  /** Beer price the player sets (slider bounds), in euros. */
  price: { min: 1, max: 16, start: 4, step: 0.5 },
  /** What guests consider a "fair" price — they compare against this. */
  expectedPrice: 4,
  /**
   * Volume discount when restocking: cost per litre at given order sizes.
   * Interpolated on a log scale between these anchors.
   */
  wholesale: { at1: 1.0, at10: 0.8, at100: 0.5 },
  /** Litres of beer capacity each placed beer tank adds (shared pool). */
  beerTankUnit: 150,
  /** Litres of waste capacity each placed waste tank adds (shared pool). */
  wasteTankUnit: 40,
  /** Cost to place another beer / waste tank. */
  beerTankCost: 70,
  wasteTankCost: 50,
  /** Default amount the restock slider starts at. */
  restockDefault: 40,
  /** Flat cost to call the toilet truck (empties the waste tank). */
  klowagenCost: 15,
  /** Cost to buy a new (empty) bench table. */
  tableCost: 30,
  /** Cost to buy a bench (adds 3 seats to a table that has a free bench slot). */
  benchCost: 12,
  /** Cost to buy a standing table (comes with 4 stools). */
  standCost: 22,

  // --- pretzels (food) -----------------------------------------------------
  /** Pretzel price the player sets (slider bounds), in euros. */
  pretzelPrice: { min: 1, max: 8, start: 2.5, step: 0.5 },
  /** What guests consider a "fair" pretzel price — they compare against this. */
  expectedPretzelPrice: 2.5,
  /** Baker wholesale: what one pretzel costs the garden when restocking. */
  pretzelWholesale: 1.0,
  /** How many fresh pretzels the stock can hold (good for one day only). */
  pretzelCapacity: 60,
  /** Default amount the pretzel-order slider starts at. */
  pretzelOrderDefault: 30,
  /** Cost to build a pretzel stand (placed like a table). */
  pretzelStandCost: 40,
  /** Cost to build a new Ausschank (comes with one tap). */
  ausschankCost: 80,
  /** Cost to add a tap to an existing Ausschank. */
  tapCost: 45,
  /** Cost to build a new WC house (comes with one toilet). */
  wcHouseCost: 60,
  /** Cost to add a toilet to an existing WC house. */
  stallCost: 35,
  /** Cost to place a bush / flower / tree / DJ. */
  bushCost: 15,
  flowerCost: 10,
  treeCost: 20,
  djCost: 90,
  /** Cost to lay one path tile. */
  pathCost: 1,
  /** Daily advertising budget the player can set (slider bounds), in euros. */
  adBudget: { min: 0, max: 200, start: 0, step: 10 },
  /** Reputation points gained per euro of advertising spent at day start. */
  adRepPerEuro: 0.08,
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
  /** Pretzel van unloading time once parked (the batch lands at the end). */
  pretzelServiceSeconds: 2,
  /** The baker's van takes this many in-game HOURS to arrive (random in range). */
  pretzelMinHours: 1,
  pretzelMaxHours: 2,
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
  closeHour: 24, // last hour shown is 23:xx, wraps at 24:00 -> 10:00
  lastCallHour: 22, // from 22:00 no beer is sold and no new guests arrive
  /** Staff stay this many hours past last call to clear up before heading home. */
  staffOvertimeHours: 1,
} as const;

/** Per-guest behaviour ranges (0..100 scales for thirst/bladder/satisfaction). */
export const GUEST = {
  /** Money a single guest is willing to spend in total. */
  walletMin: 8,
  walletMax: 26,
  /** Guests arrive with little thirst; it builds up while they sit. A finished
   *  beer fully quenches it (thirst → 0), so there's no per-beer amount. */
  thirstStartMin: 10,
  thirstStartMax: 35,
  /** Above this thirst a seated guest gets up for (another) beer. */
  thirstWantBeer: 30,
  /** Passive thirst gained per frame while not drinking. Each guest rolls their
   *  own rate in this range, so some get thirsty much faster than others. */
  thirstPerFrameMin: 0.02,
  thirstPerFrameMax: 0.045,
  /** Frames a guest relaxes at the table before getting thirsty enough / leaving. */
  relaxMin: 500,
  relaxMax: 1100,
  bladderStartMax: 20,
  bladderPerBeerMin: 22,
  bladderPerBeerMax: 42,
  /** Above this bladder level a guest needs the toilet. */
  bladderToilet: 70,
  satisfactionStart: 70,
  /** Min absolute satisfaction change (points) before a mood entry is logged. */
  moodLogThreshold: 4,
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
  /**
   * Discomfort: above these levels, thirst/hunger gnaw at the mood. The loss
   * scales from 0 at the comfort level to satDiscomfortPerFrame at fully
   * parched/starving — so an unmet need slowly makes a guest unhappy instead of
   * yanking them out the moment a bar hits 100.
   */
  thirstComfort: 80,
  hungerComfort: 80,
  satDiscomfortPerFrame: 0.04, // per source (thirst, hunger) at full excess — gentle
  /** Below this satisfaction a guest gives up and goes home — whatever the cause. */
  satLeave: 15,
  /** Satisfaction hit on finding the toilet full/too dirty to use. */
  satToiletUnusable: -12,
  /** Chance of a "malheur" (an accident) on the way out after an unusable toilet. */
  accidentChance: 0.5,
  /** Satisfaction hit when an accident happens (relieving in the garden). */
  satGardenPee: -28,
  /**
   * Satisfaction change per euro the price deviates from ECONOMY.expectedPrice.
   * At the expected price the change is 0; every euro below gives points (a
   * bargain pleases), every euro above costs points (a rip-off annoys).
   */
  satPerEuroVsExpected: 1,
  /** Satisfaction gained over the course of drinking one beer (drinking = happy). */
  satDrinkPerBeer: 12,
  /** Satisfaction gained from a toilet visit (relief = happy). */
  satToiletRelief: 8,

  // --- hunger (fed by the pretzel stand) -----------------------------------
  /** Guests arrive with a little hunger; it slowly builds while they stay. */
  hungerStartMin: 0,
  hungerStartMax: 20,
  /** Passive hunger gained per frame. Each guest rolls their own rate in this
   *  range — kept at most ~1/3 of the thirst rate, so people get hungry far
   *  slower than thirsty (thirst 0.02–0.045 → hunger 0.007–0.015). */
  hungerPerFrameMin: 0.007,
  hungerPerFrameMax: 0.015,
  /** Above this hunger a seated guest goes for a pretzel — if any is offered. */
  hungerWantPretzel: 55,
  /** Hunger removed by eating one pretzel. */
  hungerPerPretzel: 60,
  /** Frames it takes to eat a pretzel at the stand. */
  eatMin: 120,
  eatMax: 260,
  /** Satisfaction gained over the course of eating one pretzel. */
  satEatPretzel: 10,
  /** Satisfaction hit when the stand is sold out on arrival. */
  satNoPretzel: -6,
  /** Satisfaction change per euro the pretzel price strays from the expected. */
  satPerEuroVsExpectedPretzel: 2,
} as const;
