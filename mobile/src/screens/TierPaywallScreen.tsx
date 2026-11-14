/**
 * Season Pass and Monthly. Prices come from the RevenueCat current offering.
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
  isRevenueCatEnabled,
  purchasePackage,
  trackPaywallImpression,
} from "../lib/revenuecatClient";
import {
  LEGACY_OFFERING_ID,
  LEGACY_PRODUCT_IDS,
  MONTHLY_PRODUCT_ID,
  SEASON_PRODUCT_ID,
  type PaywallResultSummary,
} from "../lib/products";
import { useSubscriptionStore } from "../state/subscriptionStore";

type NavigationProp = NativeStackNavigationProp<Record<string, object | undefined>>;

type PaywallRoute = RouteProp<{
  TierPaywall: { reason?: string; resultSummary?: PaywallResultSummary };
}, "TierPaywall">;

interface PlanCard {
  id: "season" | "monthly";
  title: string;
  detail: string;
  priceLabel: string;
  trialLabel: string | null;
  package: PurchasesPackage | null;
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

  const [season, setSeason] = useState<PlanCard | null>(null);
  const [monthly, setMonthly] = useState<PlanCard | null>(null);
  const [legacy, setLegacy] = useState<PurchasesPackage[]>([]);
  const [showLegacy, setShowLegacy] = useState(false);
  const [selected, setSelected] = useState<"season" | "monthly">("season");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await trackPaywallImpression(current);
      const packages = current.availablePackages;
      const seasonPackage = packages.find((pkg) => pkg.product.identifier === SEASON_PRODUCT_ID)
        ?? packages.find((pkg) => pkg.packageType === "ANNUAL" && !(LEGACY_PRODUCT_IDS as readonly string[]).includes(pkg.product.identifier))
        ?? null;
      const monthlyPackage = packages.find((pkg) => pkg.product.identifier === MONTHLY_PRODUCT_ID)
        ?? packages.find((pkg) => pkg.packageType === "MONTHLY" && !(LEGACY_PRODUCT_IDS as readonly string[]).includes(pkg.product.identifier))
        ?? null;
      const seasonPrice = seasonPackage?.product.priceString ?? "";
      const monthlyPrice = monthlyPackage?.product.priceString ?? "";
      setSeason({
        id: "season",
        title: "Season Pass",
        detail: "A year of Quick Check, Age, and Score.",
        priceLabel: seasonPrice,
        trialLabel: seasonPackage && seasonPrice ? trialCopy(seasonPackage, seasonPrice) : null,
        package: seasonPackage,
      });
      setMonthly({
        id: "monthly",
        title: "Monthly",
        detail: "Same access, billed every month.",
        priceLabel: monthlyPrice,
        trialLabel: monthlyPackage && monthlyPrice ? trialCopy(monthlyPackage, monthlyPrice) : null,
        package: monthlyPackage,
      });
      if (!seasonPackage && monthlyPackage) setSelected("monthly");
      const legacyPool = uniquePackages([
        ...packages,
        ...(offerings.data.all[LEGACY_OFFERING_ID]?.availablePackages ?? []),
      ]).filter((pkg) => (LEGACY_PRODUCT_IDS as readonly string[]).includes(pkg.product.identifier));
      setLegacy(legacyPool);
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
  }, [applyCustomerInfo, close]);

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

  const onRestore = async () => {
    setRestoring(true);
    setError(null);
    const result = await restore();
    setRestoring(false);
    if (!result.ok) {
      setError("Couldn't reach the App Store to restore. Try again when you have a signal.");
      return;
    }
    if (!result.entitled) {
      setError("No active subscription was found for this Apple ID.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    close();
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

          <Text style={{ color: "#F5F5DC", fontSize: 28, fontWeight: "800" }}>Keep aging deer</Text>
          <Text style={{ color: "#E5D4B8", marginTop: 6, marginBottom: 18 }}>
            Three free analyses are included. A plan keeps Quick Check, Age, and Score available all season.
          </Text>

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
