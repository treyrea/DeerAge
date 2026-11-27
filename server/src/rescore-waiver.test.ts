import assert from "node:assert/strict";
import test from "node:test";
import { setKvForTests, type Kv } from "./kv.js";
import { claimRescoreWaiver, releaseRescoreWaiver, saveRescoreTicket } from "./rescore-waiver.js";

function memoryKv(): Kv {
  const strings = new Map<string, string>();
  return {
    async command(args) {
      const [opRaw, keyRaw, value] = args;
      const op = String(opRaw).toUpperCase();
      const key = String(keyRaw ?? "");
      if (op === "GET") return strings.get(key) ?? null;
      if (op === "SET") {
        strings.set(key, String(value ?? ""));
        return "OK";
      }
      return null;
    },
    async pipeline() {
      return [];
    },
  };
}

test("one follow-up score of the same job is free, and a second one is not", async () => {
  setKvForTests(memoryKv());
  try {
    await saveRescoreTicket("job_abcdef0123456789", "hunter-1", 4);
    const first = await claimRescoreWaiver({ jobId: "job_abcdef0123456789", appUserId: "hunter-1", imageCount: 3 });
    const second = await claimRescoreWaiver({ jobId: "job_abcdef0123456789", appUserId: "hunter-1", imageCount: 3 });
    assert.equal(first, true);
    assert.equal(second, false);
    await releaseRescoreWaiver("job_abcdef0123456789");
    const again = await claimRescoreWaiver({ jobId: "job_abcdef0123456789", appUserId: "hunter-1", imageCount: 2 });
    assert.equal(again, true);
  } finally {
    setKvForTests(null);
  }
});

test("another hunter, a single photo, or a missing ticket still charges", async () => {
  setKvForTests(memoryKv());
  try {
    await saveRescoreTicket("job_abcdef0123456789", "hunter-1", 1);
    assert.equal(await claimRescoreWaiver({ jobId: "job_abcdef0123456789", appUserId: "hunter-2", imageCount: 3 }), false);
    assert.equal(await claimRescoreWaiver({ jobId: "job_abcdef0123456789", appUserId: "hunter-1", imageCount: 1 }), false);
    assert.equal(await claimRescoreWaiver({ jobId: "job_missing00000000", appUserId: "hunter-1", imageCount: 3 }), false);
    assert.equal(await claimRescoreWaiver({ jobId: "not-a-job", appUserId: "hunter-1", imageCount: 3 }), false);
  } finally {
    setKvForTests(null);
  }
});
