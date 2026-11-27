import {
  MULTI_PHOTO_LINE,
  ONE_ANGLE_LINE,
  SCORE_ESTIMATE_BLOCKS,
  SCORE_PRO_TIP_STEADY,
  SCORE_PRO_TIP_WHY,
  SHARE_ESTIMATE_LINE,
  bcMinimumStatus,
  bcMinimumSummary,
  qualificationHeading,
  qualificationNote,
  qualificationSummary,
  scoreEstimateLine,
  shareMinimumLabel,
  viewpointCount,
  withoutScoreRange,
} from "./score-estimate";

describe("score estimate line", () => {
  it("uses the one-angle line until a scan records more than one photo", () => {
    expect(viewpointCount()).toBe(1);
    expect(viewpointCount(null)).toBe(1);
    expect(viewpointCount(0)).toBe(1);
    expect(viewpointCount(1)).toBe(1);
    expect(viewpointCount(Number.NaN)).toBe(1);
    expect(scoreEstimateLine()).toBe(ONE_ANGLE_LINE);
    expect(scoreEstimateLine(1)).toBe("From one angle — a rough estimate, not a tape score.");
  });

  it("switches copy when more than one distinct photo was uploaded", () => {
    expect(viewpointCount(2)).toBe(2);
    expect(viewpointCount(2.8)).toBe(2);
    expect(scoreEstimateLine(2)).toBe(MULTI_PHOTO_LINE);
    expect(scoreEstimateLine(3)).toBe("From these photos — still an estimate, not a tape score.");
  });
});

describe("score estimate sheet", () => {
  it("keeps the three blocks", () => {
    expect(SCORE_ESTIMATE_BLOCKS.map((block) => block.title)).toEqual([
      "How it works",
      "What it is not",
      "A better photo",
    ]);
    expect(SCORE_ESTIMATE_BLOCKS[0].body).toBe(
      "DeerAge estimates Boone & Crockett inches from the photo you gave it: the spread, beams, tines, and mass that are visible.",
    );
    expect(SCORE_ESTIMATE_BLOCKS[1].body).toBe(
      "It is not an official B&C score. Official scores are taped on both sides of the rack by a certified measurer.",
    );
    expect(SCORE_ESTIMATE_BLOCKS[2].body).toBe(
      "One angle hides the far side and flattens depth, so a single photo can be a long way off. Photos from different sides of the rack give a better estimate. A tape is still the official number.",
    );
  });
});

describe("score claim copy", () => {
  it("marks a shared minimum as an estimate", () => {
    expect(shareMinimumLabel("Typical")).toBe('Est. above B&C minimum (160")');
    expect(shareMinimumLabel("Non-Typical")).toBe('Est. above B&C minimum (185")');
    expect(SHARE_ESTIMATE_LINE).toBe("Estimate from a photo, not an official B&C score.");
    expect(shareMinimumLabel("Typical")).not.toMatch(/meets b&c minimum/i);
  });

  it("softens a score that clears the published minimum", () => {
    const note = qualificationNote({
      qualifies: true,
      netScore: 168.4,
      minimumThreshold: 160,
      category: "Typical",
    });
    expect(note).toBe(
      'This estimate is above the Boone & Crockett minimum of 160" for Typical scoring. Have it taped by a certified measurer to know for sure.',
    );
    expect(note).not.toMatch(/trophy-class|this rack meets/i);
    expect(qualificationHeading(true, "Typical")).toBe("Est. above B&C Typical minimum");
    expect(qualificationSummary(true, "Non-Typical")).toBe("Est. above B&C Non-Typical minimum");
  });

  it("calls a short score an estimate too", () => {
    expect(qualificationNote({
      qualifies: false,
      netScore: 142.2,
      minimumThreshold: 160,
      category: "Typical",
    })).toBe('This estimate is 142.2", which is below the B&C minimum of 160" for Typical bucks.');
    expect(qualificationHeading(false, "Typical")).toBe("Typical (Below B&C Minimum)");
    expect(qualificationSummary(false, "Typical")).toBe("Typical • Below B&C minimum");
  });

  it("does not call a checklist row qualified", () => {
    expect(bcMinimumSummary(null, true, false)).toBe("Est. above typical minimum");
    expect(bcMinimumSummary(null, false, true)).toBe("Est. above non-typical minimum");
    expect(bcMinimumSummary(null, false, false)).toBe("Below minimum");
    expect(bcMinimumSummary(190, false, false)).toBe("Est. above non-typical minimum (Adjusted)");
    expect(bcMinimumSummary(170, false, false)).toBe("Est. above typical minimum (Adjusted)");
    expect(bcMinimumSummary(140, false, false)).toBe("Below minimum (Adjusted)");
    expect(bcMinimumStatus(true)).toBe("Est. above");
    expect(bcMinimumStatus(false)).toBe("Not Met");
    expect(bcMinimumStatus(false, "Not Qualified")).toBe("Not Qualified");
    expect(bcMinimumStatus(true)).not.toMatch(/qualified/i);
  });
});

describe("score camera tip", () => {
  it("does not claim the burst sees extra angles", () => {
    const copy = `${SCORE_PRO_TIP_STEADY} ${SCORE_PRO_TIP_WHY}`;
    expect(SCORE_PRO_TIP_STEADY).toBe("Hold steady for the 2-second burst so the frames stay sharp.");
    expect(copy).not.toMatch(/parallax|3d|different angles|movement helps/i);
  });
});

describe("server score range", () => {
  it("drops the ±6% formula band and keeps the gross", () => {
    const gross = 150;
    const shown = withoutScoreRange({
      grossScore: gross,
      insideSpread: 16,
      scoreRange: {
        low: Math.round(gross * 0.94),
        high: Math.round(gross * 1.06),
      },
    });
    expect(shown).toEqual({ grossScore: 150, insideSpread: 16 });
    expect(shown).not.toHaveProperty("scoreRange");
    expect(JSON.stringify(shown)).not.toMatch(/141|159/);
  });

  it("leaves a payload alone when the band is already absent", () => {
    const payload = { grossScore: 120 };
    expect(withoutScoreRange(payload)).toBe(payload);
  });
});
