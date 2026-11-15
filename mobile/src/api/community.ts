import { getRevenueCatAppUserId } from "../lib/revenuecatClient";
import type { FeedPayload } from "../state/communityStore";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { apiBaseUrl } from "./proxy";

export async function resolveAppUserId(): Promise<string> {
  return (await getRevenueCatAppUserId()) || useSubscriptionStore.getState().ensureLocalUserId();
}

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> | null }> {
  const base = apiBaseUrl();
  if (!base) return { ok: false, status: 0, payload: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: response.ok && payload?.ok !== false, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, payload: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFeed(): Promise<FeedPayload | null> {
  const base = apiBaseUrl();
  if (!base) return null;
  const appUserId = await resolveAppUserId();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${base}/api/feed?appUserId=${encodeURIComponent(appUserId)}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Partial<FeedPayload> | null;
    if (!payload || !Array.isArray(payload.announcements) || !Array.isArray(payload.polls)) return null;
    return {
      announcements: payload.announcements,
      polls: payload.polls,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function submitVote(pollId: string, optionId: string): Promise<{ ok: boolean; optionId: string }> {
  const appUserId = await resolveAppUserId();
  const result = await postJson("/api/poll-vote", { appUserId, pollId, optionId });
  const returned = typeof result.payload?.optionId === "string" ? result.payload.optionId : optionId;
  if (result.ok || result.payload?.code === "already_voted") {
    return { ok: true, optionId: returned };
  }
  return { ok: false, optionId: returned };
}

export async function registerPushToken(token: string): Promise<boolean> {
  const appUserId = await resolveAppUserId();
  const result = await postJson("/api/push-token", { appUserId, token, enabled: true });
  return result.ok;
}

export async function unregisterPushToken(): Promise<void> {
  const appUserId = await resolveAppUserId();
  await postJson("/api/push-token", { appUserId, enabled: false });
}

export async function submitEmail(email: string): Promise<{ ok: boolean; unsubscribeToken: string | null; message: string }> {
  const appUserId = await resolveAppUserId();
  const result = await postJson("/api/email-optin", { appUserId, email });
  if (!result.ok) {
    const message = result.payload?.code === "invalid_request"
      ? "Enter a valid email."
      : "Couldn't save that. Check the address and your signal.";
    return { ok: false, unsubscribeToken: null, message };
  }
  const unsubscribeToken = typeof result.payload?.unsubscribeToken === "string" ? result.payload.unsubscribeToken : null;
  return { ok: true, unsubscribeToken, message: "" };
}

export async function unsubscribeEmail(unsubscribeToken: string | null): Promise<boolean> {
  const appUserId = await resolveAppUserId();
  const result = await postJson("/api/email-unsubscribe", unsubscribeToken ? { token: unsubscribeToken, appUserId } : { appUserId });
  return result.ok;
}
