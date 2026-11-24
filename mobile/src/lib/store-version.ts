import { Platform } from "react-native";

/** Live App Store version for id 6755117006. Cached for six hours in this process. */

export const APP_STORE_ID = "6755117006";
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
export const PLAY_STORE_PACKAGE = "com.secondgen.buckage";
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;

export function storeListingUrl(platform: string = Platform.OS): string {
  return platform === "android" ? PLAY_STORE_URL : APP_STORE_URL;
}

export function storeName(platform: string = Platform.OS): string {
  return platform === "android" ? "Google Play" : "the App Store";
}

const CACHE_MS = 6 * 60 * 60 * 1000;

let cached: { version: string; at: number } | null = null;

export function resetStoreVersionCache(): void {
  cached = null;
}

export async function liveStoreVersion(options?: {
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<string | null> {
  const now = options?.now ?? Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.version;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}`, { signal: controller.signal });
    if (!response.ok) return cached?.version ?? null;
    const body = await response.json() as { results?: { version?: string }[] };
    const version = body.results?.[0]?.version?.trim() ?? "";
    if (!version) return cached?.version ?? null;
    cached = { version, at: now };
    return version;
  } catch {
    return cached?.version ?? null;
  } finally {
    clearTimeout(timer);
  }
}
