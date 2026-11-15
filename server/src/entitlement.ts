import { ACCESS_ENTITLEMENTS, FREE_LIFETIME_ANALYSES } from "./config.js";

const RC_BASE = "https://api.revenuecat.com/v1/subscribers";
const ATTRIBUTE = "deerage_free_uses";

export interface AccessSnapshot {
  entitled: boolean;
  freeUsesUsed: number;
  freeUsesRemaining: number | null;
  entitlementIds: string[];
}

interface RcEntitlement {
  expires_date: string | null;
}

interface RcSubscriber {
  entitlements?: Record<string, RcEntitlement>;
  subscriber_attributes?: Record<string, { value?: string }>;
}

function secret(): string {
  return process.env.REVENUECAT_SECRET_API_KEY?.trim() ?? "";
}

export function revenueCatConfigured(): boolean {
  return secret().length > 0;
}

function grantKey(): string {
  return process.env.REVENUECAT_SECRET_KEY?.trim() || process.env.REVENUECAT_SECRET_API_KEY?.trim() || "";
}

/** Grants one promotional month when a secret is set. Returns false when it is not. */
export async function grantPromotionalMonth(appUserId: string): Promise<boolean> {
  const key = grantKey();
  if (!key) return false;
  const entitlement = process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || "deerage_pro";
  const response = await fetch(`${RC_BASE}/${encodeUser(appUserId)}/entitlements/${encodeURIComponent(entitlement)}/promotional`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ duration: "monthly" }),
  });
  if (!response.ok) throw new Error(`revenuecat_grant_${response.status}`);
  return true;
}

function isActive(entitlement: RcEntitlement | undefined): boolean {
  if (!entitlement) return false;
  if (!entitlement.expires_date) return true;
  const expires = Date.parse(entitlement.expires_date);
  return Number.isFinite(expires) && expires > Date.now();
}

async function rc(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(`${RC_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function encodeUser(appUserId: string): string {
  return encodeURIComponent(appUserId);
}

export async function readAccess(appUserId: string): Promise<AccessSnapshot> {
  const response = await rc(`/${encodeUser(appUserId)}`);
  if (response.status === 404) {
    return { entitled: false, freeUsesUsed: 0, freeUsesRemaining: FREE_LIFETIME_ANALYSES, entitlementIds: [] };
  }
  if (!response.ok) {
    throw new Error(`revenuecat_${response.status}`);
  }
  const payload = (await response.json()) as { subscriber?: RcSubscriber };
  const subscriber = payload.subscriber ?? {};
  const entitlementIds = ACCESS_ENTITLEMENTS.filter((id) => isActive(subscriber.entitlements?.[id]));
  const raw = subscriber.subscriber_attributes?.[ATTRIBUTE]?.value ?? "0";
  const freeUsesUsed = Math.max(0, Number.parseInt(raw, 10) || 0);
  if (entitlementIds.length > 0) {
    return { entitled: true, freeUsesUsed, freeUsesRemaining: null, entitlementIds: [...entitlementIds] };
  }
  return {
    entitled: false,
    freeUsesUsed,
    freeUsesRemaining: Math.max(0, FREE_LIFETIME_ANALYSES - freeUsesUsed),
    entitlementIds: [],
  };
}

export async function writeFreeUses(appUserId: string, used: number): Promise<void> {
  const response = await rc(`/${encodeUser(appUserId)}/attributes`, {
    method: "POST",
    body: JSON.stringify({
      attributes: {
        [ATTRIBUTE]: { value: String(Math.max(0, used)) },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`revenuecat_attr_${response.status}`);
  }
}
