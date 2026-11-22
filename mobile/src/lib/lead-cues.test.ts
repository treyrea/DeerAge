import { leadCueLines, leadOverlays } from "./lead-cues";

describe("lead cues", () => {
  it("returns no overlays when the payload has none", () => {
    expect(leadOverlays(undefined)).toEqual([]);
    expect(leadOverlays(null)).toEqual([]);
    expect(leadOverlays([])).toEqual([]);
  });

  it("keeps the first three overlays and does not add any", () => {
    const overlays = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(leadOverlays(overlays).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a short text list and drops blanks", () => {
    expect(leadCueLines([
      { area: "Neck", text: "thick" },
      { area: " ", text: "missing" },
      { area: "Chest", text: "" },
      { area: "Belly", text: "sagging" },
      { area: "Legs", text: "long" },
      { area: "Back", text: "straight" },
    ])).toEqual([
      { area: "Neck", text: "thick" },
      { area: "Belly", text: "sagging" },
      { area: "Legs", text: "long" },
    ]);
  });

  it("returns no text cues when the read did not send any", () => {
    expect(leadCueLines([])).toEqual([]);
    expect(leadCueLines(undefined)).toEqual([]);
  });
});
