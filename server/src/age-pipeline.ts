/**
 * Three reads in parallel: a fast look, the main body-first read, and an antler-blind check.
 * The first screen only says Hold. A missing or young body check cannot be a shooter.
 */

import { classStep, finalCall } from "./field-call.js";
import { callModel, parseFinal, type ModelCall } from "./gateway.js";
import { deerPresentValue, groupIsNoDeer, readingIsNoDeer, type DeerPresentAnswer } from "./hydrogen/no-deer.js";
import { coverAntlers } from "./mask.js";
import { antlerBoxPrompt, bodyFirstAgePrompt, fastAgePrompt, maskedAgePrompt } from "./prompts.js";

export interface AgeReading {
  age: number | null;
  confidence: number;
  visibleParts: string[];
  betterAngle: string;
  cues: string[];
  labeled: { area: string; text: string }[];
  stop: "not_deer" | "no_antlers" | "unreadable" | "harvested" | null;
  deerPresent: DeerPresentAnswer;
  backup: boolean;
}

export interface AgeOutcome {
  stop: AgeReading["stop"];
  provisional: { fieldCall: "LET WALK" | "HOLD"; note: string; ageClass: string };
  readings: { fast: AgeReading | null; main: AgeReading | null; bodyOnly: AgeReading | null };
  costs: ModelCall[];
  result: Record<string, unknown> | null;
  /** Set when the model calls failed or gave no usable age. The job must end as an error, never as an empty result. */
  error?: "upstream";
}

const EMPTY: AgeReading = {
  age: null,
  confidence: 0,
  visibleParts: [],
  betterAngle: "",
  cues: [],
  labeled: [],
  stop: null,
  deerPresent: "unknown",
  backup: false,
};

export function readingFrom(text: string, backup = false): AgeReading {
  const parsed = parseFinal(text);
  if (!parsed) return { ...EMPTY, backup };
  const stop = parsed.stop === "not_deer" || parsed.stop === "no_antlers" || parsed.stop === "unreadable" || parsed.stop === "harvested" ? parsed.stop : null;
  const age = Number(parsed.age);
  const parts = Array.isArray(parsed.visibleParts) ? parsed.visibleParts.filter((part): part is string => typeof part === "string") : [];
  const labeled = labeledCues(parsed.cues);
  return {
    age: Number.isFinite(age) && age > 0 ? age : null,
    confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
    visibleParts: parts.slice(0, 8),
    betterAngle: typeof parsed.betterAngle === "string" ? parsed.betterAngle.slice(0, 160) : "",
    cues: labeled.map((cue) => cue.text).slice(0, 6),
    labeled: labeled.slice(0, 6),
    stop,
    deerPresent: deerPresentValue(parsed.deer_present),
    backup,
  };
}

const CUE_AREAS = ["neck", "brisket", "belly", "back", "legs", "face", "antler"] as const;

function cueArea(given: string, text: string): string {
  const named = given.toLowerCase();
  if ((CUE_AREAS as readonly string[]).includes(named)) return named;
  const lower = text.toLowerCase();
  if (/\bantler|\brack\b|\bbeam\b|\btine\b/.test(lower)) return "antler";
  if (lower.includes("brisket") || lower.includes("chest")) return "brisket";
  if (lower.includes("neck") || lower.includes("throat")) return "neck";
  if (lower.includes("belly")) return "belly";
  if (lower.includes("back")) return "back";
  if (lower.includes("leg")) return "legs";
  if (lower.includes("face") || lower.includes("muzzle")) return "face";
  return "body";
}

function labeledCues(value: unknown): { area: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  const cues: { area: string; text: string }[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      cues.push({ area: cueArea("", item), text: item.trim() });
    } else if (item && typeof item === "object") {
      const row = item as { area?: unknown; text?: unknown };
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!text) continue;
      cues.push({ area: cueArea(typeof row.area === "string" ? row.area : "", text), text });
    }
  }
  return cues;
}

