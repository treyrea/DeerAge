import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { setSegmentLookupForTests } from "./content.js";
import { route, type Incoming } from "./http.js";
import { setKvForTests, type Kv } from "./kv.js";
import type { Outgoing } from "./wire.js";

class MemoryKv implements Kv {
  private strings = new Map<string, string>();
  private hashes = new Map<string, Map<string, number>>();
  private sets = new Map<string, Set<string>>();

  async command(args: (string | number)[]): Promise<unknown> {
    const [opRaw, ...rest] = args;
    const op = String(opRaw).toUpperCase();
    const key = rest[0] == null ? "" : String(rest[0]);
    if (op === "GET") return this.strings.get(key) ?? null;
    if (op === "SET") {
      const nx = rest.slice(2).some((part) => String(part).toUpperCase() === "NX");
      if (nx && this.strings.has(key)) return null;
      this.strings.set(key, String(rest[1] ?? ""));
      return "OK";
    }
    if (op === "DEL") {
      this.strings.delete(key);
      this.hashes.delete(key);
      this.sets.delete(key);
      return 1;
    }
    if (op === "INCR") {
      const next = (Number(this.strings.get(key) ?? 0) || 0) + 1;
      this.strings.set(key, String(next));
      return next;
    }
    if (op === "EXPIRE") return 1;
    if (op === "HINCRBY") {
      const field = String(rest[1] ?? "");
      const hash = this.hashes.get(key) ?? new Map<string, number>();
      const next = (hash.get(field) ?? 0) + Number(rest[2] ?? 1);
      hash.set(field, next);
      this.hashes.set(key, hash);
      return next;
    }
    if (op === "HGETALL") {
      const hash = this.hashes.get(key);
      if (!hash) return {};
      return Object.fromEntries([...hash.entries()].map(([field, count]) => [field, String(count)]));
    }
    if (op === "SADD") {
      const set = this.sets.get(key) ?? new Set<string>();
      set.add(String(rest[1] ?? ""));
      this.sets.set(key, set);
      return 1;
    }
    if (op === "SREM") {
      this.sets.get(key)?.delete(String(rest[1] ?? ""));
      return 1;
    }
    if (op === "SMEMBERS") return [...(this.sets.get(key) ?? new Set<string>())];
    throw new Error(`unsupported ${op}`);
  }

  async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const command of commands) results.push(await this.command(command));
    return results;
  }
}

const ADMIN = { authorization: "Bearer admin-test-token" };

function request(method: string, url: string, body?: unknown, headers?: Record<string, string>): Incoming {
  return { method, url, headers: headers ?? {}, body };
}

function payload(result: Outgoing): Record<string, any> {
  return (result.body ?? {}) as Record<string, any>;
}

