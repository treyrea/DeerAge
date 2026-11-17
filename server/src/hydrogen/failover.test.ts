import assert from "node:assert/strict";
import { test } from "node:test";
import { UpstreamError } from "../openai.js";
import { circuitNote, circuitOpen, resetCircuitsForTests } from "./circuit.js";
import { backupRange, resolveHydrogenAge } from "./failover.js";
import type { WalkResult } from "./pipeline.js";

test("a backup age is an honest range around the point estimate", () => {
  assert.deepEqual(backupRange(4.5), { low: 3.5, high: 4.5, label: "3.5–4.5" });
  assert.equal(backupRange(5.5).label, "4.5–5.5+");
  assert.equal(backupRange(1.5).label, "1.5–2.5");
});

test("a forced primary outage uses the backup and marks it", async () => {
  resetCircuitsForTests();
  const logs: string[] = [];
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    circuitOpen: async () => false,
    note: async () => undefined,
    log: (event) => logs.push(String(event.event)),
    primary: async () => {
      throw new UpstreamError("Gemini 503", 503, true);
    },
    backup: async () => ({ estimatedAgeYears: 4.5, ageClass: "4.5" }),
  });
  assert.equal(resolved.kind, "age");
  if (resolved.kind === "age") {
    assert.equal(resolved.backup, true);
    assert.equal(resolved.result.pipeline, "backup");
    assert.equal(resolved.result.ageLabel, "3.5–4.5");
    assert.equal(resolved.result.isRange, true);
    assert.equal(resolved.result.fieldCall, "BORDERLINE");
  }
  assert.ok(logs.includes("provider_error"));
  assert.ok(logs.includes("provider_fallback"));
});

test("a retake does not call the backup", async () => {
  let backupCalls = 0;
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    circuitOpen: async () => false,
    note: async () => undefined,
    primary: async (): Promise<WalkResult> => ({ kind: "retake", message: "Try a side-on shot.", fails: ["view_angle"] }),
    backup: async () => {
      backupCalls += 1;
      return { estimatedAgeYears: 4.5 };
    },
  });
  assert.equal(resolved.kind, "retake");
  assert.equal(backupCalls, 0);
});

test("three failures open the circuit and a later success closes it", async () => {
  resetCircuitsForTests();
  assert.equal(await circuitOpen("gemini", 1_000), false);
  await circuitNote("gemini", false, 1_000);
  await circuitNote("gemini", false, 1_000);
  assert.equal(await circuitOpen("gemini", 1_000), false);
  await circuitNote("gemini", false, 1_000);
  assert.equal(await circuitOpen("gemini", 1_000), true);
  assert.equal(await circuitOpen("gemini", 1_000 + 60_000), false);
  await circuitNote("gemini", true, 2_000);
  assert.equal(await circuitOpen("gemini", 2_000), false);
});

test("an open circuit skips the primary", async () => {
  let primaryCalls = 0;
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    circuitOpen: async () => true,
    note: async () => undefined,
    primary: async () => {
      primaryCalls += 1;
      return { kind: "age", label: "4.5", low: 4.5, high: 4.5, isRange: false, hunterCue: "", reason: "" };
    },
    backup: async () => ({ estimatedAgeYears: 2.5 }),
  });
  assert.equal(primaryCalls, 0);
  assert.equal(resolved.kind, "age");
  if (resolved.kind === "age") assert.equal(resolved.result.ageLabel, "1.5–2.5");
});
