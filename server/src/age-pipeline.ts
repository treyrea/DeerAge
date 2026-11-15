/**
 * Three reads in parallel: a fast look, the main body-first read, and an antler-blind check.
 * The fast look may say LET WALK early. It never says SHOOTER.
 */

import { classLabel, classStep, finalCall } from "./field-call.js";
import { callModel, GatewayError, parseFinal, type ModelCall } from "./gateway.js";
import { coverAntlers } from "./mask.js";
import { antlerBoxPrompt, bodyFirstAgePrompt, fastAgePrompt, maskedAgePrompt } from "./prompts.js";

export interface AgeReading {
  age: number | null;
  confidence: number;
  visibleParts: string[];
  betterAngle: string;
  cues: string[];
  labeled: { area: string; text: string }[];
  stop: "not_deer" | "no_antlers" | "unreadable" | null;
  backup: boolean;
}

export interface AgeOutcome {
  stop: AgeReading["stop"];
  provisional: { fieldCall: "LET WALK" | "HOLD"; note: string; ageClass: string };
  readings: { fast: AgeReading | null; main: AgeReading | null; bodyOnly: AgeReading | null };
  costs: ModelCall[];
  result: Record<string, unknown> | null;
}

const EMPTY: AgeReading = {
  age: null,
  confidence: 0,
  visibleParts: [],
  betterAngle: "",
  cues: [],
  labeled: [],
  stop: null,
  backup: false,
};

export function readingFrom(text: string, backup = false): AgeReading {
  const parsed = parseFinal(text);
  if (!parsed) return { ...EMPTY, backup };
  const stop = parsed.stop === "not_deer" || parsed.stop === "no_antlers" || parsed.stop === "unreadable" ? parsed.stop : null;
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

function earlyWalk(age: number | null, minimum: number): boolean {
  if (age == null) return false;
  const step = classStep(age);
  return step <= 2.5 && step < classStep(minimum);
}

async function safeCall(role: "fast" | "age" | "ageFallback" | "boxes" | "masked", prompt: string, images: string[], timeoutMs: number, maxTokens: number, effort: "low" | "medium" | null): Promise<ModelCall | null> {
  try {
    return await callModel({
      role,
      prompt,
      images,
      timeoutMs,
      maxTokens,
      effort,
      allowStatusRetry: true,
    });
  } catch (error) {
    if (error instanceof GatewayError) return null;
    return null;
  }
}

export async function runAgeCall(
  image: string,
  minimum: number,
  onProvisional?: (provisional: AgeOutcome["provisional"]) => void,
): Promise<AgeOutcome> {
  const costs: ModelCall[] = [];
  const fastPromise = safeCall("fast", fastAgePrompt(minimum), [image], 10_000, 800, "low");
  const mainPromise = safeCall("age", bodyFirstAgePrompt(minimum), [image], 30_000, 2000, null);
  const blindPromise = (async () => {
    const boxes = await safeCall("boxes", antlerBoxPrompt(), [image], 12_000, 500, "low");
    if (!boxes) return { call: null as ModelCall | null, reading: null as AgeReading | null };
    costs.push(boxes);
    const found = boxesFrom(boxes.text);
    if (found.length === 0) return { call: null, reading: null };
    let covered = image;
    try {
      covered = await coverAntlers(image, found);
    } catch {
      return { call: null, reading: null };
    }
    const masked = await safeCall("masked", maskedAgePrompt(), [covered], 15_000, 800, null);
    return { call: masked, reading: masked ? readingFrom(masked.text) : null };
  })();

  const fastCall = await fastPromise;
  if (fastCall) costs.push(fastCall);
  const fast = fastCall ? readingFrom(fastCall.text) : null;
  const provisional: AgeOutcome["provisional"] = earlyWalk(fast?.age ?? null, minimum)
    ? {
      fieldCall: "LET WALK",
      ageClass: classLabel(classStep(fast?.age ?? 1.5)),
      note: `Reads ${classLabel(classStep(fast?.age ?? 1.5))}, under your lease minimum of ${classLabel(classStep(minimum))}. Let him walk.`,
    }
    : { fieldCall: "HOLD", ageClass: "", note: "Hold, checking his body." };
  onProvisional?.(provisional);

  let mainCall = await mainPromise;
  let main = mainCall ? readingFrom(mainCall.text) : null;
  if (mainCall) costs.push(mainCall);
  if (!main?.age && !main?.stop) {
    const fallback = await safeCall("ageFallback", bodyFirstAgePrompt(minimum), [image], 20_000, 2000, "low");
    if (fallback) {
      costs.push(fallback);
      main = readingFrom(fallback.text, true);
      mainCall = fallback;
    }
  }
  const blind = await blindPromise;
  if (blind.call) costs.push(blind.call);

  if (main?.stop && !main.age) {
    return { stop: main.stop, provisional, readings: { fast, main, bodyOnly: blind.reading }, costs, result: null };
  }
  if (!main?.age) {
    const kept = earlyWalk(fast?.age ?? null, minimum);
    const decision = finalCall({
      mainYears: kept ? fast?.age ?? null : null,
      bodyYears: blind.reading?.age ?? null,
      minimum,
      confirmed: kept,
    });
    return {
      stop: null,
      provisional,
      readings: { fast, main, bodyOnly: blind.reading },
      costs,
      result: resultBody(decision, fast, main, blind.reading, minimum),
    };
  }
  const decision = finalCall({
    mainYears: main.age,
    bodyYears: blind.reading?.age ?? null,
    minimum,
    confirmed: true,
  });
  return {
    stop: null,
    provisional,
    readings: { fast, main, bodyOnly: blind.reading },
    costs,
    result: resultBody(decision, fast, main, blind.reading, minimum),
  };
}

function resultBody(
  decision: ReturnType<typeof finalCall>,
  fast: AgeReading | null,
  main: AgeReading | null,
  bodyOnly: AgeReading | null,
  minimum: number,
): Record<string, unknown> {
  const source = main?.age != null ? main : fast;
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
