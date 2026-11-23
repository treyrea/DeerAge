/** How many home notices sit above the logo before the rest collapse into one line. */
export const HOME_BANNER_CAP = 1;

export const HOME_BANNER_PRIORITY = {
  update: 1,
  harvest: 2,
  seasonal: 3,
  legacy: 4,
  feed: 5,
} as const;

export interface HomeBanner {
  id: string;
  priority: number;
}

/**
 * Highest priority first. Equal priority breaks ties by id so the choice is stable.
 * Expanded shows every active banner.
 */
export function selectHomeBanners(
  active: readonly HomeBanner[],
  cap = HOME_BANNER_CAP,
  expanded = false,
): { shownIds: string[]; hiddenCount: number } {
  const ranked = [...active].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const unique: HomeBanner[] = [];
  const seen = new Set<string>();
  for (const banner of ranked) {
    if (seen.has(banner.id)) continue;
    seen.add(banner.id);
    unique.push(banner);
  }
  if (expanded) return { shownIds: unique.map((banner) => banner.id), hiddenCount: 0 };
  const limit = Math.max(0, cap);
  return {
    shownIds: unique.slice(0, limit).map((banner) => banner.id),
    hiddenCount: Math.max(0, unique.length - limit),
  };
}
