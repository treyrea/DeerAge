import { shouldRequestReviewAfterLeaving } from "./review-leave";

describe("shouldRequestReviewAfterLeaving", () => {
  it("asks after a finished SHOOTER result the hunter has looked at", () => {
    expect(shouldRequestReviewAfterLeaving({
      enabled: true,
      rescan: false,
      visibleMs: 800,
      fieldCall: "SHOOTER",
    })).toBe(true);
  });

  it("asks after a finished LET WALK result", () => {
    expect(shouldRequestReviewAfterLeaving({
      enabled: true,
      rescan: false,
      visibleMs: 1_200,
      fieldCall: "LET WALK",
    })).toBe(true);
  });

  it("does not ask while the result is still on screen", () => {
    expect(shouldRequestReviewAfterLeaving({
      enabled: true,
      rescan: false,
      visibleMs: 799,
      fieldCall: "SHOOTER",
    })).toBe(false);
  });

  it("does not ask on the first brief bounce away", () => {
    expect(shouldRequestReviewAfterLeaving({
      enabled: true,
      rescan: false,
      visibleMs: 0,
      fieldCall: "SHOOTER",
    })).toBe(false);
  });

  it("does not ask when the hunter starts a rescan", () => {
    expect(shouldRequestReviewAfterLeaving({
      enabled: true,
      rescan: true,
      visibleMs: 2_000,
      fieldCall: "SHOOTER",
    })).toBe(false);
  });

  it("does not ask after BORDERLINE or a missing field call", () => {
    expect(shouldRequestReviewAfterLeaving({
      enabled: true,
      rescan: false,
      visibleMs: 2_000,
      fieldCall: "BORDERLINE",
    })).toBe(false);
    expect(shouldRequestReviewAfterLeaving({
      enabled: true,
      rescan: false,
      visibleMs: 2_000,
      fieldCall: null,
    })).toBe(false);
  });

  it("does not ask when the hook was not enabled for a finished result", () => {
    expect(shouldRequestReviewAfterLeaving({
      enabled: false,
      rescan: false,
      visibleMs: 2_000,
      fieldCall: "SHOOTER",
    })).toBe(false);
  });
});
