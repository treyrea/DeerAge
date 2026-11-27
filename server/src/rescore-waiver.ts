/**
 * One free follow-up score for the same hunter and the same finished score job.
 * A missing ticket, another hunter, or a second try charges as a normal scan.
 */

import { readJson, redisSet } from "./kv.js";

interface RescoreTicket {
  appUserId: string;
  imageCount: number;
  used: boolean;
}

function ticketKey(jobId: string): string {
  return `deerage:rescore:${jobId}`;
}

export function isScoreJobId(value: unknown): value is string {
  return typeof value === "string" && /^job_[a-f0-9]{8,32}$/.test(value);
}

export async function saveRescoreTicket(jobId: string, appUserId: string, imageCount: number): Promise<void> {
  if (!isScoreJobId(jobId) || !appUserId) return;
  const ticket: RescoreTicket = {
    appUserId,
    imageCount: Math.max(1, Math.min(4, Math.floor(imageCount) || 1)),
    used: false,
  };
  try {
    await redisSet(ticketKey(jobId), JSON.stringify(ticket));
  } catch {
    // No ticket means the follow-up score charges. That is the closed direction.
  }
}

/** True only the first time this hunter adds angles to this finished score. */
export async function claimRescoreWaiver(input: { jobId: string; appUserId: string; imageCount: number }): Promise<boolean> {
  if (!isScoreJobId(input.jobId) || !input.appUserId) return false;
  if (input.imageCount < 2 || input.imageCount > 4) return false;
  try {
    const ticket = await readJson<RescoreTicket | null>(ticketKey(input.jobId), null);
    if (!ticket || ticket.used || ticket.appUserId !== input.appUserId) return false;
    const next: RescoreTicket = { ...ticket, used: true };
    await redisSet(ticketKey(input.jobId), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** A failed follow-up gives the free pass back. A finished one keeps it used. */
export async function releaseRescoreWaiver(jobId: string): Promise<void> {
  if (!isScoreJobId(jobId)) return;
  try {
    const ticket = await readJson<RescoreTicket | null>(ticketKey(jobId), null);
    if (!ticket) return;
    await redisSet(ticketKey(jobId), JSON.stringify({ ...ticket, used: false }));
  } catch {
    // The pass stays used. The next try charges.
  }
}