export function boxesFrom(text: string): number[][] {
  const parsed = parseFinal(text) ?? (() => {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();
  if (!parsed || !Array.isArray(parsed.boxes)) return [];
  return parsed.boxes.flatMap((box) => {
    if (!Array.isArray(box) || box.length < 4) return [];
    const nums = box.slice(0, 4).map((value) => Number(value));
    if (nums.some((value) => !Number.isFinite(value))) return [];
    return [nums];
  });
}

/** The fast model reads 2.5 for almost every buck, so the first screen never uses that age. */
export function provisionalFromFast(): AgeOutcome["provisional"] {
  return { fieldCall: "HOLD", ageClass: "", note: "Hold, checking his body." };
}

export function maskedRunCount(): number {
  const parsed = Number(process.env.MASKED_RUNS);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(2, Math.min(3, Math.floor(parsed)));
}

export function mainModelIds(): string[] {
  const ensemble = process.env.MAIN_ENSEMBLE?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (ensemble.length > 0) return ensemble;
  const single = process.env.MAIN_MODEL?.trim();
  return single ? [single] : [];
}

/**
 * Harvested wins over a filled-in age on that same read.
 * no_antlers sticks unless another read aged the deer without that stop,
 * which is how a spike the model can see keeps its age.
 */
export function hardStop(readings: AgeReading[]): "harvested" | "no_antlers" | null {
  const cleanAge = readings.some((reading) => reading.age != null && reading.stop !== "harvested" && reading.stop !== "no_antlers");
  if (readings.some((reading) => reading.stop === "harvested") && !cleanAge) return "harvested";
  if (readings.some((reading) => reading.stop === "no_antlers") && !cleanAge) return "no_antlers";
  return null;
}

/** Any young body, a young majority, or no usable body read blocks a shooter. */
export function maskedVerdict(readings: Array<AgeReading | null>): { bodyYears: number | null; missing: boolean; vetoYoung: boolean } {
  const ages = readings.flatMap((reading) => (reading?.age != null ? [classStep(reading.age)] : []));
  const young = ages.filter((age) => age <= 2.5);
  const vetoYoung = young.length > 0 || (ages.length > 0 && young.length * 2 > ages.length);
  return {
    bodyYears: ages.length === 0 ? null : Math.min(...ages),
    missing: ages.length === 0,
    vetoYoung,
  };
}

type AgeCaller = typeof callModel;
let ageCaller: AgeCaller = callModel;

/** Tests script the gateway replies. Production keeps callModel. */
export function setAgeCallerForTests(next: AgeCaller | null): void {
  ageCaller = next ?? callModel;
}

async function safeCall(role: "fast" | "age" | "ageFallback" | "boxes" | "masked", prompt: string, images: string[], timeoutMs: number, maxTokens: number, effort: "low" | "medium" | null, model?: string): Promise<ModelCall | null> {
  try {
    return await ageCaller({
      role,
      prompt,
      images,
      timeoutMs,
      maxTokens,
      effort,
      allowStatusRetry: true,
      model,
    });
  } catch (error) {
    console.log(JSON.stringify({
      event: "model_call_failed",
      role,
      model: model ?? null,
      message: error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
    }));
    return null;
  }
}

export async function runAgeCall(
  image: string,
  minimum: number,
  onProvisional?: (provisional: AgeOutcome["provisional"]) => void,
): Promise<AgeOutcome> {
  const costs: ModelCall[] = [];
  const models = mainModelIds();
  const fastPromise = safeCall("fast", fastAgePrompt(minimum), [image], 10_000, 800, "low");
  const mainPromises = (models.length > 0 ? models : [undefined]).map((model) => safeCall("age", bodyFirstAgePrompt(minimum), [image], 30_000, 2000, null, model));
  const blindPromise = (async () => {
    const boxes = await safeCall("boxes", antlerBoxPrompt(), [image], 12_000, 500, "low");
    if (!boxes) return { calls: [] as ModelCall[], readings: [] as Array<AgeReading | null> };
    costs.push(boxes);
    const found = boxesFrom(boxes.text);
    if (found.length === 0) return { calls: [], readings: [] };
    let covered = image;
    try {
      covered = await coverAntlers(image, found);
    } catch {
      return { calls: [], readings: [] };
    }
    const runs = await Promise.all(
      Array.from({ length: maskedRunCount() }, () => safeCall("masked", maskedAgePrompt(), [covered], 20_000, 2000, null)),
    );
    return {
      calls: runs.filter((call): call is ModelCall => call != null),
      readings: runs.map((call) => (call && call.text.trim() ? readingFrom(call.text) : null)),
    };
  })();

  const fastCall = await fastPromise;
  if (fastCall) costs.push(fastCall);
  const fast = fastCall ? readingFrom(fastCall.text) : null;
  const provisional = provisionalFromFast();
  onProvisional?.(provisional);

  const mainCalls = await Promise.all(mainPromises);
  let mains = mainCalls.filter((call): call is ModelCall => call != null).map((call) => {
    costs.push(call);
    return readingFrom(call.text);
  });
  const finishNoDeer = async (): Promise<AgeOutcome> => {
    const blind = await blindPromise;
    for (const call of blind.calls) costs.push(call);
    return { stop: "not_deer", provisional, readings: { fast, main: mains[0] ?? null, bodyOnly: null }, costs, result: null };
  };
  if (groupIsNoDeer(mains)) return finishNoDeer();
  if (mains.every((reading) => !reading.age && !reading.stop && reading.deerPresent !== "absent")) {
    const fallback = await safeCall("ageFallback", bodyFirstAgePrompt(minimum), [image], 20_000, 2000, "low");
    if (fallback) {
      costs.push(fallback);
      mains = [readingFrom(fallback.text, true)];
    }
  }
  if (groupIsNoDeer(mains)) return finishNoDeer();
  // A young fast age used to skip no_antlers. The fast read is 1.5 or 2.5 on almost every photo,
  // including a doe, so that skip turned "no antlers" into a 1.5 buck. It does not skip anymore.
  // A real spike still ages when the main read returns an age and does not set no_antlers.
  const forced = hardStop(mains) ?? (mains.every((reading) => reading.age == null) ? hardStop(fast ? [fast] : []) : null);
  if (forced) {
    const reading = mains.find((item) => item.stop === forced) ?? fast;
    return { stop: forced, provisional, readings: { fast, main: reading, bodyOnly: null }, costs, result: null };
  }
  const stopped = mains.find((reading) => reading.stop && reading.age == null);
  if (stopped?.stop) {
    return { stop: stopped.stop, provisional, readings: { fast, main: stopped, bodyOnly: null }, costs, result: null };
  }
  const blind = await blindPromise;
  for (const call of blind.calls) costs.push(call);
  const verdict = maskedVerdict(blind.readings);
  const main = combineMains(mains, minimum, models.length > 1);
  const bodyOnly = blind.readings.find((reading) => reading?.age != null && !readingIsNoDeer(reading.deerPresent, reading.stop)) ?? null;
  if (!main?.age && fast && readingIsNoDeer(fast.deerPresent, fast.stop) && !mains.some((reading) => reading.deerPresent === "present")) {
    return { stop: "not_deer", provisional, readings: { fast, main, bodyOnly: null }, costs, result: null };
  }
  if (!main?.age && fast?.age == null) {
    // Nothing came back with an age: every call failed or none could be read. Never send an empty result.
    console.log(JSON.stringify({
      event: "age_no_reading",
      calls: costs.length,
      mains: mains.length,
      fast: Boolean(fastCall),
    }));
    return { stop: null, provisional, readings: { fast, main, bodyOnly }, costs, result: null, error: "upstream" };
  }
  if (!main?.age) {
    const decision = finalCall({ mainYears: null, bodyYears: verdict.bodyYears, minimum, confirmed: false, bodyMissing: true });
    return { stop: null, provisional, readings: { fast, main, bodyOnly }, costs, result: resultBody(decision, fast, main, bodyOnly, minimum) };
  }
  const decision = finalCall({
    mainYears: main.age,
    bodyYears: verdict.vetoYoung ? verdict.bodyYears : verdict.missing ? null : verdict.bodyYears,
    minimum,
    confirmed: true,
    bodyMissing: verdict.missing || Boolean(main.ensembleGap),
  });
  return { stop: null, provisional, readings: { fast, main, bodyOnly }, costs, result: resultBody(decision, fast, main, bodyOnly, minimum) };
}

function combineMains(readings: AgeReading[], minimum: number, ensemble: boolean): (AgeReading & { ensembleGap?: boolean }) | null {
  const usable = readings.filter((reading) => reading.age != null && !(reading.stop && !reading.age));
  if (usable.length === 0) return readings[0] ?? null;
  if (!ensemble || usable.length === 1) {
    return { ...usable[0], ensembleGap: ensemble && readings.length > 1 && classStep(usable[0].age ?? 0) >= classStep(minimum) };
  }
  const steps = usable.map((reading) => classStep(reading.age ?? 0));
  const line = classStep(minimum);
  const split = steps.some((step) => step >= line) && steps.some((step) => step < line);
  const youngest = usable.reduce((pick, reading) => (classStep(reading.age ?? 0) < classStep(pick.age ?? 0) ? reading : pick));
  const oldest = usable.reduce((pick, reading) => (classStep(reading.age ?? 0) > classStep(pick.age ?? 0) ? reading : pick));
  // A split stays borderline. Agreement uses the younger class.
  return split ? { ...oldest, ensembleGap: true } : { ...youngest, ensembleGap: false };
}

function resultBody(
  decision: ReturnType<typeof finalCall>,
  fast: AgeReading | null,
  main: AgeReading | null,
  bodyOnly: AgeReading | null,
  minimum: number,
): Record<string, unknown> {
  const source = main?.age != null ? main : fast && !readingIsNoDeer(fast.deerPresent, fast.stop) ? fast : null;
  const labeled = (source?.labeled?.length ? source.labeled : bodyOnly?.labeled) ?? [];
  const cues = labeled.map((cue) => ({
    area: cue.area === "antler" ? "Antler" : cue.area.charAt(0).toUpperCase() + cue.area.slice(1),
    text: cue.text,
  }));
  return {
    ageYears: source?.age ?? null,
    estimatedAgeYears: source?.age ?? null,
    ageClass: decision.ageClass,
    estimatedAge: decision.ageClass,
    confidence: source?.confidence ?? 0,
    overallConfidence: source?.confidence ?? 0,
    fieldCall: decision.fieldCall,
    fieldCallNote: decision.fieldCallNote,
    leaseMinimum: classStep(minimum),
    cueBullets: cues,
    visibleParts: source?.visibleParts ?? [],
    betterAngle: source?.betterAngle || bodyOnly?.betterAngle || "",
    rackOlderThanBody: decision.fieldCall === "BORDERLINE" && (bodyOnly?.age ?? 99) <= 2.5,
    fastAge: fast?.age ?? null,
    mainAge: main?.age ?? null,
    bodyOnlyAge: bodyOnly?.age ?? null,
    backupEstimate: Boolean(main?.backup),
    decision: decision.fieldCall === "SHOOTER" ? "SHOOT" : "LET WALK",
    shooterPassLabel: decision.fieldCall === "SHOOTER" ? "SHOOTER" : "LET WALK",
    isValidDeer: true,
    isValidImage: true,
  };
}
