/**
 * Covers antler boxes with gray so the body-only read cannot see the rack.
 * Boxes are fractions of the image. Each box is padded by 5 percent.
 */

import sharp from "sharp";

export async function coverAntlers(image: string, boxes: number[][]): Promise<string> {
  const bare = image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
  const input = Buffer.from(bare, "base64");
  if (boxes.length === 0) return bare;
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 2 || height < 2) return bare;
  const overlays: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const box of boxes) {
    if (box.length < 4) continue;
    const [x0, y0, x1, y1] = box;
    const padX = Math.abs(x1 - x0) * 0.05;
    const padY = Math.abs(y1 - y0) * 0.05;
    const left = clamp(Math.floor((Math.min(x0, x1) - padX) * width), 0, width - 1);
    const top = clamp(Math.floor((Math.min(y0, y1) - padY) * height), 0, height - 1);
    const right = clamp(Math.ceil((Math.max(x0, x1) + padX) * width), left + 1, width);
    const bottom = clamp(Math.ceil((Math.max(y0, y1) + padY) * height), top + 1, height);
    const rect = await sharp({
      create: { width: right - left, height: bottom - top, channels: 3, background: { r: 150, g: 150, b: 150 } },
    }).jpeg().toBuffer();
    overlays.push({ input: rect, left, top });
  }
  if (overlays.length === 0) return bare;
  const out = await sharp(input).composite(overlays).jpeg().toBuffer();
  return out.toString("base64");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
