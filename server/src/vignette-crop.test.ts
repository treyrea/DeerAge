/**
 * Deterministic vignette crop tests on synthetic images. No network, no API key.
 */
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { findCircularVignetteCrop, scaleCropRect } from "../../shared/vignette-crop.js";
import { prepareScanImage, SCAN_IMAGE_WIDTH } from "./vignette-crop.js";

const W = 400;
const H = 400;

async function rawOf(png: Buffer): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> {
  return sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function paint(draw: (buf: Buffer, width: number, height: number) => void, width = W, height = H): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3, 0);
  draw(data, width, height);
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

function setPx(data: Buffer, width: number, x: number, y: number, r: number, g: number, b: number): void {
  const i = (y * width + x) * 3;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
}

/** Black frame, a mid-gray circular field, and a tan "body" rectangle. */
function scopeView(options: { reticle?: boolean; cx?: number; cy?: number; radius?: number } = {}): (data: Buffer, width: number, height: number) => void {
  const radius = options.radius ?? 140;
  const cx = options.cx ?? 200;
  const cy = options.cy ?? 200;
  return (data, width, height) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= radius) setPx(data, width, x, y, 90, 100, 80);
        else setPx(data, width, x, y, 0, 0, 0);
      }
    }
    // tan body in the circle
    for (let y = cy - 30; y < cy + 40; y++) {
      for (let x = cx - 50; x < cx + 45; x++) {
        if (x >= 0 && y >= 0 && x < width && y < height) setPx(data, width, x, y, 150, 110, 70);
      }
    }
    if (options.reticle) {
      // thin light crosshairs across the body, like a duplex reticle
      for (let x = cx - radius + 8; x < cx + radius - 8; x++) {
        if (x >= 0 && x < width) setPx(data, width, x, cy, 220, 220, 220);
      }
      for (let y = cy - radius + 8; y < cy + radius - 8; y++) {
        if (y >= 0 && y < height) setPx(data, width, cx, y, 220, 220, 220);
      }
    }
  };
}

test("crops a centered circular vignette and keeps the body", async () => {
  const png = await paint(scopeView());
  const raw = await rawOf(png);
  const rect = findCircularVignetteCrop(raw.info.width, raw.info.height, raw.data, raw.info.channels);
  assert.ok(rect, "expected a crop");
  assert.ok(rect!.width < W * 0.9 && rect!.height < H * 0.9);
  assert.ok(rect!.width > 180 && rect!.height > 180);
  // The tan body at (150-245, 170-240) must stay inside the crop.
  assert.ok(rect!.left <= 150 && rect!.top <= 170);
  assert.ok(rect!.left + rect!.width >= 245 && rect!.top + rect!.height >= 240);
});

test("a reticle over the body does not change the crop by more than a few pixels", async () => {
  const plain = await rawOf(await paint(scopeView()));
  const crossed = await rawOf(await paint(scopeView({ reticle: true })));
  const a = findCircularVignetteCrop(plain.info.width, plain.info.height, plain.data, plain.info.channels);
  const b = findCircularVignetteCrop(crossed.info.width, crossed.info.height, crossed.data, crossed.info.channels);
  assert.ok(a && b);
  assert.equal(Math.abs(a!.left - b!.left) <= 6, true, `left ${a!.left} vs ${b!.left}`);
  assert.equal(Math.abs(a!.top - b!.top) <= 6, true);
  assert.equal(Math.abs(a!.width - b!.width) <= 8, true);
  assert.equal(Math.abs(a!.height - b!.height) <= 8, true);
});

test("does not crop a normal daylight scene", async () => {
  const png = await paint((data, width, height) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (y < height * 0.45) setPx(data, width, x, y, 110, 150, 210);
        else setPx(data, width, x, y, 50, 110, 45);
      }
    }
    for (let y = 180; y < 260; y++) {
      for (let x = 140; x < 240; x++) setPx(data, width, x, y, 150, 110, 70);
    }
  });
  const raw = await rawOf(png);
  assert.equal(findCircularVignetteCrop(raw.info.width, raw.info.height, raw.data, raw.info.channels), null);
});

