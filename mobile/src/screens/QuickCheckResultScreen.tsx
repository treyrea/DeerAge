/**
 * Quick Check Screen - Fast SHOOT/LET WALK result display
 * TPWD-Compliant - Designed for split-second decisions in the field
 */

import React from "react";
import { View, Text, Pressable, Image, Dimensions, ScrollView, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import type { QuickAgeResult } from "../api/quick-age-check";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useResultFollowUp } from "../hooks/useResultFollowUp";
import { formatAgeClass } from "../utils/age-class";
import { showPreShotRecord } from "../lib/lease-rules";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { FieldCallCard } from "../components/FieldCallCard";
import { PreShotBar } from "../components/PreShotBar";
import { WrongCallCard } from "../components/WrongCallCard";
import { RegionHeadsUp } from "../components/HuntRegionSheet";
import { LeaseManagerButton } from "../components/LeaseManagerButton";
import { activeHunt, useHunterProfile } from "../state/hunterProfile";
import type { ShotDraft } from "../types/shot-record";
import { normalizeFieldCall } from "../utils/field-call";
import { useRemoteConfig } from "../state/remoteConfig";
import * as Haptics from "expo-haptics";

type NavigationProp = NativeStackNavigationProp<any>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export const QuickCheckResultScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const { result, imageUri } = route.params as {
    result: QuickAgeResult;
    imageUri: string;
  };

  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const processFrames = useDeerScoringStore((s) => s.processFrames);

  const isShoot = result.decision === "SHOOT";
  // A result with no age is a failed read. Show the retake screen, never the lease minimum as an age.
  const missingAge = result.isValidImage !== false && (typeof result.ageYears !== "number" || !(result.ageYears > 0));
  const isInvalidImage = result.isValidImage === false || missingAge;
  const ageClassLabel = formatAgeClass(result.estimatedAgeClass);
  const leaseMinimum = useDeerScoringStore((s) => s.propertyRules.minimumShooterAge);
  const followUp = useResultFollowUp(!isInvalidImage);
  const shootOrPass = useRemoteConfig((s) => s.flags.shootOrPass);
  const recordFlag = useRemoteConfig((s) => s.flags.preShotRecord);
  const leaseRules = useHunterProfile((s) => s.leaseRules);
  const recordsOn = showPreShotRecord(leaseRules, recordFlag);
  const pendingPaywall = useSubscriptionStore((s) => s.pendingPaywall);
  const readAt = React.useMemo(() => new Date().toLocaleString(), []);

  // Haptic feedback on mount
  React.useEffect(() => {
    if (isInvalidImage) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (isShoot) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [isShoot, isInvalidImage]);

  const handleFullAnalysis = () => {
    followUp.markRescan();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Set up for full age analysis with the same image
    setAnalysisMode("age");
    startCapture();
    addFrame({ imageUri, frameIndex: 0, detectedAntlers: false, confidence: "Low", partialOcclusion: false });
    processFrames();
    navigation.replace("Processing");
  };

  const handleNewCheck = () => {
    followUp.markRescan();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.replace("QuickCheckCamera");
  };

  const handleHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Pop all screens and go back to HomeMain
    navigation.popToTop();
  };

  // Handle invalid image case
  if (isInvalidImage) {
    return (
      <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
        <LinearGradient
          colors={["#78350f", "#451a03", "#1a1a1a"]}
          style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
        >
          {/* Close button */}
          <View style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 10 }}>
            <Pressable
              onPress={handleHome}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
          </View>

          {/* Invalid Image Result */}
          <View className="flex-1 items-center justify-center px-6">
            {/* Warning Icon */}
            <View
              className="w-32 h-32 rounded-full items-center justify-center mb-6"
              style={{ backgroundColor: "rgba(251, 191, 36, 0.3)" }}
            >
              <Ionicons name="warning" size={80} color="#fbbf24" />
            </View>

            {/* Invalid Image Title */}
            <Text className="text-3xl font-black mb-2 text-amber-400">
              {missingAge
                ? "NO AGE READ"
                : result.invalidImageReason === "head_mount"
                ? "HEAD MOUNT DETECTED"
                : result.invalidImageReason === "not_deer"
                ? "NOT A DEER"
                : result.invalidImageReason === "no_body_visible"
                ? "BODY NOT VISIBLE"
                : "POOR IMAGE QUALITY"}
            </Text>

            {/* Explanation */}
            <Text className="text-white/80 text-lg text-center px-4 mb-4">
              {missingAge
                ? "DeerAge couldn't read this photo. Try again in a moment."
                : result.invalidImageMessage || "This image cannot be analyzed for deer aging."}
            </Text>

            {/* Tips */}
            <View className="bg-white/10 rounded-xl p-4 mb-8 mx-4">
              <Text className="text-amber-400 font-semibold mb-2">For accurate results:</Text>
              <Text className="text-white/70 text-sm mb-1">• Use a photo of a live deer</Text>
              <Text className="text-white/70 text-sm mb-1">• Show full body in broadside view</Text>
              <Text className="text-white/70 text-sm mb-1">• Ensure good lighting conditions</Text>
              <Text className="text-white/70 text-sm">• Avoid mounted heads or antlers only</Text>
            </View>

            {/* Thumbnail */}
            <View className="rounded-xl overflow-hidden mb-8" style={{ width: SCREEN_WIDTH * 0.4, height: SCREEN_WIDTH * 0.4 }}>
              <Image
                source={{ uri: imageUri }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <Pressable
              onPress={handleNewCheck}
              style={({ pressed }) => ({
                backgroundColor: pressed ? "#e5a922" : "#fbbf24",
                borderRadius: 12,
                paddingVertical: 16,
                alignItems: "center",
                marginBottom: 12,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons name="camera" size={20} color="#1a1a1a" />
                <Text style={{ color: "#1a1a1a", fontWeight: "bold", marginLeft: 8 }}>Try Another Photo</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handleHome}
              style={({ pressed }) => ({
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: "center",
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: "rgba(255,255,255,0.6)" }}>Back to Home</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // Age class display (NOT exact age - TPWD compliant)
  // Format key feature for display
  const keyFeatureDisplay = result.keyFeature === "neck_brisket"
    ? "Neck-Brisket"
    : result.keyFeature === "chest_hindquarter"
    ? "Chest Depth"
    : result.keyFeature === "leg_body"
    ? "Leg Proportion"
    : "";
  // Checked above: a missing age already returned the retake screen.
  const ageYears = result.ageYears as number;

  const shareRead = () => {
    const call = result.fieldCall || (result.decision === "SHOOT" ? "SHOOTER" : "LET WALK");
    void Share.share({ message: `${call} · ${ageClassLabel} · minimum ${leaseMinimum}` }).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420" }}>
      <LinearGradient
        colors={["#2B3420", "#1a1f16"]}
        style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Pressable onPress={handleHome} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: 8 }}>
          <Ionicons name="close" size={28} color="white" />
        </Pressable>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>
          {shootOrPass ? (
            <FieldCallCard
              ageYears={ageYears}
              confidence={result.confidence}
              minimum={leaseMinimum}
              cueBullets={result.cueBullets}
              fallbackCues={result.topCues ?? [result.explanation]}
              fieldCall={normalizeFieldCall(result.fieldCall)}
              note={result.fieldCallNote}
              bodyOnlyAge={result.bodyOnlyAge}
              betterAngle={result.betterAngle}
            />
          ) : (
            <FieldCallCard
              ageYears={ageYears}
              confidence={result.confidence}
              minimum={leaseMinimum}
              fallbackCues={result.topCues ?? [result.explanation]}
            />
          )}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <Image source={{ uri: imageUri }} style={{ width: 64, height: 64, borderRadius: 10 }} />
            <Text style={{ color: "#8B7355", fontSize: 13, marginLeft: 12, flex: 1 }}>{keyFeatureDisplay}</Text>
          </View>
          <Text style={{ color: "#8B7355", fontSize: 12, marginBottom: 8 }}>{result.disclaimer}</Text>

          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", minHeight: 44 }}>
            {result.canAnalyzeFurther ? (
              <Pressable onPress={handleFullAnalysis} style={{ minHeight: 44, justifyContent: "center", marginRight: 18 }}>
                <Text style={{ color: "#E5D4B8", fontSize: 15 }}>Get full age analysis</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={shareRead} style={{ minHeight: 44, justifyContent: "center", marginRight: 18 }}>
              <Text style={{ color: "#F5F5DC", fontSize: 15, fontWeight: "700" }}>Share</Text>
            </Pressable>
            {pendingPaywall ? (
              <Pressable onPress={() => navigation.navigate("TierPaywall", { reason: "free_limit" })} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text style={{ color: "#8B7355", fontSize: 15 }}>See plans</Text>
              </Pressable>
            ) : null}
          </View>

          {recordsOn ? (
            <PreShotBar
              compact
              draft={{
                localId: result.shotReceipt?.id ?? `quick-${imageUri}`,
                mode: "quick",
                photoUris: [imageUri],
                receipt: result.shotReceipt ?? null,
                ageClass: result.shotReceipt?.summary.ageClass || ageClassLabel,
                ageRange: result.shotReceipt?.summary.ageRange || result.estimatedAgeClass,
                confidence: result.confidence,
                leaseMinimum,
                fieldCall: result.fieldCall || (result.decision === "SHOOT" ? "SHOOTER" : "LET WALK"),
                fieldCallNote: result.fieldCallNote || "",
                cues: result.cueBullets?.map((cue) => `${cue.area}: ${cue.text}`) ?? result.topCues ?? [],
                huntLabel: activeHunt(useHunterProfile.getState()).label,
                fastAge: result.fastAge,
                mainAge: result.mainAge,
                bodyOnlyAge: result.bodyOnlyAge,
              } satisfies ShotDraft}
              onNeedPlan={() => navigation.navigate("TierPaywall", { reason: "records" })}
            />
          ) : null}
          <WrongCallCard
            scanId={result.shotReceipt?.id ?? `quick-${imageUri}`}
            fieldCall={result.fieldCall || (result.decision === "SHOOT" ? "SHOOTER" : "LET WALK")}
            photos={[imageUri]}
            snapshot={{
              fieldCall: result.fieldCall,
              ageYears: result.ageYears,
              fastAge: result.fastAge,
              mainAge: result.mainAge,
              bodyOnlyAge: result.bodyOnlyAge,
              leaseMinimum,
            }}
          />
          <RegionHeadsUp />
          {leaseRules ? (
            <LeaseManagerButton
              ageClass={ageClassLabel}
              call={result.fieldCall || (result.decision === "SHOOT" ? "SHOOTER" : "LET WALK")}
              minimum={leaseMinimum}
              region={activeHunt(useHunterProfile.getState()).label}
              time={readAt}
              receiptId={result.shotReceipt?.id}
              photoUri={imageUri}
            />
          ) : null}
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
          <Pressable
            onPress={handleNewCheck}
            style={{ flex: 1, minHeight: 56, borderRadius: 14, borderWidth: 1.5, borderColor: "#3A3832", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#F5F5DC", fontSize: 17, fontWeight: "700" }}>Scan again</Text>
          </Pressable>
          <Pressable
            onPress={handleHome}
            style={{ flex: 1, minHeight: 56, borderRadius: 14, backgroundColor: "#D4AF37", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#1a1f16", fontSize: 17, fontWeight: "700" }}>Done</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
};
