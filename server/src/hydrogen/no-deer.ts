/**
 * A scan with no deer in the frame.
 * The yes/no answer is one field on a call the mode already makes.
 * Age on 1.0.9 uses the C4nr quality call. Quick Check and Score, and the
 * gateway age backup, use deer_present on the body or score call.
 * There is no extra model call. The extra JSON field is a few output tokens.
 *
 * Build 18 Quick Check only opens its invalid-image screen for error code
 * not_deer (it does not map kind "no_deer"). Age and Score on that build
 * read kind "no_deer" and show the calm screen.
 */

export type DeerPresentAnswer = "present" | "absent" | "unknown";

/**
 * Only an explicit NO is "no deer." A missing field, YES, or CANT_TELL
 * stays on the normal path. A false "no deer" on a real deer is the miss
 * this refuses to make.
 */
export function deerPresentValue(value: unknown): DeerPresentAnswer {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (text === "NO") return "absent";
  if (text === "YES" || text === "CANT_TELL") return "present";
  return "unknown";
}

/**
 * NO rejects even when the same reply also names an age or a score.
 * YES or CANT_TELL does not reject. When the field is missing, the older
 * stop "not_deer" still rejects, including when an age was filled in beside it.
 */
export function readingIsNoDeer(answer: DeerPresentAnswer, stop: unknown): boolean {
  if (answer === "absent") return true;
  if (answer === "present") return false;
  return stop === "not_deer";
}

/** One YES among the replies keeps the deer. NO rejects only when nothing said YES. */
export function groupIsNoDeer(readings: Array<{ deerPresent: DeerPresentAnswer; stop: string | null }>): boolean {
  if (readings.length === 0) return false;
  if (readings.some((reading) => reading.deerPresent === "present")) return false;
  if (readings.some((reading) => reading.deerPresent === "absent")) return true;
  return readings.some((reading) => reading.stop === "not_deer");
}

export const NO_DEER_TITLE = "No deer found";
export const NO_DEER_TIP = "Get the whole deer in frame, broadside if you can, and try again.";

export interface NoDeerCopy {
  message: string;
  tip: string;
}

export function noDeerCopy(remote?: { noDeerTitle?: string; noDeerTip?: string } | null): NoDeerCopy {
  const message = remote?.noDeerTitle?.trim() || NO_DEER_TITLE;
  const tip = remote?.noDeerTip?.trim() || NO_DEER_TIP;
  return { message, tip };
}

/**
 * Build 17 shows this as its existing retake screen: title "NEED A BETTER LOOK"
 * (or the remote verdictLook line), body equal to message, the photo thumbnail,
 * and Scan again / Done. It ignores kind and tip. It does not show an age,
 * a verdict word, or a confidence.
 */
export function noDeerJobError(copy: NoDeerCopy): {
  code: "retake";
  kind: "no_deer";
  message: string;
  tip: string;
} {
  return { code: "retake", kind: "no_deer", message: copy.message, tip: copy.tip };
}

/**
 * Quick Check on build 18 (1.0.9, d8cafbb) maps error code not_deer to
 * isValidImage false and invalidImageReason "not_deer". It does not map
 * kind "no_deer", so that kind must be omitted or the camera shows an alert.
 * The shipped screen prints message and ignores tip, so both lines go in message.
 */
export function quickNoDeerJobError(copy: NoDeerCopy): {
  code: "not_deer";
  message: string;
  tip: string;
} {
  const message = copy.tip ? `${copy.message}\n${copy.tip}` : copy.message;
  return { code: "not_deer", message, tip: copy.tip };
}

/**
 * Age and Score. Build 18 reads kind first and shows the calm no-deer screen.
 * code stays "retake" so an older age client that ignores kind still avoids an age.
 */
export function noDeerJobForMode(mode: "quick" | "age" | "score", copy: NoDeerCopy): {
  code: "not_deer" | "retake";
  kind?: "no_deer";
  message: string;
  tip: string;
} {
  if (mode === "quick") return quickNoDeerJobError(copy);
  return noDeerJobError(copy);
}

/** A no-deer scan is not an age. The caller refunds the credit and skips the record. */
export function hydrogenFinishPlan(kind: string): { charge: boolean; saveRecord: boolean } {
  if (kind === "age") return { charge: true, saveRecord: true };
  return { charge: false, saveRecord: false };
}
