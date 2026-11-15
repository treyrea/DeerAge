import assert from "node:assert/strict";
import { test } from "node:test";
import { abuseFlags } from "./abuse.js";
import { proofEffect } from "./proof.js";
import { isOverdue } from "./tracker.js";

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

test("abuse flags mark a repeat month, a new subscriber, a shared photo, and a missing proof type", () => {
  const now = Date.now();
  const flags = abuseFlags({
    appUserId: "hunter-a",
    createdAt: new Date(now).toISOString(),
    reportedAge: "2.5",
    proofMethod: null,
    photoHash: "abc",
    subscribedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    grants: [new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString()],
    recentReportCount: 3,
    hashOwners: ["hunter-a", "hunter-b"],
    now,
  });
  assert.deepEqual(flags, ["repeat_free_month", "many_reports", "new_subscriber", "same_photo", "no_proof"]);
  assert.equal(isOverdue("verdict", new Date(now - 1000).toISOString(), now), false);
  assert.equal(isOverdue("studying", new Date(now - 1000).toISOString(), now), true);
});
