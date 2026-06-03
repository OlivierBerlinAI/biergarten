// Pure 2D vector + small RNG/util helpers used across the backend.
// No Paper.js, no DOM — this is part of the headless simulation core.

export interface Vec {
  x: number;
  y: number;
}

export function v(x: number, y: number): Vec {
  return { x, y };
}

export function clone(a: Vec): Vec {
  return { x: a.x, y: a.y };
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Move `pos` toward `target` by at most `speed`. Returns the new pos + arrival. */
export function stepToward(pos: Vec, target: Vec, speed: number): { pos: Vec; arrived: boolean } {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed || d === 0) return { pos: { x: target.x, y: target.y }, arrived: true };
  return { pos: { x: pos.x + (dx / d) * speed, y: pos.y + (dy / d) * speed }, arrived: false };
}

export function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
