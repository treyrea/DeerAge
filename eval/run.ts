/**
 * DeerAge accuracy harness.
 *
 * Dry run (no keys, no network):
 *   node --experimental-strip-types eval/run.ts --dry-run
 *
 * Live run through the proxy:
 *   DEERAGE_EVAL_TOKEN=... PROXY_URL=http://localhost:3000 \
 *     node --experimental-strip-types eval/run.ts --baseline
 *
 * Flagged rows are skipped unless --include-weak is set.
 * The scorecard is printed and written to eval/scorecard.json.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LABELS = resolve(HERE, "labels.csv");
const OUT = resolve(HERE, "scorecard.json");

const RELIABLE_AGE = new Set(["lab", "known history", "known (pen)", "check station"]);
const OFFICIAL_SCORE = new Set(["official", "contest-official"]);

interface ParsedAge {
  point: number | null;
  mature: boolean | null;
}

interface Label {
  id: string;
  photoUrl: string;
  age: ParsedAge;
  ageMethod: string;
  ageClass: string;
  gross: number | null;
  net: number | null;
  scoreClass: string;
  ecoregion: string;
  fenceType: string;
  region: string;
  flag: string;
  species: string;
}

interface Bucket {
  rows: number;
  ageEligible: number;
  scoreEligible: number;
  ageN: number;
  ageExact: number;
  ageWithin1: number;
  youngMatureN: number;
  youngMatureCorrect: number;
  scoreN: number;
  scoreAbsSum: number;
  scorePctSum: number;
  latencyN: number;
  latencySum: number;
  latencySamples: number[];
}

interface Prediction {
  ageYears?: number;
  mature?: boolean;
  grossScore?: number;
  netScore?: number;
  latencyMs: number;
  latencies?: number[];
  error?: string;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === "\"" && text[i + 1] === "\"") {
        cell += "\"";
        i += 1;
      } else if (ch === "\"") {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === "\"") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const header = rows[0]?.map((item) => item.trim()) ?? [];
  return rows.slice(1).filter((cells) => cells.some((value) => value.trim())).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

export function parseInches(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d/.test(text)) return null;
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const whole = text.match(/^(\d+(?:\.\d+)?)/);
  return whole ? Number(whole[1]) : null;
}

export function parseAge(raw: string): number | null {
  const match = raw.trim().match(/^(?:about\s+)?(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

/** A labeled score may lead with net and put gross in parentheses. Prefer gross when both exist. */
export function parseLabeledScore(raw: string): { gross: number | null; net: number | null } {
  const text = raw.trim();
  const grab = (kind: "gross" | "net"): number | null => {
    const match = text.match(new RegExp(`(\\d+(?:\\.\\d+)?(?:\\s+\\d+\\s*/\\s*\\d+)?)\\s*${kind}`, "i"));
    return match ? parseInches(match[1]) : null;
  };
  const gross = grab("gross");
  const net = grab("net");
  if (gross == null && net == null) return { gross: parseInches(text), net: null };
  return { gross, net };
}

export function parseAgeLabel(raw: string): ParsedAge {
  const text = raw.trim();
  if (!text || /through/i.test(text)) return { point: null, mature: null };
  const span = text.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (span && !/stated/i.test(text)) {
    const low = Number(span[1]);
    const high = Number(span[2]);
    if (low >= 4.5) return { point: null, mature: true };
    if (high < 4.5) return { point: null, mature: false };
    return { point: null, mature: null };
  }
  if (/^\d+(?:\.\d+)?\s*\+/.test(text)) {
    const value = Number(text.match(/(\d+(?:\.\d+)?)/)?.[1]);
    return { point: null, mature: value >= 4.5 };
  }
  const point = parseAge(text);
  if (point == null) return { point: null, mature: null };
  return { point, mature: point >= 4.5 };
}

function fenceGroup(value: string): string {
  const text = value.trim().toLowerCase();
  if (!text) return "not recorded";
  if (text.startsWith("high (research")) return "high (research pen)";
  if (text === "high" || text === "low" || text === "unknown") return text;
  return text;
}

function firstPhoto(raw: string): string {
  const parts = raw.split("|").map((part) => part.trim());
  return parts.find((part) => part.startsWith("http")) ?? "";
}

function loadLabels(): Label[] {
  const records = parseCsv(readFileSync(LABELS, "utf8"));
  return records.map((row) => ({
    id: row.id,
    photoUrl: firstPhoto(row.photo_url ?? ""),
    age: parseAgeLabel(row.claimed_age ?? ""),
    ageMethod: row.age_method ?? "",
    ageClass: (row.age_class ?? "").toLowerCase(),
    ...(() => {
      const scored = parseLabeledScore(row.score_in ?? "");
      return { gross: scored.gross, net: scored.net };
    })(),
    scoreClass: (row.score_class ?? "").toLowerCase(),
    ecoregion: row.ecoregion || "Unknown",
    fenceType: fenceGroup(row.fence_type ?? ""),
    region: row.location || row.state || "",
    flag: row.flag ?? "",
    species: row.species ?? "",
  }));
}

