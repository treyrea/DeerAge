import {
  MIN_QUALIFYING_RESULTS,
  REVIEW_MIN_GAP_MS,
  decideReview,
  emptyReviewLedger,
  exclusionReason,
  isQualifyingGoodResult,
  markReviewAsked,
  maybeRequestStoreReview,
  type ReviewLedger,
  type ReviewSubject,
} from "./reviewPrompt";

const VERSION = "1.0.9";
const NEXT = "1.1.0";
const NOW = Date.parse("2026-11-01T12:00:00Z");

function good(overrides: Partial<ReviewSubject> = {}): ReviewSubject {
  return {
    moment: "scan",
    resultId: overrides.resultId,
    fieldCall: "SHOOTER",
    confidence: 80,
    imageQuality: "good",
    isRange: false,
    outcome: null,
    ...overrides,
  };
}

function memoryStore(initial?: ReviewLedger) {
  let ledger = initial ?? null;
  return {
    saved: () => ledger,
    storage: {
      load: async () => ledger,
      save: async (next: ReviewLedger) => {
        ledger = next;
      },
    },
  };
}

describe("isQualifyingGoodResult", () => {
  it("accepts a firm shooter or let-walk call", () => {
    expect(isQualifyingGoodResult(good())).toBe(true);
    expect(isQualifyingGoodResult(good({ fieldCall: "LET WALK", moment: "share" }))).toBe(true);
    expect(isQualifyingGoodResult(good({ confidence: 0 }))).toBe(true);
    expect(isQualifyingGoodResult(good({ confidence: "High" }))).toBe(true);
    expect(isQualifyingGoodResult(good({ confidence: "Med" }))).toBe(true);
  });

  it("rejects borderline, a range, and low confidence", () => {
    expect(isQualifyingGoodResult(good({ fieldCall: "BORDERLINE" }))).toBe(false);
    expect(isQualifyingGoodResult(good({ isRange: true }))).toBe(false);
    expect(isQualifyingGoodResult(good({ confidence: "Low" }))).toBe(false);
    expect(isQualifyingGoodResult(good({ confidence: 49 }))).toBe(false);
    expect(isQualifyingGoodResult(good({ confidence: 50 }))).toBe(true);
    expect(isQualifyingGoodResult(good({ fieldCall: null }))).toBe(false);
  });

  it("rejects errors, pose prompts, does, mounts, and the paywall", () => {
    const excluded: ReviewSubject[] = [
      good({ outcome: "error" }),
      good({ outcome: "timeout" }),
      good({ outcome: "not_deer" }),
      good({ outcome: "Wait for him to stand broadside" }),
      good({ outcome: "Try a photo of the deer standing, not bedded, with the body upright." }),
      good({ outcome: "head-only" }),
      good({ outcome: "no_antlers" }),
      good({ outcome: "This is a doe" }),
      good({ outcome: "wall-mount" }),
      good({ outcome: "dead deer" }),
      good({ outcome: "harvested" }),
      good({ outcome: "paywall" }),
      good({ imageQuality: "poor" }),
    ];
    for (const subject of excluded) {
      expect(isQualifyingGoodResult(subject)).toBe(false);
    }
    expect(exclusionReason(good({ outcome: "head_only" }))).toBe("pose_prompt");
    expect(exclusionReason(good({ outcome: "no antlers" }))).toBe("no_antlers");
    expect(exclusionReason(good({ outcome: "head mount" }))).toBe("dead_or_mount");
    expect(exclusionReason(good({ imageQuality: "poor" }))).toBe("need_a_better_look");
    expect(exclusionReason(good())).toBeNull();
  });
});

