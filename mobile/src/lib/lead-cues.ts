/** How many body cues lead the result photo. */
export const LEAD_CUE_CAP = 3;

export interface LeadCueLine {
  area: string;
  text: string;
}

/** The first overlays the payload sent. An empty list stays empty. */
export function leadOverlays<T>(overlays: readonly T[] | null | undefined, cap = LEAD_CUE_CAP): T[] {
  if (!overlays || cap <= 0) return [];
  return overlays.slice(0, cap);
}

/** Text cues that were actually returned. Blank lines are dropped. Nothing is filled in. */
export function leadCueLines(cues: readonly LeadCueLine[] | null | undefined, cap = LEAD_CUE_CAP): LeadCueLine[] {
  if (!cues || cap <= 0) return [];
  const lines: LeadCueLine[] = [];
  for (const cue of cues) {
    const area = typeof cue.area === "string" ? cue.area.trim() : "";
    const text = typeof cue.text === "string" ? cue.text.trim() : "";
    if (!area || !text) continue;
    lines.push({ area, text });
    if (lines.length >= cap) break;
  }
  return lines;
}
