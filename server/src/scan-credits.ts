/**
 * Scan packs are consumables. A credit is added only after RevenueCat shows
 * that transaction on this app user, and the same transaction is never added twice.
 * Credits do not expire. A subscriber does not spend them.
 */

import { allowBucket, ensureRedis, kv } from "./kv.js";
import { revenueCatGrantSecret } from "./revenuecat-secret.js";
import {
  ApiError,
  type Incoming,
  type Outgoing,
  asRecord,
  callerKey,
  catchApi,
  fail,
  limitFromEnv,
  ok,
  requireAppUserId,
  userKey,
} from "./wire.js";

export const SCAN_PACKS: Record<string, number> = {
  deerage_scans_10: 10,
  deerage_scans_30: 30,
};

export interface ListedPurchase {
  productId: string;
  canonical: string;
  aliases: string[];
}

type LookupResult = ListedPurchase[] | "no_key" | "failed";

let lookupForTests: ((appUserId: string) => Promise<LookupResult>) | null = null;

export function setPackLookupForTests(next: typeof lookupForTests): void {
  lookupForTests = next;
}

function creditKey(appUserId: string): string {
  return `deerage:scancredit:${userKey(appUserId)}`;
}

function txnKey(transactionId: string): string {
  return `deerage:scancredit:tx:${transactionId}`;
}

function secret(): string {
  return revenueCatGrantSecret();
}

function asId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function purchasesFromSubscriber(body: unknown): ListedPurchase[] {
  const subscriber = body && typeof body === "object" ? (body as { subscriber?: { non_subscriptions?: unknown } }).subscriber : undefined;
  const groups = subscriber?.non_subscriptions;
  if (!groups || typeof groups !== "object" || Array.isArray(groups)) return [];
  const listed: ListedPurchase[] = [];
  for (const [productId, rows] of Object.entries(groups as Record<string, unknown>)) {
    if (!SCAN_PACKS[productId] || !Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const record = row as { id?: unknown; store_transaction_id?: unknown };
      const storeId = asId(record.store_transaction_id);
      const id = asId(record.id);
      const canonical = storeId || id;
      if (!canonical) continue;
      const aliases = [...new Set([canonical, storeId, id].filter(Boolean))];
      listed.push({ productId, canonical, aliases });
    }
  }
  return listed;
}

async function purchasesFor(appUserId: string): Promise<LookupResult> {
  if (lookupForTests) return lookupForTests(appUserId);
  const key = secret();
  if (!key) return "no_key";
  try {
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!response.ok) return "failed";
    return purchasesFromSubscriber(await response.json());
  } catch {
    return "failed";
  }
}

