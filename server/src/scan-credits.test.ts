import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { route, type Incoming } from "./http.js";
import { setKvForTests, type Kv } from "./kv.js";
import { readCredits, setPackLookupForTests, takeScanAllowance, type ListedPurchase } from "./scan-credits.js";

class MemoryKv implements Kv {
  private strings = new Map<string, string>();

  async command(args: (string | number)[]): Promise<unknown> {
    const [opRaw, ...rest] = args;
    const op = String(opRaw).toUpperCase();
    const key = String(rest[0] ?? "");
    if (op === "GET") return this.strings.get(key) ?? null;
    if (op === "SET") {
      const nx = rest.slice(2).some((part) => String(part).toUpperCase() === "NX");
      if (nx && this.strings.has(key)) return null;
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

const pack = (productId: string, canonical: string, aliases: string[] = [canonical]): ListedPurchase => ({ productId, canonical, aliases });

function post(url: string, body: unknown): Incoming {
  return { method: "POST", url, headers: {}, body };
}

beforeEach(() => {
  setKvForTests(new MemoryKv());
  setPackLookupForTests(async () => []);
  process.env.SCAN_CREDIT_RATE_LIMIT_PER_MINUTE = "1000";
});

test("a confirmed 10-pack adds 10 credits and the same transaction does not add them again", async () => {
  setPackLookupForTests(async () => [pack("deerage_scans_10", "txn-10", ["txn-10", "alias-10"])]);
  const first = await route(post("/api/scan-credits", { appUserId: "hunter-1", productId: "deerage_scans_10", transactionId: "alias-10" }));
  assert.equal(first.status, 200);
  assert.equal((first.body as { credits: number; added: number; already: boolean }).credits, 10);
  assert.equal((first.body as { added: number }).added, 10);
  const second = await route(post("/api/scan-credits", { appUserId: "hunter-1", productId: "deerage_scans_10", transactionId: "txn-10" }));
  assert.equal(second.status, 200);
  assert.equal((second.body as { credits: number; already: boolean }).credits, 10);
  assert.equal((second.body as { already: boolean }).already, true);
  assert.equal(await readCredits("hunter-1"), 10);
});

test("a purchase RevenueCat does not list adds nothing", async () => {
  const result = await route(post("/api/scan-credits", { appUserId: "hunter-1", productId: "deerage_scans_30", transactionId: "made-up" }));
  assert.equal(result.status, 400);
  assert.equal(await readCredits("hunter-1"), 0);
});

test("restore adds each confirmed pack once", async () => {
  setPackLookupForTests(async () => [
    pack("deerage_scans_10", "txn-10"),
    pack("deerage_scans_30", "txn-30"),
  ]);
  const first = await route(post("/api/scan-credits-restore", { appUserId: "hunter-1" }));
  assert.equal((first.body as { credits: number; added: number }).credits, 40);
  assert.equal((first.body as { added: number }).added, 40);
  const second = await route(post("/api/scan-credits-restore", { appUserId: "hunter-1" }));
  assert.equal((second.body as { credits: number; added: number }).added, 0);
  assert.equal((second.body as { credits: number }).credits, 40);
});

test("a credit is spent before a free scan, and a subscriber does not spend one", async () => {
  setPackLookupForTests(async () => [pack("deerage_scans_10", "txn-10")]);
  await route(post("/api/scan-credits", { appUserId: "hunter-1", productId: "deerage_scans_10", transactionId: "txn-10" }));
  assert.equal(await takeScanAllowance({ appUserId: "hunter-1", entitled: false, freeUsesRemaining: 3 }), "credit");
  assert.equal(await readCredits("hunter-1"), 9);
  assert.equal(await takeScanAllowance({ appUserId: "hunter-1", entitled: true, freeUsesRemaining: 0 }), "subscriber");
  assert.equal(await readCredits("hunter-1"), 9);
  for (let i = 0; i < 9; i += 1) {
    assert.equal(await takeScanAllowance({ appUserId: "hunter-1", entitled: false, freeUsesRemaining: 3 }), "credit");
  }
  assert.equal(await readCredits("hunter-1"), 0);
  assert.equal(await takeScanAllowance({ appUserId: "hunter-1", entitled: false, freeUsesRemaining: 2 }), "free");
  assert.equal(await takeScanAllowance({ appUserId: "hunter-1", entitled: false, freeUsesRemaining: 0 }), "blocked");
});
