import React from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useNetworkStore } from "../state/networkStore";
import { e2eEnabled, useE2eFlags } from "./flags";

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

function sampleAge(label: string, fieldCall: "SHOOTER" | "LET WALK" | "BORDERLINE", isRange: boolean) {
  useDeerScoringStore.setState({
    isProcessing: false,
    error: null,
    errorCode: null,
    currentResult: {
      analysisId: `e2e-${label}`,
      timestamp: new Date(),
      analysisMode: "age",
      capturedFrames: [],
      fusedFrameCount: 1,
      processingTime: 1,
      onDeviceProcessing: false,
      cloudRefinementUsed: true,
      score: {} as never,
      scale: { method: "hybrid", pixelsPerInch: 0, confidence: "Med" },
      age: { estimatedAge: "3.5-4.5 years", confidence: "Med", factors: { bodySize: "Med", antlerMass: "Med", beamDiameter: "Med", neckSize: "Med" } },
      explainableAge: {
        estimatedAge: "3.5-4.5 years",
        estimatedAgeYears: 3.5,
        overallConfidence: 0,
        meetsMinimumAge: fieldCall === "SHOOTER",
        minimumAgeThreshold: 4.5,
        shooterPassLabel: fieldCall === "SHOOTER" ? "SHOOTER" : "LET WALK",
        shooterPassReason: label,
        detectedCues: [],
        bodyFeatureOverlays: [],
        netAgePush: 0,
        imageQuality: "good",
        occlusionLevel: "minimal",
        fieldCall,
        fieldCallNote: label,
        ageLabel: label,
        isRange,
        hunterCue: isRange
          ? "Age it up toward 4.5 if the chest is deep and the belly nearly matches, or down toward 3.5 if the flank tuck shows."
          : "A deep chest with the belly hanging even with it.",
        reasons: isRange ? ["The body fits both ages in this photo."] : ["The chest is deep and the waist is full."],
        cueBullets: [{ area: "Body", text: label }],
      },
    } as never,
  });
}

export const E2ePanel = () => {
  const navigation = useNavigation<Nav>();
  const setShowUpdateCard = useE2eFlags((s) => s.setShowUpdateCard);
  const setForceUpdate = useE2eFlags((s) => s.setForceUpdate);
  const setHoldOffline = useE2eFlags((s) => s.setHoldOffline);
  if (!e2eEnabled) return null;
  const openAge = (label: string, fieldCall: "SHOOTER" | "LET WALK" | "BORDERLINE", isRange: boolean) => {
    sampleAge(label, fieldCall, isRange);
    navigation.navigate("AgeResults");
  };
  return (
    <View testID="e2e-panel" style={{ marginTop: 12, marginBottom: 12 }}>
      <Text style={{ color: "#8B7355", fontSize: 12, marginBottom: 6 }}>Simulator checks</Text>
      <Pressable testID="e2e-age" onPress={() => openAge("4.5", "SHOOTER", false)} style={row}>
        <Text style={label}>Sample age</Text>
      </Pressable>
      <Pressable testID="e2e-range" onPress={() => openAge("3.5–4.5", "BORDERLINE", true)} style={row}>
        <Text style={label}>Sample range</Text>
      </Pressable>
      <Pressable testID="e2e-borderline" onPress={() => openAge("3.5–4.5", "BORDERLINE", true)} style={row}>
        <Text style={label}>Sample borderline</Text>
      </Pressable>
      <Pressable
        testID="e2e-retake"
        onPress={() => {
          useDeerScoringStore.setState({
            isProcessing: false,
            currentResult: null,
            error: "Try a side-on shot so the chest, belly, and rump are all visible.",
            errorCode: "retake",
          });
          navigation.navigate("Processing");
        }}
        style={row}
      >
        <Text style={label}>Sample retake</Text>
      </Pressable>
      <Pressable testID="e2e-paywall" onPress={() => navigation.navigate("TierPaywall", { reason: "e2e" })} style={row}>
        <Text style={label}>Open paywall</Text>
      </Pressable>
      <Pressable testID="e2e-messages" onPress={() => navigation.getParent()?.navigate("Settings", { screen: "Messages" })} style={row}>
        <Text style={label}>Open messages</Text>
      </Pressable>
      <Pressable testID="e2e-feed" onPress={() => navigation.navigate("Feed")} style={row}>
        <Text style={label}>Open feed</Text>
      </Pressable>
      <Pressable testID="e2e-update" onPress={() => setShowUpdateCard(true)} style={row}>
        <Text style={label}>Show update card</Text>
      </Pressable>
      <Pressable testID="e2e-force" onPress={() => setForceUpdate(true)} style={row}>
        <Text style={label}>Show forced update</Text>
      </Pressable>
      <Pressable
        testID="e2e-offline"
        onPress={() => {
          setHoldOffline(true);
          useNetworkStore.getState().setNetworkState(false, false, "none");
        }}
        style={row}
      >
        <Text style={label}>Show offline</Text>
      </Pressable>
      <Pressable
        testID="e2e-fail"
        onPress={() => {
          useDeerScoringStore.setState({
            isProcessing: false,
            currentResult: null,
            error: "Analysis failed. Try again in a moment.",
            errorCode: "unknown",
          });
          navigation.navigate("Processing");
        }}
        style={row}
      >
        <Text style={label}>Sample failure</Text>
      </Pressable>
    </View>
  );
};

const row = { paddingVertical: 8 };
const label = { color: "#D4AF37", fontWeight: "700" as const };
