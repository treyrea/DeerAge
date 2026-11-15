import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { qrMatrix, qrSvg } from "./qr.js";

const SAMPLE = "https://deerage.example/api/verify-record?id=rec_0123456789abcdef";

test("the verify URL encodes to the known version-4 code", () => {
  const matrix = qrMatrix(SAMPLE);
  assert.ok(matrix);
  assert.equal(matrix.length, 33);
  assert.equal(matrix[0][0], 1);
  const raw = matrix.map((row) => row.join("")).join("\n");
  const hash = createHash("sha256").update(raw).digest("hex");
  assert.equal(hash, "9eb0be9a1e0a1e8a9a8772cdf537767bf9931bd5a9f16ed65d8189639a08af73");
  const svg = qrSvg(SAMPLE);
  assert.ok(svg?.startsWith("<svg"));
});

test("a longer url still fits and an oversized one does not", () => {
  const longer = `https://api.example.com/api/verify-record?id=rec_${"ab".repeat(30)}`;
  assert.ok(qrMatrix(longer));
  assert.equal(qrMatrix("x".repeat(200)), null);
});
