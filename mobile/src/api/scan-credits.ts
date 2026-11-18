import { resolveAppUserId } from "./community";
import { apiBaseUrl } from "./proxy";
import { useSubscriptionStore } from "../state/subscriptionStore";

async function postCredits(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; credits: number | null; message: string }> {
  const base = apiBaseUrl();
  if (!base) return { ok: false, credits: null, message: "No scans were added." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; credits?: unknown; message?: string } | null;
    const credits = typeof payload?.credits === "number" ? payload.credits : null;
    if (!response.ok || payload?.ok === false) {
      return { ok: false, credits, message: payload?.message || "No scans were added." };
    }
    return { ok: true, credits, message: "" };
  } catch {
    return { ok: false, credits: null, message: "No scans were added." };
  } finally {
    clearTimeout(timer);
  }
}

/** Read the server balance. A failed request leaves the last known count alone. */
export async function refreshScanCredits(): Promise<void> {
  const base = apiBaseUrl();
  if (!base) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const appUserId = await resolveAppUserId();
    const response = await fetch(`${base}/api/access?appUserId=${encodeURIComponent(appUserId)}`, { signal: controller.signal });
    if (!response.ok) return;
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      entitled?: boolean;
      freeUsesRemaining?: number | null;
      scanCredits?: unknown;
    } | null;
    if (!payload?.ok) return;
    const credits = typeof payload.scanCredits === "number" ? payload.scanCredits : undefined;
    const remaining = payload.entitled ? null : typeof payload.freeUsesRemaining === "number" ? payload.freeUsesRemaining : null;
    useSubscriptionStore.getState().noteServerUsage(remaining, credits);
  } catch {
    // Offline keeps the last count, the same as a free-scan check that cannot reach the server.
  } finally {
    clearTimeout(timer);
  }
}

export async function claimScanPack(productId: string, transactionId: string): Promise<{ ok: boolean; message: string }> {
  const appUserId = await resolveAppUserId();
  const result = await postCredits("/api/scan-credits", { appUserId, productId, transactionId });
  if (result.ok && result.credits != null) {
    useSubscriptionStore.getState().noteServerUsage(
      useSubscriptionStore.getState().entitled ? null : useSubscriptionStore.getState().remainingFree(),
      result.credits,
    );
  }
  return { ok: result.ok, message: result.message };
}

export async function restoreScanPacks(): Promise<{ ok: boolean; credits: number | null }> {
  const appUserId = await resolveAppUserId();
  const result = await postCredits("/api/scan-credits-restore", { appUserId });
  if (result.ok && result.credits != null) {
    useSubscriptionStore.getState().noteServerUsage(
      useSubscriptionStore.getState().entitled ? null : useSubscriptionStore.getState().remainingFree(),
      result.credits,
    );
  }
  return { ok: result.ok, credits: result.credits };
}
