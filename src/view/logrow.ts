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

/** Build one `.log-row` element (time · tag · message · delta). */
export function buildLogRow(e: LogEntry): HTMLElement {
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
  msg.textContent = e.msg;

  row.append(time, tag, msg);

  if (e.delta !== undefined && e.delta !== 0) {
    const d = document.createElement('span');
    d.className = `log-delta ${e.delta > 0 ? 'up' : 'down'}`;
    d.textContent = fmtDelta(e.cat, e.delta);
    row.append(d);
  }
  return row;
}
