// The on-screen debug log window. Drains the backend's queued log entries each
// frame and appends them as rows, with per-category filter checkboxes, a clear
// button and a show/hide toggle. Entries that name a guest are clickable and
// (via the callback) open that guest in the guests window. Read-only.

import { type LogCat, type LogEntry } from '../sim/log.js';
import { buildLogRow } from './logrow.js';

export class LogView {
  private readonly list = document.getElementById('log-list');
  private readonly win = document.getElementById('logwin');
  private readonly enabled = new Set<LogCat>();
  private readonly rows: { cat: LogCat; el: HTMLElement }[] = [];
  private readonly cap = 300; // keep the DOM light; oldest rows fall off

  private get checkboxes(): HTMLInputElement[] {
    return Array.from(document.querySelectorAll<HTMLInputElement>('#log-filters input[type=checkbox]'));
  }

  /** Mirror `enabled` to whatever the checkboxes currently show, then re-filter. */
  private syncFromCheckboxes(): void {
    this.enabled.clear();
    for (const cb of this.checkboxes) if (cb.checked) this.enabled.add(cb.dataset.cat as LogCat);
    this.applyFilter();
  }

  /** @param onGuestClick called with a guest id when a guest row is clicked. */
  constructor(private readonly onGuestClick: (id: number) => void) {
    for (const cb of this.checkboxes) {
      const cat = cb.dataset.cat as LogCat;
      cb.addEventListener('change', () => {
        if (cb.checked) this.enabled.add(cat);
        else this.enabled.delete(cat);
        this.applyFilter();
      });
    }
    // Seed the filter from the checkboxes' *actual* rendered state, not a fixed
    // list: browsers restore the previous checked state on reload (and on bfcache
    // back/forward), so a hardcoded set would disagree with what the boxes show
    // until you clicked each one. `pageshow` also catches a late restore.
    this.syncFromCheckboxes();
    window.addEventListener('pageshow', () => this.syncFromCheckboxes());

    document.getElementById('log-clear')?.addEventListener('click', () => this.clear());
    document.getElementById('log-close')?.addEventListener('click', () => this.win?.classList.add('hidden'));
    document.getElementById('btn-logs')?.addEventListener('click', () => this.win?.classList.toggle('hidden'));
  }

  /** Append the freshly drained backend entries. */
  append(entries: LogEntry[]): void {
    if (!this.list || entries.length === 0) return;
    // Only auto-scroll if the user is already near the bottom (don't yank them
    // away while they're scrolled back reading history).
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 28;

    for (const e of entries) {
      // Guest lines (those tagged with a guest id) show the name and no numbers;
      // business lines keep their full message and numeric delta.
      const row = buildLogRow(e, { guestLine: e.who !== undefined });
      if (!this.enabled.has(e.cat)) row.style.display = 'none';
      if (e.who !== undefined) {
        const who = e.who;
        row.classList.add('clickable');
        row.title = `Verlauf von Gast #${who} anzeigen`;
        row.addEventListener('click', () => this.onGuestClick(who));
      }
      this.list.appendChild(row);
      this.rows.push({ cat: e.cat, el: row });
    }

    while (this.rows.length > this.cap) this.rows.shift()?.el.remove();
    if (atBottom) this.list.scrollTop = this.list.scrollHeight;
  }

  private applyFilter(): void {
    for (const r of this.rows) r.el.style.display = this.enabled.has(r.cat) ? '' : 'none';
  }

  private clear(): void {
    for (const r of this.rows) r.el.remove();
    this.rows.length = 0;
  }
}
