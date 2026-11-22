import { bodyRead, formatMinimum, verdictKind, verdictWord } from "./blind-verdict";

const cue = "Age it up toward 4.5 if the chest looks deep and heavy with the belly nearly matching the chest line, or down toward 3.5 if the upward flank tuck and trimmer waist stand out more clearly.";

describe("blind verdict", () => {
  it("lets a straddling range walk and takes a clear pass", () => {
    expect(verdictKind({ fieldCall: "BORDERLINE", minimum: 4.5 })).toBe("walk");
    expect(verdictKind({ fieldCall: "LET WALK", minimum: 4.5 })).toBe("walk");
    expect(verdictKind({ fieldCall: "SHOOTER", minimum: 4.5 })).toBe("take");
    expect(verdictWord("walk")).toBe("LET HIM WALK");
    expect(verdictWord("take", { take: "SHOOT" })).toBe("SHOOT");
    expect(verdictWord("take", { take: "  " })).toBe("TAKE HIM");
  });

  it("asks for a better look on a poor photo and skips the command when no minimum is set", () => {
    expect(verdictKind({ fieldCall: "SHOOTER", minimum: 4.5, imageQuality: "poor" })).toBe("look");
    expect(verdictKind({ fieldCall: "SHOOTER", minimum: 0 })).toBe("age");
    expect(verdictKind({ fieldCall: "SHOOTER", minimum: 4.5, shootOrPass: false })).toBe("age");
    expect(formatMinimum(4.5)).toBe("4.5");
    expect(formatMinimum(6.5)).toBe("6.5+");
  });

  it("shows the look-for line once and drops a cut-off copy", () => {
    const read = bodyRead({
      hunterCue: cue,
      cueBullets: [
        { area: "Body", text: cue.slice(0, 90) },
        { area: "Cue", text: cue.slice(0, 90) },
        { area: "Chest", text: "The chest is deep and the belly is close." },
        { area: "Chest", text: "The chest is deep and the belly is close." },
      ],
      detectedCues: [
        { displayName: cue, detectedPattern: cue, explanation: cue },
      ],
    });
    expect(read.lookFor).toBe(cue);
    expect(read.clues).toEqual(["Chest: The chest is deep and the belly is close."]);
  });

  it("trusts a server reasons array and does not fall back to older copies", () => {
    const read = bodyRead({
      lookFor: cue,
      reasons: ["The chest is deep and the belly is close.", cue],
      cueBullets: [{ area: "Cue", text: cue.slice(0, 90) }],
    });
    expect(read.clues).toEqual(["The chest is deep and the belly is close."]);
    const empty = bodyRead({
      lookFor: cue,
      reasons: [],
      cueBullets: [{ area: "Body", text: "A different sentence that should stay hidden." }],
    });
    expect(empty.clues).toEqual([]);
  });
});