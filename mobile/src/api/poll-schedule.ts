/**
 * One scan polls until the server deadline, then stops.
 * Polls stay quick for the first minute (most scans finish inside it), so the
 * result and the progress bar show up within about 1.5 s; then they back off.
 */
export const MAX_STATUS_POLLS = 110;
export const POLL_DEADLINE_MS = 300_000;

export function statusPollDelayMs(attempt: number): number {
  if (attempt < 40) return 1500;
  if (attempt < 64) return 2500;
  return 4000;
}

export function statusPollContinues(attempt: number, elapsedMs: number): boolean {
  return attempt < MAX_STATUS_POLLS && elapsedMs < POLL_DEADLINE_MS;
}
