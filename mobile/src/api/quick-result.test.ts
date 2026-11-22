import { AnalysisError } from "./errors";
import { quickAgeOrNull, quickConfidence, quickKeyFeature, requireQuickAge } from "./quick-result";

describe("quick check result", () => {
  it("keeps a real age and never stands in the lease minimum", () => {
    expect(requireQuickAge(3.5)).toBe(3.5);
    expect(requireQuickAge("5.5")).toBe(5.5);
    for (const missing of [null, undefined, "", 0, -1, "abc", Number.NaN]) {
      expect(quickAgeOrNull(missing)).toBeNull();
      expect(() => requireQuickAge(missing)).toThrow(AnalysisError);
    }
    try {
      requireQuickAge(null);
    } catch (error) {
      expect((error as AnalysisError).code).toBe("upstream");
      expect((error as AnalysisError).message).toBe("Analysis failed. Try again in a moment.");
    }
  });

  it("does not make up a confidence or a key feature", () => {
    expect(quickConfidence(undefined)).toBe(0);
    expect(quickConfidence(null)).toBe(0);
    expect(quickConfidence(72.4)).toBe(72);
    expect(quickConfidence(140)).toBe(100);
    expect(quickKeyFeature(undefined)).toBeUndefined();
    expect(quickKeyFeature("neck_brisket")).toBe("neck_brisket");
    expect(quickKeyFeature("anything")).toBeUndefined();
  });
});
