/**
 * "Know his real age?" under More on a shared scan. Two sheets: the age, then how he knows.
 * iOS uses a native action sheet. Android uses a modal list so all seven ages are visible.
 * Shown only when Help improve DeerAge is on, the owner has storage on, and the scan has a job id.
 */

import React, { useState } from "react";
import { ActionSheetIOS, Alert, Modal, Platform, Pressable, Text } from "react-native";
import { sendRealAge } from "../api/contribution";
import { REAL_AGE_SOURCES, REAL_AGES } from "../lib/help-improve";
import { useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";

type PickerRequest = {
  title: string;
  message: string;
  options: readonly string[];
  resolve: (index: number | null) => void;
};

function pickOnIos(title: string, message: string, options: readonly string[]): Promise<number | null> {
  return new Promise((resolve) => {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: [...options, "Cancel"], cancelButtonIndex: options.length },
      (index) => resolve(index < options.length ? index : null),
    );
  });
}

export function RealAgeRow({ jobId, color }: { jobId?: string; color: string }) {
  const helpImprove = useHunterProfile((s) => s.helpImprove);
  const enabled = useRemoteConfig((s) => s.contributeEnabled);
  const [saved, setSaved] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerRequest | null>(null);

  if (!helpImprove || !enabled || !jobId) return null;

  const pick = (title: string, message: string, options: readonly string[]): Promise<number | null> => {
    if (Platform.OS === "ios") return pickOnIos(title, message, options);
    return new Promise((resolve) => {
      setPicker({ title, message, options, resolve });
    });
  };

  const closePicker = (index: number | null) => {
    const current = picker;
    setPicker(null);
    current?.resolve(index);
  };

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
    <>
      <Pressable
        testID="real-age-row"
        onPress={() => { void onPress(); }}
        disabled={saved != null}
        style={{ minHeight: 52, justifyContent: "center" }}
      >
        <Text style={{ color, fontSize: 17 }}>{saved ? `Real age saved: ${saved}. Thanks.` : "Know his real age?"}</Text>
      </Pressable>
      {picker != null ? (
        <Modal
          testID="real-age-picker"
          transparent
          animationType="fade"
          visible
          onRequestClose={() => closePicker(null)}
        >
          <Pressable
            testID="real-age-overlay"
            onPress={() => closePicker(null)}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 24 }}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{ backgroundColor: "#3D4A2F", borderRadius: 16, paddingVertical: 8, paddingHorizontal: 4 }}
            >
              <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700", paddingHorizontal: 16, paddingTop: 12 }}>
                {picker.title}
              </Text>
              {picker.message ? (
                <Text style={{ color: "#C9B48F", fontSize: 14, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 }}>
                  {picker.message}
                </Text>
              ) : null}
              {picker.options.map((label, index) => (
                <Pressable
                  key={label}
                  testID={`real-age-option-${label}`}
                  onPress={() => closePicker(index)}
                  style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}
                >
                  <Text style={{ color: "#F5F5DC", fontSize: 17 }}>{label}</Text>
                </Pressable>
              ))}
              <Pressable
                testID="real-age-cancel"
                onPress={() => closePicker(null)}
                style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16, marginTop: 4 }}
              >
                <Text style={{ color: "#D4AF37", fontSize: 17, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
