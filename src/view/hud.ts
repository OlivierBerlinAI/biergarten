// The read-only stats overlay: counts, money, tank levels, clock and meters.
// Every value is diffed against the last written, so a steady frame does no
// DOM writes (no layout/reflow). Reads only backend state — never mutates it.

import type { GameState, Outcome } from '../sim/economy.js';
import type { Aggregates } from '../sim/game.js';

export class Hud {
  private readonly nodes = new Map<string, HTMLElement | null>();
  private readonly last = new Map<string, string>();
  private popSlot = 0;

  render(eco: GameState, agg: Aggregates): void {
    this.text('stat-people', agg.people);
    this.text('stat-dogs', agg.dogs);
    this.text('stat-money', `${eco.money.toFixed(2)} €`);
    this.text('stat-beers', eco.beersSold);
    this.text('stat-permoney', `${agg.moneyPerVisitor.toFixed(2)} €`);
    this.text('stat-litter', agg.litter);
    this.text('stat-pretzels', `${agg.pretzelStock}${agg.pretzelAuto ? ' 🔁' : ''}`);

    this.bar('beer', eco.beer.current, eco.beer.capacity, `${Math.round(eco.beer.current)}/${eco.beer.capacity}`);
    this.bar('toilet', eco.toilet.current, eco.toilet.capacity, `${Math.round(eco.toilet.current)}/${eco.toilet.capacity}`);
    this.meter('dirt', agg.toiletDirt);

    this.meter('sat', agg.avgSatisfaction);
    this.meter('thirst', agg.avgThirst);
    this.meter('hunger', agg.avgHunger);
    this.meter('bladder', agg.avgBladder);
    this.meter('rep', eco.reputation);

    this.text('clock-time', agg.time);
    this.text('clock-note', agg.salesOpen ? 'geöffnet' : 'Sperrstunde – kein Ausschank');
  }

  /** Float a money delta above the clock: green for income, red for an expense. */
  popMoney(amount: number, reason?: string): void {
    if (amount === 0) return;
    const host = this.el('clock');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'money-pop';
    const positive = amount > 0;
    const why = reason ? ` (${reason})` : '';
    el.textContent = `${positive ? '+' : '−'}${Math.abs(amount).toFixed(0)} €${why}`;
    el.style.color = positive ? '#6fe08c' : '#ff7a7a';
    // Stagger rightward only (never off the left edge) so pops don't overlap.
    this.popSlot = (this.popSlot + 1) % 4;
    el.style.setProperty('--pop-dx', `${this.popSlot * 12}px`);
    host.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  /** Show the win/lose overlay and freeze it on screen. */
  showOutcome(outcome: Outcome): void {
    const title = this.el('overlay-title');
    const sub = this.el('overlay-sub');
    if (title) title.textContent = outcome === 'win' ? '🏆 Gewonnen!' : '💸 Pleite!';
    if (sub) {
      sub.textContent =
        outcome === 'win'
          ? 'Du hast 10.000 € erwirtschaftet. Prost! 🍺 Weiterspielen oder eine neue Runde?'
          : 'Du stehst mit über 100 € Schulden da. Game over.';
    }
    // "Weiterspielen" only makes sense after a win, not a bankruptcy.
    const keep = this.el('btn-keep-playing');
    if (keep) keep.style.display = outcome === 'win' ? '' : 'none';
    const overlay = this.el('overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  /** Dismiss the win/lose overlay (used when the player keeps playing). */
  hideOutcome(): void {
    const overlay = this.el('overlay');
    if (overlay) overlay.style.display = 'none';
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
