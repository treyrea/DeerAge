/**
 * Free-month decisions on a stored report: the automatic grant, the owed list, and a manual grant.
 */

import { abuseFlags } from "./abuse.js";
import { activePayingCount, attemptFreeMonthGrant } from "./entitlement.js";
import { type FeedbackRecord, loadAll, loadRecord, storeRecord } from "./feedback-store.js";
import { freeMonthCap, inChicagoMonth } from "./free-month.js";
import { allowBucket, ensureRedis, membersOf } from "./kv.js";
import { monthStamp } from "./limits.js";
import { sendReportReplyPush } from "./outreach.js";
import { proofEffect, type ProofMethod } from "./proof.js";
import { TRACKER_DEFAULTS, dueAtFrom, stepText, type TrackerStep } from "./tracker.js";
import {
  ApiError,
  type Incoming,
  type Outgoing,
  asRecord,
  callerKey,
  catchApi,
  cleanText,
  fail,
  limitFromEnv,
  ok,
  requireAdmin,
} from "./wire.js";

export function moveTracker(record: FeedbackRecord, step: TrackerStep, expected = TRACKER_DEFAULTS[step].expected, hours = TRACKER_DEFAULTS[step].hours): void {
  const now = new Date().toISOString();
  record.trackerStep = step;
  record.trackerExpected = expected;
  record.trackerDueAt = step === "verdict" ? null : dueAtFrom(Date.now(), hours);
  const text = step === "verdict" && record.freeMonthGrantedAt
    ? "Verdict. Your free month was added."
    : stepText(step, expected);
  record.updates = [...(record.updates ?? []), { at: now, step, text }];
  record.reply = text;
  record.replyAt = now;
  record.replyRead = false;
}

export function applyProof(record: FeedbackRecord, method: ProofMethod, ageYears: number, minimum: number): void {
  const effect = proofEffect({ fieldCall: record.fieldCall, minimum, ageYears, method });
  record.proofMethod = method;
  record.reportedAge = String(ageYears);
  record.jawboneAged = method === "jawbone";
  record.proofReview = effect === "review";
  if (effect === "free_month") {
    record.freeMonthOwed = true;
    record.owedAt = record.owedAt ?? new Date().toISOString();
    record.status = "open";
    moveTracker(record, "reviewing");
  } else if (effect === "review") {
    record.status = "open";
    moveTracker(record, "reviewing");
  }
}

export async function flagsFor(record: FeedbackRecord, records: FeedbackRecord[]): Promise<string[]> {
  const owners = record.photoHash ? await membersOf(`deerage:photohash:${record.photoHash}`) : [];
  const mine = records.filter((item) => item.appUserId === record.appUserId && item.kind === "wrong_call");
  const recentReportCount = mine.filter((item) => Date.now() - Date.parse(item.createdAt) <= 30 * 24 * 60 * 60 * 1000).length;
  return abuseFlags({
    appUserId: record.appUserId,
    createdAt: record.createdAt,
    reportedAge: record.reportedAge,
    proofMethod: record.proofMethod,
    photoHash: record.photoHash,
    subscribedAt: record.subscribedAt,
    grants: mine.map((item) => item.freeMonthGrantedAt).filter((at): at is string => Boolean(at)),
    recentReportCount,
    hashOwners: owners,
  });
}

export async function tryAutoGrant(record: FeedbackRecord): Promise<void> {
  const others = await loadAll();
  const flags = await flagsFor(record, [...others, record]);
  if (flags.length > 0) return;
  const subscribers = await activePayingCount();
  const cap = freeMonthCap(subscribers ?? 10);
  const autoThisMonth = others.filter((item) => item.grantReason === "auto" && inChicagoMonth(item.freeMonthGrantedAt)).length;
  if (autoThisMonth >= cap) return;
  const result = await attemptFreeMonthGrant(record.appUserId);
  if (result !== "granted") {
    record.autoGrantError = result === "no_key" ? "RevenueCat secret is not set." : "RevenueCat did not grant the month.";
    return;
  }
  record.freeMonthGrantedAt = new Date().toISOString();
  record.grantReason = "auto";
  record.autoGrantError = null;
  moveTracker(record, "verdict");
}

async function adminGate(req: Incoming): Promise<void> {
  ensureRedis();
  await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
  requireAdmin(req);
}

export async function handleOwed(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    await adminGate(req);
    const records = await loadAll();
    const owed = await Promise.all(records.filter((record) => record.freeMonthOwed && !record.freeMonthGrantedAt).map(async (record) => {
      const owedAt = record.owedAt ?? record.createdAt;
      const hoursWaiting = Math.max(0, (Date.now() - Date.parse(owedAt)) / (60 * 60 * 1000));
      return {
        id: record.id,
        appUserId: record.appUserId,
        owedAt,
        hoursWaiting: Math.round(hoursWaiting * 10) / 10,
        flags: await flagsFor(record, records),
        autoGrantError: record.autoGrantError,
      };
    }));
    return ok({ owed });
  } catch (error) {
    return catchApi(error, "Couldn't list owed months.");
  }
}

export async function handleGrant(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    await adminGate(req);
    const body = asRecord(req.body);
    const record = await loadRecord(cleanText(body.id, 40));
    if (!record) throw new ApiError(404, "invalid_request", "No report with that id.");
    if (!record.freeMonthOwed) throw new ApiError(400, "invalid_request", "That report does not have a free month owed.");
    if (record.freeMonthGrantedAt) return ok({ id: record.id, granted: true, grantedInStore: false, already: true });
    const result = await attemptFreeMonthGrant(record.appUserId);
    if (result === "failed") return fail(502, "upstream", "RevenueCat did not grant the month. It is still owed.");
    const grantedInStore = result === "granted";
    record.freeMonthGrantedAt = new Date().toISOString();
    record.grantReason = "manual";
    moveTracker(record, "verdict");
    await storeRecord(record);
    const pushSent = await sendReportReplyPush(record.appUserId);
    return ok({ id: record.id, granted: true, grantedInStore, pushSent });
  } catch (error) {
    return catchApi(error, "Couldn't grant that month.");
  }
}

export async function handleFreeMonths(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    await adminGate(req);
    const records = await loadAll();
    const grants = records.filter((record) => inChicagoMonth(record.freeMonthGrantedAt));
    const auto = grants.filter((record) => record.grantReason === "auto").length;
    const manual = grants.length - auto;
    const subscribers = await activePayingCount();
    const cap = freeMonthCap(subscribers ?? 10);
    return ok({
      month: monthStamp(),
      auto,
      manual,
      cap,
      paused: auto >= cap,
      activeSubscribers: subscribers ?? 10,
      grants: grants.map((record) => ({
        id: record.id,
        appUserId: record.appUserId,
        grantedAt: record.freeMonthGrantedAt,
        reason: record.grantReason ?? "manual",
      })),
    });
  } catch (error) {
    return catchApi(error, "Couldn't list free months.");
  }
}
