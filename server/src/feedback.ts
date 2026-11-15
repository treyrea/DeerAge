/**
 * Wrong calls, confirmed harvest ages, and cancel notes.
 * Stored in Redis for a later eval set. Photos are optional and size-capped.
 * This does not touch the age or score pipeline.
 */

import { randomBytes } from "node:crypto";
import { allowBucket, ensureRedis, kv, membersOf, readJson, redisSet } from "./kv.js";
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
} from "./wire.js";

const INDEX = "deerage:feedback:index";
const MAX_PHOTO = 180_000;

const KINDS = ["wrong_call", "call_right", "harvest_age", "cancel_reason", "win_back"] as const;
export type FeedbackKind = (typeof KINDS)[number];

export interface FeedbackRecord {
  id: string;
  appUserId: string;
  scanId: string;
  kind: FeedbackKind;
  fieldCall: string;
  reportedAge: string;
  jawboneAged: boolean;
  note: string;
  photoBase64: string | null;
  createdAt: string;
}

function feedbackKey(id: string): string {
  return `deerage:feedback:${id}`;
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
  return value;
}

function kindOf(value: unknown): FeedbackKind {
  if (typeof value === "string" && (KINDS as readonly string[]).includes(value)) return value as FeedbackKind;
  throw new ApiError(400, "invalid_request", "That report type is not recognized.");
}

export async function saveFeedback(input: {
  appUserId: string;
  scanId: string;
  kind: FeedbackKind;
  fieldCall?: string;
  reportedAge?: string;
  jawboneAged?: boolean;
  note?: string;
  photoBase64?: string | null;
}): Promise<{ record: FeedbackRecord; photoStored: boolean }> {
  const photo = typeof input.photoBase64 === "string" ? input.photoBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "") : "";
  const photoStored = photo.length > 0 && photo.length <= MAX_PHOTO;
  const record: FeedbackRecord = {
    id: `fb_${randomBytes(8).toString("hex")}`,
    appUserId: input.appUserId,
    scanId: input.scanId,
    kind: input.kind,
    fieldCall: (input.fieldCall ?? "").slice(0, 40),
    reportedAge: (input.reportedAge ?? "").slice(0, 40),
    jawboneAged: Boolean(input.jawboneAged),
    note: (input.note ?? "").slice(0, 500),
    photoBase64: photoStored ? photo : null,
    createdAt: new Date().toISOString(),
  };
  await redisSet(feedbackKey(record.id), JSON.stringify(record));
  await kv().command(["SADD", INDEX, record.id]);
  await kv().command(["SADD", `deerage:feedback:scan:${encodeURIComponent(input.scanId).slice(0, 80)}`, record.id]);
  return { record, photoStored };
}

export async function handleCallReport(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await allowBucket("feedback", appUserId, limitFromEnv("FEEDBACK_RATE_LIMIT_PER_MINUTE", 12));
    const kind = kindOf(body.kind);
    const scanId = body.scanId == null || body.scanId === "" ? (kind === "cancel_reason" || kind === "win_back" ? "account" : "") : cleanText(body.scanId, 80);
    if (!scanId) throw new ApiError(400, "invalid_request", "A scan id is required.");
    const saved = await saveFeedback({
      appUserId,
      scanId,
      kind,
      fieldCall: body.fieldCall == null ? "" : cleanText(body.fieldCall, 40),
      reportedAge: body.reportedAge == null || body.reportedAge === "" ? "" : cleanText(body.reportedAge, 40),
      jawboneAged: body.jawboneAged === true,
      note: body.note == null || body.note === "" ? "" : cleanText(body.note, 500),
      photoBase64: typeof body.photoBase64 === "string" ? body.photoBase64 : null,
    });
    return ok({
      id: saved.record.id,
      scanId: saved.record.scanId,
      photoStored: saved.photoStored,
    });
  } catch (error) {
    return catchApi(error, "Couldn't save that note.");
  }
}

export async function handleAdminFeedbackRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
    const members = await membersOf(INDEX);
    const records: FeedbackRecord[] = [];
    for (let i = 0; i < members.length; i += 40) {
      const slice = members.slice(i, i + 40);
      const values = await kv().pipeline(slice.map((id) => ["GET", feedbackKey(id)]));
      values.forEach((value) => {
        if (typeof value !== "string") return;
        try {
          const parsed = JSON.parse(value) as FeedbackRecord;
          if (parsed?.id && parsed.scanId) records.push(parsed);
        } catch {
          // Skip a corrupt row.
        }
      });
    }
    records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lines = ["id,appUserId,scanId,kind,fieldCall,reportedAge,jawboneAged,note,photo,createdAt"];
    for (const record of records) {
      lines.push([
        record.id,
        record.appUserId,
        record.scanId,
        record.kind,
        record.fieldCall,
        record.reportedAge,
        record.jawboneAged ? "yes" : "no",
        record.note,
        record.photoBase64 ? "yes" : "no",
        record.createdAt,
      ].map(csvField).join(","));
    }
    return {
      status: 200,
      body: null,
      text: `${lines.join("\n")}\n`,
      contentType: "text/csv; charset=utf-8",
      headers: { "cache-control": "no-store" },
    };
  } catch (error) {
    return catchApi(error, "Couldn't export reports.");
  }
}

export async function readFeedbackForScan(scanId: string): Promise<FeedbackRecord[]> {
  const members = await membersOf(`deerage:feedback:scan:${encodeURIComponent(scanId).slice(0, 80)}`);
  const records: FeedbackRecord[] = [];
  for (const id of members) {
    const row = await readJson<FeedbackRecord | null>(feedbackKey(id), null);
    if (row?.id) records.push(row);
  }
  return records;
}
