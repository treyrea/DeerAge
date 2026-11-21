import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultAgingConfig } from "./aging.js";
import { UpstreamError } from "../openai.js";
import { ageWithRouter } from "./age-with-router.js";
import { circuitNote, circuitOpen, resetCircuitsForTests } from "./circuit.js";
import { backupRange, resolveHydrogenAge } from "./failover.js";
import type { ModelCaller, WalkResult } from "./pipeline.js";

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

test("an unparsed walk uses the gateway range when the router is on", async () => {
  let backups = 0;
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    backupOnStop: true,
    circuitOpen: async () => false,
    note: async () => undefined,
    primary: async (): Promise<WalkResult> => ({ kind: "stop", reason: "unparsed quality" }),
    backup: async () => {
      backups += 1;
      return { estimatedAgeYears: 3.5 };
    },
  });
  assert.equal(backups, 1);
  assert.equal(resolved.kind, "age");
  if (resolved.kind === "age") {
    assert.equal(resolved.backup, true);
    assert.equal(resolved.result.ageLabel, "2.5–3.5");
    assert.match(String(resolved.result.fieldCallNote), /1-year range/);
  }
});

test("an unparsed walk stays a finished error when the router is off", async () => {
  let backups = 0;
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    backupOnStop: false,
    circuitOpen: async () => false,
    note: async () => undefined,
    primary: async (): Promise<WalkResult> => ({ kind: "stop", reason: "unparsed quality" }),
    backup: async () => {
      backups += 1;
      return { estimatedAgeYears: 3.5 };
    },
  });
  assert.equal(resolved.kind, "stop");
  assert.equal(backups, 0);
});

test("a walk failure with a plain age shows that age and skips the gateway", async () => {
  let backups = 0;
  let noted: boolean | null = null;
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    backupOnStop: true,
    circuitOpen: async () => false,
    note: async (ok) => {
      noted = ok;
    },
    primary: () => ageWithRouter({
      settings: { ...defaultAgingConfig(), plainPrompt: "PLAIN", crossCheckPrompt: "CROSS" },
      log: () => undefined,
      walk: async () => {
        throw new UpstreamError("Gemini 503", 503, true);
      },
      call: (async (prompt) => {
        if (prompt === "PLAIN") return { text: "He is a **3.5-year-old**." };
        throw new UpstreamError("Gemini 503", 503, true);
      }) as ModelCaller,
    }),
    backup: async () => {
      backups += 1;
      return { estimatedAgeYears: 4.5 };
    },
  });
  assert.equal(backups, 0);
  assert.equal(noted, true);
  assert.equal(resolved.kind, "age");
  if (resolved.kind === "age") {
    assert.equal(resolved.backup, false);
    assert.equal(resolved.result.ageLabel, "3.5");
    assert.equal(resolved.result.isRange, false);
    assert.equal(
      resolved.result.fieldCallNote,
      "Reads 3.5, under your lease minimum of 4.5. Let him walk. This is a field read from the photo, not a jawbone age.",
    );
  }
});

test("a walk failure with no plain age still uses the gateway and records the outage", async () => {
  let noted: boolean | null = null;
  const resolved = await resolveHydrogenAge({
    minimum: 4.5,
    backupOnStop: true,
    circuitOpen: async () => false,
    note: async (ok) => {
      noted = ok;
    },
    primary: () => ageWithRouter({
      settings: { ...defaultAgingConfig(), plainPrompt: "PLAIN", crossCheckPrompt: "CROSS" },
      log: () => undefined,
      walk: async () => {
        throw new UpstreamError("Gemini 503", 503, true);
      },
      call: async () => {
        throw new UpstreamError("Gemini 503", 503, true);
      },
    }),
    backup: async () => ({ estimatedAgeYears: 2.5 }),
  });
  assert.equal(noted, false);
  assert.equal(resolved.kind, "age");
  if (resolved.kind === "age") {
    assert.equal(resolved.backup, true);
    assert.equal(resolved.result.ageLabel, "1.5–2.5");
  }
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
