// Copy of shared/qr.ts. Vercel's server bundle cannot import ../../shared
// at runtime (same crash as shared/score-angles.ts on the PR #54 preview).
// Keep in sync with shared/qr.ts.
/**
 * Byte-mode QR, versions 4–6, error correction L, mask 0.
 * Enough for a verify URL. Returns null when the text does not fit.
 */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

interface Version {
  version: number;
  size: number;
  data: number;
  ec: number;
  align: number[];
  capacity: number;
}

const VERSIONS: Version[] = [
  { version: 4, size: 33, data: 80, ec: 20, align: [6, 26], capacity: 78 },
  { version: 5, size: 37, data: 108, ec: 26, align: [6, 30], capacity: 106 },
  { version: 6, size: 41, data: 136, ec: 36, align: [6, 34], capacity: 134 },
];

function generator(ec: number): number[] {
  let poly = [1];
  for (let i = 0; i < ec; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function remainder(data: number[], ec: number): number[] {
  const gen = generator(ec);
  const msg = data.concat(new Array(ec).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const factor = msg[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) {
      msg[i + j] ^= mul(gen[j], factor);
    }
  }
  return msg.slice(data.length);
}

function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return bytes;
}

function dataCodewords(text: string, version: Version): number[] {
  const bytes = utf8(text);
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  bytes.forEach((byte) => push(byte, 8));
  const capacity = version.data * 8;
  const terminator = Math.min(4, capacity - bits.length);
  for (let i = 0; i < terminator; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let word = 0;
    for (let b = 0; b < 8; b += 1) word = (word << 1) | bits[i + b];
    words.push(word);
  }
  let pad = 0xec;
  while (words.length < version.data) {
    words.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }
  return words;
}

function formatBits(): number {
  const data = 0b01000;
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

function paint(matrix: number[][], reserved: boolean[][], x: number, y: number, dark: boolean): void {
  if (y < 0 || x < 0 || y >= matrix.length || x >= matrix.length) return;
  matrix[y][x] = dark ? 1 : 0;
  reserved[y][x] = true;
}

function finder(matrix: number[][], reserved: boolean[][], x: number, y: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const on = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
        && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      paint(matrix, reserved, x + dx, y + dy, on);
    }
  }
}

function alignment(matrix: number[][], reserved: boolean[][], cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (reserved[cy + dy]?.[cx + dx]) return;
    }
  }
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const ring = Math.max(Math.abs(dx), Math.abs(dy));
      paint(matrix, reserved, cx + dx, cy + dy, ring !== 1);
    }
  }
}

export function qrPayload(text: string): number[] | null {
  const bytes = utf8(text).length;
  const version = VERSIONS.find((item) => bytes <= item.capacity);
  if (!version) return null;
  const payload = dataCodewords(text, version);
  return payload.concat(remainder(payload, version.ec));
}

export function qrMatrix(text: string): number[][] | null {
  const bytes = utf8(text).length;
  const version = VERSIONS.find((item) => bytes <= item.capacity);
  if (!version) return null;
  const size = version.size;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  finder(matrix, reserved, 0, 0);
  finder(matrix, reserved, size - 7, 0);
  finder(matrix, reserved, 0, size - 7);
  for (const cy of version.align) {
    for (const cx of version.align) alignment(matrix, reserved, cx, cy);
  }
  for (let i = 0; i < size; i += 1) {
    if (!reserved[6][i]) paint(matrix, reserved, i, 6, i % 2 === 0);
    if (!reserved[i][6]) paint(matrix, reserved, 6, i, i % 2 === 0);
  }
  paint(matrix, reserved, 8, size - 8, true);
  const format = formatBits();
  const primary: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const secondary: [number, number][] = [];
  for (let i = 0; i < 8; i += 1) secondary.push([size - 1 - i, 8]);
  for (let i = 0; i < 7; i += 1) secondary.push([8, size - 7 + i]);
  for (const [x, y] of [...primary, ...secondary]) reserved[y][x] = true;

  const payload = dataCodewords(text, version);
  const ec = remainder(payload, version.ec);
  const bits: number[] = [];
  [...payload, ...ec].forEach((word) => {
    for (let i = 7; i >= 0; i -= 1) bits.push((word >>> i) & 1);
  });
  let col = size - 1;
  let upward = true;
  let index = 0;
  while (col > 0) {
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = col - offset;
        if (reserved[row][x]) continue;
        matrix[row][x] = index < bits.length ? bits[index] : 0;
        index += 1;
      }
    }
    upward = !upward;
    col -= 2;
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!reserved[y][x] && (x + y) % 2 === 0) matrix[y][x] ^= 1;
    }
  }
  for (let i = 0; i < 15; i += 1) {
    const bit = (format >>> i) & 1;
    paint(matrix, reserved, primary[i][0], primary[i][1], bit === 1);
    paint(matrix, reserved, secondary[i][0], secondary[i][1], bit === 1);
  }
  return matrix;
}

export function qrSvg(text: string, quiet = 2): string | null {
  const matrix = qrMatrix(text);
  if (!matrix) return null;
  const n = matrix.length;
  const cells: string[] = [];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (matrix[y][x]) cells.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
    }
  }
  const span = n + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}" shape-rendering="crispEdges">${cells.join("")}</svg>`;
}
