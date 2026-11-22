/**
 * A scan with no deer in the frame.
 * The yes/no answer is one field on the quality call, the first model call
 * in the C4nr walk. There is no extra model call. At the configured Gemini
 * output rate ($7.50 / million tokens) the extra JSON field is well under
 * a tenth of a cent per scan.
 *
 * The shipped 1.0.9 build 17 client only reads error.code and error.message.
 * code "retake" is its age-mode quality path, so it never opens an age result.
 */

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

/** A no-deer scan is not an age. The caller refunds the credit and skips the record. */
export function hydrogenFinishPlan(kind: string): { charge: boolean; saveRecord: boolean } {
  if (kind === "age") return { charge: true, saveRecord: true };
  return { charge: false, saveRecord: false };
}
