/**
 * Wrong calls, confirmed harvest ages, cancel notes, and replies.
 * A kept scan photo is stored only with consent. Email is optional and is not mailed from here.
 * This file does not change the age or score pipeline.
 */

import { randomBytes } from "node:crypto";
import { allowBucket, ensureRedis, kv, membersOf, readJson, redisSet } from "./kv.js";
import { sendReportReplyPush } from "./outreach.js";
import { createHash } from "node:crypto";
import { abuseFlags } from "./abuse.js";
import { activePayingCount, attemptFreeMonthGrant } from "./entitlement.js";
import { freeMonthCap, inChicagoMonth } from "./free-month.js";
import { monthStamp } from "./limits.js";
import { disputeReply, proofEffect, proofMethodOf, type ProofMethod } from "./proof.js";
import { STILL_WORKING, TRACKER_DEFAULTS, dueAtFrom, isOverdue, stepText, trackerStepOf, type TrackerStep, type TrackerUpdate } from "./tracker.js";
import { loadSecondLook } from "./second-look.js";
import { deleteReportImages, readReportImage, reportImageSignatureOk, safeImageFile, saveReportImage, signedImagePath } from "./report-media.js";
import { rescanKeptPhoto } from "./report-rescan.js";
import {
  ApiError,
  type Incoming,
  type Outgoing,
  asRecord,
  callerKey,
  catchApi,
  cleanText,
  fail,
  header,
  limitFromEnv,
  ok,
  queryParam,
  requireAdmin,
  requireAppUserId,
  userKey,
} from "./wire.js";

const INDEX = "deerage:feedback:index";
const MAX_PHOTO = 180_000;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const STATUSES = ["open", "studying", "fixed", "replied", "rescanned-right", "rescanned-wrong"] as const;

const KINDS = ["wrong_call", "call_right", "harvest_age", "cancel_reason", "win_back"] as const;
export type FeedbackKind = (typeof KINDS)[number];
export type ReportStatus = (typeof STATUSES)[number];

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
  followUpEmail: string | null;
  keepPhoto: boolean;
  imageFiles: string[];
  resultSnapshot: Record<string, unknown> | null;
  reply: string | null;
  replyAt: string | null;
  replyRead: boolean;
  offerRescan: boolean;
  rescanUsed: boolean;
  rescanResult: { fieldCall: string; ageYears: number | null; note: string } | null;
  status: ReportStatus;
  fixedIn: string | null;
  emailPending: boolean;
  proofMethod: string | null;
  freeMonthOwed: boolean;
  proofReview: boolean;
  dispute: boolean;
  trackerStep: TrackerStep;
  trackerDueAt: string | null;
  trackerExpected: string;
  updates: TrackerUpdate[];
  owedAt: string | null;
  freeMonthGrantedAt: string | null;
  grantReason: "auto" | "manual" | null;
  autoGrantError: string | null;
  photoHash: string | null;
  subscribedAt: string | null;
  photoDeletedAt: string | null;
  resolvedAt: string | null;
  retainUntil: string | null;
  createdAt: string;
}

function feedbackKey(id: string): string {
  return `deerage:feedback:${id}`;
}

function userIndex(appUserId: string): string {
  return `deerage:feedback:user:${userKey(appUserId)}`;
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
  return value;
}

function kindOf(value: unknown): FeedbackKind {
  if (typeof value === "string" && (KINDS as readonly string[]).includes(value)) return value as FeedbackKind;
  throw new ApiError(400, "invalid_request", "That report type is not recognized.");
}

function statusOf(value: unknown): ReportStatus | null {
  if (value == null || value === "") return null;
  if (typeof value === "string" && (STATUSES as readonly string[]).includes(value)) return value as ReportStatus;
  throw new ApiError(400, "invalid_request", "That report status is not recognized.");
}

