/**
 * When the gateway is down or every read comes back empty, Quick Check returns an error, never an empty age.
 * No photos and no network.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { runAgeCall, setAgeCallerForTests } from "./age-pipeline.js";
import { GatewayError, type ModelCall } from "./gateway.js";

function call(text: string): ModelCall {
  return { role: "test", model: "test", text, usd: 0.001, ms: 1, promptTokens: 12, completionTokens: 8 };
}

const DEER = `FINAL {"deer_present":"YES","age":3.5,"confidence":70,"visibleParts":["neck"],"betterAngle":"","cues":[{"area":"neck","text":"Neck meets the chest"}],"stop":null}`;

afterEach(() => setAgeCallerForTests(null));

test("a gateway that is not configured gives an upstream error and no age", async () => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (line: unknown) => { logs.push(String(line)); };
  try {
    setAgeCallerForTests(async () => {
      throw new GatewayError("The AI gateway is not configured.", 503, false);
    });
    const outcome = await runAgeCall("jpeg", 4.5);
    assert.equal(outcome.error, "upstream");
    assert.equal(outcome.result, null);
    assert.equal(outcome.stop, null);
    assert.equal(outcome.costs.length, 0);
  } finally {
    console.log = original;
  }
  assert.ok(logs.some((line) => line.includes("model_call_failed") && line.includes("not configured")));
  assert.ok(logs.some((line) => line.includes("age_no_reading")));
});

test("replies with no usable age give an upstream error, not the lease minimum", async () => {
  setAgeCallerForTests(async (options) => (options.role === "boxes" ? call(`{"boxes":[]}`) : call("I could not read this.")));
  const outcome = await runAgeCall("jpeg", 4.5);
  assert.equal(outcome.error, "upstream");
  assert.equal(outcome.result, null);
});

test("a deer still ages, and a main failure with a good fast read keeps the fast age", async () => {
  setAgeCallerForTests(async (options) => (options.role === "boxes" ? call(`{"boxes":[]}`) : call(DEER)));
  const buck = await runAgeCall("jpeg", 4.5);
  assert.equal(buck.error, undefined);
  assert.equal(buck.result?.ageYears, 3.5);

  setAgeCallerForTests(async (options) => {
    if (options.role === "fast") return call(DEER);
    if (options.role === "boxes") return call(`{"boxes":[]}`);
    throw new GatewayError("Gateway 500", 500, false);
  });
  const fastOnly = await runAgeCall("jpeg", 4.5);
  assert.equal(fastOnly.error, undefined);
  assert.equal(fastOnly.result?.ageYears, 3.5);
});
