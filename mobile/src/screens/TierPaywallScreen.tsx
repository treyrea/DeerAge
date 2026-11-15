/**
 * Season Pass and Monthly. Prices come from the RevenueCat "default" offering,
 * or the current offering when "default" is missing.
 * Nothing is granted unless CustomerInfo contains an active entitlement.
 */

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import type { PurchasesPackage } from "react-native-purchases";
import {
  addCustomerInfoUpdateListener,
  getOfferings,
  getStoreProducts,
  isRevenueCatEnabled,
  purchasePackage,
  purchaseStoreProduct,
  trackPaywallImpression,
} from "../lib/revenuecatClient";
import {
  LEGACY_OFFERING_ID,
  LEGACY_PRODUCT_IDS,
  SCAN_PACK_10_ID,
  SCAN_PACK_30_ID,
  SCAN_PACK_IDS,
  type PaywallResultSummary,
} from "../lib/products";
import { claimScanPack, restoreScanPacks } from "../api/scan-credits";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { useFairUseAllowance } from "../hooks/useFairUseAllowance";
import { DEFAULT_PRODUCTS, useRemoteConfig } from "../state/remoteConfig";

type NavigationProp = NativeStackNavigationProp<Record<string, object | undefined>>;

type PaywallRoute = RouteProp<{
  TierPaywall: { reason?: string; resultSummary?: PaywallResultSummary };
}, "TierPaywall">;

type PackOffer = {
  id: string;
  scans: number;
  priceLabel: string;
  product: Parameters<typeof purchaseStoreProduct>[0];
};

interface PlanCard {
  id: "season" | "monthly";
  title: string;
  detail: string;
  priceLabel: string;
  trialLabel: string | null;
  package: PurchasesPackage | null;
  seasonKind?: "length" | "annual";
}

function trialCopy(pkg: PurchasesPackage, priceLabel: string): string | null {
  const intro = pkg.product.introPrice;
  if (!intro) return null;
  if (intro.price === 0) {
    const count = intro.periodNumberOfUnits ?? 1;
    if (intro.periodUnit === "DAY") return `${count}-day free trial, then ${priceLabel}`;
    if (intro.periodUnit === "WEEK") return `${count}-week free trial, then ${priceLabel}`;
    return `Free trial, then ${priceLabel}`;
  }
  return `${intro.priceString} to start, then ${priceLabel}`;
}

function uniquePackages(packages: PurchasesPackage[]): PurchasesPackage[] {
  const seen = new Set<string>();
  return packages.filter((pkg) => {
    if (seen.has(pkg.product.identifier)) return false;
    seen.add(pkg.product.identifier);
    return true;
  });
}

