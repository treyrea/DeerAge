import { AGE_BURST_FRAMES, BURST_INTERVAL_MS, SCORE_BURST_FRAMES, burstFrameCount, burstSpanMs } from "./burst";

describe("burst timing", () => {
  it("uses 4 frames over about 1 second for age scans", () => {
    expect(burstFrameCount("age")).toBe(4);
    expect(AGE_BURST_FRAMES).toBe(4);
    expect(burstSpanMs("age")).toBe(750);
    expect(burstSpanMs("age")).toBe((AGE_BURST_FRAMES - 1) * BURST_INTERVAL_MS);
    expect(burstSpanMs("age")).toBeLessThan(1000);
  });

  it("keeps 8 frames over about 2 seconds for rack/score", () => {
    expect(burstFrameCount("score")).toBe(8);
    expect(SCORE_BURST_FRAMES).toBe(8);
    expect(burstSpanMs("score")).toBe(1750);
    expect(burstSpanMs("score")).toBe((SCORE_BURST_FRAMES - 1) * BURST_INTERVAL_MS);
  });

  it("does not change the frame interval when shortening the age burst", () => {
    expect(BURST_INTERVAL_MS).toBe(250);
  });
});
