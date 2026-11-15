/**
 * Opt-in push tokens and optional email alerts.
 * Both are keyed by the RevenueCat app user id. Neither is required to use the app.
 */

import { randomBytes } from "node:crypto";
import { segmentFor, segmentOrUnknown, type Segment } from "./content.js";
import { allowBucket, ensureRedis, kv, membersOf, readJson, redisGet, redisSet } from "./kv.js";
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
  requireAppUserId,
  userKey,
} from "./wire.js";

const PUSH_INDEX = "deerage:push:index";
const EMAIL_INDEX = "deerage:email:index";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NO_STORE = { "cache-control": "no-store" };
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9\-_]+\]$/;

interface PushRecord {
  token: string;
  segment: Segment;
  updatedAt: string;
  appUserId: string;
}

interface EmailRecord {
  appUserId: string;
  email: string;
  consentAt: string;
  unsubscribedAt: string | null;
  unsubscribeToken: string;
  segment: Segment | "unknown";
}

function pushKey(appUserId: string): string {
  return `deerage:push:${userKey(appUserId)}`;
}

function tokenOwnerKey(token: string): string {
  return `deerage:push:owner:${encodeURIComponent(token).slice(0, 220)}`;
}

function emailKey(id: string): string {
  return `deerage:email:${id}`;
}

function emailTokenKey(token: string): string {
  return `deerage:email:token:${token}`;
}

async function gateAdmin(req: Incoming): Promise<void> {
  ensureRedis();
  await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
  requireAdmin(req);
}

async function removePush(appUserId: string): Promise<void> {
  const key = userKey(appUserId);
  const existing = await readJson<PushRecord | null>(`deerage:push:${key}`, null);
  if (existing?.token) await kv().command(["DEL", tokenOwnerKey(existing.token)]);
  await kv().command(["DEL", `deerage:push:${key}`]);
  await kv().command(["SREM", PUSH_INDEX, key]);
}

export async function handlePushTokenRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return fail(405, "invalid_request", "Use POST.");
  }
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await allowBucket("push", appUserId, limitFromEnv("PUSH_TOKEN_RATE_LIMIT_PER_MINUTE", 10));
    const disabling = req.method === "DELETE" || body.enabled === false || body.token == null || body.token === "";
    if (disabling) {
      await removePush(appUserId);
      return ok({ enabled: false });
    }
    const token = cleanText(body.token, 200);
    if (!TOKEN_RE.test(token)) {
      throw new ApiError(400, "invalid_request", "That push token is not valid.");
    }
    const segment = await segmentFor(appUserId);
    const owner = await redisGet(tokenOwnerKey(token));
    const mine = userKey(appUserId);
    if (owner && owner !== mine) {
      const previous = await readJson<PushRecord | null>(`deerage:push:${owner}`, null);
      if (previous?.appUserId) await removePush(previous.appUserId);
    }
    const record: PushRecord = {
      token,
      segment,
      updatedAt: new Date().toISOString(),
      appUserId,
    };
    await redisSet(pushKey(appUserId), JSON.stringify(record));
    await kv().command(["SADD", PUSH_INDEX, mine]);
    await redisSet(tokenOwnerKey(token), mine);
    return ok({ enabled: true, segment });
  } catch (error) {
    return catchApi(error, "Couldn't save the notification token.");
  }
}

async function pushRecords(): Promise<PushRecord[]> {
  const members = await membersOf(PUSH_INDEX);
  const records: PushRecord[] = [];
  for (let i = 0; i < members.length; i += 50) {
    const slice = members.slice(i, i + 50);
    const values = await kv().pipeline(slice.map((member) => ["GET", `deerage:push:${member}`]));
    values.forEach((value) => {
      if (typeof value !== "string") return;
      try {
        const parsed = JSON.parse(value) as PushRecord;
        if (parsed?.token && parsed.appUserId && (parsed.segment === "subscriber" || parsed.segment === "free")) {
          records.push(parsed);
        }
      } catch {
        // Skip a corrupt row. The next registration overwrites it.
      }
    });
  }
  return records;
}

function audienceOf(value: unknown): "all" | "subscriber" | "free" {
  if (value == null || value === "all") return "all";
  if (value === "subscriber" || value === "free") return value;
  throw new ApiError(400, "invalid_request", "Audience must be all, subscriber, or free.");
}

