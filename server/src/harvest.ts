/**
 * Confirmed ages from harvested deer. One row per app user id and scan id.
 */

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
  userKey,
} from "./wire.js";

const INDEX = "deerage:harvest:index";

export interface HarvestRecord {
  appUserId: string;
  scanId: string;
  harvested: boolean;
  harvestedAt: string | null;
  confirmedAge: string | null;
  method: "jawbone" | "lab" | "other" | null;
  notes: string;
  updatedAt: string;
}

function harvestKey(appUserId: string, scanId: string): string {
  return `deerage:harvest:${userKey(appUserId)}:${encodeURIComponent(scanId).slice(0, 80)}`;
}

function indexMember(appUserId: string, scanId: string): string {
  return `${userKey(appUserId)}|${encodeURIComponent(scanId).slice(0, 80)}`;
}

function methodOf(value: unknown): HarvestRecord["method"] {
  if (value == null || value === "") return null;
  if (value === "jawbone" || value === "lab" || value === "other") return value;
  throw new ApiError(400, "invalid_request", "Method must be jawbone, lab, or other.");
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
  return value;
}

export async function handleHarvestRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    ensureRedis();
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await allowBucket("harvest", appUserId, limitFromEnv("HARVEST_RATE_LIMIT_PER_MINUTE", 12));
    const scanId = cleanText(body.scanId, 80);
    const existing = await readJson<HarvestRecord | null>(harvestKey(appUserId, scanId), null);
    const harvested = body.harvested === false ? false : true;
    const record: HarvestRecord = {
      appUserId,
      scanId,
      harvested,
      harvestedAt: harvested ? (existing?.harvestedAt ?? new Date().toISOString()) : null,
      confirmedAge: body.confirmedAge == null || body.confirmedAge === "" ? (existing?.confirmedAge ?? null) : cleanText(body.confirmedAge, 40),
      method: body.method === undefined ? (existing?.method ?? null) : methodOf(body.method),
      notes: body.notes == null ? (existing?.notes ?? "") : (body.notes === "" ? "" : cleanText(body.notes, 500)),
      updatedAt: new Date().toISOString(),
    };
    if (!harvested) {
      record.confirmedAge = null;
      record.method = null;
    }
    await redisSet(harvestKey(appUserId, scanId), JSON.stringify(record));
    await kv().command(["SADD", INDEX, indexMember(appUserId, scanId)]);
    return ok({ harvest: record });
  } catch (error) {
    return catchApi(error, "Couldn't save that harvest.");
  }
}

export async function handleAdminHarvestsRequest(req: Incoming): Promise<Outgoing> {
  if (req.method !== "GET") return fail(405, "invalid_request", "Use GET.");
  try {
    ensureRedis();
    await allowBucket("admin", `admin:${callerKey(req)}`, limitFromEnv("ADMIN_RATE_LIMIT_PER_MINUTE", 30));
    requireAdmin(req);
    const members = await membersOf(INDEX);
    const records: HarvestRecord[] = [];
    for (let i = 0; i < members.length; i += 40) {
      const slice = members.slice(i, i + 40);
      const values = await kv().pipeline(slice.map((member) => {
        const [user, scan] = member.split("|");
        return ["GET", `deerage:harvest:${user}:${scan}`];
      }));
      values.forEach((value) => {
        if (typeof value !== "string") return;
        try {
          const parsed = JSON.parse(value) as HarvestRecord;
          if (parsed?.scanId && parsed.appUserId) records.push(parsed);
        } catch {
          // Skip a corrupt row.
        }
      });
    }
    records.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const lines = ["appUserId,scanId,harvested,harvestedAt,confirmedAge,method,notes,updatedAt"];
    for (const record of records) {
      lines.push([
        record.appUserId,
        record.scanId,
        record.harvested ? "yes" : "no",
        record.harvestedAt ?? "",
        record.confirmedAge ?? "",
        record.method ?? "",
        record.notes,
        record.updatedAt,
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
    return catchApi(error, "Couldn't export harvests.");
  }
}
