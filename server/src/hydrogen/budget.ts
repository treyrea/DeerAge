/**
 * Whole-scan deadline. The function limit stays 300s. A call that cannot finish
 * before this deadline is skipped so the router can use its fallbacks.
 */

import { SCAN_DEADLINE_MS } from "./aging.js";

export { SCAN_DEADLINE_MS };

export class ScanDeadlineError extends Error {
  constructor() {
    super("Scan deadline reached before the next model call.");
    this.name = "ScanDeadlineError";
  }
}

export class ScanBudget {
  constructor(
    readonly deadlineAt: number,
    readonly timeoutMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  remaining(): number {
    return this.deadlineAt - this.now();
  }

  /** True when a full attempt can finish before the deadline. */
  canStart(): boolean {
    return this.remaining() >= this.timeoutMs;
  }
}

export function createScanBudget(timeoutMs: number, totalMs = SCAN_DEADLINE_MS, now: () => number = Date.now): ScanBudget {
  return new ScanBudget(now() + totalMs, timeoutMs, now);
}
