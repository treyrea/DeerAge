/**
 * End-to-end scan eval. Photos and keys stay outside the repo.
 *
 *   cd server
 *   AI_GATEWAY_API_KEY=... npx tsx eval/run.ts \
 *     --images /path/to/bucks --labels /path/to/labels.csv --out /tmp/eval-out.csv \
 *     --minimum 4.5
 *
 * Gemini alone:  --main-model google/gemini-4-carbon
 * Gemini plus Claude:  --ensemble google/gemini-4-carbon,anthropic/claude-fable-5.2
 *
 * CSV columns: file,ageYears,grossScore,minimum
 * A blank age or score cell skips that check. minimum overrides --minimum for that row.
 * Each row times out at 300s. A timeout is not retried.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runAgeCall } from "../src/age-pipeline.js";
import { runScoreCall } from "../src/score-pipeline.js";

interface LabelRow {
  file: string;
  ageYears: number | null;
  grossScore: number | null;
  minimum: number | null;
}

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function labelsFrom(csvPath: string): LabelRow[] {
  const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1);
  return lines.filter(Boolean).map((line) => {
    const [file, age, score, minimum] = line.split(",").map((cell) => cell.trim());
    return {
      file,
      ageYears: age ? Number(age) : null,
      grossScore: score ? Number(score) : null,
      minimum: minimum ? Number(minimum) : null,
    };
  });
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function main(): Promise<void> {
  const imagesDir = arg("--images");
  const labelsPath = arg("--labels");
  const outPath = arg("--out") || "eval-out.csv";
  const defaultMinimum = Number(arg("--minimum")) || 4.5;
  const mainModel = arg("--main-model");
  const ensemble = arg("--ensemble");
  if (mainModel) process.env.MAIN_MODEL = mainModel;
  if (ensemble) process.env.MAIN_ENSEMBLE = ensemble;
  if (!imagesDir || !labelsPath) {
    console.error("Usage: npx tsx eval/run.ts --images <folder> --labels <file.csv> --out <file.csv> [--minimum 4.5] [--main-model id] [--ensemble id,id]");
    process.exitCode = 1;
    return;
  }
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    console.error("Set AI_GATEWAY_API_KEY. Do not commit it.");
    process.exitCode = 1;
    return;
  }
  const known = new Set(readdirSync(imagesDir));
  const rows = labelsFrom(labelsPath);
  const written = ["file,expectedAge,minimum,fastAge,mainAge,bodyOnlyAge,fieldCall,expectedScore,gross,costUsd,ms,note"];
  for (const row of rows) {
    if (!known.has(row.file)) {
      written.push(`${row.file},,,,,,,,,,,"missing file"`);
      continue;
    }
    const minimum = row.minimum ?? defaultMinimum;
    const image = readFileSync(path.join(imagesDir, row.file)).toString("base64");
    const started = Date.now();
    let fast = "";
    let main = "";
    let body = "";
    let call = "";
    let gross = "";
    let cost = 0;
    let note = "";
    try {
      await withTimeout((async () => {
        if (row.ageYears != null) {
          const age = await runAgeCall(image, minimum);
          fast = String(age.readings.fast?.age ?? "");
          main = String(age.readings.main?.age ?? "");
          body = String(age.readings.bodyOnly?.age ?? "");
          call = String(age.result?.fieldCall ?? age.stop ?? "");
          cost += age.costs.reduce((sum, item) => sum + item.usd, 0);
          if (age.stop) note = age.stop;
        }
        if (row.grossScore != null) {
          const score = await runScoreCall([image]);
          cost += score.costs.reduce((sum, item) => sum + item.usd, 0);
          if (score.noDeer || !score.result) {
            note = note ? `${note}; not_deer` : "not_deer";
          } else {
            gross = String(score.result.grossScore ?? "");
            if (score.backup) note = note ? `${note}; backup score` : "backup score";
          }
        }
      })(), 300_000);
    } catch (error) {
      note = error instanceof Error ? error.message.replaceAll(",", " ") : "failed";
    }
    const ms = Date.now() - started;
    written.push([row.file, row.ageYears ?? "", minimum, fast, main, body, call, row.grossScore ?? "", gross, cost.toFixed(4), ms, `"${note}"`].join(","));
    console.log(written[written.length - 1]);
  }
  mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  writeFileSync(outPath, `${written.join("\n")}\n`);
  console.log(`Wrote ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Eval failed.");
  process.exitCode = 1;
});
