// The read-only stats overlay: counts, money, tank levels, clock and meters.
// Every value is diffed against the last written, so a steady frame does no
// DOM writes (no layout/reflow). Reads only backend state — never mutates it.

import type { GameState, Outcome } from '../sim/economy.js';
import type { Aggregates } from '../sim/game.js';

export class Hud {
  private readonly nodes = new Map<string, HTMLElement | null>();
  private readonly last = new Map<string, string>();
  private seenWagePayments = 0;

  render(eco: GameState, agg: Aggregates): void {
    this.text('stat-people', agg.people);
    this.text('stat-dogs', agg.dogs);
    this.text('stat-money', `${eco.money.toFixed(2)} €`);
    this.text('stat-beers', eco.beersSold);
    this.text('stat-permoney', `${agg.moneyPerVisitor.toFixed(2)} €`);
    this.text('stat-bartenders', eco.bartenders);
    this.text('stat-cleaners', eco.cleaners);
    this.text('stat-litter', agg.litter);

    this.bar('beer', eco.beer.current, eco.beer.capacity, `${Math.round(eco.beer.current)}/${eco.beer.capacity}`);
    this.bar('toilet', eco.toilet.current, eco.toilet.capacity, `${Math.round(eco.toilet.current)}/${eco.toilet.capacity}`);
    this.meter('dirt', eco.toiletDirt);

    this.meter('sat', agg.avgSatisfaction);
    this.meter('thirst', agg.avgThirst);
    this.meter('bladder', agg.avgBladder);
    this.meter('rep', eco.reputation);

    this.text('clock-time', agg.time);
    this.text('clock-note', agg.salesOpen ? 'geöffnet' : 'Sperrstunde – kein Ausschank');

    // Pop a "−X €" above the clock each time the hourly wage is paid.
    if (eco.wagePayments !== this.seenWagePayments) {
      this.seenWagePayments = eco.wagePayments;
      this.popWage(eco.lastWage);
    }
  }

  private popWage(amount: number): void {
    const el = this.el('wage-pop');
    if (!el) return;
    el.textContent = `−${amount.toFixed(0)} €`;
    el.classList.remove('show');
    void el.offsetWidth; // reflow so the animation restarts
    el.classList.add('show');
  }

  /** Show the win/lose overlay and freeze it on screen. */
  showOutcome(outcome: Outcome): void {
    const title = this.el('overlay-title');
    const sub = this.el('overlay-sub');
    if (title) title.textContent = outcome === 'win' ? '🏆 Gewonnen!' : '💸 Pleite!';
    if (sub) {
      sub.textContent =
        outcome === 'win'
          ? 'Du hast 1.000.000 € erwirtschaftet. Prost! 🍺'
          : 'Du stehst mit über 100 € Schulden da. Game over.';
    }
    const overlay = this.el('overlay');
    if (overlay) overlay.style.display = 'flex';
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

  private write(id: string, value: string, apply: (el: HTMLElement) => void): void {
    if (this.last.get(id) === value) return;
    this.last.set(id, value);
    const el = this.el(id);
    if (el) apply(el);
  }

  private text(id: string, value: string | number): void {
    const s = String(value);
    this.write(id, s, (el) => (el.textContent = s));
  }

  private bar(name: string, value: number, max: number, label: string): void {
    const pct = `${max > 0 ? (value / max) * 100 : 0}%`;
    this.write(`bar-${name}-fill`, pct, (el) => (el.style.width = pct));
    this.text(`bar-${name}-txt`, label);
  }

  private meter(name: string, value: number): void {
    const clamped = Math.max(0, Math.min(100, value));
    const pct = `${Math.round(clamped)}%`;
    this.write(`meter-${name}-fill`, pct, (el) => (el.style.width = pct));
    this.text(`meter-${name}-txt`, Math.round(clamped));
  }
}
