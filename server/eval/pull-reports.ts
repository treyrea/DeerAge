/**
 * Download consented wrong-call photos into a folder the eval harness can read.
 * Does not change how eval/run.ts scores a folder. Do not commit the photos.
 *
 *   cd server
 *   ADMIN_TOKEN=... DEERAGE_API_BASE_URL=https://<deerage-api> npx tsx eval/pull-reports.ts --out /tmp/deerage-cases
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

interface CaseImage {
  file: string;
  url: string;
}

interface ReportCase {
  id: string;
  file: string;
  ageYears: string;
  grossScore: string;
  images: CaseImage[];
}

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, "\"\"")}"` : value;
}

async function main(): Promise<void> {
  const base = (process.env.DEERAGE_API_BASE_URL || arg("--base")).replace(/\/$/, "");
  const token = process.env.ADMIN_TOKEN?.trim() ?? "";
  const out = arg("--out") || "report-cases";
  if (!base || !token) {
    console.error("Set DEERAGE_API_BASE_URL and ADMIN_TOKEN. Do not commit either.");
    process.exitCode = 1;
    return;
  }
  const listed = await fetch(`${base}/api/admin/report-cases`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listed.ok) {
    console.error(`The case list returned ${listed.status}.`);
    process.exitCode = 1;
    return;
  }
  const body = (await listed.json()) as { cases?: ReportCase[] };
  mkdirSync(out, { recursive: true });
  const rows = ["file,ageYears,grossScore"];
  for (const item of body.cases ?? []) {
    for (const image of item.images ?? []) {
      const download = await fetch(image.url.startsWith("http") ? image.url : `${base}${image.url}`);
      if (!download.ok) {
        console.error(`Skipped ${image.file}: ${download.status}`);
        continue;
      }
      const raw = Buffer.from(await download.text(), "base64");
      writeFileSync(path.join(out, image.file), raw);
      rows.push([csvCell(image.file), csvCell(item.ageYears ?? ""), csvCell(item.grossScore ?? "")].join(","));
      console.log(image.file);
    }
  }
  writeFileSync(path.join(out, "labels.csv"), `${rows.join("\n")}\n`);
  console.log(`Wrote ${path.join(out, "labels.csv")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not pull reports.");
  process.exitCode = 1;
});
