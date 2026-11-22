import { apiBaseUrl, currentAppUserId } from "./proxy";

/** "Know his real age?" on a shared scan. Returns false on any failure; nothing else depends on it. */
export async function sendRealAge(jobId: string, realAge: string, source: string): Promise<boolean> {
  const base = apiBaseUrl();
  const appUserId = await currentAppUserId();
  if (!base || !appUserId || !jobId) return false;
  try {
    const response = await fetch(`${base}/api/contribution-age`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, appUserId, realAge, source }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; saved?: boolean } | null;
    return Boolean(response.ok && body?.ok && body.saved);
  } catch {
    return false;
  }
}