export async function handleAdminPushRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    await gateAdmin(req);
    const body = asRecord(req.body);
    const audience = audienceOf(body.audience);
    const dryRun = body.dryRun === true || body.dryRun === "true";
    const records = await pushRecords();
    const subscriber = records.filter((record) => record.segment === "subscriber").length;
    const free = records.filter((record) => record.segment === "free").length;
    const targeted = records.filter((record) => audience === "all" || record.segment === audience);
    if (dryRun) {
      return ok({ dryRun: true, audience, matched: targeted.length, subscriber, free }, NO_STORE);
    }
    const title = cleanText(body.title, 120);
    const message = cleanText(body.body, 240);
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim() ?? "";
    let sent = 0;
    let failed = 0;
    let removed = 0;
    for (let i = 0; i < targeted.length; i += 100) {
      const batch = targeted.slice(i, i + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(batch.map((record) => ({
          to: record.token,
          title,
          body: message,
          sound: "default",
          data: { kind: "deerage" },
        }))),
      });
      if (!response.ok) {
        throw new ApiError(502, "upstream", "The push service did not accept the send.");
      }
      const payload = (await response.json()) as {
        data?: { status?: string; details?: { error?: string } }[];
      };
      const tickets = payload.data ?? [];
      for (let n = 0; n < batch.length; n += 1) {
        const ticket = tickets[n];
        if (ticket?.status === "ok") {
          sent += 1;
          continue;
        }
        failed += 1;
        if (ticket?.details?.error === "DeviceNotRegistered") {
          await removePush(batch[n].appUserId);
          removed += 1;
        }
      }
    }
    return ok({
      dryRun: false,
      audience,
      matched: targeted.length,
      sent,
      failed,
      removed,
      subscriber,
      free,
    }, NO_STORE);
  } catch (error) {
    return catchApi(error, "Couldn't send that notification.");
  }
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "invalid_request", "Enter a valid email.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new ApiError(400, "invalid_request", "Enter a valid email.");
  }
  return email;
}

export async function handleEmailOptInRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await allowBucket("email", appUserId, limitFromEnv("EMAIL_RATE_LIMIT_PER_MINUTE", 6));
    const email = normalizeEmail(body.email);
    const key = userKey(appUserId);
    const existing = await readJson<EmailRecord | null>(emailKey(key), null);
    const now = new Date().toISOString();
    const record: EmailRecord = {
      appUserId,
      email,
      consentAt: existing && existing.email === email && !existing.unsubscribedAt ? existing.consentAt : now,
      unsubscribedAt: null,
      unsubscribeToken: existing?.unsubscribeToken ?? randomBytes(24).toString("hex"),
      segment: await segmentOrUnknown(appUserId),
    };
    await redisSet(emailKey(key), JSON.stringify(record));
    await kv().command(["SADD", EMAIL_INDEX, key]);
    await redisSet(emailTokenKey(record.unsubscribeToken), key);
    return ok({ email: record.email, unsubscribeToken: record.unsubscribeToken });
  } catch (error) {
    return catchApi(error, "Couldn't save that email.");
  }
}

async function markUnsubscribed(key: string): Promise<void> {
  const record = await readJson<EmailRecord | null>(emailKey(key), null);
  if (!record) return;
  if (!record.unsubscribedAt) {
    record.unsubscribedAt = new Date().toISOString();
    await redisSet(emailKey(key), JSON.stringify(record));
  }
}

export async function handleEmailUnsubscribeRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const appUserId = typeof body.appUserId === "string" ? body.appUserId.trim() : "";
    await allowBucket("email", token || appUserId || callerKey(req), limitFromEnv("EMAIL_RATE_LIMIT_PER_MINUTE", 6));
    if (token) {
      if (!/^[a-f0-9]{32,64}$/i.test(token)) {
        throw new ApiError(400, "invalid_request", "That unsubscribe link is not valid.");
      }
      const key = await redisGet(emailTokenKey(token));
      if (key) await markUnsubscribed(key);
      return ok({ unsubscribed: true });
    }
    if (appUserId) {
      requireAppUserId(appUserId);
      await markUnsubscribed(userKey(appUserId));
      return ok({ unsubscribed: true });
    }
    throw new ApiError(400, "invalid_request", "An unsubscribe token or app user id is required.");
  } catch (error) {
    return catchApi(error, "Couldn't unsubscribe.");
  }
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
  return value;
}

async function emailRecords(): Promise<EmailRecord[]> {
  const members = await membersOf(EMAIL_INDEX);
  const records: EmailRecord[] = [];
  for (let i = 0; i < members.length; i += 50) {
    const slice = members.slice(i, i + 50);
    const values = await kv().pipeline(slice.map((member) => ["GET", emailKey(member)]));
    values.forEach((value) => {
      if (typeof value !== "string") return;
      try {
        const parsed = JSON.parse(value) as EmailRecord;
        if (parsed?.email && parsed.appUserId && parsed.consentAt) records.push(parsed);
      } catch {
        // Skip a corrupt row.
      }
    });
  }
  return records.sort((a, b) => a.consentAt.localeCompare(b.consentAt));
}

export async function handleAdminEmailsRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    await gateAdmin(req);
    const records = await emailRecords();
    const lines = ["appUserId,email,consentAt,unsubscribedAt,segment,unsubscribeToken"];
    for (const record of records) {
      lines.push([
        record.appUserId,
        record.email,
        record.consentAt,
        record.unsubscribedAt ?? "",
        record.segment,
        record.unsubscribeToken,
      ].map(csvField).join(","));
    }
    return {
      status: 200,
      body: null,
      text: `${lines.join("\n")}\n`,
      contentType: "text/csv; charset=utf-8",
      headers: NO_STORE,
    };
  } catch (error) {
    return catchApi(error, "Couldn't export emails.");
  }
}