export function optionalEmail(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "invalid_request", "Enter a valid email, or leave it blank.");
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new ApiError(400, "invalid_request", "Enter a valid email, or leave it blank.");
  }
  return email;
}

export function retainUntilFrom(iso: string): string {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

function filled(record: Partial<FeedbackRecord> & Pick<FeedbackRecord, "id" | "appUserId" | "scanId" | "kind" | "createdAt">): FeedbackRecord {
  return {
    fieldCall: "",
    reportedAge: "",
    jawboneAged: false,
    note: "",
    photoBase64: null,
    followUpEmail: null,
    keepPhoto: false,
    resultSnapshot: null,
    reply: null,
    replyAt: null,
    replyRead: false,
    offerRescan: false,
    rescanUsed: false,
    rescanResult: null,
    status: "open",
    fixedIn: null,
    emailPending: false,
    proofMethod: null,
    freeMonthOwed: false,
    proofReview: false,
    dispute: false,
    trackerStep: "received",
    trackerDueAt: null,
    trackerExpected: "",
    updates: [],
    owedAt: null,
    freeMonthGrantedAt: null,
    grantReason: null,
    autoGrantError: null,
    photoHash: null,
    subscribedAt: null,
    photoDeletedAt: null,
    resolvedAt: null,
    retainUntil: null,
    ...record,
    imageFiles: Array.isArray(record.imageFiles) ? record.imageFiles.filter((file) => safeImageFile(file)) : [],
  };
}

async function loadRecord(id: string): Promise<FeedbackRecord | null> {
  const row = await readJson<FeedbackRecord | null>(feedbackKey(id), null);
  if (!row?.id || !row.scanId) return null;
  return filled(row);
}

async function storeRecord(record: FeedbackRecord): Promise<void> {
  await redisSet(feedbackKey(record.id), JSON.stringify(record));
}

async function loadAll(): Promise<FeedbackRecord[]> {
  const members = await membersOf(INDEX);
  const records: FeedbackRecord[] = [];
  for (let i = 0; i < members.length; i += 40) {
    const slice = members.slice(i, i + 40);
    const values = await kv().pipeline(slice.map((id) => ["GET", feedbackKey(id)]));
    values.forEach((value) => {
      if (typeof value !== "string") return;
      try {
        const parsed = JSON.parse(value) as FeedbackRecord;
        if (parsed?.id && parsed.scanId) records.push(filled(parsed));
      } catch {
        // Skip a corrupt row.
      }
    });
  }
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return records;
}

async function dropExpiredPhotos(record: FeedbackRecord): Promise<FeedbackRecord> {
  if (!record.retainUntil || record.imageFiles.length === 0) return record;
  if (Date.parse(record.retainUntil) > Date.now()) return record;
  await deleteReportImages(record.id, record.imageFiles);
  const next = { ...record, imageFiles: [], keepPhoto: false, photoBase64: null, photoDeletedAt: record.photoDeletedAt ?? new Date().toISOString() };
  await storeRecord(next);
  return next;
}

function markResolved(record: FeedbackRecord, status: ReportStatus): void {
  if (status !== "fixed" && status !== "rescanned-right") return;
  const now = new Date().toISOString();
  record.resolvedAt = record.resolvedAt ?? now;
  record.retainUntil = retainUntilFrom(record.resolvedAt);
}

function applyProof(record: FeedbackRecord, method: ProofMethod, ageYears: number, minimum: number): void {
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

function moveTracker(record: FeedbackRecord, step: TrackerStep, expected = TRACKER_DEFAULTS[step].expected, hours = TRACKER_DEFAULTS[step].hours): void {
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

async function flagsFor(record: FeedbackRecord, records: FeedbackRecord[]): Promise<string[]> {
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

async function tryAutoGrant(record: FeedbackRecord): Promise<void> {
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

export async function saveFeedback(input: {
  appUserId: string;
  scanId: string;
  kind: FeedbackKind;
  fieldCall?: string;
  reportedAge?: string;
  jawboneAged?: boolean;
  note?: string;
  photoBase64?: string | null;
  followUpEmail?: string | null;
  keepPhoto?: boolean;
  scanImages?: unknown;
  resultSnapshot?: unknown;
  proofMethod?: ProofMethod | null;
  minimum?: number;
  subscribedAt?: string | null;
}): Promise<{ record: FeedbackRecord; photoStored: boolean }> {
  const photo = typeof input.photoBase64 === "string" ? input.photoBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "") : "";
  const photoStored = photo.length > 0 && photo.length <= MAX_PHOTO;
  const snapshot = input.resultSnapshot && typeof input.resultSnapshot === "object" && !Array.isArray(input.resultSnapshot)
    ? input.resultSnapshot as Record<string, unknown>
    : null;
  const record = filled({
    id: `fb_${randomBytes(8).toString("hex")}`,
    appUserId: input.appUserId,
    scanId: input.scanId,
    kind: input.kind,
    fieldCall: (input.fieldCall ?? "").slice(0, 40),
    reportedAge: (input.reportedAge ?? "").slice(0, 40),
    jawboneAged: Boolean(input.jawboneAged),
    note: (input.note ?? "").slice(0, 500),
    photoBase64: photoStored ? photo : null,
    followUpEmail: input.followUpEmail ?? null,
    keepPhoto: input.kind === "wrong_call",
    resultSnapshot: input.kind === "wrong_call" ? snapshot : null,
    status: "open",
    subscribedAt: input.subscribedAt ?? null,
    createdAt: new Date().toISOString(),
  });
  if (input.kind === "wrong_call" && Array.isArray(input.scanImages)) {
    const files: string[] = [];
    for (let i = 0; i < Math.min(3, input.scanImages.length); i += 1) {
      const file = `${i}.jpg`;
      if (typeof input.scanImages[i] === "string" && await saveReportImage(record.id, file, input.scanImages[i] as string)) {
        files.push(file);
      }
    }
    record.imageFiles = files;
    const first = input.scanImages.find((item) => typeof item === "string" && item.length > 0) as string | undefined;
    if (first) {
      record.photoHash = createHash("sha256").update(first).digest("hex");
      await kv().command(["SADD", `deerage:photohash:${record.photoHash}`, userKey(input.appUserId)]);
    }
  }
  if (input.kind === "wrong_call") moveTracker(record, "received");
  if (input.proofMethod && input.reportedAge) {
    const ageYears = Number(input.reportedAge);
    if (Number.isFinite(ageYears)) applyProof(record, input.proofMethod, ageYears, input.minimum ?? 4.5);
  }
  if (record.freeMonthOwed && !record.freeMonthGrantedAt && !record.autoGrantError) {
    await tryAutoGrant(record);
  }
  await storeRecord(record);
  await kv().command(["SADD", INDEX, record.id]);
  await kv().command(["SADD", `deerage:feedback:scan:${encodeURIComponent(input.scanId).slice(0, 80)}`, record.id]);
  await kv().command(["SADD", userIndex(input.appUserId), record.id]);
  return { record, photoStored };
}

function jsonRow(record: FeedbackRecord, includeContact: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: record.id,
    createdAt: record.createdAt,
    scanId: record.scanId,
    fieldCall: record.fieldCall,
    reportedAge: record.reportedAge,
    jawboneAged: record.jawboneAged,
    note: record.note,
    hasPhoto: Boolean(record.photoBase64) || record.imageFiles.length > 0,
    hasEmail: Boolean(record.followUpEmail),
    hasReply: Boolean(record.reply),
    cancelReason: record.kind === "cancel_reason",
    status: record.status,
    emailPending: record.emailPending,
    offerRescan: record.offerRescan,
    proofMethod: record.proofMethod,
    freeMonthOwed: record.freeMonthOwed,
    proofReview: record.proofReview,
    fixedIn: record.fixedIn,
    retainUntil: record.retainUntil,
  };
  if (includeContact) row.email = record.followUpEmail;
  return row;
}

function requestBase(req: Incoming): string {
  const configured = process.env.DEERAGE_API_BASE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const host = header(req, "x-forwarded-host") || header(req, "host");
  if (!host) return "";
  const proto = header(req, "x-forwarded-proto") || "https";
  return `${proto}://${host}`;
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
      followUpEmail: optionalEmail(body.followUpEmail),
      proofMethod: proofMethodOf(body.proofMethod),
      minimum: Number(body.minimum) || 4.5,
      subscribedAt: typeof body.subscribedAt === "string" && body.subscribedAt ? body.subscribedAt : null,
      keepPhoto: body.keepPhoto === true,
      scanImages: body.scanImages,
      resultSnapshot: body.resultSnapshot,
    });
    return ok({
      id: saved.record.id,
      scanId: saved.record.scanId,
      photoStored: saved.photoStored,
      imagesKept: saved.record.imageFiles.length,
      trackerStep: saved.record.trackerStep,
    });
    if (saved.record.kind === "wrong_call") await sendReportReplyPush(saved.record.appUserId);
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
    const sinceRaw = queryParam(req, "since");
    const since = sinceRaw ? Date.parse(sinceRaw) : NaN;
    if (sinceRaw && !Number.isFinite(since)) throw new ApiError(400, "invalid_request", "since must be an ISO time.");
    let records = await loadAll();
    records = await Promise.all(records.map((record) => dropExpiredPhotos(record)));
    if (Number.isFinite(since)) records = records.filter((record) => Date.parse(record.createdAt) >= since);
    if (queryParam(req, "format") === "csv") {
      const includeContact = queryParam(req, "includeContact") === "1";
      const lines = ["id,appUserId,scanId,kind,fieldCall,reportedAge,jawboneAged,note,photo,createdAt,status,hasEmail"];
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
          record.photoBase64 || record.imageFiles.length > 0 ? "yes" : "no",
          record.createdAt,
          record.status,
          record.followUpEmail ? "yes" : "no",
          ...(includeContact ? [record.followUpEmail ?? ""] : []),
        ].map(csvField).join(","));
      }
      return {
        status: 200,
        body: null,
        text: `${lines.join("\n")}\n`,
        contentType: "text/csv; charset=utf-8",
        headers: { "cache-control": "no-store" },
      };
    }
    const includeContact = queryParam(req, "includeContact") === "1";
    const reports = await Promise.all(records.map(async (record) => {
      const owners = record.photoHash ? await membersOf(`deerage:photohash:${record.photoHash}`) : [];
      const mine = records.filter((item) => item.appUserId === record.appUserId && item.kind === "wrong_call");
      const recentReportCount = mine.filter((item) => Date.now() - Date.parse(item.createdAt) <= 30 * 24 * 60 * 60 * 1000).length;
      const flags = record.kind === "wrong_call" ? abuseFlags({
        appUserId: record.appUserId,
        createdAt: record.createdAt,
        reportedAge: record.reportedAge,
        proofMethod: record.proofMethod,
        photoHash: record.photoHash,
        subscribedAt: record.subscribedAt,
        grants: mine.map((item) => item.freeMonthGrantedAt).filter((at): at is string => Boolean(at)),
        recentReportCount,
        hashOwners: owners,
      }) : [];
      return {
        ...jsonRow(record, includeContact),
        flags,
        overdue: isOverdue(record.trackerStep, record.trackerDueAt),
        trackerStep: record.trackerStep,
      };
    }));
    return ok({ reports }, { "cache-control": "no-store" });
  } catch (error) {
    return catchApi(error, "Couldn't export reports.");
  }
}

