/**
 * "Know his real age?" under More on a shared scan. Two native sheets: the age, then how he knows.
 * Shown only when Help improve DeerAge is on, the owner has storage on, and the scan has a job id.
 */

import React, { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, Text } from "react-native";
import { sendRealAge } from "../api/contribution";
import { REAL_AGE_SOURCES, REAL_AGES } from "../lib/help-improve";
import { useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";

function pick(title: string, message: string, options: readonly string[]): Promise<number | null> {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, message, options: [...options, "Cancel"], cancelButtonIndex: options.length },
        (index) => resolve(index < options.length ? index : null),
      );
      return;
    }
    Alert.alert(title, message, [
      ...options.slice(0, 2).map((label, index) => ({ text: label, onPress: () => resolve(index) })),
      { text: "Cancel", style: "cancel" as const, onPress: () => resolve(null) },
    ]);
  });
}

export function RealAgeRow({ jobId, color }: { jobId?: string; color: string }) {
  const helpImprove = useHunterProfile((s) => s.helpImprove);
  const enabled = useRemoteConfig((s) => s.contributeEnabled);
  const [saved, setSaved] = useState<string | null>(null);
  if (!helpImprove || !enabled || !jobId) return null;

  const onPress = async () => {
    const ageIndex = await pick("His real age", "From a jawbone or a deer you know. Used only to test DeerAge's accuracy.", REAL_AGES);
    if (ageIndex == null) return;
    const sourceIndex = await pick("How do you know?", "", REAL_AGE_SOURCES.map((source) => source.label));
    if (sourceIndex == null) return;
    const age = REAL_AGES[ageIndex];
    const ok = await sendRealAge(jobId, age, REAL_AGE_SOURCES[sourceIndex].id);
    if (ok) setSaved(age);
    else Alert.alert("Couldn't save that", "Check your connection and try again.");
  };

  return (
    <Pressable onPress={() => { void onPress(); }} disabled={saved != null} style={{ minHeight: 52, justifyContent: "center" }}>
      <Text style={{ color, fontSize: 17 }}>{saved ? `Real age saved: ${saved}. Thanks.` : "Know his real age?"}</Text>
    </Pressable>
  );
}