test("does not crop a dark night woods photo with a deer off-center", async () => {
  const png = await paint((data, width, height) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = 8 + ((x * 13 + y * 7) % 18);
        setPx(data, width, x, y, v, v + 2, v);
      }
    }
    for (let y = 200; y < 320; y++) {
      for (let x = 220; x < 340; x++) setPx(data, width, x, y, 40, 38, 30);
    }
  });
  const raw = await rawOf(png);
  assert.equal(findCircularVignetteCrop(raw.info.width, raw.info.height, raw.data, raw.info.channels), null);
});

test("follows an off-center circle", async () => {
  const png = await paint(scopeView({ cx: 150, cy: 160, radius: 110 }));
  const raw = await rawOf(png);
  const rect = findCircularVignetteCrop(raw.info.width, raw.info.height, raw.data, raw.info.channels);
  assert.ok(rect);
  assert.ok(rect!.left < 80, `left ${rect!.left}`);
  assert.ok(rect!.top < 90, `top ${rect!.top}`);
  assert.ok(rect!.left + rect!.width < 320);
});

test("leaves a full-frame photo and an all-black photo alone", async () => {
  const bright = await rawOf(await paint((data, width, height) => {
    data.fill(180);
    void width;
    void height;
  }));
  assert.equal(findCircularVignetteCrop(bright.info.width, bright.info.height, bright.data, bright.info.channels), null);
  const black = await rawOf(await paint((data) => data.fill(0)));
  assert.equal(findCircularVignetteCrop(black.info.width, black.info.height, black.data, black.info.channels), null);
});

test("scaleCropRect maps a probe crop back to the original size", () => {
  const scaled = scaleCropRect({ left: 10, top: 20, width: 50, height: 60 }, 100, 400, 400);
  assert.deepEqual(scaled, { left: 40, top: 80, width: 200, height: 240 });
});

test("prepareScanImage crops a large vignette before shrinking to 768", async () => {
  const big = await paint(scopeView({ cx: 600, cy: 600, radius: 420 }), 1200, 1200);
  const jpeg = await sharp(big).jpeg().toBuffer();
  const out = await prepareScanImage(jpeg.toString("base64"));
  const meta = await sharp(Buffer.from(out, "base64")).metadata();
  assert.ok((meta.width ?? 0) <= SCAN_IMAGE_WIDTH);
  // A crop of a 140/400 = 0.35 radius on 1200px, then resize to 768, should be well under 768
  // if we cropped. If we only resized, width would be 768.
  // After crop the circle is ~840 px; resized without enlargement stays 768 if still wider.
  // Check that height is close to width (square-ish crop) rather than 768x768 from a full square source...
  // Full 1200 resize is also square 768. So check luma corners of the OUTPUT: they should not be black rings.
  const raw = await sharp(Buffer.from(out, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = raw.info;
  const corner = lumAt(raw.data, width, channels, 2, 2);
  const mid = lumAt(raw.data, width, channels, Math.floor(width / 2), Math.floor(height / 2));
  assert.ok(mid > 40, `mid luma ${mid}`);
  assert.ok(corner > 20, `corner luma ${corner} should be the field, not the black ring`);
});

test("prepareScanImage leaves a small non-vignette JPEG unchanged", async () => {
  const png = await paint((data, width, height) => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) setPx(data, width, x, y, 80, 140, 200);
    }
  }, 320, 240);
  const jpeg = await sharp(png).jpeg({ quality: 80 }).toBuffer();
  const input = jpeg.toString("base64");
  const out = await prepareScanImage(input);
  assert.equal(out, input);
});

function lumAt(data: Buffer, width: number, channels: number, x: number, y: number): number {
  const p = (y * width + x) * channels;
  return 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
}

test("the server copy of the vignette math matches shared/vignette-crop.ts", async () => {
  const { readFileSync } = await import("node:fs");
  const shared = readFileSync(new URL("../../shared/vignette-crop.ts", import.meta.url), "utf8");
  const copy = readFileSync(new URL("./vignette-crop-math.ts", import.meta.url), "utf8");
  assert.equal(copy.endsWith(shared), true);
});
