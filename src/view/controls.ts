// Wires the DOM controls to the backend Game (commands), the placement input
// and the render speed. Reads game state for labels; never mutates the sim
// except through Game's command methods.

import type { SoundEngine } from './sound.js';
import type { Game, PlaceKind } from '../sim/game.js';

/** Frontend-only actions the controls drive (placement + speed). */
export interface ViewActions {
  beginPlace(kind: PlaceKind): void;
  cancelPlace(): void;
  setSpeed(mult: number): void;
  getSpeed(): number;
  /** Toggle pause; returns the new paused state. */
  togglePause(): boolean;
  /** Toggle demolish mode; returns the new state. */
  toggleDemolish(): boolean;
  /** Whether demolish mode is currently on. */
  isDemolish(): boolean;
}

const SPEEDS = [1, 2, 4, 8];

export class Controls {
  private readonly nodes = new Map<string, HTMLElement | null>();
  private readonly last = new Map<string, string>();
  private readonly slider: HTMLInputElement | null;
  private readonly restockSlider: HTMLInputElement | null;
  private readonly pretzelPriceSlider: HTMLInputElement | null;
  private readonly pretzelOrderSlider: HTMLInputElement | null;
  private readonly adSlider: HTMLInputElement | null;
  private draggingSlider = false;
  private draggingRestock = false;
  private draggingPretzelPrice = false;
  private draggingPretzelOrder = false;
  private draggingAd = false;
  /** Which stand the pretzel overlay currently manages (null = none open). */
  private selectedStandId: number | null = null;
  /** Collapse the build menu (assigned in setupBuildMenu); used by Esc. */
  private closeBuildMenu: () => void = () => {};

  constructor(
    private readonly game: Game,
    sound: SoundEngine,
    private readonly actions: ViewActions,
  ) {
    const ambientBtn = this.el('btn-ambient');
    const startAudio = (): void => {
      sound.init();
      if (!sound.isAmbientOn()) sound.ambientToggle();
      if (ambientBtn) ambientBtn.textContent = '🎵 Atmo aus';
    };
    document.addEventListener('pointerdown', startAudio, { once: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        actions.cancelPlace();
        this.closeOverlays();
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault(); // pause/resume at the same speed
        const paused = actions.togglePause();
        const pb = document.getElementById('btn-pause');
        if (pb) pb.textContent = paused ? '▶' : '⏸';
      }
    });

    const pause = this.el('btn-pause');
    this.onClick('btn-pause', () => {
      sound.init();
      const paused = actions.togglePause();
      if (pause) pause.textContent = paused ? '▶' : '⏸';
    });

    this.onClick('btn-ambient', () => {
      sound.init();
      if (ambientBtn) ambientBtn.textContent = sound.ambientToggle() ? '🎵 Atmo aus' : '🎵 Atmo';
    });

    const mute = this.el('btn-mute');
    this.onClick('btn-mute', () => {
      sound.init();
      const m = !sound.isMuted();
      sound.setMuted(m);
      if (mute) mute.textContent = m ? '🔇 Ton aus' : '🔊 Ton an';
    });

    // Speed buttons (1x/2x/4x/8x).
    for (const s of SPEEDS) this.onClick(`btn-speed-${s}`, () => actions.setSpeed(s));

    // Economy + placement.
    this.setupBuildMenu();
    this.onClick('btn-demolish', () => { sound.init(); actions.toggleDemolish(); });
    this.onClick('pretzel-close', () => document.getElementById('pretzelwin')?.classList.add('hidden'));
    this.onClick('btn-settings', () => document.getElementById('settingswin')?.classList.toggle('hidden'));
    this.onClick('settings-close', () => document.getElementById('settingswin')?.classList.add('hidden'));
    this.onClick('btn-game', () => document.getElementById('gamewin')?.classList.toggle('hidden'));
    this.onClick('game-close', () => document.getElementById('gamewin')?.classList.add('hidden'));
    this.onClick('btn-cheat-money', () => game.cheatMoney());

