import { containedRect, overlaysFrom } from "./body-overlays";

describe("overlaysFrom", () => {
  it("keeps the server's percent boxes and labels", () => {
    const overlays = overlaysFrom([
      { featureId: "chest", name: "Chest & brisket", boundingBox: { x: 35, y: 35, width: 20, height: 27 }, label: "Chest & brisket: deep and heavy", confidence: 0 },
    ]);
    expect(overlays).toEqual([
      { featureId: "chest", name: "Chest & brisket", boundingBox: { x: 35, y: 35, width: 20, height: 27 }, label: "Chest & brisket: deep and heavy", confidence: 0 },
    ]);
  });

  it("is empty for an old server that sends nothing", () => {
    expect(overlaysFrom(undefined)).toEqual([]);
    expect(overlaysFrom("x")).toEqual([]);
  });

  it("drops malformed, tiny and duplicate boxes and clamps to the photo", () => {
    const overlays = overlaysFrom([
      { featureId: "neck", boundingBox: { x: 90, y: 10, width: 30, height: 20 } },
      { featureId: "neck", boundingBox: { x: 10, y: 10, width: 10, height: 10 } },
      { featureId: "belly", boundingBox: { x: 10, y: 10, width: 0.5, height: 10 } },
      { featureId: "legs", boundingBox: { x: "a", y: 1, width: 5, height: 5 } },
      { boundingBox: { x: 1, y: 1, width: 5, height: 5 } },
      null,
    ]);
    expect(overlays).toHaveLength(1);
    expect(overlays[0].boundingBox).toEqual({ x: 90, y: 10, width: 10, height: 20 });
    expect(overlays[0].label).toBe("neck");
  });
});

describe("containedRect", () => {
  it("letterboxes a wide photo top and bottom", () => {
    expect(containedRect(400, 300, 1600, 900)).toEqual({ left: 0, top: 37.5, width: 400, height: 225 });
  });

  it("pillarboxes a tall photo left and right", () => {
    expect(containedRect(400, 300, 900, 1600)).toEqual({ left: 115.625, top: 0, width: 168.75, height: 300 });
  });

  it("falls back to the whole view before the photo size is known", () => {
    expect(containedRect(400, 300, 0, 0)).toEqual({ left: 0, top: 0, width: 400, height: 300 });
  });
});
