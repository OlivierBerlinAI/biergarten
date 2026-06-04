// The guests window: a list of guests on the left, and on the right the full
// timeline of what the selected guest did and how it moved their mood. Selecting
// a guest who is still in the garden asks the renderer to ring them so they're
// easy to spot. Read-only view fed by the backend's drained log entries.

import { type LogEntry } from '../sim/log.js';
import { buildLogRow } from './logrow.js';
import type { Renderer } from './renderer.js';
import type { Person } from '../sim/entities/person.js';

const GUEST_CAP = 80; // remember this many guests (oldest evicted)
const ENTRIES_PER_GUEST = 400; // and at most this many events each

interface Item {
  el: HTMLElement;
  dot: HTMLElement;
  nameEl: HTMLElement;
  sub: HTMLElement;
  present: boolean;
}

export class GuestsPanel {
  private readonly win = document.getElementById('guestwin');
  private readonly listEl = document.getElementById('guest-list');
  private readonly logEl = document.getElementById('guest-log-list');
  private readonly emptyEl = document.getElementById('guest-log-empty');
  private readonly countEl = document.getElementById('guest-count');
  private readonly statsEl = document.getElementById('guest-stats');
  private stats: {
    name: HTMLElement;
    status: HTMLElement;
    wallet: HTMLElement;
    spent: HTMLElement;
    sat: Gauge;
    thirst: Gauge;
    hunger: Gauge;
    bladder: Gauge;
  } | null = null;

  // Insertion-ordered: first key is the oldest guest, evicted first.
  private readonly history = new Map<number, LogEntry[]>();
  private readonly items = new Map<number, Item>();
  private readonly names = new Map<number, string>(); // resolved guest names, once seen live
  private readonly lastStats = new Map<number, { wallet: number; spent: number }>(); // last seen, kept after they leave
  private selected: number | null = null;

  constructor(private readonly renderer: Renderer) {
    document.getElementById('btn-guests')?.addEventListener('click', () => this.win?.classList.toggle('hidden'));
    document.getElementById('guest-clear')?.addEventListener('click', () => this.clear());
    document.getElementById('guest-close')?.addEventListener('click', () => this.win?.classList.add('hidden'));
  }

  /** Fold the freshly drained entries into per-guest histories + the list. */
  ingest(entries: LogEntry[]): void {
    for (const e of entries) {
      if (e.who === undefined) continue;
      const id = e.who;
      let hist = this.history.get(id);
      if (!hist) {
        this.evictIfFull();
        hist = [];
        this.history.set(id, hist);
        this.addItem(id);
      }
      hist.push(e);
      if (hist.length > ENTRIES_PER_GUEST) hist.shift();

      // Keep the list subtitle showing the guest's most recent event.
      const item = this.items.get(id);
      if (item) item.sub.textContent = GuestsPanel.strip(e.msg);
      if (this.selected === id) {
        this.logEl?.appendChild(buildLogRow(e));
        if (this.logEl) this.logEl.scrollTop = this.logEl.scrollHeight;
      }
    }
    if (this.countEl) this.countEl.textContent = `${this.history.size}`;
  }

  /** Per-frame: refresh presence dots and the selected guest's live stats. */
  update(people: Person[]): void {
    const byId = new Map<number, Person>();
    for (const p of people) {
      byId.set(p.id, p);
      this.lastStats.set(p.id, { wallet: p.wallet, spent: p.spent }); // remember for after they leave
      if (!this.names.has(p.id)) {
        this.names.set(p.id, p.name);
        const item = this.items.get(p.id);
        if (item) item.nameEl.textContent = p.name;
      }
    }

    for (const [id, item] of this.items) {
      const present = byId.has(id);
      if (present !== item.present) {
        item.present = present;
        item.dot.classList.toggle('present', present);
        item.dot.title = present ? 'im Garten' : 'gegangen';
      }
    }

    this.renderStats(this.selected === null ? null : byId.get(this.selected) ?? null);
  }

  // --- live stats -----------------------------------------------------------

  private renderStats(p: Person | null): void {
    if (!this.statsEl) return;
    if (this.selected === null) {
      this.statsEl.classList.add('hidden');
      return;
    }
    this.statsEl.classList.remove('hidden');
    const label = this.names.get(this.selected) ?? `Gast #${this.selected}`;
    if (!p) {
      // Selected guest has left — show their final spend/wallet; history below.
      this.stats = null;
      const children: HTMLElement[] = [
        Object.assign(document.createElement('div'), { className: 'gstat-name', textContent: label }),
        Object.assign(document.createElement('div'), {
          className: 'gstat-gone',
          textContent: 'Gast hat den Garten verlassen — Verlauf siehe unten.',
        }),
      ];
      const last = this.lastStats.get(this.selected);
      if (last) {
        children.push(
          Object.assign(document.createElement('div'), {
            className: 'gstat-top',
            textContent: `ausgegeben: ${last.spent.toFixed(2)} € · Geldbeutel: ${last.wallet.toFixed(2)} €`,
          }),
        );
      }
      this.statsEl.replaceChildren(...children);
      return;
    }
    const s = this.ensureStats();
    s.name.textContent = `${label} · #${this.selected}`;
    s.status.textContent = p.statusLabel;
    s.wallet.textContent = `${p.wallet.toFixed(2)} €`;
    s.spent.textContent = `${p.spent.toFixed(2)} €`;
    setGauge(s.sat, p.satisfaction);
    setGauge(s.thirst, p.thirst);
    setGauge(s.hunger, p.hunger);
    setGauge(s.bladder, p.bladder);
  }

