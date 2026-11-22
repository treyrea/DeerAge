/**
 * Scoring runs as its own job. Gemini gets one plain question.
 * A timeout is not retried. Claude is the backup estimate.
 */

import { callModel, GatewayError, parseFinal, type ModelCall } from "./gateway.js";
import { deerPresentValue, readingIsNoDeer } from "./hydrogen/no-deer.js";
import { scorePromptPlain } from "./prompts.js";

export interface ScoreOutcome {
  noDeer: boolean;
  result: Record<string, unknown> | null;
  costs: ModelCall[];
  backup: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function scoreFrom(text: string, backup: boolean): Record<string, unknown> | "no_deer" | null {
  const parsed = parseFinal(text);
  if (!parsed) return null;
  if (readingIsNoDeer(deerPresentValue(parsed.deer_present), parsed.stop)) return "no_deer";
  if (!Number.isFinite(Number(parsed.gross))) return null;
  const beams = asRecord(parsed.beams);
  const tines = asRecord(parsed.tines);
  const mass = asRecord(parsed.mass);
  const gross = Number(parsed.gross);
  return {
    grossScore: gross,
    insideSpread: Number(parsed.spread) || 0,
    beams: { left: Number(beams.left) || 0, right: Number(beams.right) || 0 },
    tines: { left: asRecord(tines.left), right: asRecord(tines.right) },
    mass: { left: asRecord(mass.left), right: asRecord(mass.right) },
    isValidDeer: true,
    backupEstimate: backup,
    scoreRange: {
      low: Math.round(gross * 0.94),
      high: Math.round(gross * 1.06),
    },
  };
}

type ScoreCaller = typeof callModel;
let scoreCaller: ScoreCaller = callModel;

/** Tests script the score replies. Production keeps callModel. */
export function setScoreCallerForTests(next: ScoreCaller | null): void {
  scoreCaller = next ?? callModel;
}

async function once(role: "score" | "scoreFallback", images: string[], effort: "low" | "medium" | null, timeoutMs: number): Promise<ModelCall> {
  return scoreCaller({
    role,
    prompt: scorePromptPlain(),
    images,
    maxTokens: 16_000,
    timeoutMs,
    effort,
    allowStatusRetry: role === "score",
  });
}

export async function runScoreCall(images: string[]): Promise<ScoreOutcome> {
  const costs: ModelCall[] = [];
  try {
    const primary = await once("score", images, "medium", 120_000);
    costs.push(primary);
    const parsed = scoreFrom(primary.text, false);
    if (parsed === "no_deer") return { noDeer: true, result: null, costs, backup: false };
    if (parsed) return { noDeer: false, result: parsed, costs, backup: false };
  } catch (error) {
    if (!(error instanceof GatewayError)) throw error;
  }
  const backup = await once("scoreFallback", images, null, 60_000);
  costs.push(backup);
  const parsed = scoreFrom(backup.text, true);
  if (parsed === "no_deer") return { noDeer: true, result: null, costs, backup: true };
  if (!parsed) {
    throw new GatewayError("The score did not come back in a usable form.", 502, false);
  }
  return { noDeer: false, result: parsed, costs, backup: true };
}
