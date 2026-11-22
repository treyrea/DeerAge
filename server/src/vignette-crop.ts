export { findCircularVignetteCrop, scaleCropRect, VIGNETTE_DARK_MAX, type CropRect } from "./vignette-crop-math.js";

import sharp from "sharp";
import { findCircularVignetteCrop } from "./vignette-crop-math.js";

/** Max width the model should see, matching the app's jpegBase64 resize. */
export const SCAN_IMAGE_WIDTH = 768;
const SCAN_JPEG_QUALITY = 55;

function bareBase64(image: string): string {
  return image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

/**
 * Crop a circular dark vignette, then shrink to 768 px wide if needed.
 * On any failure, returns the original string so a scan still runs.
 * Leaves an already-small photo without a vignette untouched (no extra JPEG).
 */
export async function prepareScanImage(imageBase64: string): Promise<string> {
  try {
    const bare = bareBase64(imageBase64);
    const input = Buffer.from(bare, "base64");
    const raw = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const rect = findCircularVignetteCrop(raw.info.width, raw.info.height, raw.data, raw.info.channels);
    if (!rect && raw.info.width <= SCAN_IMAGE_WIDTH) return imageBase64;
    let pipeline = sharp(input);
    if (rect) {
      pipeline = pipeline.extract({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
    const out = await pipeline
      .resize({ width: SCAN_IMAGE_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: SCAN_JPEG_QUALITY })
      .toBuffer();
    return out.toString("base64");
  } catch (error) {
    console.log(JSON.stringify({
      event: "vignette_crop_skipped",
      reason: error instanceof Error ? error.message.slice(0, 120) : "error",
    }));
    return imageBase64;
  }
}

export async function prepareScanImages(images: string[]): Promise<string[]> {
  return Promise.all(images.map((image) => prepareScanImage(image)));
}
