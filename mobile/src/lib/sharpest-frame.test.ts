import { encode as encodeJpeg } from "jpeg-js";
import {
  laplacianVariance,
  pickSharpestFrame,
  pickSharpestIndex,
  rgbaToGrayscale,
  sharpnessFromJpegBytes,
  sharpnessFromRgba,
} from "./sharpest-frame";

function makeRgba(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return data;
}

function checkerboard(width: number, height: number, cell = 4): Uint8Array {
  return makeRgba(width, height, (x, y) => {
    const on = Math.floor(x / cell) % 2 === Math.floor(y / cell) % 2;
    const v = on ? 255 : 0;
    return [v, v, v];
  });
}

function flatGray(width: number, height: number, value = 128): Uint8Array {
  return makeRgba(width, height, () => [value, value, value]);
}

function boxBlur(rgba: Uint8Array, width: number, height: number, radius = 3): Uint8Array {
  const out = new Uint8Array(rgba.length);
  const area = (2 * radius + 1) * (2 * radius + 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const o = (yy * width + xx) * 4;
          r += rgba[o] ?? 0;
          g += rgba[o + 1] ?? 0;
          b += rgba[o + 2] ?? 0;
        }
      }
      const d = (y * width + x) * 4;
      out[d] = Math.round(r / area);
      out[d + 1] = Math.round(g / area);
      out[d + 2] = Math.round(b / area);
      out[d + 3] = 255;
    }
  }
  return out;
}

const WIDTH = 64;
const HEIGHT = 48;

describe("laplacian sharpness", () => {
  it("scores a checkerboard much higher than a flat or blurred image", () => {
    const sharp = checkerboard(WIDTH, HEIGHT);
    const blurry = boxBlur(sharp, WIDTH, HEIGHT, 4);
    const flat = flatGray(WIDTH, HEIGHT);
    const sharpScore = sharpnessFromRgba(sharp, WIDTH, HEIGHT);
    const blurScore = sharpnessFromRgba(blurry, WIDTH, HEIGHT);
    const flatScore = sharpnessFromRgba(flat, WIDTH, HEIGHT);
    expect(sharpScore).toBeGreaterThan(blurScore * 5);
    expect(sharpScore).toBeGreaterThan(flatScore + 100);
    expect(flatScore).toBeLessThan(1);
  });

  it("returns 0 for images too small to score", () => {
    expect(laplacianVariance(new Uint8Array(4), 2, 2)).toBe(0);
    expect(laplacianVariance(new Uint8Array(0), 0, 0)).toBe(0);
  });

  it("converts rgba to luma", () => {
    const gray = rgbaToGrayscale(Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]));
    expect(gray.length).toBe(2);
    expect(gray[0]).toBe(76); // 255 * 77 >> 8
    expect(gray[1]).toBe(149); // 255 * 150 >> 8
  });
});

describe("pickSharpestIndex", () => {
  it("picks the highest finite score", () => {
    expect(pickSharpestIndex([1, 9, 3])).toBe(1);
  });

  it("keeps the first frame when scores tie", () => {
    expect(pickSharpestIndex([5, 5, 5])).toBe(0);
    expect(pickSharpestIndex([2, 8, 8])).toBe(1);
  });

  it("falls back to the first frame when scores are missing or invalid", () => {
    expect(pickSharpestIndex([])).toBe(0);
    expect(pickSharpestIndex([null, undefined, Number.NaN, Infinity, -Infinity])).toBe(0);
  });

  it("skips invalid scores and still picks a real one", () => {
    expect(pickSharpestIndex([null, 2, Number.NaN, 7, undefined])).toBe(3);
  });
});

describe("pickSharpestFrame", () => {
  const frames = [
    { imageUri: "a.jpg", frameIndex: 0 },
    { imageUri: "b.jpg", frameIndex: 1 },
    { imageUri: "c.jpg", frameIndex: 2 },
  ];

  it("returns the only frame without scoring", async () => {
    const score = jest.fn();
    const picked = await pickSharpestFrame([frames[0]], score);
    expect(picked).toEqual(frames[0]);
    expect(score).not.toHaveBeenCalled();
  });

  it("returns undefined for an empty list", async () => {
    expect(await pickSharpestFrame([])).toBeUndefined();
  });

  it("picks the sharpest scored frame", async () => {
    const score = jest.fn(async (uri: string) => (uri === "c.jpg" ? 40 : uri === "b.jpg" ? 10 : 1));
    const picked = await pickSharpestFrame(frames, score);
    expect(picked?.imageUri).toBe("c.jpg");
    expect(score).toHaveBeenCalledTimes(3);
  });

  it("falls back to the first frame if every score fails", async () => {
    const score = jest.fn(async () => {
      throw new Error("decode failed");
    });
    const picked = await pickSharpestFrame(frames, score);
    expect(picked?.imageUri).toBe("a.jpg");
  });

  it("ignores one failed score and still picks the sharpest remaining frame", async () => {
    const score = jest.fn(async (uri: string) => {
      if (uri === "c.jpg") throw new Error("boom");
      return uri === "b.jpg" ? 20 : 3;
    });
    const picked = await pickSharpestFrame(frames, score);
    expect(picked?.imageUri).toBe("b.jpg");
  });
});

describe("sharpnessFromJpegBytes", () => {
  it("ranks a sharp JPEG above a blurred one, and stays cheap on a downscaled copy", () => {
    const width = 128;
    const height = 96;
    const sharp = checkerboard(width, height, 4);
    const blurry = boxBlur(sharp, width, height, 5);
    const sharpJpeg = Uint8Array.from(encodeJpeg({ data: sharp, width, height }, 90).data);
    const blurJpeg = Uint8Array.from(encodeJpeg({ data: blurry, width, height }, 90).data);
    const started = process.hrtime.bigint();
    const scores: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      scores.push(sharpnessFromJpegBytes(sharpJpeg));
    }
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    const blurScore = sharpnessFromJpegBytes(blurJpeg);
    expect(scores[0]).toBeGreaterThan(blurScore * 3);
    // 8 downscaled decodes + Laplacian scores should be well under 100 ms in Node.
    expect(elapsedMs).toBeLessThan(100);
  });
});
