/**
 * Whether leaving a result screen should try StoreKit's rating sheet.
 * maybeRequestReview still applies its own gates after this returns true.
 */
export function shouldRequestReviewAfterLeaving(args: {
  enabled: boolean;
  rescan: boolean;
  visibleMs: number;
  fieldCall?: string | null;
}): boolean {
  if (!args.enabled || args.rescan || args.visibleMs < 800) return false;
  return args.fieldCall === "SHOOTER" || args.fieldCall === "LET WALK";
}
