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
}

const SPEEDS = [1, 2, 4, 8];

export class Controls {
  private readonly nodes = new Map<string, HTMLElement | null>();
  private readonly last = new Map<string, string>();
  private readonly slider: HTMLInputElement | null;
  private readonly restockSlider: HTMLInputElement | null;
  private draggingSlider = false;
  private draggingRestock = false;

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
      if (e.key === 'Escape') actions.cancelPlace();
    });

    const pause = this.el('btn-pause');
    this.onClick('btn-pause', () => {
      sound.init();
      const paused = actions.togglePause();
      if (pause) pause.textContent = paused ? '▶ Weiter' : '⏸ Pause';
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
    this.onClick('btn-beer', () => { sound.init(); game.orderBeer(); });
    this.onClick('btn-klowagen', () => { sound.init(); game.callKlowagen(); });
    this.onClick('btn-klo-upgrade', () => { sound.init(); game.upgradeToilet(); });
    this.onClick('btn-table', () => { sound.init(); actions.beginPlace('table'); });
    this.onClick('btn-stand', () => { sound.init(); actions.beginPlace('stand'); });
    this.onClick('btn-bench', () => { sound.init(); actions.beginPlace('bench'); });

    this.onClick('btn-hire-bar', () => { sound.init(); game.hireBartender(); });
    this.onClick('btn-fire-bar', () => { sound.init(); game.fireBartender(); });
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
  }

  /** Refresh dynamic labels and disabled states. Called every render frame. */
  update(): void {
    const eco = this.game.eco;

    this.text('price-val', `${eco.beerPrice.toFixed(2)} €`);
    if (this.slider && !this.draggingSlider) {
      const v = String(eco.beerPrice);
      if (this.slider.value !== v) this.slider.value = v;
    }
    this.text('restock-val', `${eco.restockAmount} L`);
    if (this.restockSlider && !this.draggingRestock) {
      const v = String(eco.restockAmount);
      if (this.restockSlider.value !== v) this.restockSlider.value = v;
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

    const upCost = eco.toiletUpgradeCost();
    this.label('btn-klo-upgrade', upCost === null
      ? '🚽 Klo-Tank (max)'
      : `🚽 Klo-Tank ausbauen (${upCost} €)`);
    this.disabled('btn-klo-upgrade', !eco.canUpgradeToilet());

    this.label('btn-table', `🪑 Tisch (${eco.tableCost()} €)`);
    this.disabled('btn-table', !this.game.tableBuyable());
    this.label('btn-stand', `🧍 Stehtisch (${eco.standCost()} €)`);
    this.disabled('btn-stand', !this.game.standBuyable());
    this.label('btn-bench', `🪵 Bierbank (${eco.benchCost()} €)`);
    this.disabled('btn-bench', !this.game.benchBuyable());

    this.text('cnt-bar', String(eco.bartenders));
    this.text('cost-bar', `einmalig ${eco.bartenderHireCost()} € · Lohn ${eco.bartenderWage()} €`);
    this.disabled('btn-hire-bar', !eco.canAfford(eco.bartenderHireCost()));
    this.disabled('btn-fire-bar', eco.bartenders <= 0);

    this.text('cnt-clean', String(eco.cleaners));
    this.text('cost-clean', `einmalig ${eco.cleanerHireCost()} € · Lohn ${eco.cleanerWage()} €`);
    this.disabled('btn-hire-clean', !eco.canAfford(eco.cleanerHireCost()));
    this.disabled('btn-fire-clean', eco.cleaners <= 0);

    this.label('btn-dogcatcher', `🐕 Hundefänger (${eco.dogCatcherCost()} €)`);
    this.disabled('btn-dogcatcher', !this.game.dogCatcherAvailable());

    const speed = this.actions.getSpeed();
    for (const s of SPEEDS) this.active(`btn-speed-${s}`, speed === s);
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
