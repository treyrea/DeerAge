import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { setKvForTests, type Kv } from "./kv.js";
import { issueRecord, handleVerifyRecord } from "./record.js";
import type { Incoming } from "./wire.js";

class MemoryKv implements Kv {
  private strings = new Map<string, string>();

  async command(args: (string | number)[]): Promise<unknown> {
    const [opRaw, ...rest] = args;
    const op = String(opRaw).toUpperCase();
    const key = rest[0] == null ? "" : String(rest[0]);
    if (op === "GET") return this.strings.get(key) ?? null;
    if (op === "SET") {
      this.strings.set(key, String(rest[1] ?? ""));
      return "OK";
    }
    if (op === "INCR") {
      const next = (Number(this.strings.get(key) ?? 0) || 0) + 1;
      this.strings.set(key, String(next));
      return next;
    }
    if (op === "EXPIRE") return 1;
    throw new Error(`unsupported ${op}`);
  }

  async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const command of commands) results.push(await this.command(command));
    return results;
  }
}

let memory: MemoryKv;

beforeEach(() => {
  memory = new MemoryKv();
  setKvForTests(memory);
  process.env.RECORD_SIGNING_SECRET = "test-record-secret";
  process.env.VERIFY_RATE_LIMIT_PER_MINUTE = "1000";
});

test("a signed record verifies, and a swapped hash does not", async () => {
  const receipt = await issueRecord({
    appUserId: "free_record_user",
    images: ["photo-a", "photo-b"],
    mode: "age",
    minimum: 4.5,
    result: {
      ageClass: "4.5",
      estimatedAge: "4.5-5.5 years",
      overallConfidence: 80,
      fieldCall: "SHOOTER",
      fieldCallNote: "Reads 4.5, at or above your lease minimum of 4.5.",
      cueBullets: [{ area: "Neck", text: "Blends into the chest" }],
      leaseMinimum: 4.5,
    },
  });
  assert.ok(receipt);
  const checked = await handleVerifyRecord({
    method: "GET",
    url: `/api/verify-record?id=${receipt.id}&json=1`,
    headers: {},
  } satisfies Incoming);
  assert.equal(checked.status, 200);
  const body = checked.body as { valid: boolean; serverTime: string; summary: { fieldCall: string } };
  assert.equal(body.valid, true);
  assert.equal(body.serverTime, receipt.serverTime);
  assert.equal(body.summary.fieldCall, "SHOOTER");
  const stored = String(await memory.command(["GET", `deerage:record:${receipt.id}`]));
  assert.equal(stored.includes("photo-a"), false);
  assert.equal(stored.includes("photo-b"), false);

  const tampered = JSON.parse(stored) as { signature: string };
  tampered.signature = "0".repeat(tampered.signature.length);
  await memory.command(["SET", `deerage:record:${receipt.id}`, JSON.stringify(tampered)]);
  const broken = await handleVerifyRecord({
    method: "GET",
    url: `/api/verify-record?id=${receipt.id}&json=1`,
    headers: {},
  });
  assert.equal((broken.body as { valid: boolean }).valid, false);

  const missing = await handleVerifyRecord({
    method: "GET",
    url: "/api/verify-record?id=rec_0000000000000000&json=1",
    headers: {},
  });
  assert.equal(missing.status, 404);
});

test("without a signing secret the analysis receipt is empty", async () => {
  delete process.env.RECORD_SIGNING_SECRET;
  const receipt = await issueRecord({
    appUserId: "free_record_user",
    images: ["photo-a"],
    mode: "quick",
    minimum: 4.5,
    result: { ageClass: "2.5", fieldCall: "LET WALK", confidence: 80 },
  });
  assert.equal(receipt, null);
});
