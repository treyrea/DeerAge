import type { AntlerMeasurements } from "../types/deer-scoring";
import {
  calculateBooneAndCrockettScore,
  formatScore,
  hasRealScore,
  NOT_SCORED,
  scoreFromServerGross,
} from "./boone-crockett-calculator";

function emptyMeasurements(): AntlerMeasurements {
  return {
    rightMainBeam: { length: 0, side: "right" },
    leftMainBeam: { length: 0, side: "left" },
    abnormalPoints: [],
    rightCircumferences: {},
    leftCircumferences: {},
    insideSpread: 0,
    totalPoints: 0,
    leftSidePoints: 0,
    rightSidePoints: 0,
    totalAbnormalPoints: 0,
  };
}

describe("rack score display", () => {
  it("does not format a missing score as 0.00", () => {
    expect(formatScore(null)).toBe(NOT_SCORED);
    expect(formatScore(undefined)).toBe(NOT_SCORED);
    expect(formatScore(null)).not.toBe("0.00");
    expect(formatScore(undefined)).not.toBe("0.00");
    expect(formatScore(Number.NaN)).toBe(NOT_SCORED);
    expect(formatScore(142.5)).toBe("142.50");
    expect(formatScore(0)).toBe("0.00");
  });

  it("treats an empty or all-zero score as not scored and a measured rack as scored", () => {
    expect(hasRealScore(null)).toBe(false);
    expect(hasRealScore(undefined)).toBe(false);

    const empty = calculateBooneAndCrockettScore(emptyMeasurements());
    expect(empty.netTypical).toBe(0);
    expect(empty.grossTypical).toBe(0);
    expect(hasRealScore(empty)).toBe(false);

    const measured = calculateBooneAndCrockettScore({
      ...emptyMeasurements(),
      rightMainBeam: { length: 22, side: "right" },
      leftMainBeam: { length: 21, side: "left" },
      rightG1: { length: 4, side: "right" },
      leftG1: { length: 3.5, side: "left" },
      insideSpread: 16,
      totalPoints: 8,
      leftSidePoints: 4,
      rightSidePoints: 4,
    });
    expect(hasRealScore(measured)).toBe(true);
    expect(typeof measured.netTypical === "number" ? measured.netTypical : 0).toBeGreaterThan(0);
  });

  it("uses a server gross when the local measurement score is all zeros", () => {
    const empty = calculateBooneAndCrockettScore(emptyMeasurements());
    const lifted = scoreFromServerGross(empty, 132);
    expect(hasRealScore(lifted)).toBe(true);
    expect(lifted.grossTypical).toBe(132);
    expect(lifted.netTypical).toBe(132);
    expect(lifted.netNonTypical).toBe(132);
    expect(hasRealScore(scoreFromServerGross(empty, 0))).toBe(false);
  });
});