    this.onClick('btn-beer', () => { sound.init(); game.orderBeer(); });
    this.onClick('btn-klowagen', () => { sound.init(); game.callKlowagen(); });
    this.onClick('btn-table', () => { sound.init(); actions.beginPlace('table'); });
    this.onClick('btn-stand', () => { sound.init(); actions.beginPlace('stand'); });
    this.onClick('btn-bench', () => { sound.init(); actions.beginPlace('bench'); });
    this.onClick('btn-pretzel-stand', () => { sound.init(); actions.beginPlace('pretzel'); });
    this.onClick('btn-ausschank', () => { sound.init(); actions.beginPlace('ausschank'); });
    this.onClick('btn-wc', () => { sound.init(); actions.beginPlace('wc'); });
    this.onClick('btn-beertank', () => { sound.init(); actions.beginPlace('beertank'); });
    this.onClick('btn-wastetank', () => { sound.init(); actions.beginPlace('wastetank'); });
    this.onClick('btn-bush', () => { sound.init(); actions.beginPlace('bush'); });
    this.onClick('btn-flower', () => { sound.init(); actions.beginPlace('flower'); });
    this.onClick('btn-tree', () => { sound.init(); actions.beginPlace('tree'); });
    this.onClick('btn-dj', () => { sound.init(); actions.beginPlace('dj'); });
    this.onClick('btn-path', () => { sound.init(); actions.beginPlace('path'); });
    const decoAutoBtn = this.el('btn-deco-auto');
    this.onClick('btn-deco-auto', () => {
      sound.init();
      const on = game.toggleDecoAutoReplace();
      if (decoAutoBtn) decoAutoBtn.textContent = `🔄 Auto-Austausch: ${on ? 'an' : 'aus'}`;
    });

    this.onClick('btn-hire-gardener', () => { sound.init(); game.hireGardener(); });
    this.onClick('btn-fire-gardener', () => { sound.init(); game.fireGardener(); });
    this.onClick('btn-hire-dj', () => { sound.init(); game.hireDj(); });
    this.onClick('btn-fire-dj', () => { sound.init(); game.fireDj(); });

    this.onClick('btn-pretzel-order', () => {
      sound.init();
      if (this.selectedStandId !== null) game.orderPretzels(this.selectedStandId);
    });
    this.onClick('btn-pretzel-auto', () => {
      sound.init();
      if (this.selectedStandId !== null) game.togglePretzelAutoDeliver(this.selectedStandId);
    });

    this.onClick('btn-hire-service', () => { sound.init(); game.hireService(); });
    this.onClick('btn-fire-service', () => { sound.init(); game.fireService(); });
    this.onClick('btn-hire-clean', () => { sound.init(); game.hireCleaner(); });
    this.onClick('btn-fire-clean', () => { sound.init(); game.fireCleaner(); });
    this.onClick('btn-dogcatcher', () => { sound.init(); game.callDogCatcher(); });

