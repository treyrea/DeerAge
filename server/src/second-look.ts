/**
 * One free second look per scan. It uses SECOND_LOOK_MODEL and the antler-covered body check.
 * It does not spend a fair-use analysis. The daily spend reserve still applies.
 */

import { readingFrom, boxesFrom } from "./age-pipeline.js";
import { finalCall, classStep } from "./field-call.js";
import { callModel } from "./gateway.js";
import { coverAntlers } from "./mask.js";
import { antlerBoxPrompt, bodyFirstAgePrompt, maskedAgePrompt } from "./prompts.js";
import { allowBucket, ensureRedis, kv, membersOf, readJson, redisSet } from "./kv.js";
import { dailySpendCapUsd, dayStamp } from "./limits.js";
import { readReportImage, saveReportImage } from "./report-media.js";
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
  userKey,
} from "./wire.js";

export interface SecondLook {
  scanId: string;
  appUserId: string;
  originalCall: string;
  originalAge: number | null;
  secondAge: number | null;
  secondCall: string;
  bodyOnlyAge: number | null;
  agree: boolean | null;
  note: string;
  cues: { area: string; text: string }[];
  model: string;
  costUsd: number;
  createdAt: string;
}

export interface SecondLookRun {
  ageYears: number | null;
  fieldCall: string;
  bodyOnlyAge: number | null;
  cues: { area: string; text: string }[];
  model: string;
  costUsd: number;
}

const RESERVE = 0.12;

async function holdSpend(amount: number): Promise<boolean> {
  const key = `deerage:spend:${dayStamp()}`;
  const [afterRaw] = await kv().pipeline([
    ["INCRBYFLOAT", key, amount.toFixed(6)],
    ["EXPIRE", key, 3 * 24 * 60 * 60],
  ]);
  const after = Number(afterRaw) || 0;
  if (after - amount >= dailySpendCapUsd()) {
    await kv().command(["INCRBYFLOAT", key, (-amount).toFixed(6)]);
    return false;
  }
  return true;
}

async function settleSpend(reserved: number, actual: number): Promise<void> {
  const delta = actual - reserved;
  if (Math.abs(delta) < 0.0000001) return;
  await kv().command(["INCRBYFLOAT", `deerage:spend:${dayStamp()}`, delta.toFixed(6)]);
}

export function secondLookModel(): string {
  return process.env.SECOND_LOOK_MODEL?.trim()
    || process.env.AGE_MODEL?.trim()
    || "anthropic/claude-fable-5.2";
}

function lookKey(appUserId: string, scanId: string): string {
  return `deerage:second-look:${userKey(appUserId)}:${encodeURIComponent(scanId).slice(0, 80)}`;
}

export function agreementNote(originalAge: number | null, secondAge: number | null, originalCall: string, secondCall: string): { agree: boolean | null; note: string } {
  if (originalAge == null || secondAge == null) {
    return { agree: null, note: "One of the ages did not come back, so the two reads cannot be compared yet." };
  }
  const agree = classStep(originalAge) === classStep(secondAge);
  if (agree) {
    return { agree: true, note: `They agree. Both read ${classStep(secondAge).toFixed(1)}.` };
  }
  return {
    agree: false,
    note: `They disagree. The first call was ${originalCall || "on file"} at ${classStep(originalAge).toFixed(1)}. The second look reads ${classStep(secondAge).toFixed(1)}${secondCall ? ` (${secondCall})` : ""}.`,
  };
}

async function liveSecondLook(image: string, minimum: number): Promise<SecondLookRun> {
  const model = secondLookModel();
  const main = await callModel({
    role: "age",
    model,
    prompt: bodyFirstAgePrompt(minimum),
    images: [image],
    maxTokens: 2000,
    timeoutMs: 30_000,
    effort: null,
    allowStatusRetry: true,
  });
  const mainRead = readingFrom(main.text);
  let bodyOnlyAge: number | null = null;
  let extra = 0;
  try {
    const boxes = await callModel({
      role: "boxes",
      prompt: antlerBoxPrompt(),
      images: [image],
      maxTokens: 500,
      timeoutMs: 12_000,
      effort: "low",
      allowStatusRetry: true,
    });
    extra += boxes.usd;
    const found = boxesFrom(boxes.text);
    if (found.length > 0) {
      const covered = await coverAntlers(image, found);
      const masked = await callModel({
        role: "masked",
        model,
        prompt: maskedAgePrompt(),
        images: [covered],
        maxTokens: 800,
        timeoutMs: 15_000,
        effort: null,
        allowStatusRetry: true,
      });
      extra += masked.usd;
      bodyOnlyAge = readingFrom(masked.text).age;
    }
  } catch {
    // The second age still stands. The body check is simply missing.
  }
  const decision = finalCall({
    mainYears: mainRead.age,
    bodyYears: bodyOnlyAge,
    minimum,
    confirmed: mainRead.age != null,
  });
  return {
    ageYears: mainRead.age,
    fieldCall: decision.fieldCall,
    bodyOnlyAge,
    cues: mainRead.labeled,
    model,
    costUsd: main.usd + extra,
  };
}

