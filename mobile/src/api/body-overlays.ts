import type { BodyFeatureOverlay } from "../types/deer-scoring";
import { optionalOverlayFields } from "../utils/body-cues";

const pct = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
};

/** The server's result.overlays (percent boxes), checked. Anything malformed is dropped. */
export function overlaysFrom(raw: unknown): BodyFeatureOverlay[] {
  if (!Array.isArray(raw)) return [];
  const out: BodyFeatureOverlay[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const box = (row.boundingBox ?? {}) as Record<string, unknown>;
    const x = pct(box.x);
    const y = pct(box.y);
    const width = pct(box.width);
    const height = pct(box.height);
    const featureId = typeof row.featureId === "string" ? row.featureId : "";
    if (x == null || y == null || width == null || height == null || width < 1 || height < 1 || !featureId || seen.has(featureId)) continue;
    seen.add(featureId);
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : featureId;
    out.push({
      featureId,
      name,
      boundingBox: { x, y, width: Math.min(width, 100 - x), height: Math.min(height, 100 - y) },
      label: typeof row.label === "string" && row.label.trim() ? row.label.trim() : name,
      confidence: Math.max(0, Math.min(100, Math.round(Number(row.confidence) || 0))),
      ...optionalOverlayFields(row),
    });
  }
  return out;
}

/**
 * Where a "contain" image actually sits inside its view. Boxes are percent of the photo,
 * so they must be placed on this rectangle, not on the letterboxed view.
 */
export function containedRect(viewWidth: number, viewHeight: number, imageWidth: number, imageHeight: number) {
  if (!(viewWidth > 0 && viewHeight > 0 && imageWidth > 0 && imageHeight > 0)) {
    return { left: 0, top: 0, width: viewWidth, height: viewHeight };
  }
  const scale = Math.min(viewWidth / imageWidth, viewHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { left: (viewWidth - width) / 2, top: (viewHeight - height) / 2, width, height };
}

/** Center of a numbered dot. The anchor is a percent of the photo, then kept inside the drawn photo. */
export function dotCenter(
  viewWidth: number,
  viewHeight: number,
  imageWidth: number,
  imageHeight: number,
  anchor: { x: number; y: number },
  radius = 11,
): { x: number; y: number } {
  const rect = containedRect(viewWidth, viewHeight, imageWidth, imageHeight);
  const rawX = rect.left + (anchor.x / 100) * rect.width;
  const rawY = rect.top + (anchor.y / 100) * rect.height;
  if (!(rect.width > 0 && rect.height > 0)) return { x: rawX, y: rawY };
  const inset = Math.min(Math.max(radius, 0), rect.width / 2, rect.height / 2);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return {
    x: clamp(rawX, rect.left + inset, rect.left + rect.width - inset),
    y: clamp(rawY, rect.top + inset, rect.top + rect.height - inset),
  };
}
