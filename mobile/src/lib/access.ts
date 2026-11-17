import { FREE_LIFETIME_ANALYSES } from "./products";

/** A cancelled store sheet is not an error the hunter needs to read. */
export function purchaseNotice(errorText: string): string | null {
  if (errorText.toLowerCase().includes("cancel")) return null;
  return "The purchase didn't go through. You have not been charged for a plan that didn't activate.";
}

export function canStartScan(input: {
  entitled: boolean;
  scanCredits: number;
  lifetimeAnalysesUsed: number;
  freeLifetime?: number;
}): boolean {
  const freeLifetime = input.freeLifetime ?? FREE_LIFETIME_ANALYSES;
  if (input.entitled) return true;
  if (input.scanCredits > 0) return true;
  return input.lifetimeAnalysesUsed < freeLifetime;
}
