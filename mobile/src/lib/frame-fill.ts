/**
 * Compare a detected subject box to the viewfinder guide.
 * Green when the subject covers at least 60% of the guide. A deer that
 * covers more than 90% (fills the box completely) stays green — the 60–90%
 * band is the intended fill, not a cap that turns the brackets off.
 */

export const FILL_MIN = 0.6;

export const FRAME_GOLD = "#F5A623";
export const FRAME_GREEN = "#22C55E";
export const FRAME_OUTLINE = "#111111";
export const FRAME_STROKE_PT = 4;
export const FRAME_ARM_PT = 36;

/** Body guide box: share of screen width, width:height aspect, and lift above center (share of screen height). */
export const BODY_BOX_WIDTH = 0.9;
export const BODY_BOX_ASPECT = 3 / 2;
export const BODY_BOX_LIFT = 0.08;

export const DEFAULT_FRAME_BODY_HINT = "Zoom until the body fills the box";
export const DEFAULT_FRAME_BODY_GOOD_HINT = "Good — hold steady";

export interface NormBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boxArea(box: NormBox): number {
  if (box.width <= 0 || box.height <= 0) return 0;
  return box.width * box.height;
}

export function intersectionArea(a: NormBox, b: NormBox): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

/** How much of the guide box is covered by the subject (0–1). */
export function coverageOfGuide(subject: NormBox, guide: NormBox): number {
  const guideArea = boxArea(guide);
  if (guideArea <= 0) return 0;
  return intersectionArea(subject, guide) / guideArea;
}

export function subjectFillsGuide(subject: NormBox, guide: NormBox, min = FILL_MIN): boolean {
  return coverageOfGuide(subject, guide) >= min;
}

export function bestCoverage(subjects: readonly NormBox[], guide: NormBox): number {
  let best = 0;
  for (const subject of subjects) {
    const coverage = coverageOfGuide(subject, guide);
    if (coverage > best) best = coverage;
  }
  return best;
}

export function anySubjectFillsGuide(subjects: readonly NormBox[], guide: NormBox, min = FILL_MIN): boolean {
  return bestCoverage(subjects, guide) >= min;
}

/**
 * Map a box from image-normalized space into preview-normalized space,
 * assuming the preview is aspect-filled (center-cropped) with the image.
 */
export function mapImageBoxToPreview(
  box: NormBox,
  imageWidth: number,
  imageHeight: number,
  previewWidth: number,
  previewHeight: number,
): NormBox {
  if (imageWidth <= 0 || imageHeight <= 0 || previewWidth <= 0 || previewHeight <= 0) return box;
  const scale = Math.max(previewWidth / imageWidth, previewHeight / imageHeight);
  const displayedWidth = imageWidth * scale;
  const displayedHeight = imageHeight * scale;
  const offsetX = (previewWidth - displayedWidth) / 2;
  const offsetY = (previewHeight - displayedHeight) / 2;
  return {
    x: (box.x * imageWidth * scale + offsetX) / previewWidth,
    y: (box.y * imageHeight * scale + offsetY) / previewHeight,
    width: (box.width * imageWidth * scale) / previewWidth,
    height: (box.height * imageHeight * scale) / previewHeight,
  };
}

/** Guide and preview are in the same window coordinate space (e.g. measureInWindow). */
export function guideInPreview(guide: NormBox, preview: NormBox): NormBox | null {
  if (preview.width <= 0 || preview.height <= 0) return null;
  return {
    x: (guide.x - preview.x) / preview.width,
    y: (guide.y - preview.y) / preview.height,
    width: guide.width / preview.width,
    height: guide.height / preview.height,
  };
}

export function frameBodyHintFromCopy(value?: string | null): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || DEFAULT_FRAME_BODY_HINT;
}

export function frameBodyGoodHintFromCopy(value?: string | null): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || DEFAULT_FRAME_BODY_GOOD_HINT;
}
