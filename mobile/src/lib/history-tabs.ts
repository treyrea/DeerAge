/**
 * History tabs. Age and Rack live on the analysis history.
 * Quick Check lives on shot records with mode "quick".
 * Nothing here rewrites stored records.
 */

export type HistoryTab = "all" | "quick" | "age" | "score";
export type HistoryKind = "quick" | "age" | "score" | "other";

export interface HistoryCounts {
  all: number;
  quick: number;
  age: number;
  score: number;
  /** Saved analyses whose mode is neither age nor score. They stay on All. */
  other: number;
}

export function analysisKind(mode: string | null | undefined): HistoryKind {
  if (mode === "age") return "age";
  if (mode === "score") return "score";
  return "other";
}

export function historyTabCounts(modes: readonly (string | null | undefined)[], quickCount: number): HistoryCounts {
  let age = 0;
  let score = 0;
  let other = 0;
  for (const mode of modes) {
    const kind = analysisKind(mode);
    if (kind === "age") age += 1;
    else if (kind === "score") score += 1;
    else other += 1;
  }
  const quick = Math.max(0, quickCount);
  return { all: age + score + quick + other, quick, age, score, other };
}

/** True when the four named tabs add up to All. Other modes are the only remainder. */
export function tabsAddUp(counts: HistoryCounts): boolean {
  return counts.quick + counts.age + counts.score + counts.other === counts.all;
}

export function showsOnTab(tab: HistoryTab, kind: HistoryKind): boolean {
  if (tab === "all") return true;
  return tab === kind;
}

export function timeMs(value: string | number | Date | null | undefined): number {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}
