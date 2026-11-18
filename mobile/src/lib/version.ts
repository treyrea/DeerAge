/** Three-part compare used by the update card and the forced-update gate. */
export function compareVersions(installed: string, minimum: string): number {
  const left = installed.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = minimum.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function installedAppVersion(nativeVersion: string | null | undefined, configVersion: string | null | undefined): string {
  const native = nativeVersion?.trim();
  if (native) return native;
  const config = configVersion?.trim();
  if (config) return config;
  return "0.0.0";
}
