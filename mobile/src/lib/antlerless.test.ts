import {
  BUTTON_BUCK_NOTE,
  CANT_TELL_AGE,
  CANT_TELL_REASON,
  FAWN_AGE,
  PROBABLY_DOE,
  YOUNG_BUCK,
  YOUNG_BUCK_REASON,
  antlerlessFromJobError,
  antlerlessHistoryResult,
  antlerlessListLine,
  antlerlessView,
} from "./antlerless";

describe("antlerless copy", () => {
  it("shows a fawn doe, an unknown doe age, and a possible young buck", () => {
    const fawn = antlerlessView("probably_doe", "fawn");
    expect(fawn).toEqual({
      sex: "probably_doe",
      age: "fawn",
      headline: PROBABLY_DOE,
      ageLine: FAWN_AGE,
      reason: null,
      note: BUTTON_BUCK_NOTE,
    });
    expect(PROBABLY_DOE).toBe("Probably a doe");
    expect(FAWN_AGE).toBe("Fawn");
    expect(BUTTON_BUCK_NOTE).toBe("Check the top of the head for small bumps. A button buck looks a lot like a doe fawn.");

    const unknown = antlerlessView("probably_doe", "cant_tell");
    expect(unknown?.headline).toBe("Probably a doe");
    expect(unknown?.ageLine).toBe(CANT_TELL_AGE);
    expect(CANT_TELL_AGE).toBe("Can't tell the age from this photo");
    expect(unknown?.reason).toBe(CANT_TELL_REASON);
    expect(CANT_TELL_REASON).toBe("Adult doe ages can't be read reliably from one photo yet.");
    expect(unknown?.note).toBe(BUTTON_BUCK_NOTE);

    const buck = antlerlessView("buck_possible", null);
    expect(buck).toEqual({
      sex: "buck_possible",
      age: null,
      headline: YOUNG_BUCK,
      ageLine: null,
      reason: YOUNG_BUCK_REASON,
      note: null,
    });
    expect(YOUNG_BUCK).toBe("Could be a young buck");
    expect(YOUNG_BUCK_REASON).toBe("Head bumps or a thick neck seen. Try a closer photo of the top of the head.");
  });

  it("never says this is a doe, and never names an adult age", () => {
    for (const read of [antlerlessView("probably_doe", "fawn"), antlerlessView("probably_doe", "cant_tell"), antlerlessView("buck_possible", null)]) {
      const text = JSON.stringify(read);
      expect(text.includes("This is a doe")).toBe(false);
      expect(text.toLowerCase().includes("adult doe") ? read?.reason : "").toBe(read?.sex === "probably_doe" && read.age === "cant_tell" ? CANT_TELL_REASON : "");
      expect(read?.age === "fawn" || read?.age === "cant_tell" || read?.age === null).toBe(true);
    }
  });

  it("keeps today's no-antlers stop when the new fields are missing or unclear", () => {
    expect(antlerlessFromJobError(null)).toBeNull();
    expect(antlerlessFromJobError({ kind: undefined })).toBeNull();
    expect(antlerlessFromJobError({ code: "no_antlers" } as { kind?: string })).toBeNull();
    expect(antlerlessFromJobError({ kind: "antlerless", sex: "unclear", age: null })).toBeNull();
    expect(antlerlessFromJobError({ kind: "antlerless", sex: "probably_doe", age: "adult" })).toBeNull();
    expect(antlerlessFromJobError({ kind: "antlerless", sex: "probably_doe", age: "fawn" })?.headline).toBe("Probably a doe");
  });

  it("saves a history row that is not a rack score", () => {
    const read = antlerlessView("probably_doe", "fawn");
    const saved = antlerlessHistoryResult({ imageUri: "file://doe.jpg", read: read!, mode: "age" });
    expect(saved.antlerless?.headline).toBe("Probably a doe");
    expect(saved.score).toBeUndefined();
    expect(saved.explainableAge).toBeUndefined();
    expect(antlerlessListLine(read!)).toBe("Probably a doe · Fawn");
    expect(antlerlessListLine(antlerlessView("probably_doe", "cant_tell")!)).toBe("Probably a doe");
    expect(antlerlessListLine(antlerlessView("buck_possible", null)!)).toBe("Could be a young buck");
  });
});