export const TierPaywallScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<PaywallRoute>();
  const insets = useSafeAreaInsets();
  const summary = route.params?.resultSummary;
  const applyCustomerInfo = useSubscriptionStore((s) => s.applyCustomerInfo);
  const restore = useSubscriptionStore((s) => s.restore);
  const fairUsePerDay = useFairUseAllowance();
  const paywallHeadline = useRemoteConfig((s) => s.copy.paywallHeadline);
  const paywallSubhead = useRemoteConfig((s) => s.copy.paywallSubhead);
  const recordsOn = useRemoteConfig((s) => s.flags.preShotRecord);
  const products = useRemoteConfig((s) => s.products) ?? DEFAULT_PRODUCTS;

  const [season, setSeason] = useState<PlanCard | null>(null);
  const [monthly, setMonthly] = useState<PlanCard | null>(null);
  const [legacy, setLegacy] = useState<PurchasesPackage[]>([]);
  const [showLegacy, setShowLegacy] = useState(false);
  const [selected, setSelected] = useState<"season" | "monthly">("season");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPacks, setShowPacks] = useState(false);
  const [packs, setPacks] = useState<PackOffer[]>([]);
  const [buyingPack, setBuyingPack] = useState(false);

  const close = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "HomeMain" }] }));
  }, [navigation]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!isRevenueCatEnabled()) {
        if (active) {
          setError("Subscriptions aren't available in this build.");
          setLoading(false);
        }
        return;
      }
      const offerings = await getOfferings();
      if (!active) return;
      if (!offerings.ok || !offerings.data.current) {
        setError("Plans couldn't be loaded. Check your connection and try again.");
        setLoading(false);
        return;
      }
      const current = offerings.data.current;
      const planOffering = offerings.data.all[products.offeringId] ?? current;
      await trackPaywallImpression(planOffering);
      const packages = planOffering.availablePackages;
      const seasonLength = packages.find((pkg) => pkg.product.identifier === products.seasonPassId) ?? null;
      const seasonAnnual = packages.find((pkg) => pkg.product.identifier === products.seasonAnnualId)
        ?? packages.find((pkg) => pkg.packageType === "ANNUAL" && !(LEGACY_PRODUCT_IDS as readonly string[]).includes(pkg.product.identifier))
        ?? null;
      const seasonPackage = seasonLength ?? seasonAnnual;
      const seasonKind = seasonLength ? "length" : "annual";
      const monthlyPackage = packages.find((pkg) => pkg.product.identifier === products.monthlyId)
        ?? packages.find((pkg) => pkg.packageType === "MONTHLY" && !(LEGACY_PRODUCT_IDS as readonly string[]).includes(pkg.product.identifier))
        ?? null;
      const seasonPrice = seasonPackage?.product.priceString ?? "";
      const monthlyPrice = monthlyPackage?.product.priceString ?? "";
      setSeason({
        id: "season",
        title: "Season Pass",
        seasonKind,
        detail: seasonKind === "length"
          ? "Covers this hunting season. It does not renew, so you are not billed in the off-season."
          : "One charge a year. It renews next fall, not every month. Cancel in Settings before it renews if you sit out a season.",
        priceLabel: seasonPrice,
        trialLabel: seasonPackage && seasonPrice ? trialCopy(seasonPackage, seasonPrice) : null,
        package: seasonPackage,
      });
      setMonthly({
        id: "monthly",
        title: "Monthly",
        detail: "Billed every month, including the off-season. Cancel anytime if you only hunt in the fall.",
        priceLabel: monthlyPrice,
        trialLabel: monthlyPackage && monthlyPrice ? trialCopy(monthlyPackage, monthlyPrice) : null,
        package: monthlyPackage,
      });
      if (!seasonPackage && monthlyPackage) setSelected("monthly");
      const legacyPool = uniquePackages([
        ...current.availablePackages,
        ...(offerings.data.all[LEGACY_OFFERING_ID]?.availablePackages ?? []),
      ]).filter((pkg) => (LEGACY_PRODUCT_IDS as readonly string[]).includes(pkg.product.identifier));
      setLegacy(legacyPool);
      const storeProducts = await getStoreProducts([...SCAN_PACK_IDS]);
      if (!active) return;
      if (storeProducts.ok) {
        const offers = [SCAN_PACK_10_ID, SCAN_PACK_30_ID].flatMap((id) => {
          const product = storeProducts.data.find((item) => item.identifier === id);
          if (!product) return [];
          return [{
            id,
            scans: id === SCAN_PACK_10_ID ? 10 : 30,
            priceLabel: product.priceString,
            product,
          }];
        });
        setPacks(offers);
      }
      setLoading(false);
    };
    void load();

    const unsubscribe = addCustomerInfoUpdateListener((info) => {
      if (applyCustomerInfo(info)) close();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyCustomerInfo, close, products.offeringId, products.seasonPassId, products.seasonAnnualId, products.monthlyId]);

  const selectedPlan = selected === "season" ? season : monthly;

  const buy = async (pkg: PurchasesPackage | null) => {
    if (!pkg) {
      setError("This plan isn't available for purchase yet.");
      return;
    }
    setPurchasing(true);
    setError(null);
    const result = await purchasePackage(pkg);
    setPurchasing(false);
    if (!result.ok) {
      const text = String(result.error ?? "");
      if (!text.toLowerCase().includes("cancel")) {
        setError("The purchase didn't go through. You have not been charged for a plan that didn't activate.");
      }
      return;
    }
    const entitled = applyCustomerInfo(result.data);
    if (!entitled) {
      setError("The App Store finished, but no active plan came back. Use Restore if you were charged.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    close();
  };

  const buyPack = async (offer: PackOffer) => {
    setBuyingPack(true);
    setError(null);
    const result = await purchaseStoreProduct(offer.product);
    if (!result.ok) {
      setBuyingPack(false);
      setError("No scans were added.");
      return;
    }
    const transactionId = result.data.transaction?.transactionIdentifier ?? "";
    const claimed = await claimScanPack(result.data.productIdentifier || offer.id, transactionId);
    setBuyingPack(false);
    if (!claimed.ok) {
      setError("The App Store finished, but the scans haven't been added yet. Tap Restore when you have a signal.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    close();
  };

  const onRestore = async () => {
    setRestoring(true);
    setError(null);
    const result = await restore();
    const packsRestored = await restoreScanPacks();
    setRestoring(false);
    if (!result.ok && !packsRestored.ok) {
      setError("Couldn't reach the App Store to restore. Try again when you have a signal.");
      return;
    }
    if (result.entitled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
      return;
    }
    if (packsRestored.ok && (packsRestored.credits ?? 0) > 0) {
      setError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      close();
      return;
    }
    setError("No active subscription was found for this Apple ID.");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1f16" }}>
      <LinearGradient colors={["#2B3420", "#1a1f16"]} style={{ flex: 1, paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={close} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="close" size={28} color="#F5F5DC" />
          </Pressable>
          <Pressable onPress={() => void onRestore()} disabled={restoring}>
            {restoring ? <ActivityIndicator color="#D4AF37" /> : <Text style={{ color: "#D4AF37", fontWeight: "700" }}>Restore</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 28 }}>
          {summary ? (
            <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 14, marginBottom: 18, flexDirection: "row" }}>
              {summary.imageUri ? (
                <Image source={{ uri: summary.imageUri }} style={{ width: 72, height: 72, borderRadius: 10, marginRight: 12 }} />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#D4AF37", fontSize: 12, fontWeight: "700" }}>YOUR RESULT</Text>
                <Text style={{ color: "#F5F5DC", fontSize: 20, fontWeight: "800", marginTop: 2 }}>{summary.headline}</Text>
                <Text style={{ color: "#E5D4B8", marginTop: 2 }}>
                  {summary.call}
                  {typeof summary.confidence === "number" ? ` · ${summary.confidence}%` : ""}
                </Text>
              </View>
            </View>
          ) : null}

          <Text style={{ color: "#F5F5DC", fontSize: 28, fontWeight: "800" }}>{paywallHeadline || "Keep aging deer"}</Text>
          <Text style={{ color: "#D4AF37", marginTop: 8, lineHeight: 20 }}>
            Season Pass is for the hunting season. You do not have to pay every month of the year.
          </Text>
          <Text style={{ color: "#E5D4B8", marginTop: 6, marginBottom: recordsOn ? 8 : 18 }}>
            {paywallSubhead || `Three free analyses are included. A plan is everyday use: ${fairUsePerDay} analyses a day, and the fair-use cap resets tomorrow.`}
          </Text>
          {recordsOn ? (
            <Text style={{ color: "#E5D4B8", marginBottom: 18, lineHeight: 20 }}>
              A plan includes every pre-shot record. The most recent record stays free.
            </Text>
          ) : null}

          {loading ? <ActivityIndicator color="#D4AF37" /> : null}

          {[season, monthly].filter((plan): plan is PlanCard => plan !== null).map((plan) => {
            const isSelected = selected === plan.id;
            return (
              <Pressable
                key={plan.id}
                onPress={() => setSelected(plan.id)}
                style={{
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  backgroundColor: isSelected ? "#3D4A2F" : "#24301c",
                  borderWidth: 2,
                  borderColor: isSelected ? "#D4AF37" : "#3D4A2F",
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "800" }}>{plan.title}</Text>
                  <Text style={{ color: "#D4AF37", fontSize: 18, fontWeight: "800" }}>{plan.priceLabel || "Unavailable"}</Text>
                </View>
                <Text style={{ color: "#E5D4B8", marginTop: 4 }}>{plan.detail}</Text>
                {plan.trialLabel ? <Text style={{ color: "#bbf7d0", marginTop: 6 }}>{plan.trialLabel}</Text> : null}
                {plan.id === "season" ? <Text style={{ color: "#D4AF37", marginTop: 6, fontSize: 12, fontWeight: "700" }}>BEST FOR THE SEASON</Text> : null}
              </Pressable>
            );
          })}

          {error ? <Text style={{ color: "#fecaca", textAlign: "center", marginVertical: 8 }}>{error}</Text> : null}

          <Pressable
            onPress={() => void buy(selectedPlan?.package ?? null)}
            disabled={purchasing || loading}
            style={{ backgroundColor: "#D4AF37", borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 }}
          >
            {purchasing ? <ActivityIndicator color="#1a1f16" /> : (
              <Text style={{ color: "#1a1f16", fontWeight: "800", fontSize: 17 }}>
                {selectedPlan?.priceLabel ? `Continue with ${selectedPlan.title}` : "Plan unavailable"}
              </Text>
            )}
          </Pressable>

          <Pressable onPress={() => setShowPacks((open) => !open)} style={{ marginTop: 16, alignItems: "center" }}>
            <Text style={{ color: "#E5D4B8", textDecorationLine: "underline" }}>Just need a few scans?</Text>
          </Pressable>
          {showPacks ? (
            <View style={{ marginTop: 12 }}>
              {packs.length === 0 ? (
                <Text style={{ color: "#E5D4B8", textAlign: "center" }}>Scan packs could not be loaded. Check your connection and try again.</Text>
              ) : packs.map((offer) => (
                <Pressable
                  key={offer.id}
                  onPress={() => void buyPack(offer)}
                  disabled={buyingPack || purchasing}
                  style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: "#24301c" }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>{offer.scans} scans</Text>
                    <Text style={{ color: "#D4AF37", fontWeight: "700" }}>{offer.priceLabel || "Unavailable"}</Text>
                  </View>
                </Pressable>
              ))}
              {buyingPack ? <ActivityIndicator color="#D4AF37" style={{ marginTop: 8 }} /> : null}
            </View>
          ) : null}

          {legacy.length > 0 ? (
            <Pressable onPress={() => setShowLegacy((open) => !open)} style={{ marginTop: 18, alignItems: "center" }}>
              <Text style={{ color: "#E5D4B8" }}>{showLegacy ? "Hide other plans" : "More plans"}</Text>
            </Pressable>
          ) : null}
          {showLegacy ? legacy.map((pkg) => (
            <Pressable
              key={pkg.product.identifier}
              onPress={() => void buy(pkg)}
              style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: "#24301c" }}
            >
              <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>{pkg.product.title || pkg.product.identifier}</Text>
              <Text style={{ color: "#D4AF37" }}>{pkg.product.priceString}</Text>
            </Pressable>
          )) : null}
        </ScrollView>
      </LinearGradient>
    </View>
  );
};
