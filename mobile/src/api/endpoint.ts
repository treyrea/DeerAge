/**
 * Where the app finds the DeerAge server.
 *
 * Order: EXPO_PUBLIC_API_BASE_URL (EAS production environment), then app.json extra.apiBaseUrl,
 * then the CI test endpoint. The app.json value rides every OTA manifest, so an update published
 * without the EAS environment still reaches the server instead of saying it isn't connected.
 */
export function resolveApiBaseUrl(fromEnv: unknown, fromAppConfig: unknown, fromCi: unknown): string {
  for (const candidate of [fromEnv, fromAppConfig, fromCi]) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim().replace(/\/+$/, "");
    if (/^https:\/\/[^\s/]+/.test(trimmed)) return trimmed;
  }
  return "";
}
