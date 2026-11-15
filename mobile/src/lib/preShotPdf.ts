import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { apiBaseUrl } from "../api/proxy";
import { useHarvestStore } from "../state/harvestStore";
import { useShotRecordStore } from "../state/shotRecordStore";
import { qrSvg } from "../utils/qr";

const DISCLAIMER = "This page is a note of a good-faith decision made before the shot. It records what DeerAge read from the photos and the lease minimum that was set at that moment. It is not legal proof. It does not override a lease manager or a game warden. The age read is from a photo and can be wrong.";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char] ?? char));
}

function when(iso: string | null): string {
  if (!iso) return "Not available";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

async function photoSrc(uri: string): Promise<string | null> {
  try {
    const data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${data}`;
  } catch {
    return null;
  }
}

export async function sharePreShotRecord(localId: string): Promise<void> {
  const record = useShotRecordStore.getState().records[localId];
  if (!record) return;
  const harvest = useHarvestStore.getState().entries[localId];
  const jaw = harvest?.confirmedAge?.trim() ?? "";
  const photos = (await Promise.all(record.photoUris.map((uri) => photoSrc(uri)))).filter((src): src is string => Boolean(src));
  const verifyUrl = record.receiptId && apiBaseUrl()
    ? `${apiBaseUrl()}/api/verify-record?id=${encodeURIComponent(record.receiptId)}`
    : "";
  const qr = verifyUrl ? qrSvg(verifyUrl) : null;
  const cues = record.cues.map((cue) => `<li>${escapeHtml(cue)}</li>`).join("");
  const location = record.latitude != null && record.longitude != null
    ? `${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}`
    : "Not attached";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: letter; margin: 0.55in; }
    body { font-family: Georgia, serif; color: #1a1f16; margin: 0; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .sub { color: #5c5346; margin: 0 0 12px; font-size: 12px; }
    .call { font-size: 28px; font-weight: 700; margin: 8px 0 0; }
    .class { font-size: 22px; }
    .photos img { height: 150px; margin-right: 8px; border-radius: 8px; }
    ul { margin: 6px 0 0; padding-left: 18px; }
    .fine { font-size: 11px; color: #5c5346; line-height: 1.35; }
    .row { display: flex; justify-content: space-between; gap: 16px; }
    svg { width: 120px; height: 120px; }
  </style></head><body>
    <h1>DeerAge Pre-Shot Record</h1>
    <p class="sub">A note of the read on this phone before a trigger pull. App ${escapeHtml(record.appVersion)}.</p>
    <div class="photos">${photos.map((src) => `<img src="${src}" />`).join("")}</div>
    <p class="class">Age class ${escapeHtml(record.ageClass || "n/a")}${record.ageRange ? ` (${escapeHtml(record.ageRange)})` : ""}</p>
    <p class="call">${escapeHtml(record.fieldCall || "No call")}</p>
    <p>${escapeHtml(record.fieldCallNote)}</p>
    <p>Your lease minimum at this moment: <strong>${escapeHtml(String(record.leaseMinimum))}</strong></p>
    ${record.huntLabel ? `<p>Aged against ${escapeHtml(record.huntLabel)} norms</p>` : ""}
    ${record.bodyOnlyAge != null ? `<p>Body-only read: ${escapeHtml(String(record.bodyOnlyAge))}. Main read: ${escapeHtml(String(record.mainAge ?? "n/a"))}. Fast read: ${escapeHtml(String(record.fastAge ?? "n/a"))}.</p>` : ""}
    <p>Confidence: ${escapeHtml(String(record.confidence))}%</p>
    ${record.scoreLabel ? `<p>${escapeHtml(record.scoreLabel)}</p>` : ""}
    ${cues ? `<p style="margin-bottom:0">Why this age class</p><ul>${cues}</ul>` : ""}
    <p>Phone time: ${escapeHtml(when(record.deviceTime))}<br>Server receipt time: ${escapeHtml(when(record.serverTime))}</p>
    <p>Location: ${escapeHtml(location)}</p>
    ${jaw ? `<p>Jawbone or confirmed age entered later: <strong>${escapeHtml(jaw)}</strong>${harvest?.method ? ` (${escapeHtml(harvest.method)})` : ""}</p>` : "<p>No jawbone age entered.</p>"}
    <div class="row">
      <div>
        <p><strong>Verification code</strong><br>${escapeHtml(record.receiptId ?? "Not signed")}</p>
        ${verifyUrl ? `<p class="fine">${escapeHtml(verifyUrl)}</p>` : "<p class=\"fine\">This read was not signed by the server.</p>"}
        ${record.contentHash ? `<p class="fine">Hash ${escapeHtml(record.contentHash)}</p>` : ""}
      </div>
      ${qr ? `<div>${qr}</div>` : ""}
    </div>
    <p class="fine">${DISCLAIMER}</p>
  </body></html>`;
  const file = await Print.printToFileAsync({ html, width: 612, height: 792 });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return;
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: "DeerAge Pre-Shot Record",
  });
}
