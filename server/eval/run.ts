/**
 * End-to-end scan eval. Point it at a folder of photos and a CSV of known ages.
 * Nothing in this folder is a photo or a key. Do not commit either.
 *
 *   cd server
 *   AI_GATEWAY_API_KEY=... npx tsx eval/run.ts --images ../photos --labels ../labels.csv --out ../eval-out.csv
 *
 * CSV columns: file, ageYears, grossScore
 * file is the image name inside --images. Leave ageYears or grossScore blank to skip that check.
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
}

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function labelsFrom(csvPath: string): LabelRow[] {
  const lines = readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1);
  return lines.filter(Boolean).map((line) => {
    const [file, age, score] = line.split(",").map((cell) => cell.trim());
    return {
      file,
      ageYears: age ? Number(age) : null,
      grossScore: score ? Number(score) : null,
    };
  });
}

async function fileBase64(filePath: string): Promise<string> {
  return readFileSync(filePath).toString("base64");
}

async function main(): Promise<void> {
  const imagesDir = arg("--images");
  const labelsPath = arg("--labels");
  const outPath = arg("--out") || "eval-out.csv";
  if (!imagesDir || !labelsPath) {
    console.error("Usage: npx tsx eval/run.ts --images <folder> --labels <file.csv> --out <file.csv>");
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
  const header = "file,expectedAge,fastAge,mainAge,bodyOnlyAge,fieldCall,expectedScore,gross,costUsd,ms,note";
  const written = [header];
  for (const row of rows) {
    if (!known.has(row.file)) {
      written.push(`${row.file},,,,,,,,,"missing file"`);
      continue;
    }
    const started = Date.now();
    const image = await fileBase64(path.join(imagesDir, row.file));
    let fast = "";
    let main = "";
    let body = "";
    let call = "";
    let gross = "";
    let cost = 0;
    let note = "";
    try {
      await Promise.race([
        (async () => {
      if (row.ageYears != null) {
        const age = await runAgeCall(image, 4.5);
        fast = String(age.readings.fast?.age ?? "");
        main = String(age.readings.main?.age ?? "");
        body = String(age.readings.bodyOnly?.age ?? "");
        call = String(age.result?.fieldCall ?? age.stop ?? "");
        cost += age.costs.reduce((sum, item) => sum + item.usd, 0);
        if (age.stop) note = age.stop;
      }
      if (row.grossScore != null) {
        const score = await runScoreCall([image]);
        gross = String(score.result.grossScore ?? "");
        cost += score.costs.reduce((sum, item) => sum + item.usd, 0);
        if (score.backup) note = note ? `${note}; backup score` : "backup score";
      }
        })(),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error("timeout")), 300_000)),
      ]);
    } catch (error) {
      note = error instanceof Error ? error.message.replaceAll(",", " ") : "failed";
    }
    const ms = Date.now() - started;
    written.push([row.file, row.ageYears ?? "", fast, main, body, call, row.grossScore ?? "", gross, cost.toFixed(4), ms, `"${note}"`].join(","));
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