export async function handleAdminReply(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
    const body = asRecord(req.body);
    const id = cleanText(body.id, 40);
    const record = await loadRecord(id);
    if (!record) throw new ApiError(404, "invalid_request", "No report with that id.");
    let reply = body.reply == null || body.reply === "" ? "" : cleanText(body.reply, 2000);
    if (body.kind === "dispute") {
      const look = await loadSecondLook(record.appUserId, record.scanId);
      const cues = Array.isArray(record.resultSnapshot?.cueBullets)
        ? (record.resultSnapshot.cueBullets as { area?: unknown; text?: unknown }[]).flatMap((cue) => {
          const text = typeof cue.text === "string" ? cue.text : "";
          const area = typeof cue.area === "string" ? cue.area : "Body";
          return text ? [{ area, text }] : [];
        })
        : look?.cues ?? [];
      reply = disputeReply({
        fieldCall: record.fieldCall,
        age: record.reportedAge || String(record.resultSnapshot?.ageYears ?? ""),
        cues,
        secondAge: look?.secondAge ?? null,
        agree: look?.agree ?? null,
      });
      record.dispute = true;
      moveTracker(record, "waiting_proof");
      const last = record.updates[record.updates.length - 1];
      if (last) last.text = reply;
    }
    const status = statusOf(body.status);
    const fixedIn = body.fixedIn == null || body.fixedIn === "" ? null : cleanText(body.fixedIn, 80);
    if (!reply && !status) throw new ApiError(400, "invalid_request", "A reply or a status is required.");
    if (body.offerRescan === true && record.imageFiles.length === 0) {
      throw new ApiError(400, "invalid_request", "No photo was kept, so a re-scan cannot be offered.");
    }
    if (reply) {
      record.reply = reply;
      record.replyAt = new Date().toISOString();
      record.replyRead = false;
      record.emailPending = Boolean(record.followUpEmail);
    }
    if (body.offerRescan === true) record.offerRescan = true;
    if (fixedIn) record.fixedIn = fixedIn;
    record.status = status ?? (reply ? "replied" : record.status);
    markResolved(record, record.status);
    await storeRecord(record);
    const pushSent = reply ? await sendReportReplyPush(record.appUserId) : false;
    return ok({
      id: record.id,
      status: record.status,
      pushSent,
      emailPending: record.emailPending,
      offerRescan: record.offerRescan,
    });
  } catch (error) {
    return catchApi(error, "Couldn't save that reply.");
  }
}

