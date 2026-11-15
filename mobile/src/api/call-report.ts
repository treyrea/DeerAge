import { resolveAppUserId } from "./community";
import { apiBaseUrl } from "./proxy";

export type ReportKind = "wrong_call" | "call_right" | "cancel_reason" | "win_back";

export async function postCallReport(input: {
  kind: ReportKind;
  scanId?: string;
  fieldCall?: string;
  reportedAge?: string;
  jawboneAged?: boolean;
  note?: string;
  photoBase64?: string | null;
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
        jawboneAged: Boolean(input.jawboneAged),
        note: input.note ?? "",
        photoBase64: input.photoBase64 ?? "",
      }),
    });
    const body = (await response.json().catch(() => null)) as { photoStored?: boolean } | null;
    if (!response.ok) return { ok: false };
    return { ok: true, photoStored: Boolean(body?.photoStored) };
  } catch {
    return { ok: false };
  }
}
