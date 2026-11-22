import type { ShotRecord } from "../types/shot-record";

/**
 * Quick Check records, newest first.
 * Call this outside a zustand selector (select `s.records`, then useMemo).
 * A selector that builds a new array each time makes zustand 5 re-render forever,
 * which crashed the History screen.
 */
export function quickRecordsNewestFirst(records: Record<string, ShotRecord> | null | undefined): ShotRecord[] {
  return Object.values(records ?? {})
    .filter((record) => record?.mode === "quick")
    .sort((a, b) => (a.deviceTime < b.deviceTime ? 1 : -1));
}
