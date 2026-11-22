import { fairUseKind, fairUseLimitCopy, scanPackOffers } from "./fair-use-limit";

describe("fair-use limit copy", () => {
  it("reads a daily cap as a limit and keeps the server sentence", () => {
    const copy = fairUseLimitCopy({
      limit: "daily",
      message: "You've reached today's limit. It resets at midnight Central.",
    });
    expect(copy.title).toBe("Daily limit reached");
    expect(copy.detail).toBe("You've reached today's limit. It resets at midnight Central.");
  });

  it("reads a monthly cap from the server limit even when the sentence is rewritten", () => {
    const copy = fairUseLimitCopy({
      limit: "monthly",
      message: "You've reached this month's limit. It resets at the start of next month, at midnight Eastern.",
    });
    expect(copy.title).toBe("Monthly limit reached");
    expect(copy.detail).toMatch(/midnight Eastern/);
  });

  it("treats the older monthly sentence as a monthly limit", () => {
    expect(fairUseKind("You've used this month's analyses. The cap resets at the start of next month.", null)).toBe("monthly");
    expect(fairUseKind("You've used today's analyses. The cap resets tomorrow.", null)).toBe("daily");
  });

  it("has a Central fallback when the server sends no sentence", () => {
    expect(fairUseLimitCopy({ limit: "daily", message: "" }).detail).toMatch(/midnight Central/);
    expect(fairUseLimitCopy({ limit: "monthly" }).title).toBe("Monthly limit reached");
  });
});

describe("scan pack offers", () => {
  it("uses the live price and drops a pack that did not load", () => {
    const offers = scanPackOffers([
      { identifier: "deerage_scans_30", priceString: "$7.99" },
      { identifier: "deerage_scans_10", priceString: "  " },
      { identifier: "something_else", priceString: "$1.00" },
    ]);
    expect(offers.map((offer) => offer.id)).toEqual(["deerage_scans_30"]);
    expect(offers[0]?.priceLabel).toBe("$7.99");
    expect(offers[0]?.scans).toBe(30);
  });

  it("shows nothing when the store returns no packs", () => {
    expect(scanPackOffers([])).toEqual([]);
  });
});
