/**
 * Saving a report and the hunter's side of the thread: replies, a re-scan, and deleting a kept photo.
 * Admin export, grants, and tracker steps live next to this file.
 */

import { createHash, randomBytes } from "node:crypto";
import { allowBucket, ensureRedis, kv, membersOf } from "./kv.js";
import { applyProof, moveTracker, tryAutoGrant } from "./feedback-grants.js";
import {
  FEEDBACK_INDEX,
  MAX_PHOTO,
  type FeedbackKind,
  type FeedbackRecord,
  filled,
  kindOf,
  loadRecord,
  markResolved,
  optionalEmail,
  storeRecord,
  userIndex,
} from "./feedback-store.js";
import type { ProofMethod } from "./proof.js";
import { proofMethodOf } from "./proof.js";
import { deleteReportImages, readReportImage, saveReportImage } from "./report-media.js";
import { rescanKeptPhoto } from "./report-rescan.js";
import { loadSecondLook } from "./second-look.js";
import { TRACKER_DEFAULTS, isOverdue, type TrackerStep } from "./tracker.js";
import { userKey } from "./wire.js";
import {
  ApiError,
  type Incoming,
  type Outgoing,
  asRecord,
  catchApi,
  cleanText,
  fail,
  limitFromEnv,
  ok,
  queryParam,
  requireAppUserId,
} from "./wire.js";

export type { FeedbackKind, FeedbackRecord, ReportStatus } from "./feedback-store.js";
export { optionalEmail, retainUntilFrom } from "./feedback-store.js";
export { handleAdminFeedbackRequest, handleAdminReply, handleReportCases, handleReportImage, handleReportStep } from "./feedback-admin.js";
export { handleFreeMonths, handleGrant, handleOwed } from "./feedback-grants.js";

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
  await kv().command(["SADD", FEEDBACK_INDEX, record.id]);
  await kv().command(["SADD", `deerage:feedback:scan:${encodeURIComponent(input.scanId).slice(0, 80)}`, record.id]);
  await kv().command(["SADD", userIndex(input.appUserId), record.id]);
  return { record, photoStored };
}

async function ownedReport(appUserId: string, id: string): Promise<FeedbackRecord> {
  const record = await loadRecord(id);
  if (!record || record.appUserId !== appUserId) throw new ApiError(404, "invalid_request", "No report with that id.");
  return record;
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
  } catch (error) {
    return catchApi(error, "Couldn't save that note.");
  }
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
    if (outcome.error === "upstream") throw new ApiError(502, "upstream", "Couldn't re-scan that photo. Try again in a moment.");
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
