import { resolveAppUserId } from "./community";
import { apiBaseUrl } from "./proxy";

export type ReportKind = "wrong_call" | "call_right" | "cancel_reason" | "win_back";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/** Blank is allowed. A non-empty value must be an email. Nothing is filled in for the hunter. */
export function followUpEmailOrNull(value: string): string | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return "invalid";
  return trimmed.toLowerCase();
}

export async function postCallReport(input: {
  kind: ReportKind;
  scanId?: string;
  fieldCall?: string;
  reportedAge?: string;
  jawboneAged?: boolean;
  proofMethod?: "lab_tooth" | "jawbone" | "other" | null;
  minimum?: number;
  note?: string;
  photoBase64?: string | null;
  followUpEmail?: string | null;
  keepPhoto?: boolean;
  scanImages?: string[];
  resultSnapshot?: Record<string, unknown>;
}): Promise<{ ok: true; photoStored: boolean } | { ok: false }> {
  const base = apiBaseUrl();
  if (!base) return { ok: false };
  try {
    const appUserId = await resolveAppUserId();
    const response = await fetch(`${base}/api/call-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appUserId,
        scanId: input.scanId ?? "",
        kind: input.kind,
        fieldCall: input.fieldCall ?? "",
        reportedAge: input.reportedAge ?? "",
        jawboneAged: input.proofMethod === "jawbone" || Boolean(input.jawboneAged),
        proofMethod: input.proofMethod ?? "",
        minimum: input.minimum ?? 4.5,
        note: input.note ?? "",
        photoBase64: input.photoBase64 ?? "",
        followUpEmail: input.followUpEmail ?? "",
        keepPhoto: input.keepPhoto === true,
        scanImages: input.keepPhoto ? input.scanImages ?? [] : [],
        resultSnapshot: input.keepPhoto ? input.resultSnapshot ?? null : null,
      }),
    });
    const body = (await response.json().catch(() => null)) as { photoStored?: boolean } | null;
    if (!response.ok) return { ok: false };
    return { ok: true, photoStored: Boolean(body?.photoStored) };
  } catch {
    return { ok: false };
  }
}

export interface SecondLook {
  originalCall: string;
  originalAge: number | null;
  secondAge: number | null;
  secondCall: string;
  agree: boolean | null;
  note: string;
}

export interface DeerMessage {
  id: string;
  scanId?: string;
  status: string;
  reply: string | null;
  replyAt: string | null;
  read: boolean;
  offerRescan: boolean;
  dispute?: boolean;
  secondLook?: SecondLook | null;
  originalCall: string;
  originalAge: string;
  rescan: { fieldCall: string; ageYears: number | null; note: string } | null;
  hasKeptPhoto: boolean;
}

export async function loadMessages(): Promise<{ messages: DeerMessage[]; unread: number }> {
  const base = apiBaseUrl();
  if (!base) return { messages: [], unread: 0 };
  try {
    const appUserId = await resolveAppUserId();
    const response = await fetch(`${base}/api/replies?appUserId=${encodeURIComponent(appUserId)}`);
    const body = (await response.json().catch(() => null)) as { messages?: DeerMessage[]; unread?: number } | null;
    if (!response.ok || !body) return { messages: [], unread: 0 };
    return { messages: body.messages ?? [], unread: body.unread ?? 0 };
  } catch {
    return { messages: [], unread: 0 };
  }
}

export async function markMessageRead(id: string): Promise<void> {
  const base = apiBaseUrl();
  if (!base) return;
  const appUserId = await resolveAppUserId();
  await fetch(`${base}/api/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appUserId, id }),
  });
}

export async function rescanReport(id: string): Promise<{ original: { fieldCall: string; age: unknown }; next: DeerMessage["rescan"] } | null> {
  const base = apiBaseUrl();
  if (!base) return null;
  const appUserId = await resolveAppUserId();
  const response = await fetch(`${base}/api/rescan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appUserId, reportId: id }),
  });
  if (!response.ok) return null;
  return (await response.json()) as { original: { fieldCall: string; age: unknown }; next: DeerMessage["rescan"] };
}

export async function answerRescan(id: string, right: boolean): Promise<boolean> {
  const base = apiBaseUrl();
  if (!base) return false;
  const appUserId = await resolveAppUserId();
  const response = await fetch(`${base}/api/rescan-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appUserId, reportId: id, right }),
  });
  return response.ok;
}

export async function requestSecondLook(input: {
  scanId: string;
  originalCall: string;
  originalAge?: number | null;
  minimum?: number;
  imageBase64?: string;
}): Promise<SecondLook | null> {
  const base = apiBaseUrl();
  if (!base) return null;
  try {
    const appUserId = await resolveAppUserId();
    const response = await fetch(`${base}/api/second-look`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appUserId, ...input, originalAge: input.originalAge ?? "" }),
    });
    const body = (await response.json().catch(() => null)) as { secondLook?: SecondLook } | null;
    return response.ok ? body?.secondLook ?? null : null;
  } catch {
    return null;
  }
}

export async function deleteReportPhoto(id: string): Promise<boolean> {
  const base = apiBaseUrl();
  if (!base) return false;
  const appUserId = await resolveAppUserId();
  const response = await fetch(`${base}/api/report-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appUserId, reportId: id }),
  });
  return response.ok;
}
