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
  };
  return cached;
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
