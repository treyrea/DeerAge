import { create } from "zustand";
import type { ShotRecord } from "../types/shot-record";
import { quickRecordsNewestFirst } from "./quick-records";

const rec = (localId: string, mode: ShotRecord["mode"], deviceTime: string) =>
  ({ localId, mode, deviceTime }) as unknown as ShotRecord;

describe("quickRecordsNewestFirst", () => {
  it("keeps only quick records, newest first", () => {
    const records = {
      a: rec("a", "quick", "2026-11-20T10:00:00Z"),
      b: rec("b", "age", "2026-11-21T10:00:00Z"),
      c: rec("c", "quick", "2026-11-21T09:00:00Z"),
    };
    expect(quickRecordsNewestFirst(records).map((r) => r.localId)).toEqual(["c", "a"]);
  });

  it("handles an empty or missing store", () => {
    expect(quickRecordsNewestFirst({})).toEqual([]);
    expect(quickRecordsNewestFirst(undefined)).toEqual([]);
  });

  it("History selects the stable records object, not a fresh array", () => {
    // HistoryScreen must select s.records (same reference between reads) so zustand 5 does not loop.
    const store = create(() => ({ records: { a: rec("a", "quick", "1") } }));
    const select = (s: { records: Record<string, ShotRecord> }) => s.records;
    expect(Object.is(select(store.getState()), select(store.getState()))).toBe(true);
    expect(Object.is(quickRecordsNewestFirst(store.getState().records), quickRecordsNewestFirst(store.getState().records))).toBe(false);
  });
});
