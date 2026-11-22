/**
 * Scan jobs live in Redis when it is configured, and in memory for the local process.
 * The phone polls. The work keeps running after the HTTP response.
 */

import { randomBytes } from "node:crypto";
import { redisGet, redisSet } from "./kv.js";

export interface ScanJob {
  id: string;
  status: "running" | "done" | "error";
  mode: "quick" | "age" | "score";
  provisional: unknown;
  final: unknown;
  error: { code: string; message: string; kind?: string; tip?: string } | null;
}

const memory = new Map<string, ScanJob>();
const statusReads = new Map<string, { second: number; count: number; job: ScanJob | null }>();
let jobClock: () => number = Date.now;

/** A status poll storm must not turn into a Redis GET storm. Two reads a second is enough. */
const STATUS_READS_PER_SECOND = 2;

export function resetJobPollGuardForTests(): void {
  statusReads.clear();
  jobClock = Date.now;
}

export function setJobClockForTests(now: (() => number) | null): void {
  jobClock = now ?? Date.now;
  statusReads.clear();
}

export function newJobId(): string {
  return `job_${randomBytes(8).toString("hex")}`;
}

export async function saveJob(job: ScanJob): Promise<void> {
  memory.set(job.id, job);
  try {
    await redisSet(`deerage:job:${job.id}`, JSON.stringify(job));
  } catch {
    // The in-memory copy still serves this process.
  }
}

export async function loadJob(id: string): Promise<ScanJob | null> {
  const local = memory.get(id);
  if (local) return local;
  const second = Math.floor(jobClock() / 1000);
  const seen = statusReads.get(id);
  if (seen && seen.second === second && seen.count >= STATUS_READS_PER_SECOND) {
    return seen.job;
  }
  let job: ScanJob | null = null;
  try {
    const raw = await redisGet(`deerage:job:${id}`);
    if (raw) job = JSON.parse(raw) as ScanJob;
  } catch {
    job = null;
  }
  const current = statusReads.get(id);
  if (current && current.second === second) {
    current.count += 1;
    current.job = job ?? current.job;
  } else {
    statusReads.set(id, { second, count: 1, job });
  }
  if (statusReads.size > 2000) {
    for (const [key, value] of statusReads) {
      if (value.second < second - 2) statusReads.delete(key);
    }
  }
  return job;
}

export function keepAlive(work: Promise<unknown>): void {
  void work.catch((error: unknown) => {
    console.error(JSON.stringify({ event: "job_failed", message: error instanceof Error ? error.message : "failed" }));
  });
  void import("@vercel/functions")
    .then((mod) => {
      if (typeof mod.waitUntil === "function") mod.waitUntil(work);
    })
    .catch(() => undefined);
}
