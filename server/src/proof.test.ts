import assert from "node:assert/strict";
import { test } from "node:test";
import { proofEffect } from "./proof.js";

test("a lab tooth age that disagrees with a firm call owes a free month", () => {
  assert.equal(proofEffect({ fieldCall: "SHOOTER", minimum: 4.5, ageYears: 3.5, method: "lab_tooth" }), "free_month");
});

test("a jawbone age of 2.5 that disagrees owes a free month", () => {
  assert.equal(proofEffect({ fieldCall: "SHOOTER", minimum: 4.5, ageYears: 2.5, method: "jawbone" }), "free_month");
});

test("a jawbone age of 3.5 that disagrees is review only", () => {
  assert.equal(proofEffect({ fieldCall: "SHOOTER", minimum: 4.5, ageYears: 3.5, method: "jawbone" }), "review");
});

test("an age that matches the call does not reopen it", () => {
  assert.equal(proofEffect({ fieldCall: "SHOOTER", minimum: 4.5, ageYears: 5.5, method: "lab_tooth" }), "none");
});