describe("decideReview", () => {
  it("counts a qualifying result and waits for the second one", () => {
    const first = decideReview(emptyReviewLedger(), good({ resultId: "a" }), VERSION, NOW);
    expect(first.ask).toBe(false);
    expect(first.reason).toBe("need_another_good_result");
    expect(first.ledger.goodResultCount).toBe(1);

    const again = decideReview(first.ledger, good({ resultId: "a", moment: "share" }), VERSION, NOW);
    expect(again.ask).toBe(false);
    expect(again.ledger.goodResultCount).toBe(1);

    const second = decideReview(again.ledger, good({ resultId: "b", fieldCall: "LET WALK" }), VERSION, NOW);
    expect(second.ask).toBe(true);
    expect(second.reason).toBe("ask");
    expect(second.ledger.goodResultCount).toBe(MIN_QUALIFYING_RESULTS);
    expect(second.ledger.requestedForVersion).toBeNull();
  });

  it("asks at most once per version, including a save of a result already counted", () => {
    const first = decideReview(emptyReviewLedger(), good({ resultId: "a" }), VERSION, NOW);
    const second = decideReview(first.ledger, good({ resultId: "b", moment: "save" }), VERSION, NOW);
    const asked = markReviewAsked(second.ledger, VERSION, NOW);
    const third = decideReview(asked, good({ resultId: "c" }), VERSION, NOW + REVIEW_MIN_GAP_MS);
    expect(third.ask).toBe(false);
    expect(third.reason).toBe("already_asked_this_version");
    expect(third.ledger.goodResultCount).toBe(3);
  });

  it("waits 30 days, then allows the next version", () => {
    const asked = markReviewAsked(
      { ...emptyReviewLedger(), goodResultCount: 2, countedIds: ["a", "b"] },
      VERSION,
      NOW,
    );
    const tooSoon = decideReview(asked, good({ resultId: "c" }), NEXT, NOW + REVIEW_MIN_GAP_MS - 1);
    expect(tooSoon.ask).toBe(false);
    expect(tooSoon.reason).toBe("too_soon");

    const ready = decideReview(asked, good({ resultId: "c" }), NEXT, NOW + REVIEW_MIN_GAP_MS);
    expect(ready.ask).toBe(true);
    expect(ready.ledger.goodResultCount).toBe(3);
  });

  it("does not count excluded results", () => {
    const blocked = decideReview(emptyReviewLedger(), good({ outcome: "paywall", resultId: "a" }), VERSION, NOW);
    expect(blocked.ask).toBe(false);
    expect(blocked.reason).toBe("paywall");
    expect(blocked.ledger.goodResultCount).toBe(0);

    const doe = decideReview(blocked.ledger, good({ outcome: "doe", moment: "share" }), VERSION, NOW);
    expect(doe.ledger.goodResultCount).toBe(0);
    const borderline = decideReview(doe.ledger, good({ fieldCall: "BORDERLINE" }), VERSION, NOW);
    expect(borderline.reason).toBe("borderline");
    expect(borderline.ledger.goodResultCount).toBe(0);
    const low = decideReview(borderline.ledger, good({ confidence: "Low", moment: "save" }), VERSION, NOW);
    expect(low.reason).toBe("low_confidence");
    expect(low.ledger).toEqual(emptyReviewLedger());
  });
});

describe("maybeRequestStoreReview", () => {
  const review = {
    isAvailable: jest.fn(async () => true),
    hasAction: jest.fn(async () => true),
    requestReview: jest.fn(async () => undefined),
  };

  beforeEach(() => {
    review.isAvailable.mockReset().mockResolvedValue(true);
    review.hasAction.mockReset().mockResolvedValue(true);
    review.requestReview.mockReset().mockResolvedValue(undefined);
  });

  it("opens the sheet on the second good result and records the version", async () => {
    const store = memoryStore();
    const options = {
      now: NOW,
      version: VERSION,
      enabled: true,
      alreadyAskedForVersion: null,
      storage: store.storage,
      review,
    };
    await expect(maybeRequestStoreReview(good({ resultId: "a" }), options)).resolves.toBe(false);
    expect(review.requestReview).not.toHaveBeenCalled();
    await expect(maybeRequestStoreReview(good({ resultId: "b" }), options)).resolves.toBe(true);
    expect(review.isAvailable).toHaveBeenCalled();
    expect(review.hasAction).toHaveBeenCalled();
    expect(review.requestReview).toHaveBeenCalledTimes(1);
    expect(store.saved()).toMatchObject({
      goodResultCount: 2,
      requestedForVersion: VERSION,
      lastRequestedAt: NOW,
    });
  });

  it("does not burn the version when the sheet is unavailable", async () => {
    review.hasAction.mockResolvedValue(false);
    const store = memoryStore({ ...emptyReviewLedger(), goodResultCount: 2, countedIds: ["a", "b"] });
    const asked = await maybeRequestStoreReview(good({ resultId: "c" }), {
      now: NOW,
      version: VERSION,
      enabled: true,
      alreadyAskedForVersion: null,
      storage: store.storage,
      review,
    });
    expect(asked).toBe(false);
    expect(review.requestReview).not.toHaveBeenCalled();
    expect(store.saved()?.requestedForVersion).toBeNull();
    expect(store.saved()?.goodResultCount).toBe(3);
  });

  it("counts without asking when the caller is only recording the result", async () => {
    const store = memoryStore({ ...emptyReviewLedger(), goodResultCount: 1, countedIds: ["a"] });
    const asked = await maybeRequestStoreReview(good({ resultId: "b" }), {
      request: false,
      now: NOW,
      version: VERSION,
      enabled: true,
      alreadyAskedForVersion: null,
      storage: store.storage,
      review,
    });
    expect(asked).toBe(false);
    expect(review.requestReview).not.toHaveBeenCalled();
    expect(store.saved()).toMatchObject({ goodResultCount: 2, requestedForVersion: null });
  });
});