function emptyBucket(): Bucket {
  return {
    rows: 0,
    ageEligible: 0,
    scoreEligible: 0,
    ageN: 0,
    ageExact: 0,
    ageWithin1: 0,
    youngMatureN: 0,
    youngMatureCorrect: 0,
    scoreN: 0,
    scoreAbsSum: 0,
    scorePctSum: 0,
    latencyN: 0,
    latencySum: 0,
    latencySamples: [],
  };
}

function addPrediction(bucket: Bucket, label: Label, prediction: Prediction | null, ageEligible: boolean, scoreEligible: boolean) {
  bucket.rows += 1;
  if (ageEligible) bucket.ageEligible += 1;
  if (scoreEligible) bucket.scoreEligible += 1;
  if (!prediction || prediction.error) return;
  if (ageEligible && prediction.ageYears != null && (label.age.point != null || label.age.mature != null)) {
    if (label.age.point != null) {
      const delta = Math.abs(prediction.ageYears - label.age.point);
      bucket.ageN += 1;
      if (delta <= 0.25) bucket.ageExact += 1;
      if (delta <= 1) bucket.ageWithin1 += 1;
    }
    if (label.age.mature != null) {
      bucket.youngMatureN += 1;
      const predMature = prediction.mature ?? prediction.ageYears >= 4.5;
      if (label.age.mature === predMature) bucket.youngMatureCorrect += 1;
    }
  }
  const truth = label.gross ?? label.net;
  const predicted = label.gross != null ? prediction.grossScore : prediction.netScore;
  if (scoreEligible && truth != null && predicted != null && truth > 0) {
    const abs = Math.abs(predicted - truth);
    bucket.scoreN += 1;
    bucket.scoreAbsSum += abs;
    bucket.scorePctSum += abs / truth;
  }
  const samples = prediction.latencies ?? (prediction.latencyMs > 0 ? [prediction.latencyMs] : []);
  for (const sample of samples) {
    bucket.latencyN += 1;
    bucket.latencySum += sample;
    bucket.latencySamples.push(sample);
  }
}

function percent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function summarize(bucket: Bucket) {
  const samples = [...bucket.latencySamples].sort((a, b) => a - b);
  const p50 = samples.length ? samples[Math.floor((samples.length - 1) / 2)] : null;
  return {
    rows: bucket.rows,
    ageEligible: bucket.ageEligible,
    scoreEligible: bucket.scoreEligible,
    ageExactPct: percent(bucket.ageExact, bucket.ageN),
    ageWithin1YearPct: percent(bucket.ageWithin1, bucket.ageN),
    youngVsMaturePct: percent(bucket.youngMatureCorrect, bucket.youngMatureN),
    ageN: bucket.ageN,
    meanAbsoluteScoreError: bucket.scoreN ? Math.round((bucket.scoreAbsSum / bucket.scoreN) * 10) / 10 : null,
    meanScoreErrorPct: bucket.scoreN ? Math.round((bucket.scorePctSum / bucket.scoreN) * 1000) / 10 : null,
    scoreN: bucket.scoreN,
    meanLatencyMs: bucket.latencyN ? Math.round(bucket.latencySum / bucket.latencyN) : null,
    p50LatencyMs: p50,
  };
}

function assertParse() {
  const inches: Array<[string, number | null]> = [
    ["161", 161],
    ["146 5/8", 146.625],
    ["195 4/8 gross", 195.5],
    ["upper 150s", null],
    ["213 5/8 net typical", 213.625],
  ];
  for (const [raw, expected] of inches) {
    const got = parseInches(raw);
    if (got !== expected) throw new Error(`parseInches(${raw}) = ${got}, expected ${expected}`);
  }
  const labeled: Array<[string, number | null, number | null]> = [
    ["178 net typical (184 7/8 gross)", 184.875, 178],
    ["213 5/8 net typical (world record)", null, 213.625],
    ["158 4/8", 158.5, null],
  ];
  for (const [raw, gross, net] of labeled) {
    const got = parseLabeledScore(raw);
    if (got.gross !== gross || got.net !== net) {
      throw new Error(`parseLabeledScore(${raw}) = ${JSON.stringify(got)}`);
    }
  }
  const span = parseAgeLabel("1.5 through 6.5 (two bucks)");
  if (span.point != null || span.mature != null) throw new Error("a span of ages is not one class");
  const plus = parseAgeLabel("7.5+");
  if (plus.point != null || plus.mature !== true) throw new Error("7.5+ should be mature without an exact year");
  if (parseAgeLabel("4.5").point !== 4.5) throw new Error("4.5 should stay a point for the age eval");
}

