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
    if (op === "INCRBYFLOAT") {
      const next = (Number(this.strings.get(key) ?? 0) || 0) + Number(rest[1] ?? 0);
      this.strings.set(key, String(next));
      return next;
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

  test("remote config edits flags and copy and keeps the old minVersion field", async () => {
    const saved = await route(request("PATCH", "/api/admin/config", {
      seasonalBanner: "The rut is on",
      paywallHeadline: "A season of reads",
      flags: { shootOrPass: false },
      homeTips: ["Broadside, whole body"],
    }, ADMIN));
    assert.equal(saved.status, 200);
    const config = await route(request("GET", "/api/config"));
    assert.equal(config.status, 200);
    assert.equal(payload(config).minVersion, "1.0.8");
    assert.equal(payload(config).copy.seasonalBanner, "The rut is on");
    assert.equal(payload(config).copy.paywallHeadline, "A season of reads");
    assert.equal(payload(config).flags.shootOrPass, false);
    assert.equal(payload(config).flags.feed, true);
  });

  test("a harvest is stored once per scan and exports as CSV", async () => {
    const marked = await route(request("POST", "/api/harvest", {
      appUserId: "free_harvest_user",
      scanId: "scan_1",
      harvested: true,
    }));
    assert.equal(marked.status, 200);
    const aged = await route(request("POST", "/api/harvest", {
      appUserId: "free_harvest_user",
      scanId: "scan_1",
      confirmedAge: "4.5",
      method: "jawbone",
      notes: "Incisors worn",
    }));
    assert.equal(payload(aged).harvest.confirmedAge, "4.5");
    assert.equal(payload(aged).harvest.method, "jawbone");
    const csv = await route(request("GET", "/api/admin/harvests", undefined, ADMIN));
    assert.equal(csv.status, 200);
    assert.match(csv.text ?? "", /free_harvest_user,scan_1,yes/);
    assert.match(csv.text ?? "", /4\.5,jawbone,Incisors worn/);
    const feedback = await route(request("GET", "/api/admin/feedback?format=csv", undefined, ADMIN));
    assert.equal(feedback.status, 200);
    assert.match(feedback.text ?? "", /harvest_age/);
    assert.match(feedback.text ?? "", /4\.5/);
  });

  test("a wrong-call report is stored with the scan id", async () => {
    const saved = await route(request("POST", "/api/call-report", {
      appUserId: "free_report_user",
      scanId: "scan_wrong",
      kind: "wrong_call",
      fieldCall: "SHOOTER",
      reportedAge: "2.5",
      jawboneAged: true,
      note: "Jaw said 2.5",
      photoBase64: "a".repeat(200_000),
    }));
    assert.equal(saved.status, 200);
    assert.equal(payload(saved).scanId, "scan_wrong");
    assert.equal(payload(saved).photoStored, false);
    const csv = await route(request("GET", "/api/admin/feedback?format=csv", undefined, ADMIN));
    assert.match(csv.text ?? "", /scan_wrong,wrong_call,SHOOTER,2\.5,yes/);
  });

  test("a follow-up email is optional, validated, and hidden unless requested", async () => {
    const bad = await route(request("POST", "/api/call-report", {
      appUserId: "free_mail_user",
      scanId: "scan_mail",
      kind: "wrong_call",
      fieldCall: "LET WALK",
      followUpEmail: "not-an-email",
    }));
    assert.equal(bad.status, 400);
    const saved = await route(request("POST", "/api/call-report", {
      appUserId: "free_mail_user",
      scanId: "scan_mail",
      kind: "cancel_reason",
      note: "Only hunt in the fall",
      followUpEmail: "Hunter@Example.com",
    }));
    assert.equal(saved.status, 200);
    const hidden = await route(request("GET", "/api/admin/feedback", undefined, ADMIN));
    const reports = payload(hidden).reports as Array<Record<string, unknown>>;
    const row = reports.find((item) => item.scanId === "scan_mail");
    assert.equal(row?.hasEmail, true);
    assert.equal(row?.cancelReason, true);
    assert.equal("email" in (row ?? {}), false);
    const shown = await route(request("GET", "/api/admin/feedback?includeContact=1", undefined, ADMIN));
    const visible = (payload(shown).reports as Array<Record<string, unknown>>).find((item) => item.scanId === "scan_mail");
    assert.equal(visible?.email, "hunter@example.com");
    const later = await route(request("GET", `/api/admin/feedback?since=${encodeURIComponent("2099-01-01T00:00:00.000Z")}`, undefined, ADMIN));
    assert.equal((payload(later).reports as unknown[]).length, 0);
  });

  test("consent keeps a photo, a reply can offer one free re-scan, and a wrong answer reopens it", async () => {
    const { setRescanRunnerForTests } = await import("./report-rescan.js");
    setRescanRunnerForTests(async () => ({
      stop: null,
      provisional: { fieldCall: "HOLD", note: "", ageClass: "" },
      readings: { fast: null, main: null, bodyOnly: null },
      costs: [],
      result: { fieldCall: "LET WALK", ageYears: 2.5, fieldCallNote: "Reads 2.5." },
    }));
    const saved = await route(request("POST", "/api/call-report", {
      appUserId: "free_keep_user",
      scanId: "scan_keep",
      kind: "wrong_call",
      fieldCall: "SHOOTER",
      reportedAge: "2.5",
      scanImages: ["aGVsbG8="],
      resultSnapshot: { ageYears: 5.5, leaseMinimum: 4.5, grossScore: 140 },
    }));
    assert.equal(saved.status, 200);
    assert.equal(payload(saved).imagesKept, 1);
    const id = payload(saved).id as string;
    const cases = await route(request("GET", "/api/admin/report-cases", undefined, ADMIN));
    const item = (payload(cases).cases as Array<{ id: string; ageYears: string; grossScore: string; images: Array<{ url: string }> }>).find((row) => row.id === id);
    assert.equal(item?.ageYears, "2.5");
    assert.equal(item?.grossScore, "140");
    assert.match(item?.images[0]?.url ?? "", /sig=/);
    const image = await route(request("GET", item?.images[0]?.url ?? "", undefined, ADMIN));
    assert.equal(image.status, 200);
    assert.equal(image.text, "aGVsbG8=");
    const reply = await route(request("POST", "/api/admin/reply", {
      id,
      reply: "Looking at the body again.",
      offerRescan: true,
    }, ADMIN));
    assert.equal(reply.status, 200);
    assert.equal(payload(reply).pushSent, false);
    assert.equal(payload(reply).emailPending, false);
    assert.equal(payload(reply).status, "replied");
    const rescanned = await route(request("POST", "/api/rescan", { appUserId: "free_keep_user", reportId: id }));
    assert.equal(rescanned.status, 200);
    assert.equal(payload(rescanned).next.fieldCall, "LET WALK");
    const again = await route(request("POST", "/api/rescan", { appUserId: "free_keep_user", reportId: id }));
    assert.equal(again.status, 400);
    const answer = await route(request("POST", "/api/rescan-answer", { appUserId: "free_keep_user", reportId: id, right: false }));
    assert.equal(payload(answer).status, "rescanned-wrong");
    const removed = await route(request("POST", "/api/report-photo", { appUserId: "free_keep_user", reportId: id }));
    assert.equal(payload(removed).deleted, true);
    const after = await route(request("GET", "/api/admin/report-cases", undefined, ADMIN));
    assert.equal((payload(after).cases as Array<{ id: string }>).some((row) => row.id === id), false);
    setRescanRunnerForTests(null);
  });

  test("a second look is free once per scan and a dispute names the disagreement", async () => {
    const { setSecondLookRunnerForTests } = await import("./second-look.js");
    setSecondLookRunnerForTests(async () => ({
      ageYears: 2.5,
      fieldCall: "LET WALK",
      bodyOnlyAge: 2.5,
      cues: [{ area: "neck", text: "Thin neck with a clear throat line" }],
      model: "test-model",
      costUsd: 0.02,
    }));
    const saved = await route(request("POST", "/api/call-report", {
      appUserId: "free_look_user",
      scanId: "scan_look",
      kind: "wrong_call",
      fieldCall: "SHOOTER",
      reportedAge: "3.5",
      proofMethod: "jawbone",
      minimum: 4.5,
      scanImages: ["aGVsbG8="],
      resultSnapshot: { ageYears: 5.5, cueBullets: [{ area: "Neck", text: "Neck runs into the chest" }] },
    }));
    assert.equal(payload(saved).id.length > 0, true);
    const listed = await route(request("GET", "/api/admin/feedback", undefined, ADMIN));
    const row = (payload(listed).reports as Array<Record<string, unknown>>).find((item) => item.scanId === "scan_look");
    assert.equal(row?.proofReview, true);
    assert.equal(row?.freeMonthOwed, false);
    const first = await route(request("POST", "/api/second-look", {
      appUserId: "free_look_user",
      scanId: "scan_look",
      originalCall: "SHOOTER",
      originalAge: 5.5,
      minimum: 4.5,
    }));
    assert.equal(first.status, 200);
    assert.equal(payload(first).secondLook.agree, false);
    assert.match(payload(first).secondLook.note, /disagree/i);
    const second = await route(request("POST", "/api/second-look", {
      appUserId: "free_look_user",
      scanId: "scan_look",
      originalCall: "SHOOTER",
      originalAge: 5.5,
    }));
    assert.equal(payload(second).reused, true);
    const dispute = await route(request("POST", "/api/admin/reply", { id: payload(saved).id, kind: "dispute" }, ADMIN));
    assert.equal(dispute.status, 200);
    const messages = await route(request("GET", "/api/replies?appUserId=free_look_user"));
    const message = (payload(messages).messages as Array<{ reply: string; dispute: boolean }>).find((item) => item.dispute);
    assert.equal(message?.dispute, true);
    assert.match(message?.reply ?? "", /Here's what the photo shows/);
    assert.match(message?.reply ?? "", /disagree/i);
    assert.match(message?.reply ?? "", /lab tooth age is the strongest proof/);
    assert.doesNotMatch(message?.reply ?? "", /you're wrong/i);
    setSecondLookRunnerForTests(null);
  });

  test("a report starts at Received, an overdue note waits for approval, and a free month is listed until granted", async () => {
    const saved = await route(request("POST", "/api/call-report", {
      appUserId: "free_owed_user",
      scanId: "scan_owed",
      kind: "wrong_call",
      fieldCall: "SHOOTER",
      reportedAge: "2.5",
      proofMethod: "lab_tooth",
      minimum: 4.5,
      subscribedAt: new Date().toISOString(),
    }));
    const id = payload(saved).id as string;
    assert.equal(payload(saved).trackerStep, "reviewing");
    const thread = await route(request("GET", "/api/replies?appUserId=free_owed_user"));
    const message = (payload(thread).messages as Array<{ tracker?: { step: string; expected: string }; updates?: unknown[] }>).find((item) => item.tracker);
    assert.equal(message?.tracker?.step, "reviewing");
    assert.ok((message?.updates ?? []).length >= 1);
    const owed = await route(request("GET", "/api/admin/owed", undefined, ADMIN));
    const row = (payload(owed).owed as Array<{ id: string; appUserId: string; hoursWaiting: number }>).find((item) => item.id === id);
    assert.equal(row?.appUserId, "free_owed_user");
    assert.ok((row?.hoursWaiting ?? -1) >= 0);
    const grant = await route(request("POST", "/api/admin/grant", { id }, ADMIN));
    assert.equal(payload(grant).granted, true);
    assert.equal(payload(grant).grantedInStore, false);
    const after = await route(request("GET", "/api/admin/owed", undefined, ADMIN));
    assert.equal((payload(after).owed as Array<{ id: string }>).some((item) => item.id === id), false);
    const verdict = await route(request("GET", "/api/replies?appUserId=free_owed_user"));
    const done = (payload(verdict).messages as Array<{ reply?: string }>).find((item) => (item.reply ?? "").includes("free month"));
    assert.match(done?.reply ?? "", /free month was added/i);
    const late = await route(request("POST", "/api/admin/report-step", { id, step: "studying", hours: 0 }, ADMIN));
    assert.equal(payload(late).overdue, true);
    const waiting = await route(request("POST", "/api/admin/report-step", { id, approveOverdue: true, expected: "Usually within 24 hours" }, ADMIN));
    assert.equal(waiting.status, 200);
    assert.match(payload(waiting).text, /Still working on it/);
  });

  test("a clean free month is granted automatically, and a flagged or over-cap case waits", async () => {
    const { setGrantForTests } = await import("./entitlement.js");
    const previousMin = process.env.FREE_MONTH_CAP_MIN;
    const previousPct = process.env.FREE_MONTH_CAP_PCT;
    process.env.FREE_MONTH_CAP_MIN = "1";
    process.env.FREE_MONTH_CAP_PCT = "0";
    setGrantForTests(async () => "granted");
    try {
      const clean = await route(request("POST", "/api/call-report", {
        appUserId: "free_auto_user",
        scanId: "scan_auto",
        kind: "wrong_call",
        fieldCall: "SHOOTER",
        reportedAge: "2.5",
        proofMethod: "lab_tooth",
        minimum: 4.5,
      }));
      assert.equal(clean.status, 200);
      const thread = await route(request("GET", "/api/replies?appUserId=free_auto_user"));
      const note = (payload(thread).messages as Array<{ reply?: string; tracker?: { step: string } }>).find((item) => (item.reply ?? "").includes("free month"));
      assert.match(note?.reply ?? "", /free month was added/i);
      assert.equal(note?.tracker?.step, "verdict");
      const listed = await route(request("GET", "/api/admin/free-months", undefined, ADMIN));
      assert.equal(payload(listed).auto, 1);
      assert.equal(payload(listed).cap, 1);
      assert.equal(payload(listed).paused, true);
      assert.equal(payload(listed).grants[0].reason, "auto");
      const held = await route(request("POST", "/api/call-report", {
        appUserId: "free_auto_user_two",
        scanId: "scan_auto_two",
        kind: "wrong_call",
        fieldCall: "SHOOTER",
        reportedAge: "2.5",
        proofMethod: "lab_tooth",
        minimum: 4.5,
      }));
      const owed = await route(request("GET", "/api/admin/owed", undefined, ADMIN));
      const waiting = (payload(owed).owed as Array<{ id: string; flags: string[]; autoGrantError: string | null }>).find((item) => item.id === payload(held).id);
      assert.ok(waiting);
      assert.equal(waiting?.autoGrantError, null);
      const missingKey = await route(request("POST", "/api/call-report", {
        appUserId: "free_nokey_user",
        scanId: "scan_nokey",
        kind: "wrong_call",
        fieldCall: "LET WALK",
        reportedAge: "6.5",
        proofMethod: "lab_tooth",
        minimum: 4.5,
        subscribedAt: new Date().toISOString(),
      }));
      const flagged = (payload(await route(request("GET", "/api/admin/owed", undefined, ADMIN))).owed as Array<{ id: string; flags: string[]; autoGrantError: string | null }>).find((item) => item.id === payload(missingKey).id);
      assert.ok(flagged?.flags.includes("new_subscriber"));
      assert.equal(flagged?.autoGrantError, null);
    } finally {
      setGrantForTests(null);
      if (previousMin === undefined) delete process.env.FREE_MONTH_CAP_MIN;
      else process.env.FREE_MONTH_CAP_MIN = previousMin;
      if (previousPct === undefined) delete process.env.FREE_MONTH_CAP_PCT;
      else process.env.FREE_MONTH_CAP_PCT = previousPct;
    }
  });

  test("a missing RevenueCat key records the error and does not grant", async () => {
    const saved = await route(request("POST", "/api/call-report", {
      appUserId: "free_error_user",
      scanId: "scan_error",
      kind: "wrong_call",
      fieldCall: "SHOOTER",
      reportedAge: "1.5",
      proofMethod: "jawbone",
      minimum: 4.5,
    }));
    const owed = await route(request("GET", "/api/admin/owed", undefined, ADMIN));
    const row = (payload(owed).owed as Array<{ id: string; autoGrantError: string | null }>).find((item) => item.id === payload(saved).id);
    assert.match(row?.autoGrantError ?? "", /not set/);
    const again = await route(request("GET", "/api/admin/owed", undefined, ADMIN));
    const still = (payload(again).owed as Array<{ id: string; autoGrantError: string | null }>).find((item) => item.id === payload(saved).id);
    assert.equal(still?.autoGrantError, row?.autoGrantError);
  });
});
