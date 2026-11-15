import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { isLegacyProduct } from "../lib/products";
import { useCommunityStore } from "../state/communityStore";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { useRemoteConfig } from "../state/remoteConfig";

type NavigationProp = NativeStackNavigationProp<Record<string, object | undefined>>;

export const LegacyPlanCard = () => {
  const navigation = useNavigation<NavigationProp>();
  const activeProductIds = useSubscriptionStore((s) => s.activeProductIds);
  const dismissed = useCommunityStore((s) => s.legacyCardDismissed);
  const dismiss = useCommunityStore((s) => s.dismissLegacyCard);
  const legacyOn = useRemoteConfig((s) => s.flags.legacyCard);
  const onLegacyPlan = activeProductIds.some((id) => isLegacyProduct(id));
  if (!legacyOn || !onLegacyPlan || dismissed) return null;

  return (
    <View style={{
      backgroundColor: "#3D4A2F",
      borderRadius: 14,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: "#D4AF37",
    }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Ionicons name="shield-checkmark" size={22} color="#D4AF37" />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: "#F5F5DC", fontWeight: "700", fontSize: 16 }}>Your plan still works.</Text>
          <Text style={{ color: "#E5D4B8", fontSize: 14, marginTop: 6, lineHeight: 20 }}>
            You keep full access on the plan you already have. Season Pass is available too: $19.99 a year with a 7-day trial.
          </Text>
        </View>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            dismiss();
          }}
          hitSlop={10}
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={18} color="#E5D4B8" />
        </Pressable>
      </View>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          navigation.navigate("TierPaywall", { reason: "season" });
        }}
        style={{
          marginTop: 12,
          backgroundColor: "rgba(212, 175, 55, 0.15)",
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#D4AF37", fontWeight: "700" }}>See Season Pass</Text>
      </Pressable>
    </View>
  );
};
