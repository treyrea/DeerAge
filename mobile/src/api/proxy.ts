import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { AnalysisError, type AnalysisErrorCode } from "./errors";
import { useHunterProfile } from "../state/hunterProfile";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { getRevenueCatAppUserId } from "../lib/revenuecatClient";
import type { ShotReceipt } from "../types/shot-record";

export interface ProxySuccess {
  mode: string;
  model: string;
  latencyMs: number;
  freeUsesRemaining: number | null;
  estimatedCostUsd: number;
  result: Record<string, unknown>;
  serverTime: string | null;
  receipt: ShotReceipt | null;
}

export let lastShotReceipt: ShotReceipt | null = null;

function asReceipt(raw: unknown): ShotReceipt | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const summary = row.summary;
  if (!summary || typeof summary !== "object") return null;
  const signed = summary as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.signature !== "string" || typeof row.contentHash !== "string" || typeof row.serverTime !== "string") {
    return null;
  }
  return {
    id: row.id,
    serverTime: row.serverTime,
    contentHash: row.contentHash,
    signature: row.signature,
    imageHashes: Array.isArray(row.imageHashes) ? row.imageHashes.filter((item): item is string => typeof item === "string") : [],
    summary: {
      mode: typeof signed.mode === "string" ? signed.mode : "",
      ageClass: typeof signed.ageClass === "string" ? signed.ageClass : "",
      ageRange: typeof signed.ageRange === "string" ? signed.ageRange : "",
      confidence: Math.round(Number(signed.confidence) || 0),
      leaseMinimum: Number(signed.leaseMinimum) || 4.5,
      fieldCall: typeof signed.fieldCall === "string" ? signed.fieldCall : "",
      fieldCallNote: typeof signed.fieldCallNote === "string" ? signed.fieldCallNote : "",
      cues: Array.isArray(signed.cues) ? signed.cues.filter((cue): cue is string => typeof cue === "string") : [],
    },
  };
}

const CODES = new Set<AnalysisErrorCode>([
  "invalid_request",
  "not_configured",
  "rate_limited",
  "quota",
  "fair_use",
  "busy",
  "not_deer",
  "no_body",
  "no_antlers",
  "poor_quality",
  "timeout",
  "upstream",
  "network",
  "zero_frames",
  "unknown",
]);

export function apiBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim().replace(/\/$/, "");
}

export function sampleFrames<T>(frames: T[], max: number): T[] {
  if (frames.length <= max) return frames;
  const picked: T[] = [];
  for (let i = 0; i < max; i += 1) {
    const index = Math.round((i * (frames.length - 1)) / (max - 1));
    picked.push(frames[index]);
  }
  return picked;
}

async function jpegBase64(uri: string): Promise<string> {
  const compressed = await manipulateAsync(uri, [{ resize: { width: 768 } }], {
    compress: 0.55,
    format: SaveFormat.JPEG,
  });
  return FileSystem.readAsStringAsync(compressed.uri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function analyzeImages(input: {
  mode: "quick" | "age" | "score";
  imageUris: string[];
  minimumShooterAge?: number;
  species?: string;
  distanceYards?: number;
}): Promise<ProxySuccess> {
  if (input.imageUris.length === 0) {
    throw new AnalysisError("zero_frames");
  }
  const base = apiBaseUrl();
  if (!base) {
    throw new AnalysisError("not_configured", "DeerAge isn't connected to the analysis service yet.");
  }
  if (!useSubscriptionStore.getState().canStartAnalysis()) {
    throw new AnalysisError("quota");
  }

  const max = input.mode === "quick" ? 1 : 4;
  lastShotReceipt = null;
  const images = await Promise.all(sampleFrames(input.imageUris, max).map((uri) => jpegBase64(uri)));
  const profile = useHunterProfile.getState();
  const appUserId = (await getRevenueCatAppUserId()) || useSubscriptionStore.getState().ensureLocalUserId();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        mode: input.mode,
        appUserId,
        images,
        minimumShooterAge: input.minimumShooterAge,
        context: {
          state: profile.stateCode,
          ecoregion: profile.ecoregion,
          landType: profile.landType,
          fenceType: profile.landType === "high_fence" ? "high" : profile.landType,
          goal: profile.goal,
          minimumShooterAge: input.minimumShooterAge,
          species: input.species,
          month: new Date().getMonth() + 1,
          distanceYards: input.distanceYards,
        },
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AnalysisError("timeout");
    }
    throw new AnalysisError("network");
  } finally {
    clearTimeout(timer);
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    code?: string;
    message?: string;
    result?: Record<string, unknown>;
    model?: string;
    latencyMs?: number;
    freeUsesRemaining?: number | null;
    estimatedCostUsd?: number;
    entitled?: boolean;
    mode?: string;
    serverTime?: string | null;
    record?: unknown;
  } | null;

  if (!response.ok || !payload?.ok || !payload.result) {
    const code = payload?.code && CODES.has(payload.code as AnalysisErrorCode) ? (payload.code as AnalysisErrorCode) : response.status === 402 ? "quota" : response.status === 429 ? "rate_limited" : "upstream";
    if (code === "quota") {
      useSubscriptionStore.getState().noteServerUsage(0);
    }
    throw new AnalysisError(code, payload?.message);
  }

  const remaining = payload.entitled || payload.freeUsesRemaining == null ? null : payload.freeUsesRemaining;
  useSubscriptionStore.getState().noteServerUsage(remaining);
  lastShotReceipt = asReceipt(payload.record);
  return {
    mode: payload.mode ?? input.mode,
    model: payload.model ?? "",
    latencyMs: payload.latencyMs ?? 0,
    freeUsesRemaining: remaining,
    estimatedCostUsd: payload.estimatedCostUsd ?? 0,
    serverTime: typeof payload.serverTime === "string" ? payload.serverTime : lastShotReceipt?.serverTime ?? null,
    receipt: lastShotReceipt,
    result: payload.result,
  };
}
