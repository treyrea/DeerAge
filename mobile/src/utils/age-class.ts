/**
 * Hunter-facing age is always a class. A single year is only an internal midpoint.
 */

const EN_DASH = "–";

export function formatAgeClass(value: string | number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return classFromMidpoint(value);
  }
  const text = String(value ?? "").trim();
  if (!text) return "Age class unavailable";
  const range = text.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
  if (range) return `${range[1]}${EN_DASH}${range[2]}`;
  if (/5\.5\s*\+/.test(text)) return "5.5+";
  const single = text.match(/(\d+(?:\.\d+)?)/);
  if (single) return classFromMidpoint(Number(single[1]));
  return text;
}

function classFromMidpoint(years: number): string {
  if (years < 2.5) return `1.5${EN_DASH}2.5`;
  if (years < 3.5) return `2.5${EN_DASH}3.5`;
  if (years < 4.5) return `3.5${EN_DASH}4.5`;
  if (years < 5.5) return `4.5${EN_DASH}5.5`;
  return "5.5+";
}

export function ageCallFromClass(value: string | number | null | undefined): "Young" | "Middle-aged" | "Mature" {
  const label = formatAgeClass(value);
  if (label.startsWith("5.5") || label.startsWith("4.5")) return "Mature";
  if (label.startsWith("3.5")) return "Middle-aged";
  return "Young";
}
