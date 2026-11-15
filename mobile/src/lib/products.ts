/**
 * Product identifiers the app looks up in RevenueCat offerings.
 * Season Pass and Monthly come from DEFAULT_OFFERING_ID.
 * The current offering stays LEGACY_OFFERING_ID for live 1.0.7 subscribers.
 * Prices are never hardcoded. If a package is missing, that plan cannot be purchased.
 *
 * Create these in App Store Connect, then attach them in RevenueCat.
 * See the pull request description for the full setup.
 */

export const SEASON_PRODUCT_ID = "season_annual";
export const SEASON_PASS_PRODUCT_ID = "deerage_season";
export const MONTHLY_PRODUCT_ID = "deerage_monthly";

export const LEGACY_PRODUCT_IDS = [
  "scout_monthly",
  "hunter_monthly",
  "trophy_monthly",
  "outfitter_monthly",
] as const;

export const LEGACY_OFFERING_ID = "tiers";

/** Non-current offering that holds season_annual and deerage_monthly. */
export const DEFAULT_OFFERING_ID = "default";

/** Entitlement both new products should grant. Legacy entitlements still unlock the app. */
export const SEASON_ENTITLEMENT_ID = "deerage_pro";

export const ACCESS_ENTITLEMENT_IDS = [
  SEASON_ENTITLEMENT_ID,
  "scout",
  "hunter",
  "trophy",
  "outfitter",
  "pro",
] as const;

export type AccessEntitlementId = (typeof ACCESS_ENTITLEMENT_IDS)[number];

export function isLegacyProduct(productId: string | null | undefined): boolean {
  if (!productId) return false;
  return (LEGACY_PRODUCT_IDS as readonly string[]).includes(productId);
}

export const FREE_LIFETIME_ANALYSES = 3;

/** Consumables. Fetched by product id, not from an offering. */
export const SCAN_PACK_10_ID = "deerage_scans_10";
export const SCAN_PACK_30_ID = "deerage_scans_30";
export const SCAN_PACK_IDS = [SCAN_PACK_10_ID, SCAN_PACK_30_ID] as const;

export function allowanceLine(remainingFree: number, scanCredits: number): string {
  const free = `${remainingFree} of ${FREE_LIFETIME_ANALYSES} free analyses left`;
  if (scanCredits <= 0) return free;
  const noun = scanCredits === 1 ? "scan" : "scans";
  return `${free} · ${scanCredits} ${noun} left`;
}

export type PlanLabel = "Free" | "Season Pass" | "Monthly" | "Scout" | "Hunter" | "Trophy" | "Outfitter" | "Member";

export interface PaywallResultSummary {
  imageUri?: string;
  headline: string;
  call: string;
  confidence?: number;
}

export function planLabelFor(entitlementIds: string[], productId?: string | null): PlanLabel {
  if (entitlementIds.includes("outfitter")) return "Outfitter";
  if (entitlementIds.includes("trophy") || entitlementIds.includes("pro")) return "Trophy";
  if (entitlementIds.includes("hunter")) return "Hunter";
  if (entitlementIds.includes("scout")) return "Scout";
  if (entitlementIds.includes(SEASON_ENTITLEMENT_ID)) {
    if (productId === MONTHLY_PRODUCT_ID) return "Monthly";
    if (productId === SEASON_PRODUCT_ID || productId === SEASON_PASS_PRODUCT_ID) return "Season Pass";
    return "Member";
  }
  if (entitlementIds.length > 0) return "Member";
  return "Free";
}
