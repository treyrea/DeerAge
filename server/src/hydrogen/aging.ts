/**
 * Server-side aging release settings. Empty prompt overrides mean the bundled files.
 * Nothing here is shipped in the app; PATCH /api/admin/config changes a live scan.
 */

export const DEFAULT_RANGE_NOTE =
  "Reads {label}: a 1-year range. He fits both ages in this photo, so we show both instead of guessing.";

export const DEFAULT_CALL_TIMEOUT_MS = 120_000;
export const MIN_CALL_TIMEOUT_MS = 20_000;
export const MAX_CALL_TIMEOUT_MS = 150_000;
export const SCAN_DEADLINE_MS = 285_000;
export const PLAIN_PROMPT_MAX = 2_000;
export const CROSSCHECK_PROMPT_MAX = 8_000;
export const RANGE_NOTE_MAX = 500;

export interface AgingConfig {
  router: "c4nr" | "off";
  crossCheck: boolean;
  /** Empty uses prompts/hydrogen/plain_v1.txt. */
  plainPrompt: string;
  /** Empty uses prompts/hydrogen/crosscheck_v1.txt. */
  crossCheckPrompt: string;
  callTimeoutMs: number;
  /** Sentence with a {label} placeholder. Hunters see it in fieldCallNote for a range. */
  rangeNote: string;
}

export function defaultAgingConfig(): AgingConfig {
  return {
    router: "c4nr",
    crossCheck: true,
    plainPrompt: "",
    crossCheckPrompt: "",
    callTimeoutMs: DEFAULT_CALL_TIMEOUT_MS,
    rangeNote: DEFAULT_RANGE_NOTE,
  };
}

export function clampCallTimeout(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CALL_TIMEOUT_MS;
  return Math.min(MAX_CALL_TIMEOUT_MS, Math.max(MIN_CALL_TIMEOUT_MS, Math.round(parsed)));
}

function storedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!text || text.length > max) return "";
  return text;
}

export function normalizeAging(stored: unknown): AgingConfig {
  const base = defaultAgingConfig();
  if (!stored || typeof stored !== "object") return base;
  const row = stored as Record<string, unknown>;
  const rangeNote = storedText(row.rangeNote, RANGE_NOTE_MAX);
  return {
    router: row.router === "off" ? "off" : "c4nr",
    crossCheck: typeof row.crossCheck === "boolean" ? row.crossCheck : base.crossCheck,
    plainPrompt: storedText(row.plainPrompt, PLAIN_PROMPT_MAX),
    crossCheckPrompt: storedText(row.crossCheckPrompt, CROSSCHECK_PROMPT_MAX),
    callTimeoutMs: clampCallTimeout(row.callTimeoutMs ?? base.callTimeoutMs),
    rangeNote: rangeNote || base.rangeNote,
  };
}

export function fillRangeNote(template: string | undefined, label: string): string {
  const raw = template?.trim() ? template.trim() : DEFAULT_RANGE_NOTE;
  return raw.replaceAll("{label}", label);
}
