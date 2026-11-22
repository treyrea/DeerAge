/**
 * Pick the sharpest burst frame on the phone with a cheap Laplacian-variance
 * score on a downscaled JPEG. No new native dependency; decode uses jpeg-js.
 */

import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { decode as decodeJpeg } from "jpeg-js";

/** Width of the copy we score. 128 px keeps this fast on-device. */
export const SHARPNESS_DOWNSCALE_WIDTH = 128;

export function rgbaToGrayscale(rgba: Uint8Array | Uint8ClampedArray, pixelCount?: number): Uint8Array {
  const n = pixelCount ?? Math.floor(rgba.length / 4);
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    // Rec. 601 luma, integer math
    gray[i] = (rgba[o] * 77 + rgba[o + 1] * 150 + rgba[o + 2] * 29) >> 8;
  }
  return gray;
}

/**
 * Variance of a 4-neighbor Laplacian. Higher means more edge energy (sharper).
 * A flat or fully blurred image scores near 0.
 */
export function laplacianVariance(gray: Uint8Array | Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3 || gray.length < width * height) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const i = row + x;
      const lap = (gray[i] ?? 0) * 4 - (gray[i - 1] ?? 0) - (gray[i + 1] ?? 0) - (gray[i - width] ?? 0) - (gray[i + width] ?? 0);
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function sharpnessFromRgba(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): number {
  return laplacianVariance(rgbaToGrayscale(rgba, width * height), width, height);
}

export function sharpnessFromJpegBytes(bytes: Uint8Array): number {
  const raw = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
  return sharpnessFromRgba(raw.data, raw.width, raw.height);
}

/** First finite maximum wins. If every score is missing or invalid, return 0 (the first frame). */
export function pickSharpestIndex(scores: readonly (number | null | undefined)[]): number {
  if (scores.length === 0) return 0;
  let bestIndex = 0;
  let bestScore = -Infinity;
  let found = false;
  for (let i = 0; i < scores.length; i += 1) {
    const score = scores[i];
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    if (!found || score > bestScore) {
      bestIndex = i;
      bestScore = score;
      found = true;
    }
  }
  return found ? bestIndex : 0;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }
  const atobFn = (globalThis as { atob?: (value: string) => string }).atob;
  if (typeof atobFn !== "function") {
    throw new Error("no base64 decoder");
  }
  const binary = atobFn(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** Score one photo after shrinking it to SHARPNESS_DOWNSCALE_WIDTH. */
export async function scoreUriSharpness(uri: string): Promise<number> {
  const resized = await manipulateAsync(uri, [{ resize: { width: SHARPNESS_DOWNSCALE_WIDTH } }], {
    compress: 1,
    format: SaveFormat.JPEG,
  });
  const b64 = await FileSystem.readAsStringAsync(resized.uri, { encoding: FileSystem.EncodingType.Base64 });
  return sharpnessFromJpegBytes(base64ToBytes(b64));
}

/**
 * Pick the sharpest frame. One frame is returned as-is. If scoring throws or
 * every score is invalid, the first frame is used.
 */
export async function pickSharpestFrame<T extends { imageUri: string }>(
  frames: readonly T[],
  score: (uri: string) => Promise<number> = scoreUriSharpness,
): Promise<T | undefined> {
  if (frames.length === 0) return undefined;
  if (frames.length === 1) return frames[0];
  try {
    const scores = await Promise.all(
      frames.map(async (frame) => {
        try {
          return await score(frame.imageUri);
        } catch {
          return null;
        }
      }),
    );
    return frames[pickSharpestIndex(scores)];
  } catch {
    return frames[0];
  }
}
