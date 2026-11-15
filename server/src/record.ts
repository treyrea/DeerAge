/**
 * Signs a pre-shot record. Redis stores the hash, signature, time, and the
 * short signed summary. Photo bytes never go into Redis.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { allowBucket, ensureRedis, readJson, redisSet } from "./kv.js";
import {
  type Incoming,
  type Outgoing,
  callerKey,
  catchApi,
  fail,
  limitFromEnv,
  queryParam,
} from "./wire.js";

export interface RecordSummary {
  mode: string;
  ageClass: string;
  ageRange: string;
  confidence: number;
  leaseMinimum: number;
  fieldCall: string;
  fieldCallNote: string;
  cues: string[];
}

export interface RecordReceipt {
  id: string;
  serverTime: string;
  contentHash: string;
  signature: string;
  imageHashes: string[];
  summary: RecordSummary;
}

interface StoredRecord {
  contentHash: string;
  signature: string;
  serverTime: string;
  summary: RecordSummary;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function sign(secret: string, contentHash: string): string {
  return createHmac("sha256", secret).update(contentHash).digest("hex");
}

function signaturesMatch(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function canonicalRecord(input: {
  serverTime: string;
  imageHashes: string[];
  summary: RecordSummary;
}): string {
  return JSON.stringify({
    ageClass: input.summary.ageClass,
    ageRange: input.summary.ageRange,
    confidence: input.summary.confidence,
    cues: input.summary.cues,
    fieldCall: input.summary.fieldCall,
    fieldCallNote: input.summary.fieldCallNote,
    imageHashes: input.imageHashes,
    leaseMinimum: input.summary.leaseMinimum,
    mode: input.summary.mode,
    serverTime: input.serverTime,
  });
}

function cuesOf(result: Record<string, unknown>): string[] {
  if (Array.isArray(result.cueBullets)) {
    return result.cueBullets.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as { area?: unknown; text?: unknown };
      const text = typeof item.text === "string" ? item.text.trim() : "";
      if (!text) return [];
      const area = typeof item.area === "string" ? item.area : "Body";
      return [`${area}: ${text}`];
    }).slice(0, 6);
  }
  if (Array.isArray(result.topCues)) {
    return result.topCues.filter((cue): cue is string => typeof cue === "string").slice(0, 6);
  }
  return [];
}

export function summaryFromResult(mode: string, result: Record<string, unknown>, minimum: number): RecordSummary {
  const ageClass = typeof result.ageClass === "string" ? result.ageClass : "";
  const ageRange = typeof result.estimatedAge === "string"
    ? result.estimatedAge
    : typeof result.estimatedAgeClass === "string"
      ? result.estimatedAgeClass
      : ageClass;
  const confidence = typeof result.overallConfidence === "number"
    ? result.overallConfidence
    : typeof result.confidence === "number"
      ? result.confidence
      : result.confidence === "High"
        ? 80
        : result.confidence === "Low"
          ? 40
          : result.confidence === "Med"
            ? 60
            : 0;
  return {
    mode,
    ageClass,
    ageRange,
    confidence: Math.round(confidence),
    leaseMinimum: typeof result.leaseMinimum === "number" ? result.leaseMinimum : minimum,
    fieldCall: typeof result.fieldCall === "string" ? result.fieldCall : "",
    fieldCallNote: typeof result.fieldCallNote === "string" ? result.fieldCallNote : "",
    cues: cuesOf(result),
  };
}

export async function issueRecord(input: {
  appUserId: string;
  images: string[];
  mode: string;
  result: Record<string, unknown>;
  minimum: number;
}): Promise<RecordReceipt | null> {
  const secret = process.env.RECORD_SIGNING_SECRET?.trim() ?? "";
  if (!secret) return null;
  try {
    ensureRedis();
    const serverTime = new Date().toISOString();
    const imageHashes = input.images.map((image) => sha256(image));
    const summary = summaryFromResult(input.mode, input.result, input.minimum);
    const contentHash = sha256(canonicalRecord({ serverTime, imageHashes, summary }));
    const signature = sign(secret, contentHash);
    const id = `rec_${randomBytes(8).toString("hex")}`;
    const stored: StoredRecord = { contentHash, signature, serverTime, summary };
    await redisSet(`deerage:record:${id}`, JSON.stringify(stored));
    return { id, serverTime, contentHash, signature, imageHashes, summary };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
}

function page(stored: StoredRecord, valid: boolean): string {
  const summary = stored.summary;
  const cues = summary.cues.map((cue) => `<li>${escapeHtml(cue)}</li>`).join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>DeerAge record</title></head>
<body style="font-family:Georgia,serif;background:#1a1f16;color:#F5F5DC;padding:24px">
<h1 style="font-size:22px">DeerAge pre-shot record</h1>
<p>${valid ? "This signature matches a record DeerAge issued." : "This signature does not match."}</p>
<p>Server time: ${escapeHtml(stored.serverTime)}</p>
<p>Age class: ${escapeHtml(summary.ageClass || "n/a")} (${escapeHtml(summary.ageRange || "n/a")})</p>
<p>Call: ${escapeHtml(summary.fieldCall || "n/a")}</p>
<p>Lease minimum: ${escapeHtml(String(summary.leaseMinimum))}</p>
<p>${escapeHtml(summary.fieldCallNote)}</p>
<ul>${cues}</ul>
<p style="word-break:break-all">Hash: ${escapeHtml(stored.contentHash)}</p>
<p style="color:#E5D4B8">This confirms the time DeerAge signed the read. It is a good-faith note. It is not legal proof, and it does not override a lease manager or a game warden. The age read is from a photo and can be wrong.</p>
</body></html>`;
}

export async function handleVerifyRecord(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    await allowBucket("verify", callerKey(req), limitFromEnv("VERIFY_RATE_LIMIT_PER_MINUTE", 30));
    const secret = process.env.RECORD_SIGNING_SECRET?.trim() ?? "";
    if (!secret) return fail(503, "not_configured", "Record checks are not configured.");
    ensureRedis();
    const id = queryParam(req, "id").trim();
    if (!/^rec_[a-f0-9]{16}$/.test(id)) return fail(400, "invalid_request", "That record id is not valid.");
    const stored = await readJson<StoredRecord | null>(`deerage:record:${id}`, null);
    if (!stored?.contentHash || !stored.signature) return fail(404, "invalid_request", "No record with that id.");
    const valid = signaturesMatch(stored.signature, sign(secret, stored.contentHash));
    if (queryParam(req, "json") === "1") {
      return {
        status: 200,
        body: {
          ok: true,
          valid,
          serverTime: stored.serverTime,
          contentHash: stored.contentHash,
          summary: stored.summary,
        },
      };
    }
    return { status: 200, body: null, text: page(stored, valid), contentType: "text/html; charset=utf-8" };
  } catch (error) {
    return catchApi(error, "Couldn't check that record.");
  }
}