export async function handleReportCases(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
    const base = requestBase(req);
    let records = await loadAll();
    records = await Promise.all(records.map((record) => dropExpiredPhotos(record)));
    const cases = records.filter((record) => record.keepPhoto && record.imageFiles.length > 0).map((record) => {
      const score = record.resultSnapshot?.grossScore ?? record.resultSnapshot?.score;
      const images = record.imageFiles.map((file) => {
        const signed = signedImagePath(record.id, file);
        const downloadName = `${record.id}-${file}`;
        return { file: downloadName, url: base ? `${base}${signed.path}` : signed.path, expiresAt: signed.expiresAt };
      });
      return {
        id: record.id,
        scanId: record.scanId,
        file: images[0]?.file ?? "",
        ageYears: record.reportedAge,
        grossScore: score == null || score === "" ? "" : String(score),
        images,
      };
    });
    return ok({ cases }, { "cache-control": "no-store" });
  } catch (error) {
    return catchApi(error, "Couldn't list report cases.");
  }
}

export async function handleReportImage(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    ensureRedis();
    const id = queryParam(req, "id");
    const file = safeImageFile(queryParam(req, "file"));
    const exp = Number(queryParam(req, "exp"));
    const sig = queryParam(req, "sig");
    if (!file || !reportImageSignatureOk(id, file, exp, sig)) {
      return fail(403, "invalid_request", "That image link is not valid.");
    }
    const image = await readReportImage(id, file);
    if (!image) return fail(404, "invalid_request", "That photo is no longer stored.");
    return {
      status: 200,
      body: null,
      text: image,
      contentType: "text/plain; charset=utf-8",
      headers: { "cache-control": "no-store" },
    };
  } catch (error) {
    return catchApi(error, "Couldn't read that photo.");
  }
}

