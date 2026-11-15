/**
 * Consented report photos live in Redis, not on a public URL.
 * A download link is an HMAC that expires. It is not a permanent address.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { kv, redisGet, redisSet } from "./kv.js";

const MAX_IMAGE = 180_000;

export function imageKey(reportId: string, file: string): string {
  return `deerage:report-image:${reportId}:${file}`;
}

export function safeImageFile(value: string): string | null {
  return /^[0-2]\.jpg$/.test(value) ? value : null;
}

export async function saveReportImage(reportId: string, file: string, raw: string): Promise<boolean> {
  const bare = raw.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  if (!bare || bare.length > MAX_IMAGE || !safeImageFile(file)) return false;
  await redisSet(imageKey(reportId, file), bare);
  return true;
}

export async function readReportImage(reportId: string, file: string): Promise<string | null> {
  if (!safeImageFile(file)) return null;
  return redisGet(imageKey(reportId, file));
}

export async function deleteReportImages(reportId: string, files: string[]): Promise<void> {
  for (const file of files) {
    if (safeImageFile(file)) await kv().command(["DEL", imageKey(reportId, file)]);
  }
}

function secret(): string {
  return process.env.ADMIN_TOKEN?.trim() || "";
}

export function signReportImage(id: string, file: string, exp: number): string {
  return createHmac("sha256", secret()).update(`report-image.${id}.${file}.${exp}`).digest("hex");
}

export function reportImageSignatureOk(id: string, file: string, exp: number, sig: string): boolean {
  if (!secret() || !safeImageFile(file) || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = signReportImage(id, file, exp);
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function signedImagePath(id: string, file: string, ttlMs = 60 * 60 * 1000): { path: string; expiresAt: string } {
  const exp = Date.now() + ttlMs;
  const sig = signReportImage(id, file, exp);
  const query = `id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}&exp=${exp}&sig=${sig}`;
  return { path: `/api/admin/report-image?${query}`, expiresAt: new Date(exp).toISOString() };
}
