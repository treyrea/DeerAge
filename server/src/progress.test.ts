import assert from "node:assert/strict";
import test from "node:test";
import { loadJob, saveJob, saveProgress, type ScanJob } from "./jobs.js";
import { CALL_MEDIAN_MS, ageEtaMs, ageProgress, expectedClosersFrom, initialProgress, walkRemainingMs, type ScanProgress } from "./progress.js";

test("expected closers follow the logged stop rates", () => {
  assert.ok(Math.abs(expectedClosersFrom(0) - 2.49) < 0.02);
  assert.ok(Math.abs(expectedClosersFrom(2) - 1.13) < 0.01);
  assert.equal(expectedClosersFrom(3), 1);
});

test("time left only shrinks as the walk moves forward", () => {
  const steps = [
    walkRemainingMs({ step: "quality" }),
    walkRemainingMs({ step: "gate" }),
    walkRemainingMs({ step: "stepA" }),
    walkRemainingMs({ step: "closer", index: 0 }),
    walkRemainingMs({ step: "closer", index: 1 }),
    walkRemainingMs({ step: "closer", index: 2 }),
    walkRemainingMs({ step: "closer", index: 3 }),
  ];
  for (let i = 1; i < steps.length; i += 1) assert.ok(steps[i] < steps[i - 1], `step ${i}`);
});

test("when the walk is done the cross-check sets the time left", () => {
  const eta = ageEtaMs({ walk: "done", crossCheckStartedAt: 0, now: 10_000 });
  assert.equal(eta, CALL_MEDIAN_MS.crossCheck - 10_000 + CALL_MEDIAN_MS.finish);
  assert.equal(ageEtaMs({ walk: "done", crossCheckStartedAt: null, now: 10_000 }), CALL_MEDIAN_MS.finish);
});

test("age progress stages: photo, body, cross-check, finishing", () => {
  let clock = 1_000;
  const seen: ScanProgress[] = [];
  const tracker = ageProgress((p) => seen.push(p), { startedAt: 1_000, now: () => clock });
  tracker.walkStep({ step: "quality" });
  clock += 6_000;
  tracker.walkStep({ step: "gate" });
  tracker.walkStep({ step: "stepA" });
  tracker.walkDone();
  tracker.crossCheckDone();
  assert.deepEqual(seen.map((p) => p.stage), ["photo", "body", "body", "crosscheck", "finishing"]);
  assert.ok(seen.every((p) => p.startedAt === 1_000 && p.etaMs > 0));
});

test("initial progress per kind", () => {
  assert.equal(initialProgress("plain", 5).etaMs, CALL_MEDIAN_MS.plain + CALL_MEDIAN_MS.finish);
  assert.equal(initialProgress("score", 5).stage, "photo");
  assert.ok(initialProgress("age", 5).etaMs > 20_000);
});

test("a late progress write never overwrites a finished job", async () => {
  const job: ScanJob = { id: "job_00000000000000aa", status: "running", mode: "age", provisional: null, final: null, error: null, progress: initialProgress("age", 1) };
  await saveJob(job);
  saveProgress(job, { stage: "body", etaMs: 9_000, startedAt: 1, at: 2 });
  assert.equal((await loadJob(job.id))?.progress?.stage, "body");
  await saveJob({ ...job, status: "done", final: { ok: true } });
  saveProgress(job, { stage: "finishing", etaMs: 1_000, startedAt: 1, at: 3 });
  await saveJob({ ...job, provisional: { note: "late" } });
  const after = await loadJob(job.id);
  assert.equal(after?.status, "done");
});

test("parallel walk estimates are shorter and count down inside a batch", () => {
  const sequential = walkRemainingMs({ step: "quality" });
  const parallel = walkRemainingMs({ step: "quality", parallel: true });
  assert.ok(parallel < sequential);
  assert.ok(walkRemainingMs({ step: "closer", index: 0, parallel: true }, 5_000) < walkRemainingMs({ step: "closer", index: 0, parallel: true }, 0));
  assert.equal(walkRemainingMs({ step: "closer", index: 2, parallel: true }, 60_000), 0);
});
