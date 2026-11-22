/** One scan polls until the server deadline, then stops. Delays back off so a stuck job cannot spin. */
export const MAX_STATUS_POLLS = 70;
export const POLL_DEADLINE_MS = 300_000;

export function statusPollDelayMs(attempt: number): number {
  if (attempt < 4) return 1500;
  if (attempt < 10) return 2500;
  if (attempt < 20) return 4000;
  return 5000;
}

export function statusPollContinues(attempt: number, elapsedMs: number): boolean {
  return attempt < MAX_STATUS_POLLS && elapsedMs < POLL_DEADLINE_MS;
}
