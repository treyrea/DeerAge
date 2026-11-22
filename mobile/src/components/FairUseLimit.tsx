/**
 * Daily or monthly fair-use cap. This is a limit, not a failed scan.
 * Scan packs show only when the store returns a live price.
 */

import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StatusBar, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { claimScanPack } from "../api/scan-credits";
import type { FairUseLimit } from "../api/errors";
import { purchaseNotice } from "../lib/access";
import { fairUseLimitCopy, scanPackOffers, type ScanPackChoice } from "../lib/fair-use-limit";
import { SCAN_PACK_IDS } from "../lib/products";
import { getStoreProducts, isRevenueCatEnabled, purchaseStoreProduct } from "../lib/revenuecatClient";
import { BLIND } from "../utils/blind-verdict";

type StoreProduct = Parameters<typeof purchaseStoreProduct>[0];

export function FairUseLimitView({
  message,
  limit,
  offerPacks,
  onHome,
  onAdded,
}: {
  message: string;
  limit?: FairUseLimit | null;
  /** The answering server spends a pack credit past this cap. Otherwise the buttons stay hidden. */
  offerPacks: boolean;
  onHome: () => void;
  /** Camera: back to the shutter after a pack is added. Full scan stays on this screen. */
  onAdded?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const copy = fairUseLimitCopy({ message, limit });
  const [offers, setOffers] = useState<ScanPackChoice<StoreProduct>[]>([]);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!offerPacks || !isRevenueCatEnabled()) return undefined;
    void getStoreProducts([...SCAN_PACK_IDS]).then((result) => {
      if (!active || !result.ok) return;
      setOffers(scanPackOffers(result.data));
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [offerPacks]);

  const buy = async (offer: ScanPackChoice<StoreProduct>) => {
    if (buyingId) return;
    setBuyingId(offer.id);
    setNotice(null);
    const result = await purchaseStoreProduct(offer.product);
    if (!result.ok) {
      setBuyingId(null);
      if (purchaseNotice(String(result.error ?? ""))) setNotice("No scans were added.");
      return;
    }
    const transactionId = result.data.transaction?.transactionIdentifier ?? "";
    const claimed = await claimScanPack(result.data.productIdentifier || offer.id, transactionId);
    setBuyingId(null);
    if (!claimed.ok) {
      setNotice("The App Store finished, but the scans haven't been added yet.");
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (onAdded) {
      onAdded();
      return;
    }
    setAdded(true);
  };

  const title = added ? "Scans added" : copy.title;
  const detail = added ? "You can run another analysis." : copy.detail;
  const prompt = limit === "monthly" ? "Add scans to keep going this month." : "Add scans to keep going today.";

  return (
    <View style={{ flex: 1, backgroundColor: BLIND.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <StatusBar barStyle="light-content" />
      <View style={{ paddingHorizontal: 8 }}>
        <Pressable
          testID="fair-use-close"
          onPress={onHome}
          hitSlop={8}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="close" size={26} color={BLIND.muted} />
        </Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 28 }}>
        <Text style={{ color: BLIND.ink, fontSize: 32, fontWeight: "700", textAlign: "center" }}>{title}</Text>
        <Text style={{ color: BLIND.muted, fontSize: 17, lineHeight: 24, marginTop: 14, textAlign: "center" }}>{detail}</Text>
        {!added && offers.length > 0 ? (
          <View style={{ marginTop: 28 }}>
            <Text style={{ color: BLIND.muted, fontSize: 15, textAlign: "center", marginBottom: 4 }}>{prompt}</Text>
            {offers.map((offer) => (
              <Pressable
                key={offer.id}
                testID={`scan-pack-${offer.id}`}
                disabled={buyingId !== null}
                onPress={() => void buy(offer)}
                style={{
                  minHeight: 56,
                  borderRadius: 14,
                  backgroundColor: BLIND.button,
                  paddingHorizontal: 16,
                  marginTop: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: BLIND.buttonInk, fontSize: 17, fontWeight: "700" }}>{offer.scans} scans</Text>
                {buyingId === offer.id ? (
                  <ActivityIndicator color={BLIND.buttonInk} />
                ) : (
                  <Text style={{ color: BLIND.buttonInk, fontSize: 17, fontWeight: "700" }}>{offer.priceLabel}</Text>
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
        {notice ? (
          <Text style={{ color: "#E7B3B3", fontSize: 15, lineHeight: 21, textAlign: "center", marginTop: 16 }}>{notice}</Text>
        ) : null}
      </View>
      <Pressable
        testID="fair-use-home"
        onPress={onHome}
        style={{ minHeight: 52, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: BLIND.muted, fontSize: 17 }}>Back to Home</Text>
      </Pressable>
    </View>
  );
}
