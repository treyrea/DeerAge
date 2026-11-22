/**
 * JS wrapper around the optional on-device subject detector.
 * The native Expo module is not in current TestFlight builds, so this must
 * fail silent (empty list / unavailable) until a new native build ships it.
 */

import { requireNativeModule } from "expo-modules-core";
import type { NormBox } from "./frame-fill";

export interface SubjectDetection {
  boxes: (NormBox & { confidence: number })[];
  imageWidth: number;
  imageHeight: number;
}

interface NativeSubjectFill {
  isAvailable(): boolean;
  detectSubjects(uri: string): Promise<SubjectDetection>;
}

function loadNative(): NativeSubjectFill | null {
  try {
    const native = requireNativeModule("DeerAgeSubjectFill") as NativeSubjectFill;
    if (native && typeof native.detectSubjects === "function") return native;
    return null;
  } catch {
    return null;
  }
}

let cached: NativeSubjectFill | null | undefined;

export function subjectFillNative(): NativeSubjectFill | null {
  if (cached === undefined) cached = loadNative();
  return cached;
}

export function isSubjectFillAvailable(): boolean {
  try {
    return subjectFillNative()?.isAvailable() === true;
  } catch {
    return false;
  }
}

export async function detectSubjects(uri: string): Promise<SubjectDetection> {
  const native = subjectFillNative();
  if (!native) return { boxes: [], imageWidth: 0, imageHeight: 0 };
  try {
    const result = await native.detectSubjects(uri);
    if (!result || !Array.isArray(result.boxes)) return { boxes: [], imageWidth: 0, imageHeight: 0 };
    return result;
  } catch {
    return { boxes: [], imageWidth: 0, imageHeight: 0 };
  }
}

/** Reset the cached module. Tests only. */
export function resetSubjectFillNativeCache(): void {
  cached = undefined;
}
