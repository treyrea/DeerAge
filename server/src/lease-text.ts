/**
 * The words for "Text this to my lease manager".
 * The phone opens Messages. This string is not sent by the server.
 */

export interface LeaseTextInput {
  ageClass: string;
  call: string;
  minimum: number | string;
  region: string;
  time: string;
  link: string;
}

export const DEFAULT_LEASE_TEXT = "{age} · {call} · lease minimum {minimum}\n{region}\n{time}\n{link}";

const MISSING_LINK = "Verification link isn't available for this read.";

export function leaseManagerMessage(input: LeaseTextInput, template = ""): string {
  const link = input.link.trim();
  const values: Record<string, string> = {
    age: input.ageClass.trim() || "Age class unavailable",
    call: input.call.trim() || "No call",
    minimum: String(input.minimum),
    region: input.region.trim() || "Hunt region not set",
    time: input.time.trim(),
    link: link || MISSING_LINK,
  };
  const source = template.trim() || DEFAULT_LEASE_TEXT;
  return source
    .replaceAll("{age}", values.age)
    .replaceAll("{call}", values.call)
    .replaceAll("{minimum}", values.minimum)
    .replaceAll("{region}", values.region)
    .replaceAll("{time}", values.time)
    .replaceAll("{link}", values.link)
    .trim();
}
