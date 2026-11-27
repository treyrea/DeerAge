import { historyTabCounts, showsOnTab, tabsAddUp, timeMs } from "./history-tabs";

describe("history tabs", () => {
  it("makes Quick, Age, and Rack add up to All", () => {
    const modes = [...Array(10).fill("age"), ...Array(5).fill("score")];
    const counts = historyTabCounts(modes, 7);
    expect(counts).toEqual({ all: 22, quick: 7, age: 10, score: 5, other: 0 });
    expect(tabsAddUp(counts)).toBe(true);
    expect(counts.quick + counts.age + counts.score).toBe(counts.all);
  });

  it("counts an antlerless Quick Check saved in analyses on the Quick tab", () => {
    const counts = historyTabCounts(["age", "quick"], 2);
    expect(counts.quick).toBe(3);
    expect(counts.age).toBe(1);
    expect(counts.all).toBe(4);
    expect(tabsAddUp(counts)).toBe(true);
  });

  it("keeps an unknown saved mode on All instead of dropping it", () => {
    const counts = historyTabCounts(["age", "score", "comprehensive"], 1);
    expect(counts.other).toBe(1);
    expect(counts.all).toBe(4);
    expect(tabsAddUp(counts)).toBe(true);
    expect(showsOnTab("age", "other")).toBe(false);
    expect(showsOnTab("all", "other")).toBe(true);
  });

  it("shows each kind on its own tab and on All", () => {
    expect(showsOnTab("quick", "quick")).toBe(true);
    expect(showsOnTab("age", "quick")).toBe(false);
    expect(showsOnTab("score", "age")).toBe(false);
    expect(showsOnTab("all", "score")).toBe(true);
    expect(showsOnTab("all", "quick")).toBe(true);
  });

  it("reads a stored time without changing it", () => {
    expect(timeMs("2026-11-21T19:59:00.000Z")).toBe(Date.parse("2026-11-21T19:59:00.000Z"));
    expect(timeMs(new Date(1_700_000_000_000))).toBe(1_700_000_000_000);
    expect(timeMs(undefined)).toBe(0);
    expect(timeMs("not-a-date")).toBe(0);
  });
});
