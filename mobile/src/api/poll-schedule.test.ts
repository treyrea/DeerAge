import { MAX_STATUS_POLLS, POLL_DEADLINE_MS, statusPollContinues, statusPollDelayMs } from "./poll-schedule";

describe("status poll budget", () => {
  it("backs off and hard-stops inside the scan deadline", () => {
    let elapsed = 0;
    let attempt = 0;
    const delays: number[] = [];
    while (attempt < 10_000 && statusPollContinues(attempt, elapsed)) {
      const delay = statusPollDelayMs(attempt);
      delays.push(delay);
      elapsed += delay;
      attempt += 1;
    }
    expect(attempt).toBeLessThanOrEqual(MAX_STATUS_POLLS);
    expect(attempt).toBeGreaterThan(20);
    expect(attempt).toBeLessThan(200);
    expect(elapsed).toBeGreaterThanOrEqual(POLL_DEADLINE_MS);
    expect(delays[0]).toBe(1500);
    expect(delays[delays.length - 1]).toBeGreaterThan(delays[0]);
  });
});
