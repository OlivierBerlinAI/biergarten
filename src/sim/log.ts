// A tiny event log for debugging. The simulation pushes structured entries
// (why the reputation moved, money spent, staff changes …); the view drains
// them each frame into a filterable on-screen window. Pure logic, no DOM —
// headless runs (CLI/tests) simply never drain it (memory stays bounded).

export type LogCat = 'mood' | 'reputation' | 'money' | 'staff' | 'activity';

/** Order + display labels for the categories (used by the filter UI). */
export const LOG_CATS: readonly LogCat[] = ['mood', 'reputation', 'money', 'staff', 'activity'];

export interface LogEntry {
  /** Monotonic id, so the view can dedupe/track rows. */
  seq: number;
  /** In-game clock label at the moment it happened, e.g. "18:42". */
  time: string;
  cat: LogCat;
  msg: string;
  /** Signed magnitude of the change (Ruf points, euros …) for colour + amount. */
  delta?: number;
  /** Guest id this entry is about, if any — lets the view show a per-guest history. */
  who?: number;
}

export class EventLog {
  private buf: LogEntry[] = [];
  private seq = 0;

  push(cat: LogCat, msg: string, time: string, delta?: number, who?: number): void {
    this.buf.push({ seq: this.seq++, time, cat, msg, delta, who });
    // Cap the buffer so a never-draining headless run can't grow unbounded.
    if (this.buf.length > 1000) this.buf.splice(0, this.buf.length - 1000);
  }

  /** Hand the queued entries to the view and clear the buffer. */
  drain(): LogEntry[] {
    const out = this.buf;
    this.buf = [];
    return out;
  }
}
