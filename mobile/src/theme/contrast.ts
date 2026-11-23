/**
 * WCAG contrast for the field palette.
 * Secondary text is a lighter tan. Button fills are dark enough that the label clears 4.5:1.
 */

export const PAGE = "#2B3420";
export const CARD = "#3D4A2F";
export const OLIVE = "#5A6447";
export const BLIND_BG = "#121410";
export const INK = "#1A1814";
export const CREAM = "#F5F5DC";
/** Secondary text and icons on the page, cards, and the blind background. */
export const SECONDARY = "#C9B48F";
export const GOLD = "#D4AF37";
export const GOLD_DEEP = "#C4A15A";
/** Hunter green fill. Cream text clears 4.5:1. */
export const BUTTON_GREEN = "#14532D";
/** Brown fill. Cream text clears 4.5:1. */
export const BUTTON_BROWN = "#6B5640";
export const BUTTON_BROWN_DEEP = "#4A3C2E";
/** Quiet offline bar. Darker than the page, still hunter green. */
export const OFFLINE_BAR = "#24301C";

const AA_TEXT = 4.5;

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`Expected a 6-digit hex color, got ${hex}`);
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Contrast ratio from 1 to 21. Order does not matter. */
export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsAa(foreground: string, background: string, minimum = AA_TEXT): boolean {
  return contrastRatio(foreground, background) >= minimum;
}