async function ownedReport(appUserId: string, id: string): Promise<FeedbackRecord> {
  const record = await loadRecord(id);
  if (!record || record.appUserId !== appUserId) throw new ApiError(404, "invalid_request", "No report with that id.");
  return record;
}

export async function handleReplies(req: Incoming): Promise<Outgoing> {
  try {
    ensureRedis();
    if (req.method === "GET") {
      const appUserId = requireAppUserId(queryParam(req, "appUserId"));
      await allowBucket("replies", appUserId, limitFromEnv("FEEDBACK_RATE_LIMIT_PER_MINUTE", 30));
      const ids = await membersOf(userIndex(appUserId));
      const messages = [];
      for (const id of ids) {
        const record = await loadRecord(id);
        if (!record || (record.kind !== "wrong_call" && !record.reply && !record.rescanResult)) continue;
        messages.push({
          id: record.id,
          scanId: record.scanId,
          tracker: {
            step: record.trackerStep,
            label: TRACKER_DEFAULTS[record.trackerStep].label,
            expected: record.trackerExpected,
            overdue: isOverdue(record.trackerStep, record.trackerDueAt),
            steps: (["received", "studying", "waiting_proof", "reviewing", "verdict"] as TrackerStep[]).map((step) => ({
              id: step,
              label: TRACKER_DEFAULTS[step].label,
              current: step === record.trackerStep,
            })),
          },
          updates: record.updates,
          status: record.status,
          reply: record.reply,
          replyAt: record.replyAt,
          read: record.replyRead,
          offerRescan: record.offerRescan && !record.rescanUsed && record.imageFiles.length > 0,
          dispute: record.dispute,
          secondLook: await loadSecondLook(record.appUserId, record.scanId),
          originalCall: record.fieldCall,
          originalAge: record.reportedAge || String(record.resultSnapshot?.ageYears ?? ""),
          rescan: record.rescanResult,
          hasKeptPhoto: record.imageFiles.length > 0,
        });
      }
      messages.sort((a, b) => String(a.replyAt ?? "").localeCompare(String(b.replyAt ?? "")));
      const unread = messages.filter((message) => message.reply && !message.read).length;
      return ok({ messages, unread });
    }
    if (req.method !== "POST") return fail(405, "invalid_request", "Use GET or POST.");
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await allowBucket("replies", appUserId, limitFromEnv("FEEDBACK_RATE_LIMIT_PER_MINUTE", 30));
    const record = await ownedReport(appUserId, cleanText(body.id, 40));
    record.replyRead = true;
    await storeRecord(record);
    return ok({ id: record.id, read: true });
  } catch (error) {
    return catchApi(error, "Couldn't load those messages.");
  }
}

