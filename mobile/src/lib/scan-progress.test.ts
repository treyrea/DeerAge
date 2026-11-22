import { FALLBACK_ETA_MS, MAX_WAITING_FRACTION, parseServerProgress, progressView, roundSeconds, secondsLeftText, stageLabel } from "./scan-progress";

const base = { mode: "age" as const, startedAt: 0, server: null, receivedAt: null, shown: 0, done: false };

describe("scan progress bar", () => {
  it("starts near zero and uses the mode's measured median before the server reports", () => {
    const view = progressView({ ...base, now: 0 });
    expect(view.fraction).toBe(0);
    expect(view.label).toBe("Sending photo");
    expect(view.secondsLeft).toBe(roundSeconds(FALLBACK_ETA_MS.age));
  });

  it("follows the server's stage and time left", () => {
    const view = progressView({ ...base, now: 10_000, server: { stage: "body", etaMs: 20_000 }, receivedAt: 9_000 });
    expect(view.label).toBe("Reading body");
    expect(view.secondsLeft).toBe(20);
    expect(view.fraction).toBeCloseTo(10_000 / (10_000 + 19_000), 5);
  });

  it("never moves backwards when a new estimate is longer", () => {
    const first = progressView({ ...base, now: 10_000, server: { stage: "body", etaMs: 5_000 }, receivedAt: 10_000 });
    const later = progressView({ ...base, now: 11_000, server: { stage: "body", etaMs: 40_000 }, receivedAt: 11_000, shown: first.fraction });
    expect(later.fraction).toBe(first.fraction);
  });

  it("slows near the end and never fills before the result", () => {
    let shown = 0;
    for (let now = 0; now <= 200_000; now += 1_000) {
      const view = progressView({ ...base, now, server: { stage: "crosscheck", etaMs: 10_000 }, receivedAt: 0, shown });
      expect(view.fraction).toBeGreaterThanOrEqual(shown);
      expect(view.fraction).toBeLessThanOrEqual(MAX_WAITING_FRACTION);
      shown = view.fraction;
    }
    const over = progressView({ ...base, now: 60_000, server: { stage: "crosscheck", etaMs: 10_000 }, receivedAt: 0, shown: 0 });
    expect(over.secondsLeft).toBeNull();
    expect(over.label).toBe("Almost done");
  });

  it("fills on completion", () => {
    expect(progressView({ ...base, now: 5_000, done: true }).fraction).toBe(1);
  });

  it("labels per mode, with no B&C words in age or Quick Check", () => {
    expect(stageLabel("age", "photo")).toBe("Checking photo");
    expect(stageLabel("age", "crosscheck")).toBe("Cross-checking");
    expect(stageLabel("quick", "photo")).toBe("Reading body");
    expect(stageLabel("score", "body")).toBe("Measuring the rack");
  });

  it("rounds seconds honestly", () => {
    expect(roundSeconds(7_200)).toBe(8);
    expect(roundSeconds(21_000)).toBe(25);
    expect(secondsLeftText(1)).toBe("About a second left");
    expect(secondsLeftText(null)).toBe("");
  });

  it("ignores malformed server progress", () => {
    expect(parseServerProgress({ stage: "body", etaMs: 1200 })).toEqual({ stage: "body", etaMs: 1200 });
    expect(parseServerProgress({ stage: "nope", etaMs: 1 })).toBeNull();
    expect(parseServerProgress({ stage: "body", etaMs: -1 })).toBeNull();
    expect(parseServerProgress(null)).toBeNull();
  });
});
