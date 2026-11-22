import React from "react";
import { Pressable, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { softPulse } from "../lib/haptics";
import { CREAM, OFFLINE_BAR, SECONDARY } from "../theme/contrast";
import { MIN_TAP } from "../theme/tap";

/** One quiet offline signal. It opens the Offline Aging Guide. */
export function OfflineChip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Offline. Guide ready"
      onPress={() => {
        softPulse();
        onPress();
      }}
      style={{
        backgroundColor: OFFLINE_BAR,
        minHeight: MIN_TAP,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="book-outline" size={18} color={SECONDARY} />
      <Text style={{ color: CREAM, fontSize: 15, fontWeight: "600", marginLeft: 8 }}>Offline · Guide ready</Text>
    </Pressable>
  );
}
