/**
 * Admin views of stored reports: the export, a reply, kept photos, and the tracker step.
 */

import { abuseFlags } from "./abuse.js";
import { csvField, dropExpiredPhotos, loadAll, loadRecord, markResolved, statusOf, storeRecord, type FeedbackRecord } from "./feedback-store.js";
import { moveTracker } from "./feedback-grants.js";
import { allowBucket, ensureRedis, membersOf } from "./kv.js";
import { sendReportReplyPush } from "./outreach.js";
import { disputeReply } from "./proof.js";
import { readReportImage, reportImageSignatureOk, safeImageFile, signedImagePath } from "./report-media.js";
import { loadSecondLook } from "./second-look.js";
import { STILL_WORKING, TRACKER_DEFAULTS, dueAtFrom, isOverdue, trackerStepOf } from "./tracker.js";
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
} from "./wire.js";

async function adminGate(req: Incoming): Promise<void> {
  ensureRedis();
  await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
  requireAdmin(req);
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

export async function handleAdminFeedbackRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    await adminGate(req);
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
    await adminGate(req);
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
    await adminGate(req);
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

export async function handleReportStep(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    await adminGate(req);
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
