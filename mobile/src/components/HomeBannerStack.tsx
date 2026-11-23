import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Pressable, Text } from "react-native";
import { HOME_BANNER_CAP, selectHomeBanners } from "../lib/home-banners";
import { SECONDARY } from "../theme/contrast";

type Report = (id: string, priority: number, active: boolean) => void;

const ReportContext = createContext<Report>(() => undefined);
const ShownContext = createContext<Set<string> | null>(null);

/** Register a banner. Outside a stack this is a no-op. */
export function useHomeBanner(id: string, priority: number, active: boolean): void {
  const report = useContext(ReportContext);
  useEffect(() => {
    report(id, priority, active);
    return () => report(id, priority, false);
  }, [active, id, priority, report]);
}

/**
 * True when this banner is one of the ones on screen.
 * Outside a stack, banners stay visible.
 */
export function useBannerShown(id: string): boolean {
  const shown = useContext(ShownContext);
  if (!shown) return true;
  return shown.has(id);
}

export function HomeBannerStack({ cap = HOME_BANNER_CAP, children }: { cap?: number; children: React.ReactNode }) {
  const [active, setActive] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(false);
  const report = useCallback<Report>((id, priority, on) => {
    setActive((prev) => {
      if (on) {
        if (prev[id] === priority) return prev;
        return { ...prev, [id]: priority };
      }
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);
  const selection = useMemo(
    () => selectHomeBanners(
      Object.entries(active).map(([id, priority]) => ({ id, priority })),
      cap,
      expanded,
    ),
    [active, cap, expanded],
  );
  const shown = useMemo(() => new Set(selection.shownIds), [selection]);
  const more = selection.hiddenCount === 1 ? "1 more update" : `${selection.hiddenCount} more updates`;
  return (
    <ReportContext.Provider value={report}>
      <ShownContext.Provider value={shown}>
        {children}
        {selection.hiddenCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Show ${more}`}
            onPress={() => setExpanded(true)}
            style={{ minHeight: 44, justifyContent: "center", marginBottom: 12 }}
          >
            <Text style={{ color: SECONDARY, fontSize: 14, fontWeight: "600" }}>{more}</Text>
          </Pressable>
        ) : null}
      </ShownContext.Provider>
    </ReportContext.Provider>
  );
}
