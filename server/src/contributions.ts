/**
 * "Help improve DeerAge": photos a hunter chose to share for accuracy testing.
 *
 * Nothing is stored unless BOTH the hunter turned the switch on (the scan says contribute: true)
 * AND the owner turned contribute.enabled on in remote config. Photos are re-encoded with sharp,
 * which drops all EXIF (GPS, camera, time) before anything is written. Records keep a hash of
 * the app user id, never the id itself. Photos live in Redis like consented report photos and are
 * only downloadable through a signed admin link that expires.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { loadJob } from "./jobs.js";
import { allowBucket, ensureRedis, kv, redisGet, redisSet } from "./kv.js";
import { loadRemoteConfig } from "./remote-config.js";
export { defaultContributeConfig, normalizeContribute, patchContribute, type ContributeConfig } from "./contribute-config.js";
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
  queryParam,
  requireAdmin,
} from "./wire.js";

export const CONTRIB_INDEX = "deerage:contrib:index";
const MAX_STORED_IMAGE = 600_000;
const MAX_IMAGES = 3;
const PENDING_AGE_TTL_S = 24 * 60 * 60;

export interface Contribution {
  id: string;
  userHash: string;
  mode: string;
  createdAt: string;
  minimum: number;
  files: string[];
  result: Record<string, unknown>;
  realAge: { age: string; source: string; at: string } | null;
}

export function userHash(appUserId: string): string {
  return createHash("sha256").update(`deerage-contrib:${appUserId}`).digest("hex").slice(0, 32);
}

function recordKey(id: string): string {
  return `deerage:contrib:${id}`;
}

function imageKey(id: string, file: string): string {
  return `deerage:contrib-image:${id}:${file}`;
}

function pendingAgeKey(id: string): string {
  return `deerage:contrib-pending-age:${id}`;
}

export function safeContribId(value: string): string | null {
  return /^job_[a-f0-9]{16}$/.test(value) ? value : null;
}

function safeFile(value: string): string | null {
  return /^[0-2]\.jpg$/.test(value) ? value : null;
}

/** Re-encodes the photo. sharp writes no EXIF/XMP/GPS unless asked, so location is gone. */
export async function stripPhoto(base64: string): Promise<string | null> {
  const bare = base64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  if (!bare) return null;
  try {
    const input = Buffer.from(bare, "base64");
    for (const [edge, quality] of [[1600, 85], [1200, 78]] as const) {
      const out = await sharp(input)
        .rotate()
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
      const encoded = out.toString("base64");
      if (encoded.length <= MAX_STORED_IMAGE) return encoded;
    }
  } catch {
    return null;
  }
  return null;
}

/** The fields worth keeping for accuracy testing. No receipts, no user ids. */
export function resultSnapshot(result: Record<string, unknown>, final: Record<string, unknown>): Record<string, unknown> {
  const keep = [
    "ageLabel", "ageYears", "estimatedAgeYears", "highYears", "estimatedAgeClass", "isRange", "fieldCall",
    "reasons", "hunterCue", "pipeline", "quickEngine", "escalated", "plainAge", "grossScore", "netScore", "gross",
  ];
  const out: Record<string, unknown> = {};
  for (const name of keep) if (result[name] !== undefined) out[name] = result[name];
  if (typeof final.model === "string") out.model = final.model;
  if (typeof final.quickEngine === "string") out.quickEngine = final.quickEngine;
  return out;
}

const REAL_AGES = ["0.5", "1.5", "2.5", "3.5", "4.5", "5.5", "6.5", "7.5+"] as const;
const AGE_SOURCES = ["jawbone", "known", "other"] as const;

export function realAgeOf(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (text === "7.5" || text === "7.5+" || Number(text) >= 7.5) return "7.5+";
  return (REAL_AGES as readonly string[]).includes(text) ? text : null;
}

/**
 * Called after a scan job finishes, only when the hunter opted in.
 * Stores nothing unless the owner switch is on, the job finished with a result, and the cap has room.
 */
export async function saveContributionForJob(input: {
  jobId: string;
  appUserId: string;
  mode: string;
  minimum: number;
  images: string[];
}): Promise<"saved" | "off" | "full" | "no_result"> {
  const config = (await loadRemoteConfig()).contribute;
  if (!config.enabled) return "off";
  const job = await loadJob(input.jobId);
  const final = job?.status === "done" && job.final && typeof job.final === "object" ? job.final as Record<string, unknown> : null;
  const result = final && final.result && typeof final.result === "object" ? final.result as Record<string, unknown> : null;
  if (!final || !result) return "no_result";
  const count = Number(await kv().command(["SCARD", CONTRIB_INDEX])) || 0;
  if (count >= config.maxStored) return "full";
  const files: string[] = [];
  for (let i = 0; i < Math.min(MAX_IMAGES, input.images.length); i += 1) {
    const clean = await stripPhoto(input.images[i]);
    if (!clean) continue;
    const file = `${i}.jpg`;
    await redisSet(imageKey(input.jobId, file), clean);
    files.push(file);
  }
  if (files.length === 0) return "no_result";
  const pending = await redisGet(pendingAgeKey(input.jobId));
  let realAge: Contribution["realAge"] = null;
  if (pending) {
    try {
      const parsed = JSON.parse(pending) as Contribution["realAge"] & { userHash?: string };
      if (parsed && parsed.userHash === userHash(input.appUserId)) realAge = { age: parsed.age, source: parsed.source, at: parsed.at };
    } catch {
      realAge = null;
    }
  }
  const record: Contribution = {
    id: input.jobId,
    userHash: userHash(input.appUserId),
    mode: input.mode,
    createdAt: new Date().toISOString(),
    minimum: input.minimum,
    files,
    result: resultSnapshot(result, final),
    realAge,
  };
  await redisSet(recordKey(input.jobId), JSON.stringify(record));
  await kv().command(["SADD", CONTRIB_INDEX, input.jobId]);
  if (pending) await kv().command(["DEL", pendingAgeKey(input.jobId)]);
  console.log(JSON.stringify({ event: "contribution_saved", mode: input.mode, files: files.length }));
  return "saved";
}

