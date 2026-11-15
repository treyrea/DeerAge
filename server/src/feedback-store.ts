/**
 * Stored wrong-call, harvest, and cancel notes.
 * Photos and emails live on the record. This file does not send mail or call a model.
 */

import { kv, membersOf, readJson, redisSet } from "./kv.js";
import { safeImageFile, deleteReportImages } from "./report-media.js";
import type { TrackerStep, TrackerUpdate } from "./tracker.js";
import { userKey, ApiError } from "./wire.js";

export const FEEDBACK_INDEX = "deerage:feedback:index";
export const MAX_PHOTO = 180_000;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const STATUSES = ["open", "studying", "fixed", "replied", "rescanned-right", "rescanned-wrong"] as const;
const KINDS = ["wrong_call", "call_right", "harvest_age", "cancel_reason", "win_back"] as const;

export type FeedbackKind = (typeof KINDS)[number];
export type ReportStatus = (typeof STATUSES)[number];

export interface FeedbackRecord {
  id: string;
  appUserId: string;
  scanId: string;
  kind: FeedbackKind;
  fieldCall: string;
  reportedAge: string;
  jawboneAged: boolean;
  note: string;
  photoBase64: string | null;
  followUpEmail: string | null;
  keepPhoto: boolean;
  imageFiles: string[];
  resultSnapshot: Record<string, unknown> | null;
  reply: string | null;
  replyAt: string | null;
  replyRead: boolean;
  offerRescan: boolean;
  rescanUsed: boolean;
  rescanResult: { fieldCall: string; ageYears: number | null; note: string } | null;
  status: ReportStatus;
  fixedIn: string | null;
  emailPending: boolean;
  proofMethod: string | null;
  freeMonthOwed: boolean;
  proofReview: boolean;
  dispute: boolean;
  trackerStep: TrackerStep;
  trackerDueAt: string | null;
  trackerExpected: string;
  updates: TrackerUpdate[];
  owedAt: string | null;
  freeMonthGrantedAt: string | null;
  grantReason: "auto" | "manual" | null;
  autoGrantError: string | null;
  photoHash: string | null;
  subscribedAt: string | null;
  photoDeletedAt: string | null;
  resolvedAt: string | null;
  retainUntil: string | null;
  createdAt: string;
}

export function feedbackKey(id: string): string {
  return `deerage:feedback:${id}`;
}

export function userIndex(appUserId: string): string {
  return `deerage:feedback:user:${userKey(appUserId)}`;
}

export function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, "\"\"")}"`;
  return value;
}

export function kindOf(value: unknown): FeedbackKind {
  if (typeof value === "string" && (KINDS as readonly string[]).includes(value)) return value as FeedbackKind;
  throw new ApiError(400, "invalid_request", "That report type is not recognized.");
}

export function statusOf(value: unknown): ReportStatus | null {
  if (value == null || value === "") return null;
  if (typeof value === "string" && (STATUSES as readonly string[]).includes(value)) return value as ReportStatus;
  throw new ApiError(400, "invalid_request", "That report status is not recognized.");
}

export function optionalEmail(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "invalid_request", "Enter a valid email, or leave it blank.");
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new ApiError(400, "invalid_request", "Enter a valid email, or leave it blank.");
  }
  return email;
}

export function retainUntilFrom(iso: string): string {
  const date = new Date(iso);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString();
}

export function filled(record: Partial<FeedbackRecord> & Pick<FeedbackRecord, "id" | "appUserId" | "scanId" | "kind" | "createdAt">): FeedbackRecord {
  return {
    fieldCall: "",
    reportedAge: "",
    jawboneAged: false,
    note: "",
    photoBase64: null,
    followUpEmail: null,
    keepPhoto: false,
    resultSnapshot: null,
    reply: null,
    replyAt: null,
    replyRead: false,
    offerRescan: false,
    rescanUsed: false,
    rescanResult: null,
    status: "open",
    fixedIn: null,
    emailPending: false,
    proofMethod: null,
    freeMonthOwed: false,
    proofReview: false,
    dispute: false,
    trackerStep: "received",
    trackerDueAt: null,
    trackerExpected: "",
    updates: [],
    owedAt: null,
    freeMonthGrantedAt: null,
    grantReason: null,
    autoGrantError: null,
    photoHash: null,
    subscribedAt: null,
    photoDeletedAt: null,
    resolvedAt: null,
    retainUntil: null,
    ...record,
    imageFiles: Array.isArray(record.imageFiles) ? record.imageFiles.filter((file) => safeImageFile(file)) : [],
  };
}

export async function loadRecord(id: string): Promise<FeedbackRecord | null> {
  const row = await readJson<FeedbackRecord | null>(feedbackKey(id), null);
  if (!row?.id || !row.scanId) return null;
  return filled(row);
}

export async function storeRecord(record: FeedbackRecord): Promise<void> {
  await redisSet(feedbackKey(record.id), JSON.stringify(record));
}

export async function loadAll(): Promise<FeedbackRecord[]> {
  const members = await membersOf(FEEDBACK_INDEX);
  const records: FeedbackRecord[] = [];
  for (let i = 0; i < members.length; i += 40) {
    const slice = members.slice(i, i + 40);
    const values = await kv().pipeline(slice.map((id) => ["GET", feedbackKey(id)]));
    values.forEach((value) => {
      if (typeof value !== "string") return;
      try {
        const parsed = JSON.parse(value) as FeedbackRecord;
        if (parsed?.id && parsed.scanId) records.push(filled(parsed));
      } catch {
        // Skip a corrupt row.
      }
    });
  }
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return records;
}

export async function dropExpiredPhotos(record: FeedbackRecord): Promise<FeedbackRecord> {
  if (!record.retainUntil || record.imageFiles.length === 0) return record;
  if (Date.parse(record.retainUntil) > Date.now()) return record;
  await deleteReportImages(record.id, record.imageFiles);
  const next = { ...record, imageFiles: [], keepPhoto: false, photoBase64: null, photoDeletedAt: record.photoDeletedAt ?? new Date().toISOString() };
  await storeRecord(next);
  return next;
}

export function markResolved(record: FeedbackRecord, status: ReportStatus): void {
  if (status !== "fixed" && status !== "rescanned-right") return;
  const now = new Date().toISOString();
  record.resolvedAt = record.resolvedAt ?? now;
  record.retainUntil = retainUntilFrom(record.resolvedAt);
}
