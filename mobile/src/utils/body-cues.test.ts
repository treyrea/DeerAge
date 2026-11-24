import { ageLean, extraBodyNotes, plainExplanation, regionRows, shortCue, stripFiller, withDescribeCues } from "./body-cues";

const DESCRIBE_ONCE = [
  "- **Waist/belly depth vs chest depth:** The chest is slightly deeper than the rear flank, though the midsection is fairly full and only tapers modestly toward the waist.",
  "- **Belly line (tucked, straight, or sagging):** The belly line is tucked slightly but the midsection stays fairly full.",
  "- **Back line:** The back line is level from the withers to the hips.",
  "- **Neck vs shoulder junction, and neck thickness:** The neck meets the shoulder at a visible junction and is not swollen.",
  "- **Shoulders vs hindquarters mass:** Well-balanced overall; both the shoulders and hindquarters appear solid and filled out, with the hindquarters looking slightly fuller from this rear-quartering angle.",
  "- **Leg length vs body depth:** Tall grass hides the lower legs, so full length is not visible, but the exposed upper legs look proportionate to the depth of the torso.",
  "- **Overall build:** Sturdy, compact, and well-filled-out with smooth contours rather than sharp bony angles.",
  "- **Season cues (velvet, rut, vegetation):** Full velvet on the antlers, no extreme rut neck swelling, and green leafy foliage and tall weeds surrounding the deer.",
].join("\n");

describe("stripFiller", () => {
  it("drops the recorded-is-described-as prefix", () => {
    expect(stripFiller("The recorded belly line is described as sagging below the chest")).toBe(
      "sagging below the chest",
    );
  });

  it("drops a bare recorded prefix", () => {
    expect(stripFiller("The recorded neck is thick and blends into the shoulders")).toBe(
      "neck is thick and blends into the shoulders",
    );
  });

  it("drops a leading is-described-as prefix", () => {
    expect(stripFiller("is described as thick, blends into shoulders")).toBe("thick, blends into shoulders");
  });

  it("leaves a sentence that does not start with filler", () => {
    expect(stripFiller("Neck is thick. The recorded mass is described as heavy")).toBe(
      "Neck is thick. The recorded mass is described as heavy",
    );
  });

  it("strips a second filler prefix left behind by the first", () => {
    expect(stripFiller("The recorded belly line is described as The recorded neck is thick")).toBe("neck is thick");
  });
});

describe("shortCue", () => {
  it("drops bold markers and a parenthesis that was cut off", () => {
    expect(shortCue("**Belly line (tucked")).toBe("Belly line");
    expect(plainExplanation("- **Waist/belly depth vs chest depth:** The chest is slightly deeper.")).toBe(
      "Waist/belly depth vs chest depth: The chest is slightly deeper.",
    );
  });

  it("keeps a cue that is already short", () => {
    expect(shortCue("thick, blends into shoulders")).toBe("thick, blends into shoulders");
    expect(shortCue("thick, blends into shoulders").split(" ").length).toBeLessThanOrEqual(8);
  });

  it("keeps at most eight words and does not end on a joining word", () => {
    const cue = shortCue(
      "The recorded belly line is described as sagging well below the chest and nearly level with the back line",
    );
    expect(cue.split(" ").length).toBeLessThanOrEqual(8);
    expect(cue).toBe("sagging well below the chest and nearly level");
  });

  it("uses the full cleaned sentence as the explanation", () => {
    const full =
      "The recorded belly line is described as sagging well below the chest and nearly level with the back line on this buck.";
    expect(plainExplanation(full)).toBe(
      "sagging well below the chest and nearly level with the back line on this buck.",
    );
    expect(shortCue(full).length).toBeLessThan(plainExplanation(full).length);
  });
});

describe("withDescribeCues", () => {
  const box = { x: 10, y: 10, width: 20, height: 20 };
  const named = (featureId: string, name: string, cue: string) => ({
    featureId,
    name,
    label: `${name}: ${cue}`,
    shortCue: cue,
    detail: cue,
    boundingBox: box,
  });

  it("gives each dot its own observation from the screenshot note", () => {
    const repaired = withDescribeCues(
      [
        named("neck", "Neck", "**Neck vs shoulder junction"),
        named("chest", "Chest & brisket", "**Back line"),
        named("belly", "Belly & waist", "**Belly line (tucked"),
        named("back", "Back line", "**Back line"),
        named("legs", "Legs", "**Belly line (tucked"),
        named("face", "Face", "**Belly line (tucked"),
      ],
      DESCRIBE_ONCE,
    );
    const cue = (id: string) => repaired.find((row) => row.featureId === id)?.shortCue ?? "";
    expect(cue("neck")).toMatch(/neck meets the shoulder/);
    expect(cue("chest")).toBe("Well-balanced overall");
    expect(cue("belly")).toMatch(/tucked slightly/);
    expect(cue("back")).toMatch(/back line is level/);
    expect(cue("legs")).toMatch(/Tall grass hides the lower legs/);
    expect(cue("face")).toBe("");
    expect(cue("legs")).not.toBe(cue("belly"));
    for (const row of repaired) {
      expect(row.shortCue ?? "").not.toContain("**");
      expect(row.detail ?? "").not.toContain("**");
    }
    const rows = regionRows(repaired);
    expect(rows.find((row) => row.featureId === "face")?.cue).toBe("");
    expect(
      extraBodyNotes(
        ["Well-balanced overall; both the shoulders and hindquarters appear solid and filled out."],
        repaired,
      ).length,
    ).toBe(1);
  });
});

