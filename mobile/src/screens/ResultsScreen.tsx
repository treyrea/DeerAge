/**
 * Results Screen - Unified results for Age and Rack Score modes
 * Displays all metrics: Age, Rack Score, Tine Count, Confidence, and Shooter/Pass suggestion
 */

import React, { useEffect, useState, useRef } from "react";
import { View, Text, ScrollView, Pressable, Share, Image as RNImage, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { formatScore, meetsBooneAndCrockettMinimum } from "../utils/boone-crockett-calculator";
import { ConfidenceLevel, MeasurementRange } from "../types/deer-scoring";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from "react-native-reanimated";
import { AnnotatedImage } from "../components/AnnotatedImage";
import { ManualPointCounter } from "../components/ManualPointCounter";
import { EmailPrompt } from "../components/EmailPrompt";
import { ScoreAdjustmentModal } from "../components/ScoreAdjustmentModal";
import * as Haptics from "expo-haptics";

type NavigationProp = NativeStackNavigationProp<any>;

export const ResultsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const currentResult = useDeerScoringStore((s) => s.currentResult);
  const clearCurrentResult = useDeerScoringStore((s) => s.clearCurrentResult);
  const saveToHistory = useDeerScoringStore((s) => s.saveToHistory);
  const updateHistory = useDeerScoringStore((s) => s.updateHistory);
  const analysisMode = useDeerScoringStore((s) => s.analysisMode);
  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const processFrames = useDeerScoringStore((s) => s.processFrames);
  const analysisCount = useDeerScoringStore((s) => s.analysisCount);
  const userEmail = useDeerScoringStore((s) => s.userEmail);
  const markEmailPromptSeen = useDeerScoringStore((s) => s.markEmailPromptSeen);
  const dismissEmailPrompt = useDeerScoringStore((s) => s.dismissEmailPrompt);

  const [hasSaved, setHasSaved] = useState(false);
  const [showManualCounter, setShowManualCounter] = useState(false);
  const [manualCount, setManualCount] = useState(currentResult?.manualPointCount || 0);
  const [manualLeftCount, setManualLeftCount] = useState(currentResult?.manualLeftCount || 0);
  const [manualRightCount, setManualRightCount] = useState(currentResult?.manualRightCount || 0);
  const [manualOverride, setManualOverride] = useState(currentResult?.manualOverride || false);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [showScoreAdjustment, setShowScoreAdjustment] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [adjustedScore, setAdjustedScore] = useState<number | null>(null);
  const [adjustedScoreExplanation, setAdjustedScoreExplanation] = useState<string | null>(null);
  const [avgMissedTineLength, setAvgMissedTineLength] = useState<number | null>(null);

  // Collapsible section states - default collapsed for cleaner UI
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    pointCount: false,
    ageEstimation: false,
    scoreBreakdown: false,
    whyThisScore: false,
    componentTotals: false,
    detailedMeasurements: false,
    bcQualification: false,
    analysisDetails: false,
  });

  const toggleSection = (section: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleManualConfirm = (leftCount: number, rightCount: number, totalCount: number) => {
    setManualCount(totalCount);
    setManualLeftCount(leftCount);
    setManualRightCount(rightCount);
    setManualOverride(true);
    setShowManualCounter(false);

    // Reset adjusted score when manual count changes
    setAdjustedScore(null);
    setAdjustedScoreExplanation(null);
    setAvgMissedTineLength(null);

    // Update the existing history entry with manual override data
    if (currentResult) {
      const updatedResult = {
        ...currentResult,
        manualPointCount: totalCount,
        manualLeftCount: leftCount,
        manualRightCount: rightCount,
        manualOverride: true,
      };
      // Update the existing history entry instead of creating a new one
      updateHistory(updatedResult);
    }
  };

  const handleScoreAdjustmentConfirm = (avgLength: number, newAdjustedScore: number, explanation: string) => {
    setAvgMissedTineLength(avgLength);
    setAdjustedScore(newAdjustedScore);
    setAdjustedScoreExplanation(explanation);
    setShowScoreAdjustment(false);

    // Update history with adjusted score
    if (currentResult) {
      const updatedResult = {
        ...currentResult,
        manualPointCount: manualCount,
        manualLeftCount: manualLeftCount,
        manualRightCount: manualRightCount,
        manualOverride: true,
        adjustedScore: newAdjustedScore,
        adjustedScoreExplanation: explanation,
        avgMissedTineLength: avgLength,
      };
      updateHistory(updatedResult);
    }
  };

  // Handle missing result - redirect to home
  useEffect(() => {
    if (!currentResult) {
      navigation.replace("HomeMain");
    }
  }, [currentResult, navigation]);

  // Auto-save to history when result is available (only once)
  useEffect(() => {
    if (currentResult && !hasSaved) {
      // Use setTimeout to defer state update until after render
      const timer = setTimeout(() => {
        saveToHistory(currentResult);
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

  if (!currentResult) {
    return null;
  }

  const { score, age, scale, fusedFrameCount, processingTime, cloudRefinementUsed } = currentResult;
  const bcMinimum = meetsBooneAndCrockettMinimum(score);

  // Extract AI tine measurements for score adjustment calculations
  const getAiTineMeasurements = () => {
    const measurements = score.measurements;
    const tines: Array<{ length: number; side: "left" | "right" }> = [];

    // Helper to extract length value
    const extractLength = (tine: any): number => {
      if (!tine) return 0;
      const len = tine.length;
      if (typeof len === "number") return len;
      if (len && typeof len.average === "number") return len.average;
      return 0;
    };

    // Right side tines
    const rightTines = [measurements.rightG1, measurements.rightG2, measurements.rightG3, measurements.rightG4, measurements.rightG5, measurements.rightG6];
    rightTines.forEach(t => {
      const len = extractLength(t);
      if (len > 0) tines.push({ length: len, side: "right" });
    });

    // Left side tines
    const leftTines = [measurements.leftG1, measurements.leftG2, measurements.leftG3, measurements.leftG4, measurements.leftG5, measurements.leftG6];
    leftTines.forEach(t => {
      const len = extractLength(t);
      if (len > 0) tines.push({ length: len, side: "left" });
    });

    return tines;
  };

  // Use manual count if override is active, otherwise use AI count
  const displayedPointCount = manualOverride
    ? manualCount
    : score.measurements.totalPoints + score.measurements.totalAbnormalPoints;

  const getValue = (measurement: number | MeasurementRange | undefined): number => {
    if (!measurement) return 0;
    if (typeof measurement === "number") return measurement;
    return measurement.average;
  };

  const handleNewScore = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHasSaved(false); // Reset for next analysis
    clearCurrentResult();
    navigation.navigate("HomeMain");
  };

  const handleExportPDF = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowShareSheet(false);

    // Get the image URI from captured frames
    const imageUri = currentResult.capturedFrames?.[0]?.imageUri;

    // Build comprehensive message with all details
    const scoreToShow = adjustedScore !== null ? adjustedScore.toFixed(1) : formatScore(score.netNonTypical);
    const pointCountToShow = manualOverride ? displayedPointCount : (score.measurements.totalPoints + score.measurements.totalAbnormalPoints);

    let message = `DeerAge Analysis Summary\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `Mode: ${analysisMode === "age" ? "Age My Deer" : "Score My Rack"}\n\n`;

    message += `📊 RESULTS\n`;
    message += `• Estimated Age: ${age.estimatedAge}\n`;
    message += `• Rack Score (B&C): ${scoreToShow}″`;
    if (adjustedScore !== null) {
      message += ` (Adjusted)\n`;
      message += `  Original AI Score: ${formatScore(score.netNonTypical)}″\n`;
    } else {
      message += `\n`;
    }
    message += `• Point Count: ${pointCountToShow}`;
    if (manualOverride) {
      message += ` (Manual)\n`;
      message += `  AI Count: ${score.measurements.totalPoints + score.measurements.totalAbnormalPoints}\n`;
      message += `  Left: ${manualLeftCount} | Right: ${manualRightCount}\n`;
    } else {
      message += `\n`;
      message += `  Left: ${score.measurements.leftSidePoints} | Right: ${score.measurements.rightSidePoints}\n`;
    }
    message += `• Confidence: ${score.overallConfidence}\n\n`;

    // B&C Qualification
    const scoreForQualification = adjustedScore !== null ? adjustedScore : getValue(score.netNonTypical);
    const qualifiesTypical = scoreForQualification >= 160;
    const qualifiesNonTypical = scoreForQualification >= 185;

    message += `🏆 B&C QUALIFICATION\n`;
    message += `• Typical (160″): ${qualifiesTypical ? "✓ Qualified" : "Not Met"}\n`;
    message += `• Non-Typical (185″): ${qualifiesNonTypical ? "✓ Qualified" : "Not Met"}\n\n`;

    message += `Analyzed with DeerAge - AI Deer Scoring`;

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
          subject: "My Deer Analysis Results", // Email subject if shared via email
        }
      );
    } catch (error: any) {
      // User cancelled share - this is normal, don't log as error
      if (error?.message !== "User did not share") {
        console.log("Share cancelled or failed:", error?.message);
      }
    }
  };

  // Calculate age in years (extract numeric value)
  const ageYears = age.estimatedAge.split("-")[0] || age.estimatedAge;
  const isYoung = age.estimatedAge.includes("1.5-2.5") || age.estimatedAge.includes("2.5-3.5");
  const shooterSuggestion = isYoung ? "Pass - Let him grow" : "Shooter - Mature buck";

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
              {analysisMode === "age" ? "Age My Deer" : "Score My Rack"}
            </Text>
            <Text className="text-xs mt-0.5" style={{ color: "#D4AF37" }}>
              RackScore™ AI
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

      <ScrollView ref={scrollViewRef} className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="px-6 py-6">
          {/* Deer Image with Pinch-to-Zoom */}
          {currentResult.capturedFrames && currentResult.capturedFrames.length > 0 && currentResult.capturedFrames[0].imageUri && (
            <View className="mb-6">
              {!showManualCounter ? (
                <ZoomableImage imageUri={currentResult.capturedFrames[0].imageUri} />
              ) : (
                <ManualPointCounter
                  imageUri={currentResult.capturedFrames[0].imageUri}
                  initialLeftCount={score.measurements.leftSidePoints}
                  initialRightCount={score.measurements.rightSidePoints}
                  onConfirm={handleManualConfirm}
                  onCancel={() => setShowManualCounter(false)}
                />
              )}
            </View>
          )}

          {/* Manual Count Suggestion Banner - Show when AI count is symmetrical (AI tends to impose symmetry) */}
          {!showManualCounter && !manualOverride && score.measurements.leftSidePoints === score.measurements.rightSidePoints && currentResult.capturedFrames && currentResult.capturedFrames.length > 0 && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowManualCounter(true);
                scrollViewRef.current?.scrollTo({ y: 0, animated: true });
              }}
              className="mb-6 rounded-xl p-4 flex-row items-center"
              style={{ backgroundColor: "#D4AF37" }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#1f2937" }}>
                <Ionicons name="finger-print" size={22} color="#D4AF37" />
              </View>
              <View className="flex-1">
                <Text className="font-bold text-base" style={{ color: "#1f2937" }}>
                  Verify Point Count?
                </Text>
                <Text className="text-sm mt-0.5" style={{ color: "#1f2937" }}>
                  AI counted {score.measurements.leftSidePoints}x{score.measurements.rightSidePoints} - tap to verify on the photo
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#1f2937" />
            </Pressable>
          )}

          {/* Unified Metrics Card - Shows ALL key metrics */}
          <View className="rounded-2xl p-6 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <Text className="text-sm font-medium mb-4" style={{ color: "#D4AF37" }}>
              ANALYSIS RESULTS
            </Text>

            {/* Age */}
            <View className="mb-4">
              <Text className="text-sm mb-1" style={{ color: "#E5D4B8" }}>Estimated Age</Text>
              <Text className="text-3xl font-bold text-white">{age.estimatedAge}</Text>
            </View>

            {/* Rack Score */}
            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm" style={{ color: "#E5D4B8" }}>Rack Score (Boone &amp; Crockett)</Text>
                {adjustedScore !== null && (
                  <View className="px-2 py-0.5 rounded" style={{ backgroundColor: "#D4AF37" }}>
                    <Text className="text-xs font-bold" style={{ color: "#1f2937" }}>Adjusted</Text>
                  </View>
                )}
              </View>
              <View className="flex-row items-baseline">
                <Text className="text-3xl font-bold text-white">
                  {adjustedScore !== null ? adjustedScore.toFixed(1) : getValue(score.netNonTypical).toFixed(1)}
                </Text>
                <Text className="text-lg ml-2" style={{ color: "#E5D4B8" }}>inches</Text>
              </View>
              {adjustedScore !== null && (
                <Text className="text-xs mt-1" style={{ color: "#D4AF37" }}>
                  Original AI: {getValue(score.netNonTypical).toFixed(1)}&quot; • Adjusted for {manualCount} points
                </Text>
              )}
            </View>

            {/* Tine Count */}
            <View className="mb-4">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm" style={{ color: "#E5D4B8" }}>Tine Count</Text>
                {manualOverride && (
                  <View className="px-2 py-0.5 rounded" style={{ backgroundColor: "#5A6447" }}>
                    <Text className="text-white text-xs font-bold">Manual</Text>
                  </View>
                )}
              </View>
              <Text className="text-3xl font-bold text-white">{displayedPointCount}</Text>
            </View>

            {/* Confidence */}
            <View className="mb-4">
              <Text className="text-sm mb-2" style={{ color: "#E5D4B8" }}>Confidence</Text>
              <View className="flex-row items-center">
                <View className="flex-1 h-2 rounded-full mr-3" style={{ backgroundColor: "#5A6447" }}>
                  <View
                    className="h-2 rounded-full"
                    style={{
                      width: score.overallConfidence === "High" ? "100%" : score.overallConfidence === "Med" ? "66%" : "33%",
                      backgroundColor: "#D4AF37",
                    }}
                  />
                </View>
                <Text className="text-white font-semibold">{score.overallConfidence}</Text>
              </View>
            </View>

            {/* Shooter/Pass Suggestion */}
            {isYoung && (
              <View className="rounded-lg p-4 mt-2" style={{ backgroundColor: "#5A6447" }}>
                <View className="flex-row items-center">
                  <Ionicons
                    name={isYoung ? "pause-circle" : "checkmark-circle"}
                    size={24}
                    color={isYoung ? "#FFA500" : "#22c55e"}
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-white font-bold mb-1">{shooterSuggestion}</Text>
                    <Text className="text-xs" style={{ color: "#E5D4B8" }}>
                      {isYoung
                        ? "This buck is under 3.5 years old. Consider letting him mature for better genetics and larger rack development."
                        : "This is a mature buck suitable for harvest."}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Overall Score Card */}
          <View className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 mb-6">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white/80 text-sm font-medium">RECOMMENDED CATEGORY</Text>
              <View className="flex-row items-center">
                {adjustedScore !== null && (
                  <View className="px-2 py-0.5 rounded mr-2" style={{ backgroundColor: "#D4AF37" }}>
                    <Text className="text-xs font-bold" style={{ color: "#1f2937" }}>Adjusted</Text>
                  </View>
                )}
                <ConfidenceBadge confidence={score.overallConfidence} />
              </View>
            </View>
            <Text className="text-white text-3xl font-bold mb-2">{score.recommendedCategory}</Text>
            <View className="flex-row items-baseline">
              <Text className="text-white text-5xl font-bold">
                {adjustedScore !== null
                  ? adjustedScore.toFixed(1)
                  : getValue(score.recommendedCategory === "Typical" ? score.netTypical : score.netNonTypical).toFixed(1)}
              </Text>
              <Text className="text-white/80 text-xl ml-2">inches</Text>
            </View>
            <Text className="text-white/70 text-sm mt-3">
              {adjustedScore !== null ? "Adjusted " : ""}Net {score.recommendedCategory} Score
            </Text>
          </View>

          {/* Manual Point Override Section - Only show when manual override is active or user might need it */}
          {(manualOverride || score.measurements.totalAbnormalPoints > 0) && (
            <CollapsibleSection
              title="Point Count Adjustment"
              icon="git-branch"
              iconColor="#3b82f6"
              isExpanded={expandedSections.pointCount}
              onToggle={() => toggleSection("pointCount")}
              summary={manualOverride
                ? `Manual: ${displayedPointCount} pts (AI: ${score.measurements.totalPoints + score.measurements.totalAbnormalPoints})`
                : `${score.measurements.totalAbnormalPoints} abnormal points detected - verify count`}
            >
              <View className="bg-blue-600/20 rounded-lg p-4 -mt-2">
                {/* Point Breakdown Visual */}
                <View className="bg-white/10 rounded-lg p-3 mb-3">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-white/90 text-xs font-semibold">POINT BREAKDOWN BY SIDE</Text>
                    <Text className="text-white/70 text-xs">
                      {score.measurements.leftSidePoints}x{score.measurements.rightSidePoints}
                    </Text>
                  </View>
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-white text-sm">Left Side:</Text>
                    <Text className="text-white font-bold text-sm">{score.measurements.leftSidePoints} points</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-white text-sm">Right Side:</Text>
                    <Text className="text-white font-bold text-sm">{score.measurements.rightSidePoints} points</Text>
                  </View>
                  <View className="border-t border-white/20 mt-2 pt-2">
                    <Text className="text-white/60 text-xs">
                      {score.measurements.totalPoints} normal + {score.measurements.totalAbnormalPoints} abnormal = {score.measurements.totalPoints + score.measurements.totalAbnormalPoints} total
                    </Text>
                  </View>
                </View>

                {score.measurements.totalAbnormalPoints > 0 && !manualOverride && (
                  <Text className="text-yellow-200 text-xs mb-3">
                    Tip: For complex non-typical racks, verify count by examining the photo for small stickers and split points
                  </Text>
                )}

                {/* Manual Override Info */}
                {manualOverride && (
                  <>
                    <View className="bg-green-600/20 rounded-lg p-3">
                      <View className="flex-row items-start">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                        <View className="flex-1 ml-2">
                          <Text className="text-green-300 text-xs font-semibold">Manual Count Active: {displayedPointCount} points</Text>
                          <Text className="text-green-200 text-xs mt-1">
                            B&amp;C score calculations remain based on AI measurements.
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Update B&C Score Button */}
                    {manualCount !== (score.measurements.totalPoints + score.measurements.totalAbnormalPoints) && (
                      <Pressable
                        onPress={() => setShowScoreAdjustment(true)}
                        className="rounded-lg py-3 mt-3 items-center"
                        style={{ backgroundColor: "#D4AF37" }}
                      >
                        <View className="flex-row items-center">
                          <Ionicons name="calculator" size={18} color="#1f2937" />
                          <Text className="font-bold ml-2" style={{ color: "#1f2937" }}>Update B&amp;C Score</Text>
                        </View>
                      </Pressable>
                    )}

                    {/* Adjusted Score Display */}
                    {adjustedScore !== null && (
                      <View className="bg-yellow-600/20 rounded-lg p-4 mt-3">
                        <View className="flex-row items-center mb-2">
                          <Ionicons name="star" size={18} color="#D4AF37" />
                          <Text className="text-yellow-300 font-bold ml-2">Adjusted Score: {adjustedScore.toFixed(1)}&quot;</Text>
                        </View>
                        <Text className="text-yellow-100 text-xs">{adjustedScoreExplanation}</Text>
                      </View>
                    )}

                    <Pressable
                      onPress={() => {
                        setManualOverride(false);
                        setManualCount(0);
                        setAdjustedScore(null);
                        setAdjustedScoreExplanation(null);
                        setAvgMissedTineLength(null);
                      }}
                      className="bg-orange-600/20 rounded-lg py-2 mt-3 items-center"
                    >
                      <View className="flex-row items-center">
                        <Ionicons name="refresh" size={16} color="#fb923c" />
                        <Text className="text-orange-300 text-xs font-semibold ml-2">
                          Reset to AI Count ({score.measurements.totalPoints + score.measurements.totalAbnormalPoints})
                        </Text>
                      </View>
                    </Pressable>
                  </>
                )}
              </View>
            </CollapsibleSection>
          )}

          {/* Score Breakdown - Collapsible */}
          <CollapsibleSection
            title="Score Breakdown"
            icon="calculator"
            iconColor="#D4AF37"
            isExpanded={expandedSections.scoreBreakdown}
            onToggle={() => toggleSection("scoreBreakdown")}
            summary={adjustedScore !== null
              ? `Adjusted Net: ${adjustedScore.toFixed(1)}″ (AI: ${formatScore(score.netNonTypical)}″)`
              : `Net: ${formatScore(score.netTypical)}″ typical • ${formatScore(score.netNonTypical)}″ non-typical`}
          >
            <View className="-mt-2">
              {adjustedScore !== null && (
                <View className="bg-yellow-600/20 rounded-lg p-3 mb-4">
                  <View className="flex-row items-center mb-2">
                    <Ionicons name="calculator" size={16} color="#D4AF37" />
                    <Text className="text-yellow-300 font-semibold ml-2">Adjusted Score Active</Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-white text-sm">Adjusted Net Score:</Text>
                    <Text className="text-yellow-300 font-bold text-lg">{adjustedScore.toFixed(1)}&quot;</Text>
                  </View>
                  <Text className="text-yellow-200/70 text-xs mt-1">
                    Based on manual count of {manualCount} points
                  </Text>
                </View>
              )}
              <ScoreRow label="Gross Typical" value={formatScore(score.grossTypical)} />
              <ScoreRow label="Gross Non-Typical" value={formatScore(score.grossNonTypical)} />
              <View className="h-px bg-neutral-700 my-3" />
              <ScoreRow label="Net Typical (AI)" value={formatScore(score.netTypical)} highlight={adjustedScore === null} />
              <ScoreRow label="Net Non-Typical (AI)" value={formatScore(score.netNonTypical)} highlight={adjustedScore === null} />
              <View className="h-px bg-neutral-700 my-3" />
              <ScoreRow label="Symmetry Deductions" value={formatScore(score.symmetryDeductions)} deduction />
              <ScoreRow label="Abnormal Points Total" value={formatScore(score.abnormalPointsTotal)} />
            </View>
          </CollapsibleSection>

          {/* WHY THIS SCORE? - Explainable Rack Scoring */}
          {currentResult.explainableRackScore && (
            <CollapsibleSection
              title="WHY THIS SCORE?"
              icon="help-circle"
              iconColor="#D4AF37"
              isExpanded={expandedSections.whyThisScore}
              onToggle={() => toggleSection("whyThisScore")}
              summary={currentResult.explainableRackScore.qualifies
                ? `B&C ${currentResult.explainableRackScore.category} Qualified`
                : `${currentResult.explainableRackScore.category} • Below B&C minimum`}
            >
              <View className="-mt-2">
                {/* Measurement Quality Notice */}
                {currentResult.explainableRackScore.measurementQuality === "fair" ||
                 currentResult.explainableRackScore.measurementQuality === "poor" ? (
                  <View className="rounded-lg p-4 mb-4" style={{ backgroundColor: "#f59e0b" }}>
                    <View className="flex-row items-center mb-2">
                      <Ionicons name="warning" size={20} color="white" />
                      <Text className="text-white font-semibold ml-2">
                        Lower Measurement Confidence
                      </Text>
                    </View>
                    <Text className="text-white text-sm">
                      Some measurements have lower confidence. For best results, take photos directly facing the rack with good lighting.
                    </Text>
                    {currentResult.explainableRackScore.measurementTips && (
                      <View className="mt-2">
                        {currentResult.explainableRackScore.measurementTips.map((tip, index) => (
                          <View key={index} className="flex-row items-start mb-1">
                            <Text className="text-white mr-2">•</Text>
                            <Text className="text-white text-sm flex-1">{tip}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ) : null}

                {/* B&C Qualification Status */}
                <View
                  className="rounded-lg p-4 mb-4"
                  style={{
                    backgroundColor: currentResult.explainableRackScore.qualifies ? "#22c55e" : "#6b7280",
                  }}
                >
                  <View className="flex-row items-center mb-2">
                    <Ionicons
                      name={currentResult.explainableRackScore.qualifies ? "trophy" : "ribbon"}
                      size={24}
                      color="white"
                    />
                    <Text className="text-white font-bold text-lg ml-3">
                      {currentResult.explainableRackScore.qualifies
                        ? `B&C ${currentResult.explainableRackScore.category} Qualified!`
                        : `${currentResult.explainableRackScore.category} (Below B&C Minimum)`}
                    </Text>
                  </View>
                  <Text className="text-white text-sm leading-5">
                    {currentResult.explainableRackScore.qualifies
                      ? `This rack meets the Boone & Crockett minimum of ${currentResult.explainableRackScore.minimumThreshold}" for ${currentResult.explainableRackScore.category} scoring. This is a trophy-class buck.`
                      : `This rack scores ${currentResult.explainableRackScore.netScore.toFixed(1)}", which is below the B&C minimum of ${currentResult.explainableRackScore.minimumThreshold}" for ${currentResult.explainableRackScore.category} bucks.`}
                  </Text>
                </View>

                {/* Component Breakdown with Explanations */}
                <Text className="text-sm font-semibold mb-3" style={{ color: "#D4AF37" }}>
                  SCORING COMPONENTS ({currentResult.explainableRackScore.detectedCues.filter(c => c.category !== "symmetry").length})
                </Text>

                {/* Main Beams */}
                {currentResult.explainableRackScore.componentBreakdown.mainBeams.cues.length > 0 && (
                  <>
                    <Text className="text-white font-semibold text-sm mb-2 mt-3">Main Beams</Text>
                    {currentResult.explainableRackScore.componentBreakdown.mainBeams.cues.map((cue, index) => (
                      <View
                        key={`mb-${index}`}
                        className="mb-3 p-3 rounded-lg"
                        style={{ backgroundColor: "#4b5563" }}
                      >
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-white font-semibold flex-1">{cue.displayName}</Text>
                          <View
                            className="rounded px-2 py-0.5 ml-2"
                            style={{
                              backgroundColor:
                                cue.confidence >= 75 ? "#22c55e" : cue.confidence >= 50 ? "#3b82f6" : "#f59e0b",
                            }}
                          >
                            <Text className="text-white text-xs font-bold">{cue.confidence}%</Text>
                          </View>
                        </View>
                        <Text className="text-sm mb-2" style={{ color: "#e5e7eb" }}>
                          {cue.detectedMeasurement}
                        </Text>
                        <View className="flex-row items-center mb-2">
                          <Text className="text-xs mr-2" style={{ color: "#D4AF37" }}>
                            Contributes:
                          </Text>
                          <Text className="text-sm font-bold" style={{ color: "#22c55e" }}>
                            +{cue.contribution.toFixed(1)}&quot;
                          </Text>
                        </View>
                        <Text className="text-xs leading-4" style={{ color: "#d1d5db" }}>
                          {cue.explanation}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Tines */}
                {currentResult.explainableRackScore.componentBreakdown.tines.cues.length > 0 && (
                  <>
                    <Text className="text-white font-semibold text-sm mb-2 mt-3">Tines</Text>
                    {currentResult.explainableRackScore.componentBreakdown.tines.cues.map((cue, index) => (
                      <View
                        key={`tine-${index}`}
                        className="mb-3 p-3 rounded-lg"
                        style={{ backgroundColor: "#4b5563" }}
                      >
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-white font-semibold flex-1">{cue.displayName}</Text>
                          <View
                            className="rounded px-2 py-0.5 ml-2"
                            style={{
                              backgroundColor:
                                cue.confidence >= 75 ? "#22c55e" : cue.confidence >= 50 ? "#3b82f6" : "#f59e0b",
                            }}
                          >
                            <Text className="text-white text-xs font-bold">{cue.confidence}%</Text>
                          </View>
                        </View>
                        <Text className="text-sm mb-2" style={{ color: "#e5e7eb" }}>
                          {cue.detectedMeasurement}
                        </Text>
                        <View className="flex-row items-center mb-2">
                          <Text className="text-xs mr-2" style={{ color: "#D4AF37" }}>
                            Contributes:
                          </Text>
                          <Text className="text-sm font-bold" style={{ color: "#22c55e" }}>
                            +{cue.contribution.toFixed(1)}&quot;
                          </Text>
                        </View>
                        <Text className="text-xs leading-4" style={{ color: "#d1d5db" }}>
                          {cue.explanation}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Mass */}
                {currentResult.explainableRackScore.componentBreakdown.mass.cues.length > 0 && (
                  <>
                    <Text className="text-white font-semibold text-sm mb-2 mt-3">Mass (Circumferences)</Text>
                    {currentResult.explainableRackScore.componentBreakdown.mass.cues.map((cue, index) => (
                      <View
                        key={`mass-${index}`}
                        className="mb-3 p-3 rounded-lg"
                        style={{ backgroundColor: "#4b5563" }}
                      >
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-white font-semibold flex-1">{cue.displayName}</Text>
                          <View
                            className="rounded px-2 py-0.5 ml-2"
                            style={{
                              backgroundColor:
                                cue.confidence >= 75 ? "#22c55e" : cue.confidence >= 50 ? "#3b82f6" : "#f59e0b",
                            }}
                          >
                            <Text className="text-white text-xs font-bold">{cue.confidence}%</Text>
                          </View>
                        </View>
                        <Text className="text-sm mb-2" style={{ color: "#e5e7eb" }}>
                          {cue.detectedMeasurement}
                        </Text>
                        <View className="flex-row items-center mb-2">
                          <Text className="text-xs mr-2" style={{ color: "#D4AF37" }}>
                            Contributes:
                          </Text>
                          <Text className="text-sm font-bold" style={{ color: "#22c55e" }}>
                            +{cue.contribution.toFixed(1)}&quot;
                          </Text>
                        </View>
                        <Text className="text-xs leading-4" style={{ color: "#d1d5db" }}>
                          {cue.explanation}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Spread */}
                {currentResult.explainableRackScore.componentBreakdown.spread.cues.length > 0 && (
                  <>
                    <Text className="text-white font-semibold text-sm mb-2 mt-3">Spread</Text>
                    {currentResult.explainableRackScore.componentBreakdown.spread.cues.map((cue, index) => (
                      <View
                        key={`spread-${index}`}
                        className="mb-3 p-3 rounded-lg"
                        style={{ backgroundColor: "#4b5563" }}
                      >
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-white font-semibold flex-1">{cue.displayName}</Text>
                          <View
                            className="rounded px-2 py-0.5 ml-2"
                            style={{
                              backgroundColor:
                                cue.confidence >= 75 ? "#22c55e" : cue.confidence >= 50 ? "#3b82f6" : "#f59e0b",
                            }}
                          >
                            <Text className="text-white text-xs font-bold">{cue.confidence}%</Text>
                          </View>
                        </View>
                        <Text className="text-sm mb-2" style={{ color: "#e5e7eb" }}>
                          {cue.detectedMeasurement}
                        </Text>
                        {cue.contribution !== 0 && (
                          <View className="flex-row items-center mb-2">
                            <Text className="text-xs mr-2" style={{ color: "#D4AF37" }}>
                              Contributes:
                            </Text>
                            <Text className="text-sm font-bold" style={{ color: "#22c55e" }}>
                              +{cue.contribution.toFixed(1)}&quot;
                            </Text>
                          </View>
                        )}
                        <Text className="text-xs leading-4" style={{ color: "#d1d5db" }}>
                          {cue.explanation}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Abnormal Points */}
                {currentResult.explainableRackScore.componentBreakdown.abnormal.cues.length > 0 && (
                  <>
                    <Text className="text-white font-semibold text-sm mb-2 mt-3">Abnormal Points</Text>
                    {currentResult.explainableRackScore.componentBreakdown.abnormal.cues.map((cue, index) => (
                      <View
                        key={`abnormal-${index}`}
                        className="mb-3 p-3 rounded-lg"
                        style={{ backgroundColor: "#4b5563" }}
                      >
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-white font-semibold flex-1">{cue.displayName}</Text>
                          <View
                            className="rounded px-2 py-0.5 ml-2"
                            style={{
                              backgroundColor:
                                cue.confidence >= 75 ? "#22c55e" : cue.confidence >= 50 ? "#3b82f6" : "#f59e0b",
                            }}
                          >
                            <Text className="text-white text-xs font-bold">{cue.confidence}%</Text>
                          </View>
                        </View>
                        <Text className="text-sm mb-2" style={{ color: "#e5e7eb" }}>
                          {cue.detectedMeasurement}
                        </Text>
                        <View className="flex-row items-center mb-2">
                          <Text className="text-xs mr-2" style={{ color: "#D4AF37" }}>
                            Contributes:
                          </Text>
                          <Text className="text-sm font-bold" style={{ color: "#8b5cf6" }}>
                            +{cue.contribution.toFixed(1)}&quot; (Non-Typical)
                          </Text>
                        </View>
                        <Text className="text-xs leading-4" style={{ color: "#d1d5db" }}>
                          {cue.explanation}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Symmetry Deductions */}
                {currentResult.explainableRackScore.deductionBreakdown.total > 0 && (
                  <>
                    <Text className="text-white font-semibold text-sm mb-2 mt-4" style={{ color: "#f59e0b" }}>
                      Symmetry Deductions
                    </Text>
                    <View className="mb-3 p-3 rounded-lg" style={{ backgroundColor: "#7c2d12" }}>
                      <Text className="text-white font-semibold mb-2">Total Deductions</Text>
                      <View className="flex-row items-center mb-2">
                        <Text className="text-xs mr-2" style={{ color: "#fed7aa" }}>
                          Deducted:
                        </Text>
                        <Text className="text-sm font-bold" style={{ color: "#fb923c" }}>
                          -{currentResult.explainableRackScore.deductionBreakdown.total.toFixed(1)}&quot;
                        </Text>
                      </View>
                      <Text className="text-xs leading-4" style={{ color: "#fed7aa" }}>
                        All asymmetries between left and right measurements are deducted from the gross score to calculate the net score. Symmetrical racks are more valuable and score higher.
                      </Text>
                    </View>

                    {currentResult.explainableRackScore.deductionBreakdown.mainBeamAsymmetry.cue && (
                      <View className="mb-2 p-3 rounded-lg" style={{ backgroundColor: "#4b5563" }}>
                        <Text className="text-white font-semibold text-sm mb-1">
                          {currentResult.explainableRackScore.deductionBreakdown.mainBeamAsymmetry.cue.displayName}
                        </Text>
                        <Text className="text-xs" style={{ color: "#d1d5db" }}>
                          {currentResult.explainableRackScore.deductionBreakdown.mainBeamAsymmetry.cue.explanation}
                        </Text>
                      </View>
                    )}

                    {currentResult.explainableRackScore.deductionBreakdown.tineAsymmetry.cues.map((cue, index) => (
                      <View key={`tine-deduction-${index}`} className="mb-2 p-3 rounded-lg" style={{ backgroundColor: "#4b5563" }}>
                        <Text className="text-white font-semibold text-sm mb-1">{cue.displayName}</Text>
                        <Text className="text-xs" style={{ color: "#d1d5db" }}>
                          {cue.explanation}
                        </Text>
                      </View>
                    ))}

                    {currentResult.explainableRackScore.deductionBreakdown.massAsymmetry.cues.map((cue, index) => (
                      <View key={`mass-deduction-${index}`} className="mb-2 p-3 rounded-lg" style={{ backgroundColor: "#4b5563" }}>
                        <Text className="text-white font-semibold text-sm mb-1">{cue.displayName}</Text>
                        <Text className="text-xs" style={{ color: "#d1d5db" }}>
                          {cue.explanation}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Point Enumeration (if available) */}
                {currentResult.explainableRackScore.pointEnumeration && (
                  <View className="mt-4 rounded-lg p-3" style={{ backgroundColor: "#1f2937" }}>
                    <Text className="text-white font-semibold mb-2">AI Point Counting Process</Text>
                    <Text className="text-xs leading-5" style={{ color: "#9ca3af" }}>
                      {currentResult.explainableRackScore.pointEnumeration.substring(0, 500)}
                      {currentResult.explainableRackScore.pointEnumeration.length > 500 ? "..." : ""}
                    </Text>
                  </View>
                )}
              </View>
            </CollapsibleSection>
          )}

          {/* Component Totals - Collapsible */}
          <CollapsibleSection
            title="Component Totals"
            icon="layers"
            iconColor="#22c55e"
            isExpanded={expandedSections.componentTotals}
            onToggle={() => toggleSection("componentTotals")}
            summary={`Beam: ${formatScore(score.totalMainBeamLength)}″ • Tines: ${formatScore(score.totalTineLength)}″`}
          >
            <View className="-mt-2">
              <ScoreRow label="Total Main Beam Length" value={formatScore(score.totalMainBeamLength)} />
              <ScoreRow label="Total Tine Length" value={formatScore(score.totalTineLength)} />
              <ScoreRow label="Total Mass (Circumferences)" value={formatScore(score.totalMass)} />
              <ScoreRow label="Inside Spread Credit" value={formatScore(score.spreadCredit)} />
            </View>
          </CollapsibleSection>

          {/* Detailed Measurements - Collapsible */}
          <CollapsibleSection
            title="Detailed Measurements"
            icon="resize"
            iconColor="#3b82f6"
            isExpanded={expandedSections.detailedMeasurements}
            onToggle={() => toggleSection("detailedMeasurements")}
            summary="All individual tine and beam measurements"
          >
            <View className="-mt-2">
              <MeasurementSection title="Main Beams" />
              <DetailRow
                label="Right Main Beam"
                value={formatScore(score.measurements.rightMainBeam.length)}
              />
              <DetailRow
                label="Left Main Beam"
                value={formatScore(score.measurements.leftMainBeam.length)}
              />

              <MeasurementSection title="Right Antler Tines" />
              {score.measurements.rightG1 && (
                <DetailRow label="G1 (Brow Tine)" value={formatScore(score.measurements.rightG1.length)} />
              )}
              {score.measurements.rightG2 && <DetailRow label="G2" value={formatScore(score.measurements.rightG2.length)} />}
              {score.measurements.rightG3 && <DetailRow label="G3" value={formatScore(score.measurements.rightG3.length)} />}
              {score.measurements.rightG4 && <DetailRow label="G4" value={formatScore(score.measurements.rightG4.length)} />}
              {score.measurements.rightG5 && <DetailRow label="G5" value={formatScore(score.measurements.rightG5.length)} />}
              {score.measurements.rightG6 && <DetailRow label="G6" value={formatScore(score.measurements.rightG6.length)} />}
              <View className="mt-2 bg-blue-500/10 rounded px-3 py-2">
                <Text className="text-blue-400 text-sm font-semibold">
                  Right Side Total: {score.measurements.rightSidePoints} points
                </Text>
              </View>

              <MeasurementSection title="Left Antler Tines" />
              {score.measurements.leftG1 && (
                <DetailRow label="G1 (Brow Tine)" value={formatScore(score.measurements.leftG1.length)} />
              )}
              {score.measurements.leftG2 && <DetailRow label="G2" value={formatScore(score.measurements.leftG2.length)} />}
              {score.measurements.leftG3 && <DetailRow label="G3" value={formatScore(score.measurements.leftG3.length)} />}
              {score.measurements.leftG4 && <DetailRow label="G4" value={formatScore(score.measurements.leftG4.length)} />}
              {score.measurements.leftG5 && <DetailRow label="G5" value={formatScore(score.measurements.leftG5.length)} />}
              {score.measurements.leftG6 && <DetailRow label="G6" value={formatScore(score.measurements.leftG6.length)} />}
              <View className="mt-2 bg-blue-500/10 rounded px-3 py-2">
                <Text className="text-blue-400 text-sm font-semibold">
                  Left Side Total: {score.measurements.leftSidePoints} points
                </Text>
              </View>

              <MeasurementSection title="Circumferences (Mass)" />
              <DetailRow
                label="Right H1"
                value={formatScore(score.measurements.rightCircumferences.h1 || 0)}
              />
              <DetailRow
                label="Right H2"
                value={formatScore(score.measurements.rightCircumferences.h2 || 0)}
              />
              <DetailRow
                label="Right H3"
                value={formatScore(score.measurements.rightCircumferences.h3 || 0)}
              />
              <DetailRow
                label="Right H4"
                value={formatScore(score.measurements.rightCircumferences.h4 || 0)}
              />
              <DetailRow
                label="Left H1"
                value={formatScore(score.measurements.leftCircumferences.h1 || 0)}
              />
              <DetailRow
                label="Left H2"
                value={formatScore(score.measurements.leftCircumferences.h2 || 0)}
              />
              <DetailRow
                label="Left H3"
                value={formatScore(score.measurements.leftCircumferences.h3 || 0)}
              />
              <DetailRow
                label="Left H4"
                value={formatScore(score.measurements.leftCircumferences.h4 || 0)}
              />

              <MeasurementSection title="Spread" />
              <DetailRow
                label="Inside Spread"
                value={formatScore(score.measurements.insideSpread)}
              />
              {score.measurements.greatestSpread && (
                <DetailRow
                  label="Greatest Spread"
                  value={formatScore(score.measurements.greatestSpread)}
                />
              )}

              <MeasurementSection title="Point Count" />
              <DetailRow label="Total Countable Points" value={score.measurements.totalPoints.toString()} noUnit />
              <DetailRow label="Abnormal Points" value={score.measurements.totalAbnormalPoints.toString()} noUnit />
            </View>
          </CollapsibleSection>

          {/* B&C Qualification - Collapsible */}
          <CollapsibleSection
            title="B&C Qualification"
            icon="trophy"
            iconColor={
              adjustedScore !== null
                ? (adjustedScore >= 160 || adjustedScore >= 185 ? "#22c55e" : "#6b7280")
                : (bcMinimum.typical || bcMinimum.nonTypical ? "#22c55e" : "#6b7280")
            }
            isExpanded={expandedSections.bcQualification}
            onToggle={() => toggleSection("bcQualification")}
            summary={
              adjustedScore !== null
                ? (adjustedScore >= 185 ? "Non-Typical Qualified (Adjusted)" : adjustedScore >= 160 ? "Typical Qualified (Adjusted)" : "Below minimum (Adjusted)")
                : (bcMinimum.typical ? "Typical Qualified" : bcMinimum.nonTypical ? "Non-Typical Qualified" : "Below minimum")
            }
          >
            <View className="-mt-2">
              {adjustedScore !== null && (
                <View className="bg-yellow-600/20 rounded-lg p-3 mb-4">
                  <View className="flex-row items-center">
                    <Ionicons name="calculator" size={16} color="#D4AF37" />
                    <Text className="text-yellow-300 text-sm ml-2">
                      Using adjusted score: {adjustedScore.toFixed(1)}&quot;
                    </Text>
                  </View>
                </View>
              )}
              <View className="flex-row items-center mb-2">
                <Ionicons
                  name={(adjustedScore !== null ? adjustedScore >= 160 : bcMinimum.typical) ? "checkmark-circle" : "close-circle"}
                  size={20}
                  color={(adjustedScore !== null ? adjustedScore >= 160 : bcMinimum.typical) ? "#22c55e" : "#666"}
                />
                <Text className={`ml-2 ${(adjustedScore !== null ? adjustedScore >= 160 : bcMinimum.typical) ? "text-green-500" : "text-gray-500"}`}>
                  Typical Minimum (160&quot;): {(adjustedScore !== null ? adjustedScore >= 160 : bcMinimum.typical) ? "Qualified" : "Not Met"}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons
                  name={(adjustedScore !== null ? adjustedScore >= 185 : bcMinimum.nonTypical) ? "checkmark-circle" : "close-circle"}
                  size={20}
                  color={(adjustedScore !== null ? adjustedScore >= 185 : bcMinimum.nonTypical) ? "#22c55e" : "#666"}
                />
                <Text className={`ml-2 ${(adjustedScore !== null ? adjustedScore >= 185 : bcMinimum.nonTypical) ? "text-green-500" : "text-gray-500"}`}>
                  Non-Typical Minimum (185&quot;): {(adjustedScore !== null ? adjustedScore >= 185 : bcMinimum.nonTypical) ? "Qualified" : "Not Met"}
                </Text>
              </View>
            </View>
          </CollapsibleSection>

          {/* Analysis Details - Collapsible */}
          <CollapsibleSection
            title="Analysis Details"
            icon="analytics"
            iconColor="#9ca3af"
            isExpanded={expandedSections.analysisDetails}
            onToggle={() => toggleSection("analysisDetails")}
            summary={`${fusedFrameCount} frames • ${(processingTime / 1000).toFixed(1)}s`}
          >
            <View className="-mt-2">
              <DetailRow label="Frames Analyzed" value={fusedFrameCount.toString()} noUnit />
              <DetailRow label="Processing Time" value={`${(processingTime / 1000).toFixed(1)}s`} noUnit />
              <DetailRow label="Scale Method" value={scale.method} noUnit />
              <DetailRow label="Scale Confidence" value={scale.confidence} noUnit />
              <DetailRow label="Cloud AI" value="GPT-4.1" noUnit />
              {cloudRefinementUsed && (
                <DetailRow label="Extra Refinement" value="Yes" noUnit />
              )}
            </View>
          </CollapsibleSection>

          {/* Run Age Analysis Button */}
          <Pressable
            onPress={async () => {
              if (!currentResult) return;

              console.log("[Results] Starting age analysis from rack result");

              // Switch to age estimation mode FIRST
              setAnalysisMode("age");

              // Small delay to ensure state updates
              await new Promise(resolve => setTimeout(resolve, 100));

              // Reset capture state and add existing frames
              startCapture();

              console.log("[Results] Adding frames:", currentResult.capturedFrames.length);
              currentResult.capturedFrames.forEach((frame) => {
                addFrame(frame);
              });

              // Small delay to ensure frames are added
              await new Promise(resolve => setTimeout(resolve, 100));

              // Start processing BEFORE navigation
              console.log("[Results] Starting processFrames");
              const processPromise = processFrames();

              // Navigate to processing screen immediately (processing will continue)
              navigation.navigate("Processing");

              // Wait for processing to complete
              try {
                await processPromise;
                console.log("[Results] processFrames completed successfully");
              } catch (error) {
                console.error("[Results] processFrames failed:", error);
              }
            }}
            className="bg-blue-600 rounded-xl py-4 items-center mb-6"
          >
            <View className="flex-row items-center justify-center mb-1">
              <Ionicons name="body" size={20} color="white" />
              <Text className="text-white text-lg font-bold ml-2">
                Run Full Age Analysis
              </Text>
            </View>
            <Text className="text-white/80 text-xs text-center">
              Get body-based age estimation with shooter/pass guidance
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Email Prompt Modal */}
      <EmailPrompt
        visible={showEmailPrompt}
        onDismiss={() => {
          setShowEmailPrompt(false);
          dismissEmailPrompt();
        }}
      />

      {/* Score Adjustment Modal */}
      <ScoreAdjustmentModal
        visible={showScoreAdjustment}
        onClose={() => setShowScoreAdjustment(false)}
        onConfirm={handleScoreAdjustmentConfirm}
        missedPointCount={manualCount - (score.measurements.totalPoints + score.measurements.totalAbnormalPoints)}
        currentNetScore={getValue(score.netNonTypical)}
        aiPointCount={score.measurements.totalPoints + score.measurements.totalAbnormalPoints}
        manualPointCount={manualCount}
        aiTineMeasurements={getAiTineMeasurements()}
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
              onPress={handleExportPDF}
              className="flex-row items-center p-4 rounded-xl mb-3"
              style={{ backgroundColor: "#5A6447" }}
            >
              <View className="w-12 h-12 rounded-full items-center justify-center mr-4" style={{ backgroundColor: "#D4AF37" }}>
                <Ionicons name="share-social" size={24} color="white" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-base">Share Analysis</Text>
                <Text className="text-sm" style={{ color: "#E5D4B8" }}>Share score, age, and photo</Text>
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

      {/* Sticky Bottom Action Bar */}
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
          {!showManualCounter && currentResult.capturedFrames && currentResult.capturedFrames.length > 0 && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowManualCounter(true);
                // Scroll to top so user can see the manual counter
                scrollViewRef.current?.scrollTo({ y: 0, animated: true });
              }}
              className="h-12 px-4 rounded-xl items-center justify-center flex-row"
              style={{ backgroundColor: "#8B7355" }}
            >
              <Ionicons name="finger-print" size={20} color="white" />
              <Text className="text-white font-semibold ml-2 text-sm">Recount</Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleNewScore}
            className="flex-1 rounded-xl py-3 items-center justify-center"
            style={{ backgroundColor: "#22c55e" }}
          >
            <Text className="text-white font-bold text-base">Score Another Deer</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

// Helper Components
const ZoomableImage: React.FC<{ imageUri: string }> = ({ imageUri }) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      // Limit zoom between 1x and 4x
      if (scale.value < 1) {
        scale.value = withSpring(1);
      } else if (scale.value > 4) {
        scale.value = withSpring(4);
      }
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        // Reset to original size
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        // Zoom in to 2x
        scale.value = withSpring(2);
        savedScale.value = 2;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View className="mb-6 rounded-2xl overflow-hidden bg-neutral-800">
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[{ width: "100%", height: 250 }]}>
          <Animated.Image
            source={{ uri: imageUri }}
            style={[{ width: "100%", height: "100%" }, animatedStyle]}
            resizeMode="cover"
          />
        </Animated.View>
      </GestureDetector>
      <View className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded">
        <Text className="text-white text-xs">Pinch to zoom</Text>
      </View>
    </View>
  );
};

const ConfidenceBadge: React.FC<{ confidence: ConfidenceLevel }> = ({ confidence }) => {
  const colors = {
    Low: "bg-yellow-500/20 text-yellow-500",
    Med: "bg-blue-500/20 text-blue-500",
    High: "bg-green-500/20 text-green-500",
  };

  return (
    <View className={`${colors[confidence]} px-3 py-1 rounded-full`}>
      <Text className={`${colors[confidence].split(" ")[1]} text-xs font-bold`}>{confidence}</Text>
    </View>
  );
};

const ScoreRow: React.FC<{ label: string; value: string; highlight?: boolean; deduction?: boolean }> = ({
  label,
  value,
  highlight,
  deduction,
}) => {
  return (
    <View className="flex-row justify-between items-center mb-3">
      <Text className={`${highlight ? "text-white font-semibold" : "text-gray-400"} text-base`}>
        {label}
      </Text>
      <Text
        className={`${
          highlight ? "text-white font-bold text-lg" : deduction ? "text-red-400" : "text-gray-300"
        }`}
      >
        {deduction && value !== "0" && "-"}
        {value}″
      </Text>
    </View>
  );
};

const DetailRow: React.FC<{ label: string; value: string; noUnit?: boolean }> = ({ label, value, noUnit }) => {
  return (
    <View className="flex-row justify-between items-center mb-2">
      <Text className="text-gray-400 text-sm">{label}</Text>
      <Text className="text-white text-sm">{value}{noUnit ? "" : '″'}</Text>
    </View>
  );
};

const MeasurementSection: React.FC<{ title: string }> = ({ title }) => {
  return (
    <View className="mt-4 mb-2">
      <Text className="text-white font-semibold text-base">{title}</Text>
      <View className="h-px bg-neutral-700 mt-2" />
    </View>
  );
};

// Collapsible Section Component
const CollapsibleSection: React.FC<{
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: string;
  iconColor?: string;
  summary?: string;
}> = ({ title, isExpanded, onToggle, children, icon, iconColor = "#D4AF37", summary }) => {
  return (
    <View className="bg-neutral-800 rounded-xl mb-4 overflow-hidden">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between p-5"
      >
        <View className="flex-row items-center flex-1">
          {icon && (
            <Ionicons name={icon as any} size={20} color={iconColor} style={{ marginRight: 8 }} />
          )}
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">{title}</Text>
            {!isExpanded && summary && (
              <Text className="text-gray-400 text-sm mt-1" numberOfLines={1}>{summary}</Text>
            )}
          </View>
        </View>
        <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: "#3D4A2F" }}>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
            color="#D4AF37"
          />
        </View>
      </Pressable>
      {isExpanded && (
        <View className="px-5 pb-5 pt-0">
          {children}
        </View>
      )}
    </View>
  );
};
