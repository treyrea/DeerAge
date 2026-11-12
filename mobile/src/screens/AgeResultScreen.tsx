/**
 * Age Result Screen - Explainable AI age estimation with visual overlays
 * Shows detailed body feature analysis with interactive overlays and cue explanations
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { BodyFeatureOverlayComponent } from "../components/BodyFeatureOverlay";
import { EmailPrompt } from "../components/EmailPrompt";
import { ErrorModal } from "../components/ErrorModal";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

type NavigationProp = NativeStackNavigationProp<any>;

export const AgeResultScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const currentResult = useDeerScoringStore((s) => s.currentResult);
  const clearCurrentResult = useDeerScoringStore((s) => s.clearCurrentResult);
  const saveToHistory = useDeerScoringStore((s) => s.saveToHistory);
  const updateHistory = useDeerScoringStore((s) => s.updateHistory);
  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const processFrames = useDeerScoringStore((s) => s.processFrames);
  const analysisCount = useDeerScoringStore((s) => s.analysisCount);
  const userEmail = useDeerScoringStore((s) => s.userEmail);
  const markEmailPromptSeen = useDeerScoringStore((s) => s.markEmailPromptSeen);
  const dismissEmailPrompt = useDeerScoringStore((s) => s.dismissEmailPrompt);

  const [hasSaved, setHasSaved] = useState(false);
  const [showOverlays, setShowOverlays] = useState(true);
  const [showWhyThisAge, setShowWhyThisAge] = useState(true);
  const [showModelCard, setShowModelCard] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [manualNotes, setManualNotes] = useState("");
  const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Auto-save to history when result is available
  useEffect(() => {
    if (currentResult && !hasSaved) {
      const timer = setTimeout(async () => {
        // Try to get GPS location
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const location = await Location.getCurrentPositionAsync({});
            setGpsLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });

            // Save with GPS
            await saveToHistory({
              ...currentResult,
              gpsLocation: {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy || undefined,
              },
            });
          } else {
            await saveToHistory(currentResult);
          }
        } catch (error) {
          // GPS not available, save without location
          await saveToHistory(currentResult);
        }
        setHasSaved(true);

        // Show email prompt after 1st or 5th analysis (if email not collected)
        if (!userEmail && (analysisCount === 1 || analysisCount === 5)) {
          setTimeout(() => {
            setShowEmailPrompt(true);
            markEmailPromptSeen();
          }, 1500); // Delay to let user see results first
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentResult, hasSaved, saveToHistory, userEmail, analysisCount, markEmailPromptSeen]);

  // Handle missing result
  useEffect(() => {
    if (!currentResult) {
      navigation.replace("HomeMain");
    }
  }, [currentResult, navigation]);

  if (!currentResult || !currentResult.explainableAge) {
    return null;
  }

  const explainableAge = currentResult.explainableAge;
  const imageUri = currentResult.capturedFrames[0]?.imageUri;

  const handleNewAnalysis = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHasSaved(false);
    clearCurrentResult();
    navigation.navigate("HomeMain");
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowShareSheet(false);

    const message = `DeerAge – Age My Deer Analysis

Estimated Age: ${explainableAge.estimatedAge} (${explainableAge.estimatedAgeYears} years)
Confidence: ${explainableAge.overallConfidence}%
${explainableAge.shooterPassLabel}: ${explainableAge.shooterPassReason}

Detected Cues:
${explainableAge.detectedCues.map((cue) => `• ${cue.displayName}: ${cue.detectedPattern} (${cue.confidence}%)`).join("\n")}

Know before you pull the trigger.
Powered by RackScore™ AI`;

    // Small delay to let modal close before showing share sheet
    await new Promise(resolve => setTimeout(resolve, 300));

    // Share with both message and image
    try {
      await Share.share(
        {
          message,
          url: imageUri, // iOS only - include the photo
        },
        {
          subject: "My Deer Age Analysis Results",
        }
      );
    } catch (error: any) {
      // User cancelled share - this is normal, don't log as error
      if (error?.message !== "User did not share") {
        console.log("Share cancelled or failed:", error?.message);
      }
    }
  };

  const handleSaveNotes = () => {
    if (currentResult) {
      const updatedResult = {
        ...currentResult,
        manualNotes,
        gpsLocation: gpsLocation || undefined,
      };
      updateHistory(updatedResult);
      setShowNotesModal(false);
      setShowSuccessModal(true);
    }
  };

  const confidenceColor =
    explainableAge.overallConfidence >= 75
      ? "#22c55e"
      : explainableAge.overallConfidence >= 50
      ? "#3b82f6"
      : "#f59e0b";

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-6 py-4" style={{ borderBottomWidth: 1, borderBottomColor: "#3D4A2F" }}>
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("HomeMain");
            }}
            className="w-11 h-11 items-center justify-center"
          >
            <Ionicons name="close" size={24} color="#F5F5DC" />
          </Pressable>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold" style={{ color: "#F5F5DC" }}>
              Age My Deer
            </Text>
            <Text className="text-xs mt-0.5" style={{ color: "#D4AF37" }}>
              Know before you pull the trigger
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowShareSheet(true);
            }}
            className="w-11 h-11 items-center justify-center"
          >
            <Ionicons name="share-outline" size={24} color="#F5F5DC" />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="px-6 py-6">
          {/* Primary Result Card */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            {/* TPWD Disclaimer Banner */}
            <View className="rounded-lg p-3 mb-4" style={{ backgroundColor: "#5A6447" }}>
              <Text className="text-xs text-center" style={{ color: "#E5D4B8" }}>
                Age estimates are based on proportional body characteristics and represent age classes, not exact age.
              </Text>
            </View>

            {/* Image Quality Warning - Show prominently if poor */}
            {explainableAge.imageQuality === "poor" && explainableAge.overallConfidence < 40 && (
              <View className="rounded-lg p-4 mb-4" style={{ backgroundColor: "#dc2626" }}>
                <View className="flex-row items-center mb-2">
                  <Ionicons name="warning" size={24} color="white" />
                  <Text className="text-white font-bold text-lg ml-2">
                    Unsuitable Image
                  </Text>
                </View>
                <Text className="text-white text-sm mb-2">
                  This image cannot be reliably analyzed for age estimation. The analysis below may not be accurate.
                </Text>
                {explainableAge.photoTips && explainableAge.photoTips.length > 0 && (
                  <View className="mt-2">
                    {explainableAge.photoTips.map((tip, index) => (
                      <View key={index} className="flex-row items-start mb-1">
                        <Text className="text-white mr-2">•</Text>
                        <Text className="text-white text-sm flex-1">{tip}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            <Text className="text-sm font-medium mb-4" style={{ color: "#D4AF37" }}>
              ESTIMATED AGE
            </Text>

            <View className="mb-4">
              <Text className="text-4xl font-bold text-white mb-2">
                {explainableAge.estimatedAge}
              </Text>
              <Text className="text-lg" style={{ color: "#E5D4B8" }}>
                ({explainableAge.estimatedAgeYears} years old)
              </Text>
            </View>

            {/* Confidence */}
            <View className="mb-4">
              <Text className="text-sm mb-2" style={{ color: "#E5D4B8" }}>
                Overall Confidence
              </Text>
              <View className="flex-row items-center">
                <View className="flex-1 h-3 rounded-full mr-3" style={{ backgroundColor: "#5A6447" }}>
                  <View
                    className="h-3 rounded-full"
                    style={{
                      width: `${explainableAge.overallConfidence}%`,
                      backgroundColor: confidenceColor,
                    }}
                  />
                </View>
                <Text className="text-white font-bold text-lg">
                  {explainableAge.overallConfidence}%
                </Text>
              </View>
            </View>

            {/* Shooter/Let Walk/Nice Harvest/Nice Mount Badge */}
            <View
              className="rounded-lg p-4 mt-2"
              style={{
                backgroundColor:
                  explainableAge.shooterPassLabel === "SHOOTER"
                    ? "#22c55e"
                    : explainableAge.shooterPassLabel === "NICE HARVEST"
                    ? "#3b82f6"
                    : explainableAge.shooterPassLabel === "NICE MOUNT"
                    ? "#8b5cf6"
                    : "#f59e0b",
              }}
            >
              <View className="flex-row items-center mb-2">
                <Ionicons
                  name={
                    explainableAge.shooterPassLabel === "SHOOTER"
                      ? "checkmark-circle"
                      : explainableAge.shooterPassLabel === "NICE HARVEST"
                      ? "trophy"
                      : explainableAge.shooterPassLabel === "NICE MOUNT"
                      ? "medal"
                      : "hand-left"
                  }
                  size={28}
                  color="white"
                />
                <Text className="text-white font-bold text-xl ml-3">
                  {explainableAge.shooterPassLabel}
                </Text>
                {explainableAge.shooterPassLabel !== "NICE HARVEST" &&
                 explainableAge.shooterPassLabel !== "NICE MOUNT" && (
                  <Text className="text-white text-sm ml-2">
                    ({explainableAge.meetsMinimumAge ? "Meets" : "Below"} {explainableAge.minimumAgeThreshold}+ yrs)
                  </Text>
                )}
              </View>
              <Text className="text-white text-sm leading-5">
                {explainableAge.shooterPassReason}
              </Text>
            </View>
          </View>

          {/* Image with Overlays */}
          {imageUri && (
            <View className="mb-6">
              <BodyFeatureOverlayComponent
                imageUri={imageUri}
                overlays={explainableAge.bodyFeatureOverlays}
                showOverlays={showOverlays}
                onToggleOverlays={() => setShowOverlays(!showOverlays)}
              />
            </View>
          )}

          {/* WHY THIS AGE? Section */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <Pressable
              onPress={() => setShowWhyThisAge(!showWhyThisAge)}
              className="flex-row items-center justify-between mb-4"
            >
              <Text className="text-lg font-bold text-white">WHY THIS AGE?</Text>
              <Ionicons
                name={showWhyThisAge ? "chevron-up" : "chevron-down"}
                size={24}
                color="#D4AF37"
              />
            </Pressable>

            {showWhyThisAge && (
              <>
                {/* No Cues Detected Warning */}
                {explainableAge.detectedCues.length === 0 && (
                  <View className="rounded-lg p-4 mb-4" style={{ backgroundColor: "#dc2626" }}>
                    <View className="flex-row items-center mb-2">
                      <Ionicons name="alert-circle" size={20} color="white" />
                      <Text className="text-white font-semibold ml-2">
                        No Body Features Analyzed
                      </Text>
                    </View>
                    <Text className="text-white text-sm">
                      The image did not show enough body features for analysis. Try taking a photo that shows the full deer body from a side view.
                    </Text>
                  </View>
                )}

                {/* Primary Features (4) */}
                {explainableAge.detectedCues.length > 0 && (
                  <View className="mb-4">
                    <Text className="text-sm font-semibold mb-3" style={{ color: "#D4AF37" }}>
                      PRIMARY BODY FEATURES (High Weight)
                    </Text>

                    {explainableAge.detectedCues.slice(0, 4).map((cue, index) => (
                      <View
                        key={index}
                        className="flex-row items-start mb-3 p-3 rounded-lg"
                        style={{ backgroundColor: "#5A6447" }}
                      >
                        <Ionicons
                          name={cue.ageWeight >= 2 ? "checkmark-circle" : cue.ageWeight <= -1 ? "close-circle" : "ellipse-outline"}
                          size={20}
                          color={cue.ageWeight >= 2 ? "#22c55e" : cue.ageWeight <= -1 ? "#f59e0b" : "#9ca3af"}
                        />
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center justify-between mb-1">
                            <Text className="text-white font-semibold flex-1">
                              {cue.displayName}
                            </Text>
                            <View
                              className="rounded px-2 py-0.5 ml-2"
                              style={{
                                backgroundColor:
                                  cue.ageWeight >= 2 ? "#22c55e" : cue.ageWeight <= -1 ? "#f59e0b" : "#6b7280",
                              }}
                            >
                              <Text className="text-white text-xs font-bold">
                                {cue.ageWeight >= 2 ? "MATURE" : cue.ageWeight <= -1 ? "IMMATURE" : "TRANSITIONAL"}
                              </Text>
                            </View>
                          </View>
                          <Text className="text-sm mb-2" style={{ color: "#E5D4B8" }}>
                            {cue.detectedPattern}
                          </Text>
                          <Text className="text-xs" style={{ color: "#9ca3af" }}>
                            {cue.explanation}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Secondary Features (3) */}
                {explainableAge.detectedCues.length > 4 && (
                  <View className="mb-4">
                    <Text className="text-sm font-semibold mb-3" style={{ color: "#D4AF37" }}>
                      SECONDARY FEATURES (Supporting Evidence)
                    </Text>

                    {explainableAge.detectedCues.slice(4).map((cue, index) => (
                      <View
                        key={index}
                        className="flex-row items-start mb-3 p-3 rounded-lg"
                        style={{ backgroundColor: "#4A5640" }}
                      >
                        <Ionicons
                          name={cue.ageWeight >= 2 ? "checkmark-circle" : cue.ageWeight <= -1 ? "close-circle" : "ellipse-outline"}
                          size={18}
                          color={cue.ageWeight >= 2 ? "#22c55e" : cue.ageWeight <= -1 ? "#f59e0b" : "#9ca3af"}
                        />
                        <View className="flex-1 ml-3">
                          <View className="flex-row items-center justify-between mb-1">
                            <Text className="text-white font-medium flex-1 text-sm">
                              {cue.displayName}
                            </Text>
                            <View
                              className="rounded px-2 py-0.5 ml-2"
                              style={{
                                backgroundColor:
                                  cue.ageWeight >= 2 ? "#22c55e" : cue.ageWeight <= -1 ? "#f59e0b" : "#6b7280",
                              }}
                            >
                              <Text className="text-white text-xs">
                                {cue.ageWeight >= 2 ? "MATURE" : cue.ageWeight <= -1 ? "IMMATURE" : "TRANS"}
                              </Text>
                            </View>
                          </View>
                          <Text className="text-xs" style={{ color: "#E5D4B8" }}>
                            {cue.detectedPattern}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Net Age Push Bar */}
                {explainableAge.detectedCues.length > 0 && (
                <View className="p-4 rounded-lg" style={{ backgroundColor: "#5A6447" }}>
                  <Text className="text-sm font-semibold mb-3 text-center" style={{ color: "#D4AF37" }}>
                    NET AGE ASSESSMENT
                  </Text>
                  <View className="flex-row items-center">
                    <Text className="text-xs" style={{ color: "#E5D4B8" }}>
                      Younger
                    </Text>
                    <View className="flex-1 h-4 rounded-full mx-3" style={{ backgroundColor: "#2B3420" }}>
                      <View
                        className="h-4 rounded-full"
                        style={{
                          width: `${((explainableAge.netAgePush + 12) / 24) * 100}%`,
                          backgroundColor:
                            explainableAge.netAgePush < 0
                              ? "#f59e0b"
                              : explainableAge.netAgePush > 0
                              ? "#22c55e"
                              : "#9ca3af",
                        }}
                      />
                    </View>
                    <Text className="text-xs" style={{ color: "#E5D4B8" }}>
                      Older
                    </Text>
                  </View>
                  <Text className="text-center text-white text-sm mt-2">
                    Combined push: {explainableAge.netAgePush > 0 ? "+" : ""}
                    {explainableAge.netAgePush}
                    {explainableAge.netAgePush > 3
                      ? " (Strong older indicators)"
                      : explainableAge.netAgePush < -3
                      ? " (Strong younger indicators)"
                      : " (Moderate indicators)"}
                  </Text>
                </View>
                )}
              </>
            )}
          </View>

          {/* Image Quality & Tips */}
          {explainableAge.photoTips && explainableAge.photoTips.length > 0 && (
            <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#5A6447" }}>
              <View className="flex-row items-center mb-3">
                <Ionicons name="information-circle" size={24} color="#f59e0b" />
                <Text className="text-lg font-bold text-white ml-2">
                  Photo Quality Notice
                </Text>
              </View>
              <Text className="text-sm mb-3" style={{ color: "#E5D4B8" }}>
                For better accuracy next time, try these tips:
              </Text>
              {explainableAge.photoTips.map((tip, index) => (
                <View key={index} className="flex-row items-start mb-2">
                  <Text className="text-white mr-2">•</Text>
                  <Text className="text-sm flex-1" style={{ color: "#E5D4B8" }}>
                    {tip}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Model Card */}
          <Pressable
            onPress={() => setShowModelCard(true)}
            className="rounded-lg p-4 mb-6 flex-row items-center justify-between"
            style={{ backgroundColor: "#3D4A2F" }}
          >
            <View className="flex-row items-center flex-1">
              <Ionicons name="analytics" size={20} color="#D4AF37" />
              <Text className="text-white font-semibold ml-2">How does this work?</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#E5D4B8" />
          </Pressable>

          {/* Add Notes Button */}
          <Pressable
            onPress={() => setShowNotesModal(true)}
            className="rounded-lg p-4 mb-6 flex-row items-center justify-between"
            style={{ backgroundColor: "#5A6447" }}
          >
            <View className="flex-row items-center flex-1">
              <Ionicons name="create-outline" size={20} color="#D4AF37" />
              <Text className="text-white font-semibold ml-2">
                {manualNotes ? "Edit Notes" : "Add Notes"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#E5D4B8" />
          </Pressable>

          {/* Run Rack Analysis Button */}
          <Pressable
            onPress={async () => {
              if (!currentResult) return;

              console.log("[AgeResult] Starting rack analysis from age result");

              // Switch to rack scoring mode FIRST
              setAnalysisMode("score");

              // Small delay to ensure state updates
              await new Promise(resolve => setTimeout(resolve, 100));

              // Reset capture state and add existing frames
              startCapture();

              console.log("[AgeResult] Adding frames:", currentResult.capturedFrames.length);
              currentResult.capturedFrames.forEach((frame) => {
                addFrame(frame);
              });

              // Small delay to ensure frames are added
              await new Promise(resolve => setTimeout(resolve, 100));

              // Start processing BEFORE navigation
              console.log("[AgeResult] Starting processFrames");
              const processPromise = processFrames();

              // Navigate to processing screen immediately (processing will continue)
              navigation.navigate("Processing");

              // Wait for processing to complete
              try {
                await processPromise;
                console.log("[AgeResult] processFrames completed successfully");
              } catch (error) {
                console.error("[AgeResult] processFrames failed:", error);
              }
            }}
            className="rounded-lg p-4 mb-6"
            style={{ backgroundColor: "#d97706" }}
          >
            <View className="flex-row items-center justify-center mb-1">
              <Ionicons name="ribbon" size={20} color="white" />
              <Text className="text-white font-bold text-base ml-2">
                Run Full Rack Score Analysis
              </Text>
            </View>
            <Text className="text-white/80 text-xs text-center">
              Get detailed B&C measurements and point breakdown
            </Text>
          </Pressable>

          {/* Footer */}
          <Text className="text-center text-xs mb-6" style={{ color: "#8B7355" }}>
            Scoring powered by RackScore™ AI
          </Text>
        </View>
      </ScrollView>

      {/* Model Card Modal */}
      <Modal
        visible={showModelCard}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModelCard(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View
            className="rounded-t-3xl p-6"
            style={{ backgroundColor: "#3D4A2F", maxHeight: "80%" }}
          >
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-bold text-white flex-1">AI Model Card</Text>
              <Pressable onPress={() => setShowModelCard(false)}>
                <Ionicons name="close-circle" size={32} color="#E5D4B8" />
              </Pressable>
            </View>

            <ScrollView>
              <View className="mb-4">
                <Text className="text-base font-semibold mb-2" style={{ color: "#D4AF37" }}>
                  How It Works
                </Text>
                <Text className="text-sm leading-6" style={{ color: "#E5D4B8" }}>
                  This analysis uses advanced computer vision AI trained on millions of
                  images. It identifies key body features (neck, chest, legs, etc.) and compares them
                  to expert criteria used by wildlife biologists and experienced hunters.
                </Text>
              </View>

              <View className="mb-4">
                <Text className="text-base font-semibold mb-2" style={{ color: "#D4AF37" }}>
                  Data Sources
                </Text>
                <Text className="text-sm leading-6" style={{ color: "#E5D4B8" }}>
                  Age criteria based on peer-reviewed research and field observations from wildlife
                  management agencies. The AI learns visual patterns from thousands of tagged deer with
                  known ages.
                </Text>
              </View>

              <View className="mb-4">
                <Text className="text-base font-semibold mb-2" style={{ color: "#D4AF37" }}>
                  Known Limitations
                </Text>
                <Text className="text-sm leading-6" style={{ color: "#E5D4B8" }}>
                  • Best with broadside views showing full body{"\n"}
                  • Accuracy decreases with brush occlusion{"\n"}
                  • Poor lighting reduces confidence{"\n"}
                  • Individual deer genetics can vary{"\n"}
                  • Regional nutrition affects body development
                </Text>
              </View>

              <View className="mb-4">
                <Text className="text-base font-semibold mb-2" style={{ color: "#D4AF37" }}>
                  Best Practices
                </Text>
                <Text className="text-sm leading-6" style={{ color: "#E5D4B8" }}>
                  ✓ Take broadside (side view) photos{"\n"}
                  ✓ Ensure good natural lighting{"\n"}
                  ✓ Minimize brush/tree occlusion{"\n"}
                  ✓ Fill frame with deer body{"\n"}
                  ✓ Capture in good focus
                </Text>
              </View>

              <View className="mb-4">
                <Text className="text-base font-semibold mb-2" style={{ color: "#D4AF37" }}>
                  Disclaimer
                </Text>
                <Text className="text-sm leading-6" style={{ color: "#E5D4B8" }}>
                  This tool provides age estimates to guide hunting decisions. Always follow local
                  regulations, landowner rules, and MLDP requirements. Final harvest decisions remain
                  the hunter&apos;s responsibility.
                </Text>
              </View>
            </ScrollView>

            <Pressable
              onPress={() => setShowModelCard(false)}
              className="rounded-xl py-4 items-center mt-4"
              style={{ backgroundColor: "#5A6447" }}
            >
              <Text className="text-white font-bold">Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Notes Modal */}
      <Modal
        visible={showNotesModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNotesModal(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View
            className="rounded-t-3xl p-6"
            style={{ backgroundColor: "#3D4A2F" }}
          >
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-xl font-bold text-white">Add Notes</Text>
              <Pressable onPress={() => setShowNotesModal(false)}>
                <Ionicons name="close-circle" size={32} color="#E5D4B8" />
              </Pressable>
            </View>

            <Text className="text-sm mb-2" style={{ color: "#E5D4B8" }}>
              Location: {gpsLocation ? `${gpsLocation.latitude.toFixed(6)}, ${gpsLocation.longitude.toFixed(6)}` : "Not available"}
            </Text>

            <Text className="text-sm mb-2" style={{ color: "#D4AF37" }}>
              Add details (wind, distance, behavior, etc.)
            </Text>

            <TextInput
              value={manualNotes}
              onChangeText={setManualNotes}
              placeholder="e.g., Wind 10 mph N, at feeder 120 yds, feeding calmly"
              placeholderTextColor="#8B7355"
              multiline
              numberOfLines={4}
              className="rounded-lg p-4 mb-4"
              style={{
                backgroundColor: "#5A6447",
                color: "#F5F5DC",
                textAlignVertical: "top",
                minHeight: 100,
              }}
            />

            <Pressable
              onPress={handleSaveNotes}
              className="rounded-xl py-4 items-center"
              style={{ backgroundColor: "#D4AF37" }}
            >
              <Text className="text-white font-bold">Save Notes</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Email Prompt Modal */}
      <EmailPrompt
        visible={showEmailPrompt}
        onDismiss={() => {
          setShowEmailPrompt(false);
          dismissEmailPrompt();
        }}
      />

      {/* Success Modal */}
      <ErrorModal
        visible={showSuccessModal}
        title="Notes Saved"
        message="Your notes have been saved to this analysis."
        type="success"
        onDismiss={() => setShowSuccessModal(false)}
        confirmText="OK"
      />

      {/* Share Bottom Sheet */}
      <Modal
        visible={showShareSheet}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowShareSheet(false)}
      >
        <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <Pressable className="flex-1" onPress={() => setShowShareSheet(false)} />
          <View
            className="rounded-t-3xl p-6"
            style={{ backgroundColor: "#3D4A2F" }}
          >
            <View className="w-10 h-1 bg-gray-500 rounded-full self-center mb-6" />
            <Text className="text-white text-xl font-bold mb-6 text-center">Share Results</Text>

            <Pressable
              onPress={handleShare}
              className="flex-row items-center p-4 rounded-xl mb-3"
              style={{ backgroundColor: "#5A6447" }}
            >
              <View className="w-12 h-12 rounded-full items-center justify-center mr-4" style={{ backgroundColor: "#D4AF37" }}>
                <Ionicons name="share-social" size={24} color="white" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-base">Share Analysis</Text>
                <Text className="text-sm" style={{ color: "#E5D4B8" }}>Share age estimate and photo</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#E5D4B8" />
            </Pressable>

            <Pressable
              onPress={() => setShowShareSheet(false)}
              className="py-4 items-center mt-2"
            >
              <Text className="text-white/60 font-semibold">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Sticky Bottom Action Bar - Easy one-handed access */}
      <View
        className="absolute bottom-0 left-0 right-0 px-4 py-3"
        style={{
          backgroundColor: "#2B3420",
          borderTopWidth: 1,
          borderTopColor: "#3D4A2F",
          paddingBottom: insets.bottom + 8,
        }}
      >
        <View className="flex-row gap-3">
          <Pressable
            onPress={handleNewAnalysis}
            className="flex-1 rounded-xl py-3 items-center justify-center"
            style={{ backgroundColor: "#22c55e" }}
          >
            <Text className="text-white font-bold text-base">New Analysis</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};
