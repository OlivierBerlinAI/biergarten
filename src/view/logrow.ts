// Shared rendering of a single log row, used by both the log window and the
// guests window so they stay visually identical.

import { type LogCat, type LogEntry } from '../sim/log.js';

export const CAT_LABEL: Record<LogCat, string> = {
  mood: 'STIM',
  reputation: 'RUF',
  money: 'GELD',
  staff: 'PERS',
};

/** Mood/reputation deltas are point-precise; money/staff are whole euros. */
export function fmtDelta(cat: LogCat, v: number): string {
  const sign = v > 0 ? '+' : '−';
  const points = cat === 'reputation' || cat === 'mood';
  const mag = points ? Math.abs(v).toFixed(cat === 'mood' ? 1 : 2) : `${Math.round(Math.abs(v))} €`;
  return `${sign}${mag}`;
}

/** Strip the trailing mood "70→100" range and "(8.00 €)" amount off a message. */
function stripNumbers(s: string): string {
  s = s.replace(/\s*:\s*\d+\s*→\s*\d+\s*$/u, ''); // trailing mood "…: 70→100"
  s = s.replace(/\s*\([^)]*\d[^)]*\)\s*$/u, ''); // trailing amount "(8.00 €)"
  return s.trim();
}

/**
 * A guest line for the shared log window: keep the leading guest name, but drop
 * any "#id" tag and numbers — e.g. "Anna Müller kauft ein Bier".
 */
export function guestLogText(msg: string): string {
  return stripNumbers(msg.replace(/^#\d+\s*/, ''));
}

/**
 * A single guest's own timeline: also drop their (redundant) leading name, so it
 * reads as a bare activity diary — e.g. "kauft ein Bier", "Hund gestreichelt".
 */
export function guestEventText(msg: string, name: string): string {
  let s = msg.replace(/^#\d+\s*/, '');
  if (name && s.startsWith(name)) s = s.slice(name.length).replace(/^\s+/, '');
  return stripNumbers(s);
}

interface RowOpts {
  /** A single guest's own timeline: strip their leading name + all numbers, no delta. */
  ownName?: string;
  /** A guest line in the shared log: keep the name, strip numbers, no delta. */
  guestLine?: boolean;
}

/**
 * Build one `.log-row` element (time · tag · message · delta).
 * Guest rows (ownName / guestLine) are cleaned of numbers and show no delta —
 * except mood rows, which keep their satisfaction delta. Business rows keep
 * their full message and numeric delta.
 */
export function buildLogRow(e: LogEntry, opts: RowOpts = {}): HTMLElement {
  const clean = opts.ownName !== undefined || opts.guestLine === true;
  const showDelta = !clean || e.cat === 'mood'; // mood deltas show even on guest lines

  const row = document.createElement('div');
  row.className = `log-row cat-${e.cat}`;

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = e.time;

  const tag = document.createElement('span');
  tag.className = 'log-tag';
  tag.textContent = CAT_LABEL[e.cat];

  const msg = document.createElement('span');
  msg.className = 'log-msg';
  msg.textContent =
    opts.ownName !== undefined ? guestEventText(e.msg, opts.ownName)
    : opts.guestLine ? guestLogText(e.msg)
    : e.msg;

  row.append(time, tag, msg);

  if (showDelta && e.delta !== undefined && e.delta !== 0) {
    const d = document.createElement('span');
    d.className = `log-delta ${e.delta > 0 ? 'up' : 'down'}`;
    d.textContent = fmtDelta(e.cat, e.delta);
    row.append(d);
  }
  return row;
}
