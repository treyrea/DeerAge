/**
 * Which age walk a request uses.
 *
 * Clients that do not send 1.0.9 stay on the gateway age pipeline already in
 * this server (fast look, body read, antler-blind check). Quick Check and
 * Score always use that gateway.
 *
 * 1.0.9 and newer use AGING_PIPELINE. Unset or "hydrogen" runs the Gemini 4
 * Hydrogen walk. "openai" or "sol" keeps the gateway age pipeline.
 */

export const HYDROGEN_MIN_VERSION = "1.0.9";
export const HYDROGEN_MODEL = "gemini-4-hydrogen";

export type AgingEngine = "current" | "sol" | "hydrogen";

export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length, 3);
  for (let i = 0; i < length; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

export function agingEngineFor(appVersion: string | undefined, pipeline = process.env.AGING_PIPELINE): AgingEngine {
  const version = (appVersion ?? "").trim();
  if (!version || compareVersions(version, HYDROGEN_MIN_VERSION) < 0) return "current";
  const flag = (pipeline ?? "hydrogen").trim().toLowerCase();
  if (flag === "openai" || flag === "sol" || flag === "gpt-5.6-sol" || flag === "current") return "sol";
  return "hydrogen";
}