export async function loadContribution(id: string): Promise<Contribution | null> {
  const raw = await redisGet(recordKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Contribution;
  } catch {
    return null;
  }
}

/** POST /api/contribution-age {jobId, appUserId, realAge, source}. The hunter's own scan only. */
export async function handleContributionAge(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    await allowBucket("contrib-age", `contrib-age:${callerKey(req)}`, limitFromEnv("CONTRIB_AGE_PER_MINUTE", 20));
    const body = asRecord(req.body);
    const id = safeContribId(cleanText(body.jobId, 40));
    const appUserId = cleanText(body.appUserId, 200);
    const age = realAgeOf(body.realAge);
    const source = (AGE_SOURCES as readonly string[]).includes(String(body.source)) ? String(body.source) : "other";
    if (!id || !appUserId || !age) throw new ApiError(400, "invalid_request", "Send a scan and an age.");
    const config = (await loadRemoteConfig()).contribute;
    if (!config.enabled) return ok({ saved: false });
    const entry = { age, source, at: new Date().toISOString() };
    const record = await loadContribution(id);
    if (!record) {
      // The photo may still be saving. Hold the age for a day; the save picks it up.
      await kv().command(["SET", pendingAgeKey(id), JSON.stringify({ ...entry, userHash: userHash(appUserId) }), "EX", PENDING_AGE_TTL_S]);
      return ok({ saved: true, pending: true });
    }
    if (record.userHash !== userHash(appUserId)) throw new ApiError(404, "invalid_request", "No shared scan with that id.");
    record.realAge = entry;
    await redisSet(recordKey(id), JSON.stringify(record));
    return ok({ saved: true });
  } catch (error) {
    return catchApi(error, "Couldn't save that age.");
  }
}

function secret(): string {
  return process.env.ADMIN_TOKEN?.trim() || "";
}

function sign(id: string, file: string, exp: number): string {
  return createHmac("sha256", secret()).update(`contrib-image.${id}.${file}.${exp}`).digest("hex");
}

export function contributionImagePath(id: string, file: string, ttlMs = 60 * 60 * 1000): string {
  const exp = Date.now() + ttlMs;
  return `/api/admin/contribution-image?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}&exp=${exp}&sig=${sign(id, file, exp)}`;
}

export function contributionSignatureOk(id: string, file: string, exp: number, sig: string): boolean {
  if (!secret() || !safeContribId(id) || !safeFile(file) || !Number.isFinite(exp) || exp < Date.now()) return false;
  const left = Buffer.from(sign(id, file, exp));
  const right = Buffer.from(sig);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function adminGate(req: Incoming): Promise<void> {
  ensureRedis();
  await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
  requireAdmin(req);
}

/** GET /api/admin/contributions?limit=100 (Bearer admin token). Newest first, with 1-hour photo links. */
export async function handleAdminContributions(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    await adminGate(req);
    const limit = Math.min(500, Math.max(1, Number(queryParam(req, "limit")) || 100));
    const ids = ((await kv().command(["SMEMBERS", CONTRIB_INDEX])) as string[] | null) ?? [];
    const records: Contribution[] = [];
    for (const id of ids) {
      const record = safeContribId(id) ? await loadContribution(id) : null;
      if (record) records.push(record);
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const config = (await loadRemoteConfig()).contribute;
    return ok({
      enabled: config.enabled,
      maxStored: config.maxStored,
      total: records.length,
      withRealAge: records.filter((record) => record.realAge).length,
      contributions: records.slice(0, limit).map((record) => ({
        ...record,
        photos: record.files.map((file) => contributionImagePath(record.id, file)),
      })),
    }, { "cache-control": "no-store" });
  } catch (error) {
    return catchApi(error, "Couldn't list contributions.");
  }
}

/** GET /api/admin/contribution-image?id&file&exp&sig: the stripped JPEG. */
export async function handleContributionImage(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    ensureRedis();
    const id = queryParam(req, "id");
    const file = queryParam(req, "file");
    if (!contributionSignatureOk(id, file, Number(queryParam(req, "exp")), queryParam(req, "sig"))) {
      return fail(403, "invalid_request", "That image link is not valid.");
    }
    const image = await redisGet(imageKey(id, file));
    if (!image) return fail(404, "invalid_request", "That photo is no longer stored.");
    return { status: 200, body: null, text: image, contentType: "text/plain; charset=utf-8", headers: { "cache-control": "no-store" } };
  } catch (error) {
    return catchApi(error, "Couldn't read that photo.");
  }
}