export async function readCredits(appUserId: string): Promise<number> {
  try {
    const raw = await kv().command(["GET", creditKey(appUserId)]);
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
}

/** Spend one credit. A missing balance stays at zero. */
export async function consumeCredit(appUserId: string): Promise<boolean> {
  const next = Number(await kv().command(["INCRBY", creditKey(appUserId), -1]));
  if (!Number.isFinite(next) || next < 0) {
    await kv().command(["INCRBY", creditKey(appUserId), 1]);
    return false;
  }
  return true;
}

export async function returnCredit(appUserId: string): Promise<void> {
  await kv().command(["INCRBY", creditKey(appUserId), 1]);
}

/**
 * Non-subscribers spend a pack credit before a free scan is used.
 * Subscribers do not spend credits. No credit and no free scan is blocked.
 */
export async function takeScanAllowance(input: {
  appUserId: string;
  entitled: boolean;
  freeUsesRemaining: number;
}): Promise<"subscriber" | "credit" | "free" | "blocked"> {
  if (input.entitled) return "subscriber";
  if (await consumeCredit(input.appUserId)) return "credit";
  if (input.freeUsesRemaining > 0) return "free";
  return "blocked";
}

async function creditNew(appUserId: string, canonical: string, amount: number): Promise<{ credits: number; added: number; already: boolean; rejected: boolean }> {
  const claimed = await kv().command(["SET", txnKey(canonical), userKey(appUserId), "NX"]);
  if (claimed !== "OK") {
    const owner = await kv().command(["GET", txnKey(canonical)]);
    if (owner !== userKey(appUserId)) return { credits: await readCredits(appUserId), added: 0, already: false, rejected: true };
    return { credits: await readCredits(appUserId), added: 0, already: true, rejected: false };
  }
  const next = Number(await kv().command(["INCRBY", creditKey(appUserId), amount]));
  return { credits: Number.isFinite(next) ? next : await readCredits(appUserId), added: amount, already: false, rejected: false };
}

export async function grantVerifiedPack(appUserId: string, productId: string, transactionId: string): Promise<{ credits: number; added: number; already: boolean } | "no_key" | "failed" | "rejected"> {
  const amount = SCAN_PACKS[productId];
  if (!amount) return "rejected";
  const listed = await purchasesFor(appUserId);
  if (listed === "no_key" || listed === "failed") return listed;
  const match = listed.find((purchase) => purchase.productId === productId && purchase.aliases.includes(transactionId));
  if (!match) return "rejected";
  const saved = await creditNew(appUserId, match.canonical, amount);
  if (saved.rejected) return "rejected";
  return { credits: saved.credits, added: saved.added, already: saved.already };
}

export async function restoreVerifiedPacks(appUserId: string): Promise<{ credits: number; added: number } | "no_key" | "failed"> {
  const listed = await purchasesFor(appUserId);
  if (listed === "no_key" || listed === "failed") return listed;
  let added = 0;
  for (const purchase of listed) {
    const amount = SCAN_PACKS[purchase.productId];
    if (!amount) continue;
    const saved = await creditNew(appUserId, purchase.canonical, amount);
    if (!saved.rejected) added += saved.added;
  }
  return { credits: await readCredits(appUserId), added };
}

function cleanTxn(value: unknown): string {
  if (typeof value !== "string") throw new ApiError(400, "invalid_request", "That purchase could not be confirmed. No scans were added.");
  const txn = value.trim();
  if (!txn || txn.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(txn)) {
    throw new ApiError(400, "invalid_request", "That purchase could not be confirmed. No scans were added.");
  }
  return txn;
}

async function gate(req: Incoming, appUserId: string): Promise<void> {
  ensureRedis();
  await allowBucket("scan-credits", callerKey(req) || appUserId, limitFromEnv("SCAN_CREDIT_RATE_LIMIT_PER_MINUTE", 20));
}

export async function handleScanCredits(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await gate(req, appUserId);
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!SCAN_PACKS[productId]) throw new ApiError(400, "invalid_request", "That scan pack is not available.");
    const transactionId = cleanTxn(body.transactionId);
    const result = await grantVerifiedPack(appUserId, productId, transactionId);
    if (result === "no_key") return fail(503, "not_configured", "Scan packs aren't available right now. No scans were added.");
    if (result === "failed") return fail(502, "upstream", "We couldn't confirm that purchase. No scans were added.");
    if (result === "rejected") return fail(400, "invalid_request", "That purchase could not be confirmed. No scans were added.");
    return ok({ credits: result.credits, added: result.added, already: result.already });
  } catch (error) {
    return catchApi(error, "We couldn't add those scans.");
  }
}

export async function handleRestoreScanCredits(req: Incoming): Promise<Outgoing> {
  if (req.method !== "POST") return fail(405, "invalid_request", "Use POST.");
  try {
    const body = asRecord(req.body);
    const appUserId = requireAppUserId(body.appUserId);
    await gate(req, appUserId);
    const result = await restoreVerifiedPacks(appUserId);
    if (result === "no_key") return fail(503, "not_configured", "Scan packs aren't available right now.");
    if (result === "failed") return fail(502, "upstream", "We couldn't confirm purchases just now.");
    return ok({ credits: result.credits, added: result.added });
  } catch (error) {
    return catchApi(error, "We couldn't restore those scans.");
  }
}
