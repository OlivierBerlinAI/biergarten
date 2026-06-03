// In-game clock. 20 real seconds = 1 in-game hour; the day runs from openHour
// to closeHour and then loops. From lastCallHour on, no beer is sold and no new
// guests arrive.

import { CLOCK } from '../config.js';

export class Clock {
  private frames = 0;
  private readonly framesPerHour = CLOCK.secondsPerHour * 60;
  private readonly dayFrames = (CLOCK.closeHour - CLOCK.openHour) * CLOCK.secondsPerHour * 60;

  tick(): void {
    this.frames += 1;
    if (this.frames >= this.dayFrames) this.frames = 0; // new day
  }

  get hour(): number {
    return CLOCK.openHour + Math.floor(this.frames / this.framesPerHour);
  }

  get minute(): number {
    return Math.floor(((this.frames % this.framesPerHour) / this.framesPerHour) * 60);
  }

  /** Beer is served and new guests arrive only before last call. */
  isOpenForBusiness(): boolean {
    return this.hour < CLOCK.lastCallHour;
  }

  /** "HH:MM" for the on-screen clock. */
  label(): string {
    const h = String(this.hour).padStart(2, '0');
    const m = String(this.minute).padStart(2, '0');
    return `${h}:${m}`;
  }
}