describe("regionRows", () => {
  const box = { x: 30, y: 20, width: 20, height: 20 };

  it("numbers rows and anchors each dot on the box center", () => {
    const rows = regionRows([
      {
        featureId: "neck",
        name: "Neck",
        label: "Neck: The recorded neck is described as thick, blends into shoulders",
        boundingBox: box,
      },
      {
        featureId: "belly",
        name: "Belly & waist",
        label: "Belly & waist: The recorded belly line is described as sagging below the chest",
        boundingBox: { x: 50, y: 50, width: 25, height: 16 },
      },
    ]);
    expect(rows.map((row) => row.number)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      featureId: "neck",
      name: "Neck",
      cue: "thick, blends into shoulders",
      anchor: { x: 40, y: 30 },
    });
    expect(rows[0].lean).toBeUndefined();
    expect(rows[1].cue).toBe("sagging below the chest");
    expect(rows[1].anchor).toEqual({ x: 62.5, y: 58 });
    expect(rows[1].detail).toBe("sagging below the chest");
  });

  it("prefers a server short cue and keeps the full detail for expand", () => {
    const [row] = regionRows([
      {
        featureId: "chest",
        name: "Chest & brisket",
        label: "Chest & brisket: The recorded chest is described as deep and heavy and still separate from the neck",
        shortCue: "deep and heavy",
        detail: "The recorded chest is described as deep and heavy and still separate from the neck.",
        boundingBox: box,
      },
    ]);
    expect(row.cue).toBe("deep and heavy");
    expect(row.detail).toBe("deep and heavy and still separate from the neck.");
  });

  it("omits the lean when the payload has none", () => {
    const [row] = regionRows([
      { featureId: "back", name: "Back line", label: "Back line", boundingBox: box },
    ]);
    expect(row.lean).toBeUndefined();
    expect(row.cue).toBe("");
    expect("lean" in row).toBe(false);
  });

  it("reads older, younger, and neutral from the payload", () => {
    const rows = regionRows([
      { featureId: "neck", name: "Neck", label: "Neck: thick", boundingBox: box, lean: "older" },
      { featureId: "legs", name: "Legs", label: "Legs: long", boundingBox: box, ageWeight: -2 },
      { featureId: "face", name: "Face", label: "Face: even", boundingBox: box, cue: { ageWeight: 0 } },
      { featureId: "back", name: "Back line", label: "Back line: level", boundingBox: box, direction: "neutral" },
    ]);
    expect(rows.map((row) => row.lean)).toEqual(["older", "younger", "neutral", "neutral"]);
    expect(ageLean({})).toBeUndefined();
  });

  it("hides a note the list already shows, and keeps one the shortened label cut off", () => {
    const box = { x: 10, y: 10, width: 20, height: 20 };
    const overlays = [
      {
        featureId: "chest",
        name: "Chest & brisket",
        label: "Chest & brisket: deep and heavy",
        detail: "The chest is deep and heavy.",
        boundingBox: box,
      },
      {
        featureId: "belly",
        name: "Belly & waist",
        label: "Belly & waist: sagging well below…",
        boundingBox: box,
      },
    ];
    expect(
      extraBodyNotes(
        [
          "The chest is deep and heavy.",
          "The recorded belly line is described as sagging well below the chest and nearly level with the back.",
          "Overall build reads mature.",
        ],
        overlays,
      ),
    ).toEqual([
      "sagging well below the chest and nearly level with the back.",
      "Overall build reads mature.",
    ]);
  });

  it("uses a provided anchor instead of the box center", () => {
    const [row] = regionRows([
      { featureId: "neck", name: "Neck", label: "Neck", boundingBox: box, anchor: { x: 12, y: 80 } },
    ]);
    expect(row.anchor).toEqual({ x: 12, y: 80 });
  });
});