export async function handleRescan(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await allowBucket("rescan", appUserId, limitFromEnv("FEEDBACK_RATE_LIMIT_PER_MINUTE", 6));
    const record = await ownedReport(appUserId, cleanText(body.reportId ?? body.id, 40));
    if (!record.offerRescan || record.imageFiles.length === 0) {
      throw new ApiError(400, "invalid_request", "This report does not have a free re-scan.");
    }
    if (record.rescanUsed) throw new ApiError(400, "invalid_request", "The free re-scan was already used.");
    const image = await readReportImage(record.id, record.imageFiles[0]);
    if (!image) throw new ApiError(400, "invalid_request", "The kept photo is no longer stored.");
    const minimum = Number(record.resultSnapshot?.leaseMinimum);
    const outcome = await rescanKeptPhoto(image, Number.isFinite(minimum) && minimum > 0 ? minimum : 4.5);
    const next = outcome.result;
    record.rescanUsed = true;
    record.rescanResult = {
      fieldCall: typeof next?.fieldCall === "string" ? next.fieldCall : "",
      ageYears: typeof next?.ageYears === "number" ? next.ageYears : null,
      note: typeof next?.fieldCallNote === "string" ? next.fieldCallNote : "",
    };
    await storeRecord(record);
    return ok({
      original: { fieldCall: record.fieldCall, age: record.resultSnapshot?.ageYears ?? record.reportedAge },
      next: record.rescanResult,
    });
  } catch (error) {
    return catchApi(error, "Couldn't re-scan that photo.");
  }
}

