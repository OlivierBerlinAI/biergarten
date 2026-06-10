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

/**
 * Strip the guest's name, "#id" tag, mood "70→100" range and "(8.00 €)" amount
 * out of a message, leaving a clean activity phrase (e.g. "Hund gestreichelt",
 * "kauft ein Bier"). Used for a single guest's own timeline.
 */
export function guestEventText(msg: string, name: string): string {
  let s = msg.replace(/^#\d+\s*/, ''); // leading "#42 " guest tag
  if (name && s.startsWith(name)) s = s.slice(name.length).replace(/^\s+/, '');
  s = s.replace(/\s*:\s*\d+\s*→\s*\d+\s*$/u, ''); // trailing mood "…: 70→100"
  s = s.replace(/\s*\([^)]*\d[^)]*\)\s*$/u, ''); // trailing amount "(8.00 €)"
  return s.trim();
}

/**
 * Build one `.log-row` element (time · tag · message · delta).
 * Pass `guestName` to render a single guest's own row: the message is cleaned of
 * names/numbers and the numeric delta is dropped (a tidy activity diary).
 */
export function buildLogRow(e: LogEntry, guestName?: string): HTMLElement {
  const clean = guestName !== undefined;

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
  msg.textContent = clean ? guestEventText(e.msg, guestName) : e.msg;

  row.append(time, tag, msg);

  if (!clean && e.delta !== undefined && e.delta !== 0) {
    const d = document.createElement('span');
    d.className = `log-delta ${e.delta > 0 ? 'up' : 'down'}`;
    d.textContent = fmtDelta(e.cat, e.delta);
    row.append(d);
  }
  return row;
}
