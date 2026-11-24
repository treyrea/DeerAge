import { shouldAdvanceToResult } from "./result-navigation";

describe("shouldAdvanceToResult", () => {
  it("opens the result only after a finished scan that produced one", () => {
    expect(shouldAdvanceToResult({ isProcessing: false, hasResult: true, hasError: false })).toBe(true);
  });

  it("stays on a need-a-better-look stop even when an older result is still in memory", () => {
    expect(shouldAdvanceToResult({ isProcessing: false, hasResult: true, hasError: true })).toBe(false);
    expect(shouldAdvanceToResult({ isProcessing: false, hasResult: false, hasError: true })).toBe(false);
  });

  it("does not open a result while the scan is still running", () => {
    expect(shouldAdvanceToResult({ isProcessing: true, hasResult: true, hasError: false })).toBe(false);
    expect(shouldAdvanceToResult({ isProcessing: true, hasResult: false, hasError: false })).toBe(false);
  });
});
