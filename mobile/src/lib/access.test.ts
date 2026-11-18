import { allowanceLine, isLegacyProduct, planLabelFor } from "./products";
import { canStartScan, purchaseNotice } from "./access";
import { compareVersions } from "./version";

describe("purchase", () => {
  it("stays quiet when the hunter cancels", () => {
    expect(purchaseNotice("User cancelled the purchase")).toBeNull();
  });

  it("tells the hunter a failed purchase was not charged", () => {
    expect(purchaseNotice("StoreKit error")).toMatch(/not been charged/);
  });
});

describe("credits and access", () => {
  it("lets a subscriber scan without a credit or a free scan", () => {
    expect(canStartScan({ entitled: true, scanCredits: 0, lifetimeAnalysesUsed: 3 })).toBe(true);
  });

  it("spends a credit before the free scans are gone", () => {
    expect(canStartScan({ entitled: false, scanCredits: 2, lifetimeAnalysesUsed: 3 })).toBe(true);
  });

  it("blocks a hunter with no credit and no free scans", () => {
    expect(canStartScan({ entitled: false, scanCredits: 0, lifetimeAnalysesUsed: 3 })).toBe(false);
  });

  it("keeps legacy product ids and season_annual as access", () => {
    expect(isLegacyProduct("scout_monthly")).toBe(true);
    expect(isLegacyProduct("deerage_season")).toBe(false);
    expect(planLabelFor(["deerage_pro"], "season_annual")).toBe("Season Pass");
    expect(planLabelFor(["scout"], "scout_monthly")).toBe("Scout");
    expect(allowanceLine(2, 10)).toBe("2 of 3 free analyses left · 10 scans left");
  });
});

describe("version compare", () => {
  it("treats 1.0.9 as newer than 1.0.8 and equal to itself", () => {
    expect(compareVersions("1.0.8", "1.0.9")).toBeLessThan(0);
    expect(compareVersions("1.0.9", "1.0.9")).toBe(0);
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
  });
});
