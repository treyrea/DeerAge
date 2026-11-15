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
  error: { code: string; message: string } | null;
}

const memory = new Map<string, ScanJob>();

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
  try {
    const raw = await redisGet(`deerage:job:${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as ScanJob;
  } catch {
    return null;
  }
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
