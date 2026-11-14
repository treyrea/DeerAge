import { useEffect, useState } from "react";
import { apiBaseUrl } from "../api/proxy";

const DEFAULT_PER_DAY = 25;

/** Daily subscriber allowance from the proxy. Falls back to the documented default. */
export function useFairUseAllowance(): number {
  const [perDay, setPerDay] = useState(DEFAULT_PER_DAY);

  useEffect(() => {
    const base = apiBaseUrl();
    if (!base) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(`${base}/api/config`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { fairUsePerDay?: number } | null) => {
        if (typeof body?.fairUsePerDay === "number" && body.fairUsePerDay > 0) {
          setPerDay(body.fairUsePerDay);
        }
      })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));
    return () => controller.abort();
  }, []);

  return perDay;
}
