/**
 * How many free months may be granted automatically this calendar month.
 * The month is America/Chicago, the same clock as the spend cap.
 */

import { monthStamp } from "./limits.js";

export function capSettings(env: NodeJS.ProcessEnv = process.env): { min: number; pct: number } {
  const minRaw = Number(env.FREE_MONTH_CAP_MIN);
  const pctRaw = Number(env.FREE_MONTH_CAP_PCT);
  const min = Number.isFinite(minRaw) && minRaw >= 0 ? Math.floor(minRaw) : 10;
  let pct = Number.isFinite(pctRaw) && pctRaw >= 0 ? pctRaw : 5;
  if (pct > 1) pct = pct / 100;
  return { min, pct };
}

export function freeMonthCap(subscribers: number, env: NodeJS.ProcessEnv = process.env): number {
  const { min, pct } = capSettings(env);
  const base = Number.isFinite(subscribers) && subscribers > 0 ? subscribers : 10;
  return Math.max(min, Math.ceil(pct * base));
}

export function inChicagoMonth(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return false;
  return monthStamp(time) === monthStamp(now);
}
