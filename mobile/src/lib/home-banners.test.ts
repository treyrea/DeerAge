import { HOME_BANNER_CAP, HOME_BANNER_PRIORITY, selectHomeBanners } from "./home-banners";

const all = [
  { id: "feed", priority: HOME_BANNER_PRIORITY.feed },
  { id: "update", priority: HOME_BANNER_PRIORITY.update },
  { id: "seasonal", priority: HOME_BANNER_PRIORITY.seasonal },
  { id: "legacy", priority: HOME_BANNER_PRIORITY.legacy },
  { id: "harvest", priority: HOME_BANNER_PRIORITY.harvest },
];

describe("selectHomeBanners", () => {
  it("shows nothing when nothing is active", () => {
    expect(selectHomeBanners([])).toEqual({ shownIds: [], hiddenCount: 0 });
  });

  it("keeps a single banner", () => {
    expect(selectHomeBanners([{ id: "feed", priority: 5 }])).toEqual({ shownIds: ["feed"], hiddenCount: 0 });
  });

  it("caps stacked banners and keeps the highest priority", () => {
    expect(selectHomeBanners(all, HOME_BANNER_CAP)).toEqual({
      shownIds: ["update"],
      hiddenCount: 4,
    });
  });

  it("shows the next banner when the higher one is absent", () => {
    const rest = all.filter((banner) => banner.id !== "update");
    expect(selectHomeBanners(rest).shownIds).toEqual(["harvest"]);
    expect(selectHomeBanners(rest).hiddenCount).toBe(3);
  });

  it("expands to every active banner", () => {
    const selected = selectHomeBanners(all, 1, true);
    expect(selected.hiddenCount).toBe(0);
    expect(selected.shownIds).toEqual(["update", "harvest", "seasonal", "legacy", "feed"]);
  });

  it("drops a duplicate id and breaks equal priority by id", () => {
    expect(selectHomeBanners([
      { id: "b", priority: 2 },
      { id: "a", priority: 2 },
      { id: "b", priority: 2 },
    ], 2)).toEqual({ shownIds: ["a", "b"], hiddenCount: 0 });
  });
});
