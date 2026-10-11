/** Injectable clock so tests (and the explanation of "time-based" behavior) are deterministic. */
let override: (() => Date) | null = null;

export function now(): Date {
  return override ? override() : new Date();
}

export function setClockForTests(fn: (() => Date) | null): void {
  override = fn;
}
