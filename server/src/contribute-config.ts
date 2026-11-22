/** Owner switch for "Help improve DeerAge" storage. Lives apart from contributions.ts to avoid an import cycle. */

import { ApiError } from "./wire.js";

export interface ContributeConfig {
  /** Owner switch. Off stores nothing even when hunters opted in. */
  enabled: boolean;
  /** Hard cap on stored contributions so storage can't run away. */
  maxStored: number;
}

export function defaultContributeConfig(): ContributeConfig {
  return { enabled: false, maxStored: 2000 };
}

export function normalizeContribute(stored: unknown): ContributeConfig {
  const base = defaultContributeConfig();
  if (!stored || typeof stored !== "object") return base;
  const row = stored as Record<string, unknown>;
  const max = Number(row.maxStored);
  return {
    enabled: typeof row.enabled === "boolean" ? row.enabled : base.enabled,
    maxStored: Number.isFinite(max) && max >= 0 ? Math.min(100_000, Math.floor(max)) : base.maxStored,
  };
}

export function patchContribute(current: ContributeConfig, incoming: unknown): ContributeConfig {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    throw new ApiError(400, "invalid_request", "contribute must be an object.");
  }
  const row = incoming as Record<string, unknown>;
  const next = { ...current };
  if (row.enabled != null) {
    if (typeof row.enabled !== "boolean") throw new ApiError(400, "invalid_request", "contribute.enabled must be true or false.");
    next.enabled = row.enabled;
  }
  if (row.maxStored != null) {
    const max = Number(row.maxStored);
    if (!Number.isFinite(max) || max < 0 || max > 100_000) throw new ApiError(400, "invalid_request", "contribute.maxStored must be 0 to 100000.");
    next.maxStored = Math.floor(max);
  }
  return next;
}

