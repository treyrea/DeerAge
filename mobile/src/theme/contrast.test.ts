import {
  BLIND_BG,
  BUTTON_BROWN,
  BUTTON_GREEN,
  CARD,
  CREAM,
  GOLD,
  GOLD_DEEP,
  INK,
  OFFLINE_BAR,
  OLIVE,
  PAGE,
  SECONDARY,
  contrastRatio,
  meetsAa,
  parseHex,
  relativeLuminance,
} from "./contrast";

describe("contrast", () => {
  it("parses hex and rejects anything else", () => {
    expect(parseHex("#2B3420")).toEqual({ r: 43, g: 52, b: 32 });
    expect(parseHex("2b3420")).toEqual({ r: 43, g: 52, b: 32 });
    expect(parseHex("#fff")).toBeNull();
    expect(parseHex("green")).toBeNull();
  });

  it("measures black on white as 21:1", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });

  it("rejects a bad color instead of inventing a ratio", () => {
    expect(() => contrastRatio("#12", PAGE)).toThrow(/6-digit hex/);
  });

  it("keeps the old brown and the bright fills under AA, and the replacements over it", () => {
    expect(meetsAa("#8B7355", CARD)).toBe(false);
    expect(meetsAa("#8B7355", PAGE)).toBe(false);
    expect(meetsAa("#FFFFFF", "#22C55E")).toBe(false);
    expect(meetsAa("#FFFFFF", "#F59E0B")).toBe(false);
    expect(meetsAa("#FFFFFF", "#16A34A")).toBe(false);

    expect(meetsAa(SECONDARY, PAGE)).toBe(true);
    expect(meetsAa(SECONDARY, CARD)).toBe(true);
    expect(meetsAa(SECONDARY, BLIND_BG)).toBe(true);
    expect(meetsAa(SECONDARY, OFFLINE_BAR)).toBe(true);
    expect(meetsAa(CREAM, OLIVE)).toBe(true);
    expect(meetsAa(CREAM, BUTTON_GREEN)).toBe(true);
    expect(meetsAa(CREAM, BUTTON_BROWN)).toBe(true);
    expect(meetsAa(CREAM, "#7F1D1D")).toBe(true);
    expect(meetsAa(CREAM, "#9A3412")).toBe(true);
    expect(meetsAa(CREAM, "#404040")).toBe(true);
    expect(meetsAa(CREAM, "#1E3A8A")).toBe(true);
    expect(meetsAa("#FFFFFF", "#1E3A8A")).toBe(true);
    expect(meetsAa(CREAM, OFFLINE_BAR)).toBe(true);
    expect(meetsAa(INK, GOLD)).toBe(true);
    expect(meetsAa(INK, GOLD_DEEP)).toBe(true);
    expect(contrastRatio(SECONDARY, CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(INK, GOLD)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(CREAM, BUTTON_GREEN)).toBeGreaterThanOrEqual(4.5);
  });
});
