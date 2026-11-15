import assert from "node:assert/strict";
import { test } from "node:test";
import { contextBlock } from "./prompts.js";
import { regionAt, regionHeadsUp, sameHunt, type Place } from "./regions.js";

const pineywoods: Place = { stateCode: "TX", stateName: "Texas", ecoregion: "Pineywoods", label: "Pineywoods" };
const edwards: Place = { stateCode: "TX", stateName: "Texas", ecoregion: "Hill Country/Edwards Plateau", label: "Hill Country/Edwards Plateau" };
const transPecos: Place = { stateCode: "TX", stateName: "Texas", ecoregion: "Trans-Pecos", label: "Trans-Pecos" };
const iowa: Place = { stateCode: "IA", stateName: "Iowa", ecoregion: "", label: "Iowa" };

test("gps maps known stands without a network", () => {
  assert.equal(regionAt(32.35, -95.3)?.label, "Pineywoods");
  assert.equal(regionAt(30.36, -103.66)?.label, "Trans-Pecos");
  assert.equal(regionAt(30.05, -99.14)?.label, "Edwards Plateau");
  assert.equal(regionAt(32.78, -96.8)?.label, "Blackland Prairie");
  const iowaHit = regionAt(41.59, -93.62);
  assert.equal(iowaHit?.stateCode, "IA");
  assert.equal(iowaHit?.ecoregion, "");
  assert.equal(regionAt(0, 0), null);
});

test("a sourced antler gap is quoted and an unsourced pair stays generic", () => {
  assert.equal(sameHunt(edwards, { ...edwards, ecoregion: "Edwards Plateau", label: "Edwards Plateau" }), true);
  const sourced = regionHeadsUp(edwards, pineywoods);
  assert.ok(sourced?.includes("126"));
  assert.ok(sourced?.includes("118"));
  assert.ok(sourced?.includes("body shape"));
  assert.equal(sourced?.toLowerCase().includes("smaller-bodied"), false);
  const generic = regionHeadsUp(transPecos, pineywoods);
  assert.equal(generic, "Deer in this region may look different from the ones at home, so lean on body shape.");
  assert.equal(regionHeadsUp(edwards, edwards), null);
  assert.equal(regionHeadsUp({ ...iowa, ecoregion: "Midwest", label: "Midwest" }, iowa), null);
  const remote = regionHeadsUp(pineywoods, transPecos, "Hunting {hunt}, home is {home}.");
  assert.equal(remote, "Hunting Trans-Pecos, home is Pineywoods.");
});

test("the prompt applies the regional prior to the hunt region", () => {
  const block = contextBlock({
    state: "TX",
    ecoregion: "Pineywoods",
    homeState: "TX",
    homeEcoregion: "Edwards Plateau",
    minimumShooterAge: 4.5,
  });
  assert.ok(block.includes("Hunt ecoregion: Pineywoods"));
  assert.ok(block.includes("Home ecoregion: Edwards Plateau"));
  assert.ok(block.includes("hunt ecoregion"));
  assert.ok(block.includes("Edwards Plateau about 118"));
});