async function predict(label: Label, proxy: string, token: string, mode: "age" | "score", baseline: boolean): Promise<Prediction> {
  if (!label.photoUrl) return { latencyMs: 0, error: "no photo url" };
  const started = Date.now();
  const imageResponse = await fetch(label.photoUrl);
  if (!imageResponse.ok) return { latencyMs: Date.now() - started, error: `photo ${imageResponse.status}` };
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  if (bytes.length > 1_500_000) return { latencyMs: Date.now() - started, error: "photo too large" };
  const response = await fetch(`${proxy.replace(/\/$/, "")}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-deerage-eval-token": token,
    },
    body: JSON.stringify({
      mode: baseline ? "age" : mode,
      baseline,
      appUserId: `eval-${label.id}`,
      images: [bytes.toString("base64")],
      context: {
        ecoregion: label.ecoregion,
        state: label.region,
        fenceType: label.fenceType === "not recorded" ? undefined : label.fenceType,
        landType: label.fenceType.startsWith("high") ? "high_fence" : label.fenceType,
        species: label.species.toLowerCase().includes("mule") ? "mule_deer" : "whitetail",
        minimumShooterAge: 4.5,
      },
    }),
  });
  const body = await response.json() as {
    ok?: boolean;
    result?: { estimatedAgeYears?: number; ageYears?: number; ageCall?: string; grossScore?: number; netScore?: number };
    latencyMs?: number;
    message?: string;
  };
  const latencyMs = body.latencyMs ?? Date.now() - started;
  if (!response.ok || !body.ok || !body.result) {
    return { latencyMs, error: body.message ?? `proxy ${response.status}` };
  }
  const ageYears = body.result.estimatedAgeYears ?? body.result.ageYears;
  return {
    ageYears,
    mature: body.result.ageCall ? body.result.ageCall === "mature" : (ageYears ?? 0) >= 4.5,
    grossScore: body.result.grossScore,
    netScore: body.result.netScore,
    latencyMs,
    latencies: [latencyMs],
  };
}

async function predictRow(label: Label, proxy: string, token: string, ageEligible: boolean, scoreEligible: boolean): Promise<Prediction> {
  const calls: Prediction[] = [];
  if (ageEligible) calls.push(await predict(label, proxy, token, "age", false));
  if (scoreEligible) calls.push(await predict(label, proxy, token, "score", false));
  if (calls.length === 0) return { latencyMs: 0, error: "not in the age or score set" };
  const failed = calls.find((call) => call.error);
  const ageCall = ageEligible ? calls[0] : undefined;
  const scoreCall = scoreEligible ? calls[calls.length - 1] : undefined;
  return {
    ageYears: ageCall?.ageYears,
    mature: ageCall?.mature,
    grossScore: scoreCall?.grossScore,
    netScore: scoreCall?.netScore,
    latencyMs: Math.max(...calls.map((call) => call.latencyMs)),
    latencies: calls.flatMap((call) => call.latencies ?? []),
    error: failed?.error,
  };
}

function printSummary(title: string, summary: ReturnType<typeof summarize>) {
  console.log(`\n${title}`);
  console.log(`  rows ${summary.rows}  age-eligible ${summary.ageEligible}  score-eligible ${summary.scoreEligible}`);
  console.log(`  age exact ${summary.ageExactPct ?? "n/a"}%  within 1 year ${summary.ageWithin1YearPct ?? "n/a"}%  (n=${summary.ageN})`);
  console.log(`  young vs mature (4.5+) ${summary.youngVsMaturePct ?? "n/a"}%`);
  console.log(`  score MAE ${summary.meanAbsoluteScoreError ?? "n/a"} in  error ${summary.meanScoreErrorPct ?? "n/a"}%  (n=${summary.scoreN})`);
  console.log(`  latency mean ${summary.meanLatencyMs ?? "n/a"} ms  p50 ${summary.p50LatencyMs ?? "n/a"} ms`);
}

async function main() {
  assertParse();
  const dryRun = has("--dry-run");
  const includeWeak = has("--include-weak");
  const baseline = has("--baseline");
  const limit = Number.parseInt(arg("--limit") ?? "0", 10);
  const proxy = arg("--proxy") ?? process.env.PROXY_URL ?? "";
  const token = process.env.DEERAGE_EVAL_TOKEN ?? "";

  const all = loadLabels();
  const isWeak = (flag: string) => flag.toLowerCase().startsWith("weak");
  let labels = includeWeak ? all : all.filter((label) => !isWeak(label.flag));
  if (limit > 0) labels = labels.slice(0, limit);

  const overall = emptyBucket();
  const byRegion = new Map<string, Bucket>();
  const byFence = new Map<string, Bucket>();
  const skipped: Array<{ id: string; reason: string }> = [];

  if (!dryRun && !proxy) {
    console.error("Set PROXY_URL or pass --proxy. Use --dry-run to check the harness without keys.");
    process.exit(1);
  }
  if (!dryRun && !token) {
    console.error("Set DEERAGE_EVAL_TOKEN so the proxy does not spend a free analysis.");
    process.exit(1);
  }

  for (const label of labels) {
    const blocksAge = /mount only|antlers only|no live body/i.test(label.flag);
    const ageEligible = RELIABLE_AGE.has(label.ageClass) && !blocksAge && (label.age.point != null || label.age.mature != null);
    const scoreEligible = OFFICIAL_SCORE.has(label.scoreClass) && (label.gross != null || label.net != null);
    let prediction: Prediction | null = null;
    if (dryRun) {
      if (!label.photoUrl) skipped.push({ id: label.id, reason: "no fetchable photo" });
    } else if (ageEligible || scoreEligible) {
      try {
        prediction = await predictRow(label, proxy, token, ageEligible, scoreEligible);
        if (prediction.error) skipped.push({ id: label.id, reason: prediction.error });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "request failed";
        skipped.push({ id: label.id, reason });
        prediction = { latencyMs: 0, error: reason };
      }
    }
    const regionBucket = byRegion.get(label.ecoregion) ?? emptyBucket();
    const fenceBucket = byFence.get(label.fenceType) ?? emptyBucket();
    addPrediction(regionBucket, label, prediction, ageEligible, scoreEligible);
    addPrediction(fenceBucket, label, prediction, ageEligible, scoreEligible);
    addPrediction(overall, label, prediction, ageEligible, scoreEligible);
    byRegion.set(label.ecoregion, regionBucket);
    byFence.set(label.fenceType, fenceBucket);
  }

  let baselineSummary = null;
  if (baseline && !dryRun) {
    const baselineBucket = emptyBucket();
    for (const label of labels) {
      const blocksAge = /mount only|antlers only|no live body/i.test(label.flag);
      const ageEligible = RELIABLE_AGE.has(label.ageClass) && !blocksAge && (label.age.point != null || label.age.mature != null);
      try {
        const prediction = await predict(label, proxy, token, "age", true);
        addPrediction(baselineBucket, label, prediction, ageEligible, false);
      } catch {
        skipped.push({ id: label.id, reason: "baseline failed" });
      }
    }
    baselineSummary = summarize(baselineBucket);
  }

  const regions = Object.fromEntries([...byRegion.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, bucket]) => [name, summarize(bucket)]));
  const fences = Object.fromEntries([...byFence.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, bucket]) => [name, summarize(bucket)]));
  const model = summarize(overall);
  const scorecard = {
    generatedAt: new Date().toISOString(),
    dryRun,
    includeWeak,
    labelsFile: "labels.csv",
    rowsInFile: all.length,
    rowsScored: labels.length,
    flaggedExcluded: includeWeak ? 0 : all.filter((label) => label.flag.toLowerCase().startsWith("weak")).length,
    ageClasses: [...RELIABLE_AGE],
    scoreClasses: [...OFFICIAL_SCORE],
    model,
    baseline: baselineSummary,
    byEcoregion: regions,
    byFenceType: fences,
    photos: "URLs in labels.csv are references only. This harness does not save image files.",
    skipped,
    releaseBar: dryRun ? {
      evaluated: false,
      note: "Dry run does not call the proxy. Young-vs-mature, score error, and latency are not measured.",
    } : {
      evaluated: true,
      youngVsMatureBeatsBaseline: baselineSummary && model.youngVsMaturePct != null && baselineSummary.youngVsMaturePct != null
        ? model.youngVsMaturePct >= baselineSummary.youngVsMaturePct
        : null,
      scoreErrorAtMost10Pct: model.meanScoreErrorPct != null ? model.meanScoreErrorPct <= 10 : null,
      meanLatencyAtMost20s: model.meanLatencyMs != null ? model.meanLatencyMs <= 20_000 : null,
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(scorecard, null, 2));
  console.log(`DeerAge eval ${dryRun ? "(dry run)" : ""}`);
  console.log(`labels ${all.length}, included ${labels.length}, flagged excluded ${scorecard.flaggedExcluded}`);
  printSummary("Overall", model);
  if (baselineSummary) printSummary("Baseline prompt", baselineSummary);
  console.log("\nBy ecoregion");
  for (const [name, summary] of Object.entries(regions)) {
    printSummary(name, summary);
  }
  console.log("\nBy fence type");
  for (const [name, summary] of Object.entries(fences)) {
    printSummary(name, summary);
  }
  if (skipped.length) console.log(`\nSkipped or failed: ${skipped.length}`);
  console.log(`\nWrote ${OUT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