export async function handleRescanAnswer(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    const record = await ownedReport(appUserId, cleanText(body.reportId ?? body.id, 40));
    if (!record.rescanResult) throw new ApiError(400, "invalid_request", "There is no re-scan to answer yet.");
    const right = body.right === true;
    record.status = right ? "rescanned-right" : "rescanned-wrong";
    markResolved(record, record.status);
    await storeRecord(record);
    return ok({ id: record.id, status: record.status });
  } catch (error) {
    return catchApi(error, "Couldn't save that answer.");
  }
}

export async function handleDeleteReportPhoto(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    const record = await ownedReport(appUserId, cleanText(body.reportId ?? body.id, 40));
    await deleteReportImages(record.id, record.imageFiles);
    record.imageFiles = [];
    record.photoBase64 = null;
    record.keepPhoto = false;
    record.offerRescan = false;
    record.photoDeletedAt = new Date().toISOString();
    await storeRecord(record);
    return ok({ id: record.id, deleted: true });
  } catch (error) {
    return catchApi(error, "Couldn't delete that photo.");
  }
}

export async function handleReportStep(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
    const body = asRecord(req.body);
    const record = await loadRecord(cleanText(body.id, 40));
    if (!record) throw new ApiError(404, "invalid_request", "No report with that id.");
    if (body.approveOverdue === true) {
      if (!isOverdue(record.trackerStep, record.trackerDueAt)) {
        throw new ApiError(400, "invalid_request", "That step is not overdue.");
      }
      const hours = Number(body.hours);
      const nextHours = Number.isFinite(hours) && hours >= 0 ? hours : TRACKER_DEFAULTS[record.trackerStep].hours;
      const expected = typeof body.expected === "string" && body.expected.trim()
        ? cleanText(body.expected, 120)
        : TRACKER_DEFAULTS[record.trackerStep].expected;
      record.trackerExpected = expected;
      record.trackerDueAt = dueAtFrom(Date.now(), nextHours || 24);
      const text = `${STILL_WORKING} ${expected}`.trim();
      record.updates = [...record.updates, { at: new Date().toISOString(), step: record.trackerStep, text }];
      record.reply = text;
      record.replyAt = record.updates[record.updates.length - 1].at;
      record.replyRead = false;
      await storeRecord(record);
      const pushSent = await sendReportReplyPush(record.appUserId);
      return ok({ id: record.id, overdue: false, pushSent, text });
    }
    const step = trackerStepOf(body.step);
    if (!step) throw new ApiError(400, "invalid_request", "That step is not recognized.");
    const hours = Number(body.hours);
    const expected = typeof body.expected === "string" && body.expected.trim()
      ? cleanText(body.expected, 120)
      : TRACKER_DEFAULTS[step].expected;
    moveTracker(record, step, expected, Number.isFinite(hours) && hours >= 0 ? hours : TRACKER_DEFAULTS[step].hours);
    await storeRecord(record);
    const pushSent = await sendReportReplyPush(record.appUserId);
    return ok({ id: record.id, step, overdue: isOverdue(record.trackerStep, record.trackerDueAt), pushSent });
  } catch (error) {
    return catchApi(error, "Couldn't update that step.");
  }
}

export async function handleOwed(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
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
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
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
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
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
