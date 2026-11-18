import assert from "node:assert/strict";
import { test } from "node:test";
import { leaseButtonLabel, leaseManagerMessage } from "./lease-text.js";

test("the lease text names the class, the call, and the minimum", () => {
  const text = leaseManagerMessage({
    ageClass: "4.5",
    call: "SHOOTER",
    minimum: 4.5,
    region: "Pineywoods",
    time: "Nov 15, 2026, 8:14 AM",
    link: "https://api.example.com/api/verify-record?id=rec_0123456789abcdef",
  });
  assert.ok(text.startsWith("4.5 · SHOOTER · lease minimum 4.5"));
  assert.ok(text.includes("Pineywoods"));
  assert.ok(text.includes("Nov 15, 2026, 8:14 AM"));
  assert.ok(text.includes("/api/verify-record?id=rec_0123456789abcdef"));
  assert.equal(text.includes("sms:"), false);
});

test("a missing verification link is omitted without blocking the text", () => {
  const text = leaseManagerMessage({
    ageClass: "3.5",
    call: "LET WALK",
    minimum: 4.5,
    region: "Edwards Plateau",
    time: "Nov 15, 2026, 8:14 AM",
    link: "",
  });
  assert.ok(text.includes("3.5 · LET WALK · lease minimum 4.5"));
  assert.ok(text.includes("isn't available"));
  assert.equal(text.includes("http"), false);
});

test("the primary button uses the saved name, or asks for setup", () => {
  assert.deepEqual(leaseButtonLabel("Jake", "5550100"), { ready: true, label: "Text Jake · Lease Manager" });
  assert.deepEqual(leaseButtonLabel("", ""), { ready: false, label: "Set up lease manager" });
  assert.equal(leaseButtonLabel("Jake", "5550100", "Text the lease").label, "Text the lease");
});

test("remote copy replaces the lease text", () => {
  const text = leaseManagerMessage({
    ageClass: "4.5",
    call: "BORDERLINE",
    minimum: 4.5,
    region: "Pineywoods",
    time: "today",
    link: "https://api.example.com/api/verify-record?id=rec_0123456789abcdef",
  }, "{call} on a {minimum} lease in the {region}. {link}");
  assert.equal(text, "BORDERLINE on a 4.5 lease in the Pineywoods. https://api.example.com/api/verify-record?id=rec_0123456789abcdef");
});
