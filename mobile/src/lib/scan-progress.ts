/**
 * The waiting screen's progress bar.
 *
 * The server reports which step is running and its expected time left (from
 * measured call times). The bar is elapsed / (elapsed + time left), so it moves
 * with real work, never goes backwards, and slows near the end instead of
 * claiming to be finished before the result is in.
 */

export type ScanMode = "quick" | "age" | "score";
export type ScanStage = "upload" | "photo" | "body" | "crosscheck" | "finishing";

export interface ServerProgress {
  stage: ScanStage;
  etaMs: number;
}

/** Used before the server has reported (sending the photo, or an older server). Medians of logged scans. */
export const FALLBACK_ETA_MS: Record<ScanMode, number> = {
  quick: 6_000,
  age: 32_000,
  score: 18_000,
};

/** The bar stops here until the result arrives. */
export const MAX_WAITING_FRACTION = 0.96;
/** The bar always assumes at least this much is left, so it slows near the end and keeps creeping on an overrun. */
export const MIN_LEFT_MS = 3_000;

export const MODE_TITLE: Record<ScanMode, string> = {
  quick: "Quick Check",
  age: "Age Check",
  score: "Scoring the Rack",
};

export function stageLabel(mode: ScanMode, stage: ScanStage): string {
  if (stage === "upload") return "Sending photo";
  if (stage === "finishing") return "Almost done";
  if (mode === "score") return "Measuring the rack";
  if (stage === "photo") return mode === "quick" ? "Reading body" : "Checking photo";
  if (stage === "body") return "Reading body";
  return "Cross-checking";
}

export function parseServerProgress(value: unknown): ServerProgress | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const stage = row.stage;
  const eta = Number(row.etaMs);
  if (stage !== "photo" && stage !== "body" && stage !== "crosscheck" && stage !== "finishing") return null;
  if (!Number.isFinite(eta) || eta < 0) return null;
  return { stage, etaMs: Math.min(eta, 300_000) };
}

export interface ProgressInput {
  mode: ScanMode;
  /** Phone clock, ms. */
  startedAt: number;
  now: number;
  /** Latest server report and when the phone received it (phone clock). */
  server: ServerProgress | null;
  receivedAt: number | null;
  /** The fraction already shown; the bar never moves back. */
  shown: number;
  done: boolean;
}

export interface ProgressView {
  fraction: number;
  label: string;
  /** Rounded seconds left, or null when the estimate has run out ("Almost done"). */
  secondsLeft: number | null;
}

export function remainingMs(input: Pick<ProgressInput, "mode" | "startedAt" | "now" | "server" | "receivedAt">): number {
  if (input.server && input.receivedAt != null) {
    return Math.max(0, input.server.etaMs - (input.now - input.receivedAt));
  }
  return Math.max(0, FALLBACK_ETA_MS[input.mode] - (input.now - input.startedAt));
}

export function roundSeconds(ms: number): number {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 10) return seconds;
  return Math.ceil(seconds / 5) * 5;
}

export function progressView(input: ProgressInput): ProgressView {
  const stage: ScanStage = input.done ? "finishing" : input.server?.stage ?? "upload";
  const label = stageLabel(input.mode, stage);
  if (input.done) return { fraction: 1, label, secondsLeft: null };
  const elapsed = Math.max(0, input.now - input.startedAt);
  const left = remainingMs(input);
  const raw = elapsed / (elapsed + Math.max(left, MIN_LEFT_MS));
  const fraction = Math.max(input.shown, Math.min(MAX_WAITING_FRACTION, raw));
  const secondsLeft = left >= 1_500 ? roundSeconds(left) : null;
  return { fraction, label: secondsLeft == null && stage !== "upload" ? "Almost done" : label, secondsLeft };
}

export function secondsLeftText(secondsLeft: number | null): string {
  if (secondsLeft == null) return "";
  if (secondsLeft <= 1) return "About a second left";
  return `About ${secondsLeft} seconds left`;
}
