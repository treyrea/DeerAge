import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { runAnalysis } from "./analyze.js";
import { setKvForTests, type Kv } from "./kv.js";
import { consumeCredit, readCredits, returnCredit } from "./scan-credits.js";
import { backoffMs, withBackoff } from "./retry.js";

class MemoryKv implements Kv {
  private strings = new Map<string, string>();

  async command(args: (string | number)[]): Promise<unknown> {
    const [opRaw, ...rest] = args;
    const op = String(opRaw).toUpperCase();
    const key = String(rest[0] ?? "");
    if (op === "GET") return this.strings.get(key) ?? null;
    if (op === "SET") {
      this.strings.set(key, String(rest[1] ?? ""));
      return "OK";
    }
    if (op === "INCRBY") {
      const next = (Number(this.strings.get(key) ?? 0) || 0) + Number(rest[1] ?? 0);
      this.strings.set(key, String(next));
      return next;
    }
    if (op === "INCR") {
      const next = (Number(this.strings.get(key) ?? 0) || 0) + 1;
      this.strings.set(key, String(next));
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

beforeEach(() => {
  setKvForTests(new MemoryKv());
});

test("a bad analyze body is rejected before a model call", async () => {
  const missingMode = await runAnalysis({}, { evalToken: "" });
  assert.equal(missingMode.status, 400);
  assert.equal((missingMode.body as { code: string }).code, "invalid_request");

  const badImages = await runAnalysis({ mode: "age", appUserId: "hunter", images: ["short"] }, { evalToken: "" });
  assert.equal(badImages.status, 400);
});

test("a spent credit is returned when the scan fails", async () => {
  const store = new MemoryKv();
  setKvForTests(store);
  await store.command(["SET", "deerage:scancredit:hunter", "2"]);
  assert.equal(await consumeCredit("hunter"), true);
  assert.equal(await readCredits("hunter"), 1);
  await returnCredit("hunter");
  assert.equal(await readCredits("hunter"), 2);
});

test("retries wait 200ms then 400ms and stop on a timeout", async () => {
  assert.deepEqual([backoffMs(0), backoffMs(1), backoffMs(2)], [200, 400, 800]);
  const waits: number[] = [];
  let calls = 0;
  await assert.rejects(
    () => withBackoff(
      async () => {
        calls += 1;
        const error = new Error("timed out");
        error.name = "AbortError";
        throw error;
      },
      {
        attempts: 3,
        sleep: async (ms) => {
          waits.push(ms);
        },
        retryable: (error) => error instanceof Error && error.name === "AbortError",
      },
    ),
    /timed out/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(waits, [200, 400]);
});