let runner: (image: string, minimum: number) => Promise<SecondLookRun> = liveSecondLook;

export function setSecondLookRunnerForTests(next: typeof runner | null): void {
  runner = next ?? liveSecondLook;
}

export async function loadSecondLook(appUserId: string, scanId: string): Promise<SecondLook | null> {
  return readJson<SecondLook | null>(lookKey(appUserId, scanId), null);
}

async function imageFor(scanId: string, supplied: string): Promise<string> {
  if (supplied) return supplied.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  const stored = await readReportImage(`scan_${encodeURIComponent(scanId).slice(0, 60)}`, "0.jpg");
  if (stored) return stored;
  const ids = await membersOf(`deerage:feedback:scan:${encodeURIComponent(scanId).slice(0, 80)}`);
  for (const id of ids) {
    const row = await readJson<{ imageFiles?: string[] } | null>(`deerage:feedback:${id}`, null);
    const file = row?.imageFiles?.[0];
    if (!file) continue;
    const image = await readReportImage(id, file);
    if (image) return image;
  }
  return "";
}

export async function handleSecondLook(req: Incoming): Promise<Outgoing> {
  try {
    ensureRedis();
    if (req.method === "GET") {
      const appUserId = requireAppUserId(queryParam(req, "appUserId"));
      const scanId = cleanText(queryParam(req, "scanId"), 80);
      const existing = await loadSecondLook(appUserId, scanId);
      return ok({ secondLook: existing });
    }
    if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await allowBucket("second-look", appUserId, limitFromEnv("SECOND_LOOK_RATE_LIMIT_PER_MINUTE", 4));
    const scanId = cleanText(body.scanId, 80);
    const existing = await loadSecondLook(appUserId, scanId);
    if (existing) return ok({ secondLook: existing, reused: true });
    const minimum = Number(body.minimum);
    const lease = Number.isFinite(minimum) && minimum > 0 ? minimum : 4.5;
    const originalAge = Number(body.originalAge);
    const originalCall = body.originalCall == null ? "" : cleanText(body.originalCall, 40);
    const supplied = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const image = await imageFor(scanId, supplied);
    if (!image) throw new ApiError(400, "invalid_request", "A photo is required for a second look.");
    const reserved = await holdSpend(RESERVE);
    if (!reserved) return fail(503, "busy", "DeerAge is busy right now. Try the second look in a little while.");
    try {
      await saveReportImage(`scan_${encodeURIComponent(scanId).slice(0, 60)}`, "0.jpg", image);
      const run = await runner(image, lease);
      await settleSpend(RESERVE, run.costUsd);
      const compared = agreementNote(Number.isFinite(originalAge) ? originalAge : null, run.ageYears, originalCall, run.fieldCall);
      const look: SecondLook = {
        scanId,
        appUserId,
        originalCall,
        originalAge: Number.isFinite(originalAge) ? originalAge : null,
        secondAge: run.ageYears,
        secondCall: run.fieldCall,
        bodyOnlyAge: run.bodyOnlyAge,
        agree: compared.agree,
        note: compared.note,
        cues: run.cues,
        model: run.model,
        costUsd: run.costUsd,
        createdAt: new Date().toISOString(),
      };
      await redisSet(lookKey(appUserId, scanId), JSON.stringify(look));
      return ok({ secondLook: look, reused: false });
    } catch (error) {
      await settleSpend(RESERVE, 0);
      throw error;
    }
  } catch (error) {
    return catchApi(error, "Couldn't finish the second look.");
  }
}