describe("community endpoints", { concurrency: 1 }, () => {
  beforeEach(() => {
    setKvForTests(new MemoryKv());
    setSegmentLookupForTests(async (id) => (id.startsWith("sub_") ? "subscriber" : "free"));
    process.env.ADMIN_TOKEN = "admin-test-token";
    process.env.FEED_RATE_LIMIT_PER_MINUTE = "1000";
    process.env.VOTE_RATE_LIMIT_PER_MINUTE = "1000";
    process.env.PUSH_TOKEN_RATE_LIMIT_PER_MINUTE = "1000";
    process.env.EMAIL_RATE_LIMIT_PER_MINUTE = "1000";
    process.env.ADMIN_RATE_LIMIT_PER_MINUTE = "1000";
  });

  test("feed shows published announcements and hides drafts and closed items", async () => {
    const draft = await route(request("POST", "/api/admin/announcements", {
      title: "Draft note",
      body: "Not ready",
      status: "draft",
    }, ADMIN));
    assert.equal(draft.status, 200);
    const published = await route(request("POST", "/api/admin/announcements", {
      title: "Season Pass is here",
      body: "Your current plan keeps full access.",
      status: "published",
    }, ADMIN));
    assert.equal(published.status, 200);
    const live = await route(request("GET", "/api/feed"));
    assert.equal(live.status, 200);
    assert.deepEqual(payload(live).announcements.map((item: { title: string }) => item.title), ["Season Pass is here"]);

    const closed = await route(request("PATCH", "/api/admin/announcements", {
      id: payload(published).announcement.id,
      status: "closed",
    }, ADMIN));
    assert.equal(closed.status, 200);
    const after = await route(request("GET", "/api/feed"));
    assert.equal(payload(after).announcements.length, 0);
  });

  test("one vote per app user, split by subscriber and free", async () => {
    const created = await route(request("POST", "/api/admin/polls", {
      question: "What should we build next?",
      options: ["Rut timing", "Herd photos"],
    }, ADMIN));
    const poll = payload(created).poll;
    const first = poll.options[0].id as string;
    const second = poll.options[1].id as string;

    const vote = await route(request("POST", "/api/poll-vote", {
      appUserId: "sub_hunter_1",
      pollId: poll.id,
      optionId: first,
    }));
    assert.equal(vote.status, 200);
    assert.equal(payload(vote).segment, "subscriber");
    assert.equal(payload(vote).alreadyVoted, false);

    const again = await route(request("POST", "/api/poll-vote", {
      appUserId: "sub_hunter_1",
      pollId: poll.id,
      optionId: first,
    }));
    assert.equal(again.status, 200);
    assert.equal(payload(again).alreadyVoted, true);

    const changed = await route(request("POST", "/api/poll-vote", {
      appUserId: "sub_hunter_1",
      pollId: poll.id,
      optionId: second,
    }));
    assert.equal(changed.status, 409);
    assert.equal(payload(changed).code, "already_voted");

    const free = await route(request("POST", "/api/poll-vote", {
      appUserId: "free_hunter_1",
      pollId: poll.id,
      optionId: second,
    }));
    assert.equal(free.status, 200);
    assert.equal(payload(free).segment, "free");

    const results = await route(request("GET", `/api/admin/poll-results?pollId=${poll.id}`, undefined, ADMIN));
    assert.equal(results.status, 200);
    const rows = payload(results).results as { id: string; subscriber: number; free: number }[];
    assert.equal(rows.find((row) => row.id === first)?.subscriber, 1);
    assert.equal(rows.find((row) => row.id === first)?.free, 0);
    assert.equal(rows.find((row) => row.id === second)?.free, 1);
    assert.equal(payload(results).totalVotes, 2);

    const feed = await route(request("GET", "/api/feed?appUserId=sub_hunter_1"));
    assert.equal(payload(feed).polls[0].myVote, first);

    const shut = await route(request("PATCH", "/api/admin/polls", { id: poll.id, status: "closed" }, ADMIN));
    assert.equal(shut.status, 200);
    const late = await route(request("POST", "/api/poll-vote", {
      appUserId: "free_hunter_2",
      pollId: poll.id,
      optionId: first,
    }));
    assert.equal(late.status, 404);
  });

  test("admin routes fail closed without a token", async () => {
    delete process.env.ADMIN_TOKEN;
    const unconfigured = await route(request("GET", "/api/admin/announcements", undefined, ADMIN));
    assert.equal(unconfigured.status, 503);
    process.env.ADMIN_TOKEN = "admin-test-token";
    const denied = await route(request("GET", "/api/admin/announcements"));
    assert.equal(denied.status, 401);
  });

  test("email opt-in validates, stores consent, and unsubscribes", async () => {
    const bad = await route(request("POST", "/api/email-optin", {
      appUserId: "free_mail_user",
      email: "not-an-email",
    }));
    assert.equal(bad.status, 400);

    const saved = await route(request("POST", "/api/email-optin", {
      appUserId: "free_mail_user",
      email: "Hunter@Example.com",
    }));
    assert.equal(saved.status, 200);
    assert.equal(payload(saved).email, "hunter@example.com");
    const token = payload(saved).unsubscribeToken as string;
    assert.match(token, /^[a-f0-9]{48}$/);

    const optedOut = await route(request("POST", "/api/email-unsubscribe", { token }));
    assert.equal(optedOut.status, 200);

    const csv = await route(request("GET", "/api/admin/emails", undefined, ADMIN));
    assert.equal(csv.status, 200);
    assert.match(csv.text ?? "", /hunter@example.com/);
    const fields = (csv.text ?? "").trim().split("\n")[1]?.split(",") ?? [];
    assert.equal(fields.length, 6);
    assert.equal(fields[0], "free_mail_user");
    assert.equal(fields[1], "hunter@example.com");
    assert.match(fields[3] ?? "", /^20/);
  });

  test("push registration supports a dry-run count and drops dead tokens", async () => {
    const subscriber = await route(request("POST", "/api/push-token", {
      appUserId: "sub_push_user",
      token: "ExponentPushToken[subToken1]",
      enabled: true,
    }));
    assert.equal(subscriber.status, 200);
    assert.equal(payload(subscriber).segment, "subscriber");
    const free = await route(request("POST", "/api/push-token", {
      appUserId: "free_push_user",
      token: "ExponentPushToken[freeToken1]",
      enabled: true,
    }));
    assert.equal(free.status, 200);

    const counted = await route(request("POST", "/api/admin/push", {
      audience: "subscriber",
      dryRun: true,
    }, ADMIN));
    assert.equal(counted.status, 200);
    assert.equal(payload(counted).dryRun, true);
    assert.equal(payload(counted).matched, 1);
    assert.equal(payload(counted).subscriber, 1);
    assert.equal(payload(counted).free, 1);

    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
    try {
      const sent = await route(request("POST", "/api/admin/push", {
        audience: "free",
        title: "New poll",
        body: "Vote on what is next.",
      }, ADMIN));
      assert.equal(sent.status, 200);
      assert.equal(payload(sent).sent, 0);
      assert.equal(payload(sent).removed, 1);
    } finally {
      globalThis.fetch = original;
    }

    const after = await route(request("POST", "/api/admin/push", { audience: "free", dryRun: true }, ADMIN));
    assert.equal(payload(after).matched, 0);
  });

  test("public feed is rate limited", async () => {
    process.env.FEED_RATE_LIMIT_PER_MINUTE = "2";
    const first = await route(request("GET", "/api/feed?appUserId=free_rate_user"));
    const second = await route(request("GET", "/api/feed?appUserId=free_rate_user"));
    const third = await route(request("GET", "/api/feed?appUserId=free_rate_user"));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.equal(payload(third).code, "rate_limited");
  });
});
