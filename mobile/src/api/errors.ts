export type AnalysisErrorCode =
  | "invalid_request"
  | "not_configured"
  | "rate_limited"
  | "quota"
  | "fair_use"
  | "busy"
  | "not_deer"
  | "no_body"
  | "no_antlers"
  | "poor_quality"
  | "timeout"
  | "upstream"
  | "network"
  | "zero_frames"
  | "unknown";

const FALLBACK: Record<AnalysisErrorCode, string> = {
  invalid_request: "That photo couldn't be sent. Try again.",
  not_configured: "DeerAge isn't connected to the analysis service yet.",
  rate_limited: "Too many requests. Wait a moment and try again.",
  quota: "You've used your 3 free analyses.",
  fair_use: "You've used today's analyses. The cap resets tomorrow.",
  busy: "DeerAge is busy right now. Try again in a little while.",
  not_deer: "This photo doesn't show a deer.",
  no_body: "The deer's body isn't visible enough to age. Use a broadside photo of the whole deer.",
  no_antlers: "No antlers are visible in this photo.",
  poor_quality: "The photo is too dark or blurry to analyze. Try a clearer shot.",
  timeout: "Analysis took too long. Try a clearer photo.",
  upstream: "Analysis failed. Try again in a moment.",
  network: "You're offline. DeerAge needs a connection to estimate age.",
  zero_frames: "The burst didn't capture any frames. Hold the phone steady and try again.",
  unknown: "Analysis failed. Try again.",
};

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode;

  constructor(code: AnalysisErrorCode, message?: string) {
    super(message && message.trim().length > 0 ? message : FALLBACK[code]);
    this.name = "AnalysisError";
    this.code = code;
  }
}

export function isAnalysisError(error: unknown): error is AnalysisError {
  return error instanceof AnalysisError;
}

export function messageForCode(code: AnalysisErrorCode): string {
  return FALLBACK[code];
}