    this.slider = this.el('price-slider') as HTMLInputElement | null;
    if (this.slider) {
      const apply = (): void => game.setBeerPrice(parseFloat(this.slider!.value));
      this.slider.addEventListener('input', () => { this.draggingSlider = true; apply(); });
      this.slider.addEventListener('change', () => { this.draggingSlider = false; apply(); });
    }
    this.restockSlider = this.el('restock-slider') as HTMLInputElement | null;
    if (this.restockSlider) {
      const apply = (): void => game.setRestockAmount(parseFloat(this.restockSlider!.value));
      this.restockSlider.addEventListener('input', () => { this.draggingRestock = true; apply(); });
      this.restockSlider.addEventListener('change', () => { this.draggingRestock = false; apply(); });
    }
    this.pretzelPriceSlider = this.el('pretzel-price-slider') as HTMLInputElement | null;
    if (this.pretzelPriceSlider) {
      const apply = (): void => game.setPretzelPrice(parseFloat(this.pretzelPriceSlider!.value));
      this.pretzelPriceSlider.addEventListener('input', () => { this.draggingPretzelPrice = true; apply(); });
      this.pretzelPriceSlider.addEventListener('change', () => { this.draggingPretzelPrice = false; apply(); });
    }
    this.pretzelOrderSlider = this.el('pretzel-order-slider') as HTMLInputElement | null;
    if (this.pretzelOrderSlider) {
      const apply = (): void => {
        if (this.selectedStandId !== null) game.setPretzelOrderAmount(this.selectedStandId, parseFloat(this.pretzelOrderSlider!.value));
      };
      this.pretzelOrderSlider.addEventListener('input', () => { this.draggingPretzelOrder = true; apply(); });
      this.pretzelOrderSlider.addEventListener('change', () => { this.draggingPretzelOrder = false; apply(); });
    }
    this.adSlider = this.el('ad-slider') as HTMLInputElement | null;
    if (this.adSlider) {
      const apply = (): void => game.setAdBudget(parseFloat(this.adSlider!.value));
      this.adSlider.addEventListener('input', () => { this.draggingAd = true; apply(); });
      this.adSlider.addEventListener('change', () => { this.draggingAd = false; apply(); });
    }
  }

  /** Point the pretzel overlay at a specific stand (called when one is clicked). */
  selectStand(id: number): void {
    this.selectedStandId = id;
  }

  /** Wire the two-level build menu: category row → item row. */
  private setupBuildMenu(): void {
    const buildbar = document.getElementById('buildbar');
    const buildbar2 = document.getElementById('buildbar2');
    const catButtons = Array.from(document.querySelectorAll<HTMLElement>('.cat-btn'));
    const groups = Array.from(document.querySelectorAll<HTMLElement>('#buildbar2 .cat-group'));
    let openCat: string | null = null;
    const showCat = (cat: string | null): void => {
      openCat = cat;
      for (const g of groups) g.classList.toggle('hidden', g.dataset.cat !== cat);
      for (const b of catButtons) b.classList.toggle('on', b.dataset.cat === cat);
      buildbar2?.classList.toggle('hidden', cat === null);
    };
    this.onClick('btn-build', () => {
      buildbar?.classList.toggle('hidden');
      if (buildbar?.classList.contains('hidden')) showCat(null); // closing build → hide items
    });
    for (const b of catButtons) {
      b.addEventListener('click', () => showCat(openCat === b.dataset.cat ? null : (b.dataset.cat ?? null)));
    }
    this.closeBuildMenu = (): void => {
      buildbar?.classList.add('hidden');
      showCat(null);
    };
  }

  /** Esc dismisses every open pop-over: the dialog windows + the build menu.
   *  The modal start / win-lose overlays are intentionally left alone. */
  private closeOverlays(): void {
    const ids = ['settingswin', 'gamewin', 'pretzelwin', 'logwin', 'guestwin', 'upgradewin'];
    for (const id of ids) document.getElementById(id)?.classList.add('hidden');
    this.closeBuildMenu();
  }

  /** Refresh dynamic labels and disabled states. Called every render frame. */
  update(): void {
    const eco = this.game.eco;

    this.text('price-val', `${eco.beerPrice.toFixed(2)} €`);
    if (this.slider && !this.draggingSlider) {
      const v = String(eco.beerPrice);
      if (this.slider.value !== v) this.slider.value = v;
    }
    this.text('ad-val', `${eco.adBudget} €`);
    if (this.adSlider && !this.draggingAd) {
      const v = String(eco.adBudget);
      if (this.adSlider.value !== v) this.adSlider.value = v;
    }
    this.text('restock-val', `${eco.restockAmount} L`);
    if (this.restockSlider) {
      // Cap the restock amount at the current tank volume (grows with upgrades).
      const max = String(eco.beer.capacity);
      if (this.restockSlider.max !== max) this.restockSlider.max = max;
      if (!this.draggingRestock) {
        const v = String(eco.restockAmount);
        if (this.restockSlider.value !== v) this.restockSlider.value = v;
      }
    }

    const beerPending = this.game.beerOrderPending();
    this.text('btn-beer-label', beerPending
      ? '🍺 Lieferung unterwegs …'
      : `🍺 Bestellen (${eco.plannedRestock()} L · ${eco.restockCost()} €)`);
    this.fill('btn-beer-fill', beerPending ? this.game.beerOrderProgress() : 0);
    this.disabled('btn-beer', beerPending || eco.plannedRestock() <= 0 || !eco.canAfford(eco.restockCost()));

    const kloPending = this.game.kloPending();
    this.text('btn-klowagen-label', kloPending
      ? '🚽 Klowagen unterwegs …'
      : `🚽 Klowagen (${eco.klowagenCost()} €)`);
    this.fill('btn-klowagen-fill', kloPending ? this.game.kloProgress() : 0);
    this.disabled('btn-klowagen', kloPending || eco.toilet.current <= 0 || eco.money < eco.klowagenCost());

    this.label('btn-table', `🪑 Tisch (${eco.tableCost()} €)`);
    this.disabled('btn-table', !this.game.tableBuyable());
    this.label('btn-stand', `🧍 Stehtisch (${eco.standCost()} €)`);
    this.disabled('btn-stand', !this.game.standBuyable());
    this.label('btn-bench', `🪵 Bierbank (${eco.benchCost()} €)`);
    this.disabled('btn-bench', !this.game.benchBuyable());

    this.label('btn-pretzel-stand', `🥨 Brezelstand (${eco.pretzelStandCost()} €)`);
    this.disabled('btn-pretzel-stand', !this.game.pretzelStandBuyable());

    this.label('btn-ausschank', `🍺 Bar (${eco.ausschankCost()} €)`);
    this.disabled('btn-ausschank', !this.game.ausschankBuyable());

    this.label('btn-wc', `🚽 WC-Haus (${eco.wcHouseCost()} €)`);
    this.disabled('btn-wc', !this.game.wcBuyable());

    this.label('btn-beertank', `🛢️ Bier-Tank (${eco.beerTankCost()} €)`);
    this.disabled('btn-beertank', !this.game.beerTankBuyable());
    this.label('btn-wastetank', `🛢️ Klo-Tank (${eco.wasteTankCost()} €)`);
    this.disabled('btn-wastetank', !this.game.wasteTankBuyable());

    this.label('btn-bush', `🌳 Busch (${eco.bushCost()} €)`);
    this.disabled('btn-bush', !this.game.bushBuyable());
    this.label('btn-flower', `🌸 Blumen (${eco.flowerCost()} €)`);
    this.disabled('btn-flower', !this.game.flowerBuyable());
    this.label('btn-tree', `🌳 Baum (${eco.treeCost()} €)`);
    this.disabled('btn-tree', !this.game.treeBuyable());
    this.label('btn-dj', `🎧 DJ (${eco.djCost()} €)`);
    this.disabled('btn-dj', !this.game.djBuyable());
    this.label('btn-path', `🛤️ Weg (${eco.pathCost()} €)`);
    this.disabled('btn-path', !this.game.pathBuyable());

    this.text('pretzel-price-val', `${eco.pretzelPrice.toFixed(2)} €`);
    if (this.pretzelPriceSlider && !this.draggingPretzelPrice) {
      const v = String(eco.pretzelPrice);
      if (this.pretzelPriceSlider.value !== v) this.pretzelPriceSlider.value = v;
    }
    // The pretzel order/auto controls manage the clicked stand (price is shared).
    const stand = this.selectedStandId !== null ? this.game.standInfo(this.selectedStandId) : null;
    this.text('pretzel-stand-stock', stand ? `${stand.stock} 🥨` : '–');
    this.text('pretzel-order-val', String(stand?.orderAmount ?? 0));
    if (this.pretzelOrderSlider && !this.draggingPretzelOrder && stand) {
      const v = String(stand.orderAmount);
      if (this.pretzelOrderSlider.value !== v) this.pretzelOrderSlider.value = v;
    }
    if (!stand) {
      this.label('btn-pretzel-order', '🥨 Brezn bestellen');
      this.disabled('btn-pretzel-order', true);
    } else if (stand.pending) {
      const pct = Math.round(stand.progress * 100);
      this.label('btn-pretzel-order', `🥨 Lieferung unterwegs… ${pct}%`);
      this.disabled('btn-pretzel-order', true);
    } else {
      this.label('btn-pretzel-order', `🥨 Brezn bestellen (${stand.planned} · ${stand.cost} €)`);
      this.disabled('btn-pretzel-order', stand.planned <= 0 || !eco.canAfford(stand.cost));
    }
    this.label('btn-pretzel-auto', `🔁 Auto-Lieferung: ${stand?.auto ? 'an' : 'aus'}`);
    this.disabled('btn-pretzel-auto', !stand);

    this.text('cnt-service', String(eco.service));
    this.text('cost-service', `einmalig ${eco.serviceHireCost()} € · Lohn ${eco.serviceWage()} €`);
    this.disabled('btn-hire-service', !eco.canAfford(eco.serviceHireCost()));
    this.disabled('btn-fire-service', eco.service <= 0);

    this.text('cnt-clean', String(eco.cleaners));
    this.text('cost-clean', `einmalig ${eco.cleanerHireCost()} € · Lohn ${eco.cleanerWage()} €`);
    this.disabled('btn-hire-clean', !eco.canAfford(eco.cleanerHireCost()));
    this.disabled('btn-fire-clean', eco.cleaners <= 0);

    this.text('cnt-gardener', String(eco.gardeners));
    this.text('cost-gardener', `einmalig ${eco.gardenerHireCost()} € · Lohn ${eco.gardenerWage()} €`);
    this.disabled('btn-hire-gardener', !eco.canAfford(eco.gardenerHireCost()));
    this.disabled('btn-fire-gardener', eco.gardeners <= 0);


    this.text('cnt-dj-staff', String(eco.djWorkers));
    this.text('cost-dj-staff', `einmalig ${eco.djHireCost()} € · Lohn ${eco.djWage()} €`);
    this.disabled('btn-hire-dj', !eco.canAfford(eco.djHireCost()));
    this.disabled('btn-fire-dj', eco.djWorkers <= 0);

    this.label('btn-dogcatcher', `🐕 Hundefänger (${eco.dogCatcherCost()} €)`);
    this.disabled('btn-dogcatcher', !this.game.dogCatcherAvailable());

    const speed = this.actions.getSpeed();
    for (const s of SPEEDS) this.active(`btn-speed-${s}`, speed === s);

    this.active('btn-demolish', this.actions.isDemolish());
  }

  // --- diffed DOM helpers ---------------------------------------------------

  private el(id: string): HTMLElement | null {
    let node = this.nodes.get(id);
    if (node === undefined) {
      node = document.getElementById(id);
      this.nodes.set(id, node);
    }
    return node;
  }

  private onClick(id: string, handler: () => void): void {
    this.el(id)?.addEventListener('click', handler);
  }

  private text(id: string, value: string): void {
    if (this.last.get(id) === value) return;
    this.last.set(id, value);
    const el = this.el(id);
    if (el) el.textContent = value;
  }

  private label(id: string, value: string): void {
    this.text(id, value);
  }

  /** Set a button's inner progress fill (0..1) as a width %. */
  private fill(id: string, frac: number): void {
    const pct = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`;
    const key = `${id}:w`;
    if (this.last.get(key) === pct) return;
    this.last.set(key, pct);
    const el = this.el(id);
    if (el) el.style.width = pct;
  }

  private disabled(id: string, value: boolean): void {
    const key = `${id}:disabled`;
    const s = String(value);
    if (this.last.get(key) === s) return;
    this.last.set(key, s);
    const el = this.el(id) as HTMLButtonElement | null;
    if (el) el.disabled = value;
  }

  private active(id: string, on: boolean): void {
    const key = `${id}:active`;
    const s = on ? '1' : '0';
    if (this.last.get(key) === s) return;
    this.last.set(key, s);
    this.el(id)?.classList.toggle('on', on);
  }
}
