/**
 * Mounts, decoys, drawings, and harvested deer still come back as not_deer
 * (Quick Check) or retake (Age, Score, and a harvested Quick Check, which the
 * app stores as too_small). The title follows the server sentence so a head
 * mount or a dead deer is not called "not a deer" or "get closer".
 * A car, room, person, or dog keeps "NOT A DEER". A real zoom retake keeps
 * "GET CLOSER OR ZOOM IN".
 */

export const NOT_A_LIVE_DEER_TITLE = "NOT A LIVE DEER";
export const JAWBONE_TIP = "Check the teeth on the lower jawbone.";

const NOT_LIVE_CODES = new Set(["head_mount", "not_deer", "retake", "too_small"]);

function messageText(message: string | null | undefined): string {
  return (message ?? "").toLowerCase();
}

/** Server wording for a mount, decoy, drawing, or a harvested / dead deer. */
export function messageIsNotLive(message: string | null | undefined): boolean {
  const text = messageText(message);
  if (text.includes("not a live deer") || text.includes("harvested or dead")) return true;
  return /\bmount\b/.test(text);
}

export function isNotLiveRejection(code: string | null | undefined, message?: string | null): boolean {
  if (!code || !NOT_LIVE_CODES.has(code)) return false;
  if (code === "head_mount") return true;
  return messageIsNotLive(message);
}

/** Not-live photos use NOT A LIVE DEER. Every other photo keeps `fallback`. */
export function rejectionTitle(code: string | null | undefined, message: string | null | undefined, fallback: string): string {
  if (isNotLiveRejection(code, message)) return NOT_A_LIVE_DEER_TITLE;
  return fallback;
}

function quickFallback(reason: string): string {
  if (reason === "not_deer") return "NOT A DEER";
  if (reason === "no_body_visible") return "BODY NOT VISIBLE";
  if (reason === "too_small" || reason === "retake") return "GET CLOSER OR ZOOM IN";
  return "POOR IMAGE QUALITY";
}

/** Title on the Quick Check rejection screen. */
export function quickCheckRejectionTitle(input: {
  missingAge?: boolean;
  reason?: string | null;
  message?: string | null;
}): string {
  if (input.missingAge) return "NO AGE READ";
  const reason = input.reason ?? "";
  return rejectionTitle(reason, input.message, quickFallback(reason));
}

/**
 * One short tip when the deer is harvested or dead. Null keeps the screen's
 * own tips. The server sentence stays the subtitle.
 */
export function notLiveTips(message: string | null | undefined): string[] | null {
  if (!messageText(message).includes("harvested or dead")) return null;
  return [JAWBONE_TIP];
}
