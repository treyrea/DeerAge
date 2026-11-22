// Copy of shared/vignette-crop.ts. Vercel's server bundle could not import the
// shared file's named exports at runtime (FUNCTION_INVOCATION_FAILED on the PR #26
// preview), so the server keeps its own copy. vignette-crop.test.ts checks the two match.
/**
 * Detect a circular dark vignette (scope or binocular eyepiece) and
 * return a tight crop rectangle. Pure pixel math. No model calls.
 *
 * Conservative on purpose: a night woods photo or a dark sky must not
 * be cropped. All of the checks below have to pass.
 */

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export const VIGNETTE_DARK_MAX = 18;

function lum(data: Uint8Array, i: number, channels: number): number {
  const p = i * channels;
  return 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Find a circular dark-ring crop. `data` is packed RGB or RGBA, row-major.
 * Returns null when the frame does not look like a scope/binocular view.
 */
export function findCircularVignetteCrop(
  width: number,
  height: number,
  data: Uint8Array,
  channels: number,
  darkMax: number = VIGNETTE_DARK_MAX,
): CropRect | null {
  if (width < 32 || height < 32) return null;
  if (channels !== 3 && channels !== 4) return null;
  if (data.length < width * height * channels) return null;

  const corner = Math.max(4, Math.round(Math.min(width, height) * 0.08));
  const cornerCells = [
    [0, 0],
    [width - corner, 0],
    [0, height - corner],
    [width - corner, height - corner],
  ];
  for (const [x0, y0] of cornerCells) {
    let dark = 0;
    let sum = 0;
    const n = corner * corner;
    for (let y = y0; y < y0 + corner; y++) {
      for (let x = x0; x < x0 + corner; x++) {
        const L = lum(data, y * width + x, channels);
        sum += L;
        if (L <= darkMax) dark++;
      }
    }
    if (dark / n < 0.92 || sum / n > 12) return null;
  }

  // Sampled content bounding box (every other pixel keeps this cheap).
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  let cx = 0;
  let cy = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 256));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (lum(data, y * width + x, channels) <= darkMax) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      cx += x;
      cy += y;
      count++;
    }
  }
  if (count < 20 || maxX < minX) return null;

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const boxArea = boxW * boxH;
  const frameArea = width * height;
  const areaFrac = boxArea / frameArea;
  if (areaFrac < 0.12 || areaFrac > 0.82) return null;

  const centerX = cx / count;
  const centerY = cy / count;
  // Radius of the circular field: the larger axis of the content box, not the
  // box corner (hypot would inflate a circle by sqrt(2) and often refuse to crop).
  const rBox = Math.max(centerX - minX, maxX - centerX, centerY - minY, maxY - centerY);
  const radius = rBox * 1.04;
  if (radius < Math.min(width, height) * 0.18) return null;
  if (radius > Math.min(width, height) * 0.48) {
    // Almost the full frame; cropping would barely help.
    if (areaFrac > 0.75) return null;
  }

  // Pixels clearly outside the circle should be dark. Inside, most should be content
  // or the dim field of an eyepiece (not required to be bright; just not all black).
  let outside = 0;
  let outsideLit = 0;
  let inside = 0;
  let insideLit = 0;
  const rOut = radius + Math.max(2, Math.min(width, height) * 0.02);
  const r2 = radius * radius;
  const rOut2 = rOut * rOut;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const d2 = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
      const lit = lum(data, y * width + x, channels) > darkMax;
      if (d2 > rOut2) {
        outside++;
        if (lit) outsideLit++;
      } else if (d2 <= r2) {
        inside++;
        if (lit) insideLit++;
      }
    }
  }
  if (outside < 30 || inside < 30) return null;
  if (outsideLit / outside > 0.03) return null;
  if (insideLit / inside < 0.20) return null;

  // Inscribed square, slightly inside the true field so JPEG ringing on the
  // ring does not leave black corners after the crop.
  const half = rBox * 0.70;
  const left = clamp(Math.floor(centerX - half), 0, width - 1);
  const top = clamp(Math.floor(centerY - half), 0, height - 1);
  const right = clamp(Math.ceil(centerX + half), left + 1, width);
  const bottom = clamp(Math.ceil(centerY + half), top + 1, height);
  const cropW = right - left;
  const cropH = bottom - top;
  if (cropW < 32 || cropH < 32) return null;
  if (cropW >= width * 0.95 && cropH >= height * 0.95) return null;
  return { left, top, width: cropW, height: cropH };
}

/** Scale a crop found on a probe image back to the original size. */
export function scaleCropRect(rect: CropRect, fromWidth: number, toWidth: number, toHeight: number): CropRect {
  const s = toWidth / fromWidth;
  const left = clamp(Math.floor(rect.left * s), 0, toWidth - 1);
  const top = clamp(Math.floor(rect.top * s), 0, toHeight - 1);
  const width = clamp(Math.ceil(rect.width * s), 1, toWidth - left);
  const height = clamp(Math.ceil(rect.height * s), 1, toHeight - top);
  return { left, top, width, height };
}
