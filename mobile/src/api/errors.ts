import type { AntlerlessRead } from "../types/deer-scoring";

export type AnalysisErrorCode =
  | "invalid_request"
  | "not_configured"
  | "rate_limited"
  | "quota"
  | "fair_use"
  | "busy"
  | "not_deer"
  | "no_deer"
  | "no_body"
  | "no_antlers"
  | "poor_quality"
  | "unreadable"
  | "retake"
  | "timeout"
  | "upstream"
  | "network"
  | "zero_frames"
  | "unknown";

const FALLBACK: Record<AnalysisErrorCode, string> = {
  invalid_request: "That photo couldn't be sent. Try again.",
  not_configured: "This copy of DeerAge can't find its server. Close DeerAge fully and reopen it to load the latest update.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  quota: "You've used your 3 free analyses.",
  fair_use: "You've reached today's limit. It resets at midnight Central.",
  busy: "DeerAge is busy right now. Try again in a little while.",
  not_deer: "This photo doesn't show a deer.",
  no_deer: "No deer found",
  no_body: "The deer's body isn't visible enough to age. Use a broadside photo of the whole deer.",
  no_antlers: "No antlers are visible in this photo.",
  poor_quality: "The photo is too dark or blurry to analyze. Try a clearer shot.",
  unreadable: "The photo is too dark or blurry to read.",
  retake: "Try a clearer side-on photo of one deer standing with its head up, so the chest, belly, and back are easy to see.",
  timeout: "Analysis took too long. Try a clearer photo.",
  upstream: "Analysis failed. Try again in a moment.",
  network: "You're offline. DeerAge needs a connection to estimate age.",
  zero_frames: "The burst didn't capture any frames. Hold the phone steady and try again.",
  unknown: "Analysis failed. Try again.",
};

export type FairUseLimit = "daily" | "monthly";

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode;
  readonly tip: string;
  /** Set when the server says which fair-use cap was hit. */
  readonly limit: FairUseLimit | null;
  /** True only when this server will spend a pack credit to pass the cap. */
  readonly creditsBypass: boolean;
  /** A doe or possible young buck sent beside the no_antlers code. Null on today's stop. */
  readonly antlerless: AntlerlessRead | null;

  constructor(code: AnalysisErrorCode, message?: string, tip?: string, extra?: { limit?: FairUseLimit | null; creditsBypass?: boolean; antlerless?: AntlerlessRead | null }) {
    super(message && message.trim().length > 0 ? message : FALLBACK[code]);
    this.name = "AnalysisError";
    this.code = code;
    this.tip = tip?.trim() ?? "";
    this.limit = extra?.limit === "daily" || extra?.limit === "monthly" ? extra.limit : null;
    this.creditsBypass = extra?.creditsBypass === true;
    this.antlerless = extra?.antlerless ?? null;
  }
}

export function isAnalysisError(error: unknown): error is AnalysisError {
  return error instanceof AnalysisError;
}

export function messageForCode(code: AnalysisErrorCode): string {
  return FALLBACK[code];
}
