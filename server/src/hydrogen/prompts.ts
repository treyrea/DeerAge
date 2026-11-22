import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ChartPack {
  labels: Record<string, string>;
  chart: Record<string, string>;
}

export interface HydrogenPromptSet {
  quality: string;
  babyGate: string;
  stepA: string;
  closer: string;
  range55: string;
  range45: string;
  range25: string;
  bind: string;
  season: string;
  chart: ChartPack;
  plain: string;
  crossCheck: string;
  plainDeer: string;
}

let cachedDir: string | null = null;
let cached: HydrogenPromptSet | null = null;

export function hydrogenPromptDirectory(): string {
  if (cachedDir) return cachedDir;
  const candidates = [
    resolve(dirname(fileURLToPath(import.meta.url)), "../../prompts/hydrogen"),
    resolve(process.cwd(), "prompts/hydrogen"),
  ];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "quality_v4.txt"))) {
      cachedDir = candidate;
      return candidate;
    }
  }
  throw new Error("Hydrogen prompt files are not installed.");
}

function readPrompt(name: string): string {
  return readFileSync(resolve(hydrogenPromptDirectory(), name), "utf8");
}

export function hydrogenPrompts(): HydrogenPromptSet {
  if (cached) return cached;
  cached = {
    quality: readPrompt("quality_v4.txt"),
    babyGate: readPrompt("baby_gate.txt"),
    stepA: readPrompt("step_a.txt"),
    closer: readPrompt("closer.txt"),
    range55: readPrompt("range_55_v3.txt"),
    range45: readPrompt("range_45_v12.txt"),
    range25: readPrompt("range_25_v4.txt"),
    bind: readPrompt("bind.txt"),
    season: readPrompt("season.txt"),
    chart: JSON.parse(readPrompt("chart.json")) as ChartPack,
    plain: readPrompt("plain_v1.txt"),
    crossCheck: readPrompt("crosscheck_v1.txt"),
    plainDeer: readPrompt("plain_deer_v1.txt"),
  };
  return cached;
}

/** Appended to the quality prompt when aging.ignoreReticle is on (the default). */
export const QUALITY_IGNORE_RETICLE_SENTENCE =
  "Thin reticle or crosshair lines, including a scope or rangefinder overlay, are not a graphic box and do not make this NO.";

/** Appended to the quality prompt so a distant speck is DEER_LARGE_ENOUGH: NO. */
export const QUALITY_MIN_SIZE_SENTENCE =
  "Write DEER_LARGE_ENOUGH: NO unless the neck, chest, and belly are large enough in the frame to read as body shapes, not only a distant silhouette or a small mark in a wide field.";

/**
 * Bundled quality_v4 text, plus the minimum-size sentence, and one isolated
 * reticle sentence when ignoreReticle is true. The file itself is unchanged
 * so its tested hash still matches.
 */
export function activeQualityPrompt(ignoreReticle = true): string {
  const base = withMinSizeSentence(hydrogenPrompts().quality);
  if (!ignoreReticle) return base;
  const needle = "a graphic box, or another deer?";
  if (!base.includes(needle)) return `${base.trim()}
${QUALITY_IGNORE_RETICLE_SENTENCE}
`;
  return base.replace(needle, `${needle} ${QUALITY_IGNORE_RETICLE_SENTENCE}`);
}

function withMinSizeSentence(base: string): string {
  const needle = "NO if the deer is a tiny thumbnail, a small collage tile, or a distant speck.";
  if (base.includes(QUALITY_MIN_SIZE_SENTENCE)) return base;
  if (!base.includes(needle)) return `${base.trim()}
${QUALITY_MIN_SIZE_SENTENCE}
`;
  return base.replace(needle, `${needle} ${QUALITY_MIN_SIZE_SENTENCE}`);
}

/** A non-empty override replaces the bundled file for this scan. The file text is not trimmed. */
export function activePlainPrompt(override?: string): string {
  const custom = override?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() ?? "";
  if (custom) return custom;
  return hydrogenPrompts().plain;
}

export function activeCrossCheckPrompt(override?: string): string {
  const custom = override?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() ?? "";
  if (custom) return custom;
  return hydrogenPrompts().crossCheck;
}

export function ageLabel(age: number, labels: Record<string, string>): string {
  return labels[String(age)] ?? `${age}-year-old`;
}

/**
 * Closer text, in the same order the tested runner concatenates it:
 * pair prompt, bind, recorded Step A, season, younger chart, older chart.
 */
export function buildCloserPrompt(younger: number, older: number, description: string): string {
  const prompts = hydrogenPrompts();
  let question = prompts.closer;
  if (younger === 4.5 && older === 5.5) question = prompts.range55;
  else if (younger === 3.5 && older === 4.5) question = prompts.range45;
  else if (younger === 2.5 && older === 3.5) question = prompts.range25;
  const youngerText = prompts.chart.chart[String(younger)];
  const olderText = prompts.chart.chart[String(older)];
  if (!youngerText || !olderText) {
    throw new Error(`No chart text for ${younger} vs ${older}.`);
  }
  const youngerName = ageLabel(younger, prompts.chart.labels);
  const olderName = ageLabel(older, prompts.chart.labels);
  return (
    question
    + "\n\n"
    + prompts.bind
    + "\n\nRecorded body observations:\n"
    + description
    + "\n\nSeason and condition (applies to both ages):\n"
    + prompts.season
    + `\nYOUNGER description (${youngerName}):\n`
    + youngerText
    + `\nOLDER description (${olderName}):\n`
    + olderText
  );
}

/** Quick Check's one read: the plain question plus a last DEER_PRESENT line. A non-empty override wins. */
export function activeQuickPrompt(override?: string): string {
  const custom = override?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() ?? "";
  if (custom) return custom;
  return hydrogenPrompts().plainDeer;
}
