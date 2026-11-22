import { resultTimeBadge } from "./result-time-badge";
import { FALLBACK_ETA_MS } from "./scan-progress";

describe("result time badge", () => {
  it("uses the configured Quick Check and age fallback medians", () => {
    expect(FALLBACK_ETA_MS.quick).toBe(6_000);
    expect(FALLBACK_ETA_MS.age).toBe(25_000);
    expect(resultTimeBadge("quick")).toBe("~6 sec result");
    expect(resultTimeBadge("age")).toBe("~25 sec result");
  });
});