  /** Build the fixed stats scaffold once, return cached element refs. */
  private ensureStats(): NonNullable<GuestsPanel['stats']> {
    if (this.stats) return this.stats;
    const name = document.createElement('div');
    name.className = 'gstat-name';

    const top = document.createElement('div');
    top.className = 'gstat-top';
    const status = labelled(top, 'Status');
    const wallet = labelled(top, 'Geldbeutel');
    const spent = labelled(top, 'ausgegeben');

    const sat = gauge('Zufriedenheit', 'sat');
    const thirst = gauge('Durst', 'thirst');
    const hunger = gauge('Hunger', 'hunger');
    const bladder = gauge('Blase', 'bladder');

    this.statsEl!.replaceChildren(
      name, top,
      sat.row, sat.bar,
      thirst.row, thirst.bar,
      hunger.row, hunger.bar,
      bladder.row, bladder.bar,
    );
    this.stats = { name, status, wallet, spent, sat, thirst, hunger, bladder };
    return this.stats;
  }

  /** Open the window and select a guest (used by clicks in the log window). */
  openFor(id: number): void {
    this.win?.classList.remove('hidden');
    this.select(id); // select even guests on their way out (or with no log yet)
  }

  // --- list -----------------------------------------------------------------

  private addItem(id: number): void {
    if (!this.listEl) return;
    const el = document.createElement('div');
    el.className = 'guest-item';

    const dot = document.createElement('span');
    dot.className = 'guest-dot present';

    const text = document.createElement('div');
    text.className = 'guest-text';
    const nameEl = document.createElement('div');
    nameEl.className = 'guest-name';
    nameEl.textContent = this.names.get(id) ?? `Gast #${id}`;
    const sub = document.createElement('div');
    sub.className = 'guest-sub small';
    text.append(nameEl, sub);

    el.append(dot, text);
    el.addEventListener('click', () => this.select(id));
    this.listEl.prepend(el); // newest on top

    this.items.set(id, { el, dot, nameEl, sub, present: true });
  }

  private select(id: number): void {
    this.selected = id;
    for (const [otherId, item] of this.items) item.el.classList.toggle('sel', otherId === id);

    const hist = this.history.get(id) ?? [];
    this.logEl?.replaceChildren(...hist.map((e) => buildLogRow(e)));
    if (this.emptyEl) this.emptyEl.style.display = 'none';
    if (this.logEl) this.logEl.scrollTop = this.logEl.scrollHeight;

    this.renderer.setSelected(id); // ring them in the world (if still present)
  }

  private evictIfFull(): void {
    if (this.history.size < GUEST_CAP) return;
    const oldest = this.history.keys().next().value;
    if (oldest === undefined) return;
    this.history.delete(oldest);
    this.items.get(oldest)?.el.remove();
    this.items.delete(oldest);
    if (this.selected === oldest) this.deselect();
  }

  private clear(): void {
    this.history.clear();
    for (const item of this.items.values()) item.el.remove();
    this.items.clear();
    this.deselect();
    if (this.countEl) this.countEl.textContent = '0';
  }

  private deselect(): void {
    this.selected = null;
    this.logEl?.replaceChildren();
    if (this.emptyEl) this.emptyEl.style.display = '';
    this.statsEl?.classList.add('hidden');
    this.renderer.setSelected(null);
  }

  /** Drop a leading "#42 " guest tag from a message for the compact subtitle. */
  private static strip(msg: string): string {
    return msg.replace(/^#\d+\s*/, '');
  }
}

// --- small DOM helpers for the stats area ----------------------------------

interface Gauge {
  row: HTMLElement;
  bar: HTMLElement;
  fill: HTMLElement;
  txt: HTMLElement;
}

/** A labelled bar (reuses the HUD's .gauge/.fill/.lbl styles). */
function gauge(label: string, kind: string): Gauge {
  const row = document.createElement('div');
  row.className = 'gstat-row';
  row.textContent = label;
  const bar = document.createElement('div');
  bar.className = 'gauge';
  const fill = document.createElement('span');
  fill.className = `fill ${kind}`;
  const txt = document.createElement('span');
  txt.className = 'lbl';
  bar.append(fill, txt);
  return { row, bar, fill, txt };
}

function setGauge(g: Gauge, value: number): void {
  const v = Math.max(0, Math.min(100, value));
  g.fill.style.width = `${v}%`;
  g.txt.textContent = `${Math.round(v)}`;
}

/** Append "label: <b></b>" to a parent and return the bold value node. */
function labelled(parent: HTMLElement, label: string): HTMLElement {
  const wrap = document.createElement('span');
  const b = document.createElement('b');
  wrap.append(`${label}: `, b);
  parent.appendChild(wrap);
  return b;
}
