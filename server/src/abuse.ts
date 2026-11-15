/**
 * Flags for the admin feed. They never block the hunter.
 */

const DAY = 24 * 60 * 60 * 1000;

export interface AbuseInput {
  appUserId: string;
  createdAt: string;
  reportedAge: string;
  proofMethod: string | null;
  photoHash: string | null;
  subscribedAt: string | null;
  grants: string[];
  recentReportCount: number;
  hashOwners: string[];
  now?: number;
}

export function abuseFlags(input: AbuseInput): string[] {
  const now = input.now ?? Date.now();
  const flags: string[] = [];
  const grantsInYear = input.grants.filter((at) => {
    const time = Date.parse(at);
    return Number.isFinite(time) && now - time <= 365 * DAY;
  }).length;
  if (grantsInYear > 1) flags.push("repeat_free_month");
  if (input.recentReportCount >= 3) flags.push("many_reports");
  if (input.subscribedAt) {
    const subscribed = Date.parse(input.subscribedAt);
    const filed = Date.parse(input.createdAt);
    if (Number.isFinite(subscribed) && Number.isFinite(filed) && filed >= subscribed && filed - subscribed <= 2 * DAY) {
      flags.push("new_subscriber");
    }
  }
  if (input.photoHash && input.hashOwners.some((owner) => owner !== input.appUserId)) flags.push("same_photo");
  if (input.reportedAge.trim() && !input.proofMethod) flags.push("no_proof");
  return flags;
}
