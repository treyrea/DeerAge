/**
 * Settings: "Help improve DeerAge" (opt-in, off by default) and "Invite a hunting buddy".
 * Two plain rows. Turning sharing on first shows exactly what is shared; off takes effect at once.
 */

import React from "react";
import { Alert, Pressable, Share, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";
import { HELP_IMPROVE_CONSENT, HELP_IMPROVE_SUBTITLE, HELP_IMPROVE_TITLE, inviteText } from "../lib/help-improve";

export function HelpImproveSettings() {
  const helpImprove = useHunterProfile((s) => s.helpImprove);
  const setHelpImprove = useHunterProfile((s) => s.setHelpImprove);
  const inviteMessage = useRemoteConfig((s) => s.copy.inviteMessage);
  const inviteUrl = useRemoteConfig((s) => s.copy.inviteUrl);

  const onToggle = (next: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!next) {
      setHelpImprove(false);
      return;
    }
    Alert.alert(HELP_IMPROVE_TITLE, HELP_IMPROVE_CONSENT, [
      { text: "Not Now", style: "cancel" },
      { text: "Turn On", onPress: () => setHelpImprove(true) },
    ]);
  };

  const onInvite = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({ message: inviteText(inviteMessage, inviteUrl) });
    } catch {
      // The share sheet was closed or unavailable; nothing to do.
    }
  };

  return (
    <View className="rounded-2xl mb-6 overflow-hidden" style={{ backgroundColor: "#3D4A2F" }}>
      <View className="flex-row items-center p-4">
        <Ionicons name="sparkles-outline" size={22} color="#D4AF37" />
        <View className="flex-1 ml-3 mr-3">
          <Text className="text-white font-semibold">{HELP_IMPROVE_TITLE}</Text>
          <Text className="text-xs mt-1" style={{ color: "#8B7355" }}>{HELP_IMPROVE_SUBTITLE}</Text>
        </View>
        <Switch
          value={helpImprove}
          onValueChange={onToggle}
          accessibilityLabel={HELP_IMPROVE_TITLE}
          trackColor={{ false: "#3D4A2F", true: "#22c55e" }}
          thumbColor={helpImprove ? "#fff" : "#8B7355"}
        />
      </View>
      <View style={{ height: 1, backgroundColor: "#2B3420", marginLeft: 50 }} />
      <Pressable onPress={onInvite} className="flex-row items-center p-4" accessibilityRole="button">
        <Ionicons name="share-outline" size={22} color="#D4AF37" />
        <Text className="text-white font-semibold ml-3 flex-1">Invite a Hunting Buddy</Text>
        <Ionicons name="chevron-forward" size={18} color="#8B7355" />
      </Pressable>
    </View>
  );
}
