/**
 * Copy for a fair-use cap. The server sentence is shown as sent.
 * The title follows the server's limit field, then the sentence, then daily.
 */

import { SCAN_PACK_10_ID, SCAN_PACK_30_ID } from "./products";
import type { FairUseLimit } from "../api/errors";

export function fairUseKind(message: string, limit?: string | null): FairUseLimit {
  if (limit === "monthly" || limit === "daily") return limit;
  return /this month/i.test(message) ? "monthly" : "daily";
}

export function fairUseLimitCopy(input: {
  message?: string | null;
  limit?: string | null;
}): { title: string; detail: string } {
  const message = input.message?.trim() ?? "";
  const kind = fairUseKind(message, input.limit);
  const title = kind === "monthly" ? "Monthly limit reached" : "Daily limit reached";
  if (message) return { title, detail: message };
  const detail = kind === "monthly"
    ? "You've reached this month's limit. It resets at the start of next month, at midnight Central."
    : "You've reached today's limit. It resets at midnight Central.";
  return { title, detail };
}

export interface PricedProduct {
  identifier: string;
  priceString: string;
}

export interface ScanPackChoice<T extends PricedProduct = PricedProduct> {
  id: string;
  scans: number;
  priceLabel: string;
  product: T;
}

/** Live store products only. A missing pack or a blank price is left out. */
export function scanPackOffers<T extends PricedProduct>(products: T[]): ScanPackChoice<T>[] {
  const specs = [
    { id: SCAN_PACK_10_ID, scans: 10 },
    { id: SCAN_PACK_30_ID, scans: 30 },
  ];
  return specs.flatMap((spec) => {
    const product = products.find((item) => item.identifier === spec.id);
    const priceLabel = product?.priceString?.trim() ?? "";
    if (!product || !priceLabel) return [];
    return [{ id: spec.id, scans: spec.scans, priceLabel, product }];
  });
}
