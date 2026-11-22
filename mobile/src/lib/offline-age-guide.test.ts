import {
  scoreGuide,
  hasEnoughTraits,
  collectVotes,
  combineAges,
  fieldCallFor,
  formatAgeRange,
  TRAITS,
} from "./offline-age-guide";
import type { ScoreValue, TraitId } from "./offline-age-guide";

function pick(partial: Partial<Record<TraitId, ScoreValue>>) {
  return partial;
}

describe("offline age guide scoring", () => {
  it("does not show an age from the neck or face alone", () => {
    expect(hasEnoughTraits(pick({ neck: 3 }))).toBe(false);
    expect(scoreGuide(pick({ neck: 3 })).ready).toBe(false);
    expect(scoreGuide(pick({ face: 1 })).ready).toBe(false);
    expect(scoreGuide(pick({ neck: 5, face: 1 })).ready).toBe(false);
  });

  it("needs 3 body traits, or the neck plus 2 body traits", () => {
    const twoBody = pick({ belly: 3, build: 3 });
    expect(hasEnoughTraits(twoBody)).toBe(false);
    expect(hasEnoughTraits({ ...twoBody, neck: 3 })).toBe(true);
    expect(hasEnoughTraits({ ...twoBody, chest: 3 })).toBe(true);
    expect(scoreGuide(pick({ neck: 3, belly: 3 })).ready).toBe(false);
  });

  it("does not count skipped legs as a body trait", () => {
    const scores = pick({ neck: 3, belly: 3, legs: "skip" });
    expect(hasEnoughTraits(scores)).toBe(false);
    expect(scoreGuide(scores).bodyCount).toBe(1);
    expect(scoreGuide(scores).scoredCount).toBe(3);
  });

  it("shows a single age class when the cues agree", () => {
    const result = scoreGuide(pick({ belly: 3, chest: 3, build: 3 }));
    expect(result.ready).toBe(true);
    expect(result.ageLabel).toBe("3.5");
    expect(result.cuesAgree).toBe(true);
    expect(result.statusLine).toBe("3 of 7 scored, cues agree");
    expect(result.fieldCall).toBe("LET WALK"); // default minimum 4.5
  });

  it("returns a range when scored cues disagree, instead of averaging them", () => {
    const result = scoreGuide(pick({ belly: 1, chest: 3, build: 3 }));
    expect(result.ageLabel).toBe("1.5–3.5");
    expect(result.cuesAgree).toBe(false);
    expect(result.statusLine).toBe("3 of 7 scored, cues disagree");
    // Must not be a mean (~2.5).
    expect(result.ageLabel).not.toBe("2.5");
  });

  it("uses the lease minimum: a 3.5 is LET WALK when the minimum is 4.5", () => {
    const scores = pick({ belly: 3, chest: 3, build: 3, legs: 3 });
    expect(scoreGuide(scores, 4.5).fieldCall).toBe("LET WALK");
    expect(scoreGuide(scores, 3.5).fieldCall).toBe("SHOOTER");
  });

  it("calls SHOOTER only when the lower age meets the minimum", () => {
    const mature = pick({ belly: 4, chest: 4, build: 4 });
    expect(scoreGuide(mature, 4.5).fieldCall).toBe("SHOOTER");
    expect(scoreGuide(mature, 5.5).fieldCall).toBe("LET WALK");
  });

  it("calls BORDERLINE when a range straddles the lease minimum", () => {
    const result = scoreGuide(pick({ belly: 3, chest: 4, build: 4 }), 4.5);
    expect(result.ageLabel).toBe("3.5–4.5");
    expect(result.fieldCall).toBe("BORDERLINE");
  });

  it("lets a baby face vote 1.5, and ignores any other face choice", () => {
    const withBaby = scoreGuide(pick({ belly: 3, chest: 3, build: 3, face: 1 }));
    expect(withBaby.votes).toContain(1.5);
    expect(withBaby.ageLabel).toBe("1.5–3.5");

    const without = scoreGuide(pick({ belly: 3, chest: 3, build: 3, face: 2 }));
    expect(without.votes).toEqual([3.5, 3.5, 3.5]);
    expect(without.ageLabel).toBe("3.5");
    expect(without.scoredCount).toBe(4);
  });

  it("does not let a level back raise a young deer toward 4.5", () => {
    const result = scoreGuide(pick({ belly: 1, build: 1, legs: 1, backline: 1 }));
    expect(result.ageLabel).toBe("1.5");
    expect(result.cuesAgree).toBe(true);
  });

  it("widens the range when a level back conflicts with a 5.5+ cue", () => {
    const result = scoreGuide(pick({ belly: 5, chest: 5, backline: 1 }));
    expect(result.ageLabel).toBe("4.5–5.5+");
    expect(result.cuesAgree).toBe(false);
  });

  it("treats a slight dip as 5.5+ and a deeply swayed back as 6.5+", () => {
    expect(scoreGuide(pick({ backline: 2, belly: 5, chest: 5 })).ageLabel).toBe("5.5+");
    expect(scoreGuide(pick({ backline: 3, belly: 5, chest: 5 })).ageLabel).toBe("5.5–6.5+");
    expect(scoreGuide(pick({ backline: 3, belly: 5, build: 5, chest: 5 })).low).toBe(5.5);
    const old = scoreGuide(pick({ backline: 3, belly: 5, build: 5, chest: 5 }));
    // Deeply swayed pulls the high to 6.5+; belly/chest/build vote 5.5.
    expect(old.high).toBe(6.5);
    expect(old.ageLabel).toBe("5.5–6.5+");
  });

  it("maps each body trait's steps to a single age class", () => {
    const expected: Record<string, (number | undefined)[]> = {
      neck: [1.5, 2.5, 3.5, 4.5, 5.5],
      chest: [1.5, 2.5, 3.5, 4.5, 5.5],
      belly: [1.5, 2.5, 3.5, 4.5, 5.5],
      legs: [1.5, 2.5, 3.5, 4.5, 5.5],
      build: [1.5, 2.5, 3.5, 4.5, 5.5],
    };
    for (const [id, ages] of Object.entries(expected)) {
      const trait = TRAITS.find((row) => row.id === id)!;
      const voted = trait.scores.filter((row) => row.value !== "skip").map((row) => row.age);
      expect(voted).toEqual(ages);
    }
    const back = TRAITS.find((row) => row.id === "backline")!;
    expect(back.scores[0].cap).toBe(4.5);
    expect(back.scores[0].age).toBeUndefined();
    expect(back.scores[1].age).toBe(5.5);
    expect(back.scores[2].age).toBe(6.5);
  });

  it("has a skip choice on legs and only a baby-face vote on face", () => {
    const legs = TRAITS.find((row) => row.id === "legs")!;
    expect(legs.scores.some((row) => row.value === "skip")).toBe(true);
    const face = TRAITS.find((row) => row.id === "face")!;
    expect(face.scores.filter((row) => row.age != null)).toEqual([
      expect.objectContaining({ label: "Baby face", age: 1.5 }),
    ]);
    expect(face.scores.some((row) => /battle scarred/i.test(row.label))).toBe(false);
  });

  it("renames muscle to Overall build and uses the engine's body words", () => {
    const build = TRAITS.find((row) => row.id === "build")!;
    expect(build.name).toBe("Overall build");
    const labels = build.scores.map((row) => row.label);
    expect(labels).toEqual([
      "Doe-like, sleek",
      "Lean",
      "Athletic racehorse",
      "Full-bodied",
      "Rounded, “small cow”",
    ]);
  });

  it("never invents a percent confidence", () => {
    const result = scoreGuide(pick({ belly: 3, chest: 3, build: 3 }));
    expect(result).not.toHaveProperty("confidence");
    expect(JSON.stringify(result)).not.toMatch(/% conf|confidence/i);
  });

  it("formats 5.5 and 6.5 with a plus, and ranges with an en dash", () => {
    expect(formatAgeRange(5.5, 5.5)).toBe("5.5+");
    expect(formatAgeRange(6.5, 6.5)).toBe("6.5+");
    expect(formatAgeRange(3.5, 4.5)).toBe("3.5–4.5");
    expect(formatAgeRange(5.5, 6.5)).toBe("5.5–6.5+");
  });

  it("keeps combineAges from raising a low vote when a cap is higher", () => {
    expect(combineAges([1.5, 1.5], 4.5)).toEqual({ low: 1.5, high: 1.5 });
    expect(collectVotes(pick({ backline: 1, belly: 1 })).cap).toBe(4.5);
  });

  it("matches the engine's shooter rule in fieldCallFor", () => {
    expect(fieldCallFor(3.5, 3.5, 4.5).fieldCall).toBe("LET WALK");
    expect(fieldCallFor(4.5, 4.5, 4.5).fieldCall).toBe("SHOOTER");
    expect(fieldCallFor(3.5, 4.5, 4.5).fieldCall).toBe("BORDERLINE");
    expect(fieldCallFor(5.5, 6.5, 4.5).fieldCall).toBe("SHOOTER");
  });
});
