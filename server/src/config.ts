import { HYDROGEN_MODEL, agingEngineFor } from "./aging-switch.js";
import { fairUsePerDay, fairUsePerMonth } from "./limits.js";

export const FREE_LIFETIME_ANALYSES = 3;

export const ACCESS_ENTITLEMENTS = [
  "deerage_pro",
  "scout",
  "hunter",
  "trophy",
  "outfitter",
  "pro",
] as const;

export function publicConfig() {
  return {
    ok: true,
    minVersion: process.env.MIN_APP_VERSION?.trim() || "1.0.8",
    latestVersion: process.env.LATEST_APP_VERSION?.trim() || "1.0.9",
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-sol",
    agingPipeline: (process.env.AGING_PIPELINE?.trim() || "hydrogen").toLowerCase(),
    hydrogenModel: HYDROGEN_MODEL,
    hydrogenMinVersion: "1.0.9",
    agingEngineForNewBuild: agingEngineFor("1.0.9"),
    freeLifetimeAnalyses: FREE_LIFETIME_ANALYSES,
    fairUsePerDay: fairUsePerDay(),
    fairUsePerMonth: fairUsePerMonth(),
  };
}

export function modelName(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5.6-sol";
}
