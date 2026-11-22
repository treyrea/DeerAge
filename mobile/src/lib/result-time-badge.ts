import { FALLBACK_ETA_MS, type ScanMode } from "./scan-progress";

/** Camera time badge, from the same fallback medians the waiting bar uses. */
export function resultTimeBadge(mode: ScanMode): string {
  const seconds = Math.round(FALLBACK_ETA_MS[mode] / 1000);
  return `~${seconds} sec result`;
}
