/**
 * One reader for the RevenueCat secret.
 * REVENUECAT_SECRET_API_KEY is the name in the server docs.
 * REVENUECAT_SECRET_KEY is accepted when that is the name already set on the server.
 * Neither value is logged.
 */
/** Subscriber reads. The documented name wins when both are set. */
export function revenueCatSecret(): string {
  return process.env.REVENUECAT_SECRET_API_KEY?.trim() || process.env.REVENUECAT_SECRET_KEY?.trim() || "";
}

/** Grants and scan-pack checks. Keeps the previous order: the grant alias, then the documented name. */
export function revenueCatGrantSecret(): string {
  return process.env.REVENUECAT_SECRET_KEY?.trim() || process.env.REVENUECAT_SECRET_API_KEY?.trim() || "";
}
