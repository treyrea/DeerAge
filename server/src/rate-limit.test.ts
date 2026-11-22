import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { allowBucket, setKvForTests, type Kv } from "./kv.js";
import { consumeRate, LimitStoreError, resetRateGatesForTests } from "./limits.js";
import { loadJob, resetJobPollGuardForTests, setJobClockForTests } from "./jobs.js";
import { handleJobStatus } from "./analyze.js";
import { ApiError } from "./wire.js";

class CountingKv implements Kv {
  readonly commands: (string | number)[][] = [];
  private values = new Map<string, string>();
  fail = false;

  async command(args: (string | number)[]): Promise<unknown> {
    this.commands.push(args);
    if (this.fail) throw new Error("redis down");
    const op = String(args[0]).toUpperCase();
    const key = String(args[1] ?? "");
    if (op === "GET") return this.values.get(key) ?? null;
    if (op === "INCR") {
      const next = (Number(this.values.get(key) ?? 0) || 0) + 1;
      this.values.set(key, String(next));
      return next;
    }
    if (op === "EXPIRE") return 1;
    return null;
  }

  async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const command of commands) results.push(await this.command(command));
    return results;
  }
}

afterEach(() => {
  resetRateGatesForTests();
  resetJobPollGuardForTests();
  setKvForTests(null);
});

test("a flood of rate checks writes one INCR and one EXPIRE, then stops calling Redis", async () => {
  const store = new CountingKv();
  const now = 1_700_000_000_000;
  let allowed = 0;
  for (let i = 0; i < 500; i += 1) {
    if (await consumeRate("deerage:rate:hunter:1", 8, 120, (commands) => store.pipeline(commands), now)) allowed += 1;
  }
  assert.equal(allowed, 8);
  const writes = store.commands.map((command) => String(command[0]));
  assert.deepEqual(writes, ["INCR", "EXPIRE"]);
});

test("a Redis failure is remembered so the next checks do not call Redis again", async () => {
  const store = new CountingKv();
  store.fail = true;
  const now = 1_700_000_000_000;
  await assert.rejects(
    () => consumeRate("deerage:rate:hunter:1", 8, 120, (commands) => store.pipeline(commands), now),
    LimitStoreError,
  );
  assert.equal(store.commands.length, 1);
  for (let i = 0; i < 100; i += 1) {
    await assert.rejects(
      () => consumeRate("deerage:rate:hunter:1", 8, 120, (commands) => store.pipeline(commands), now + 1000),
      LimitStoreError,
    );
  }
  assert.equal(store.commands.length, 1);
});

test("allowBucket denies from memory after the counter is known", async () => {
  const store = new CountingKv();
  setKvForTests(store);
  await allowBucket("feed", "hunter", 2);
  await allowBucket("feed", "hunter", 2);
  await assert.rejects(() => allowBucket("feed", "hunter", 2), (error: unknown) => {
    return error instanceof ApiError && error.status === 429;
  });
  assert.equal(store.commands.filter((command) => String(command[0]) === "INCR").length, 1);
});

test("job status does not INCR, and a poll burst reads Redis twice a second", async () => {
  const store = new CountingKv();
  setKvForTests(store);
  setJobClockForTests(() => 1_700_000_000_000);
  const id = "job_0123456789abcdef";
  const status = await handleJobStatus(id);
  assert.equal(status.status, 404);
  for (let i = 0; i < 9; i += 1) await loadJob(id);
  const ops = store.commands.map((command) => String(command[0]));
  assert.equal(ops.includes("INCR"), false);
  assert.equal(ops.includes("EXPIRE"), false);
  assert.equal(ops.filter((op) => op === "GET").length, 2);
});
