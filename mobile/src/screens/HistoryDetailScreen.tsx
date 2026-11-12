/**
 * History Detail Screen - View full scorecard from history
 */

import React from "react";
import { View, Text, ScrollView, Pressable, Share, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { formatScore, meetsBooneAndCrockettMinimum } from "../utils/boone-crockett-calculator";
import { ConfidenceLevel, MeasurementRange, DeerScoringResult } from "../types/deer-scoring";
import { format } from "date-fns";

type NavigationProp = NativeStackNavigationProp<any>;

export const HistoryDetailScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const result = (route.params as { result: DeerScoringResult }).result;

  if (!result) {
    navigation.goBack();
    return null;
  }

  const { score, age, scale, fusedFrameCount, processingTime, cloudRefinementUsed, timestamp, capturedFrames, manualPointCount, manualOverride, analysisMode, explainableAge, explainableRackScore } = result;
  const bcMinimum = meetsBooneAndCrockettMinimum(score);

  // Determine if this is age mode or rack mode
  const isAgeMode = analysisMode === "age";
  const isRackMode = analysisMode === "score";

  // Use manual count if override is active, otherwise use AI count
  const displayedPointCount = manualOverride && manualPointCount
    ? manualPointCount
    : score.measurements.totalPoints + score.measurements.totalAbnormalPoints;

  const getValue = (measurement: number | MeasurementRange | undefined): number => {
    if (!measurement) return 0;
    if (typeof measurement === "number") return measurement;
    return measurement.average;
  };

  const handleExportPDF = async () => {
    // Get the image URI from captured frames
    const imageUri = capturedFrames[0]?.imageUri;

    if (isAgeMode) {
      const message = `Deer Age Analysis:\nEstimated Age: ${explainableAge?.estimatedAge || age.estimatedAge}\nConfidence: ${explainableAge?.overallConfidence ? explainableAge.overallConfidence + "%" : age.confidence}\nRecommendation: ${explainableAge?.shooterPassLabel || "N/A"}\nQuick Rack Estimate: ~${displayedPointCount}pt`;

      try {
        await Share.share({
          message,
          url: imageUri, // Include the photo
        });
      } catch (error) {
        console.error("Share failed:", error);
      }
    } else {
      const message = `Deer Score Summary:\nNet Typical: ${formatScore(score.netTypical)}\nNet Non-Typical: ${formatScore(score.netNonTypical)}\nTotal Points: ${displayedPointCount}\nEstimated Age: ${age.estimatedAge}\nConfidence: ${score.overallConfidence}`;

      try {
        await Share.share({
          message,
          url: imageUri, // Include the photo
        });
      } catch (error) {
        console.error("Share failed:", error);
      }
    }
  };

  return (
    <View className="flex-1 bg-neutral-900" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => navigation.goBack()} className="w-10 h-10 items-center justify-center">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text className="text-white text-lg font-bold">Scorecard</Text>
          <Pressable onPress={handleExportPDF} className="w-10 h-10 items-center justify-center">
            <Ionicons name="share-outline" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="px-6 py-6">
          {/* Image Preview */}
          {capturedFrames[0]?.imageUri && (
            <View className="mb-6 rounded-xl overflow-hidden">
              <Image
                source={{ uri: capturedFrames[0].imageUri }}
                style={{ width: "100%", height: 250 }}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Date & Mode Badge */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Ionicons name="calendar" size={16} color="#666" />
              <Text className="text-gray-400 text-sm ml-2">
                {format(new Date(timestamp), "MMMM d, yyyy 'at' h:mm a")}
              </Text>
            </View>
            <View
              className={`px-3 py-1.5 rounded-lg flex-row items-center ${
                isAgeMode ? "bg-blue-600" : "bg-orange-600"
              }`}
            >
              <Ionicons
                name={isAgeMode ? "body" : "ribbon"}
                size={14}
                color="white"
                style={{ marginRight: 6 }}
              />
              <Text className="text-white text-xs font-bold">
                {isAgeMode ? "AGE MY DEER" : "SCORE MY RACK"}
              </Text>
            </View>
          </View>

          {isAgeMode ? (
            // AGE MODE SCORECARD
            <>
              {/* Primary Age Result */}
              <View className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 mb-6">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-white/80 text-sm font-medium">ESTIMATED AGE</Text>
                  {explainableAge?.overallConfidence ? (
                    <View className="bg-white/20 px-3 py-1 rounded-full">
                      <Text className="text-white text-xs font-bold">{explainableAge.overallConfidence}% Confident</Text>
                    </View>
                  ) : (
                    <ConfidenceBadge confidence={age.confidence} />
                  )}
                </View>
                <Text className="text-white text-5xl font-bold mb-3">
                  {explainableAge?.estimatedAge || age.estimatedAge}
                </Text>
                {explainableAge?.shooterPassLabel && (
                  <View className="flex-row items-center mt-2">
                    <View
                      className="px-3 py-1.5 rounded-lg"
                      style={{
                        backgroundColor:
                          explainableAge.shooterPassLabel === "SHOOTER"
                            ? "#22c55e"
                            : explainableAge.shooterPassLabel === "NICE HARVEST" || explainableAge.shooterPassLabel === "NICE MOUNT"
                            ? "#3b82f6"
                            : "#f59e0b",
                      }}
                    >
                      <Text className="text-white text-sm font-bold">{explainableAge.shooterPassLabel}</Text>
                    </View>
                  </View>
                )}
                <Text className="text-white/70 text-sm mt-3">{age.regionalPrior || "Based on body and antler characteristics"}</Text>
              </View>

              {/* Age Characteristics (if explainable age available) */}
              {explainableAge && explainableAge.detectedCues && explainableAge.detectedCues.length > 0 && (
                <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                  <View className="flex-row items-center mb-4">
                    <Ionicons name="bulb" size={20} color="#a855f7" />
                    <Text className="text-white text-lg font-bold ml-2">What We Observed</Text>
                  </View>
                  {explainableAge.detectedCues.slice(0, 5).map((cue, idx) => (
                    <View key={idx} className="mb-3">
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-white text-sm font-semibold">{cue.displayName}</Text>
                        <Text className="text-gray-400 text-xs">{cue.confidence}% sure</Text>
                      </View>
                      <Text className="text-gray-400 text-xs leading-relaxed">{cue.explanation}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Quick Rack Summary */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Quick Rack Summary</Text>
                <View className="flex-row items-center justify-between">
                  <Text className="text-gray-400 text-sm">Estimated Points</Text>
                  <Text className="text-white text-2xl font-bold">~{displayedPointCount}pt</Text>
                </View>
                <View className="flex-row items-center justify-between mt-3">
                  <Text className="text-gray-400 text-sm">Estimated B&C Score</Text>
                  <Text className="text-white text-lg font-semibold">
                    ~{getValue(score.recommendedCategory === "Typical" ? score.netTypical : score.netNonTypical).toFixed(0)}&quot;
                  </Text>
                </View>
                <Text className="text-gray-500 text-xs mt-3">
                  Note: For precise scoring, use &quot;Score My Rack&quot; mode
                </Text>
              </View>
            </>
          ) : (
            // RACK MODE SCORECARD
            <>
              {/* Primary Score Result */}
              <View className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 mb-6">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-white/80 text-sm font-medium">RECOMMENDED CATEGORY</Text>
                  <ConfidenceBadge confidence={score.overallConfidence} />
                </View>
                <Text className="text-white text-3xl font-bold mb-2">{score.recommendedCategory}</Text>
                <View className="flex-row items-baseline">
                  <Text className="text-white text-5xl font-bold">
                    {getValue(score.recommendedCategory === "Typical" ? score.netTypical : score.netNonTypical).toFixed(1)}
                  </Text>
                  <Text className="text-white/80 text-xl ml-2">inches</Text>
                </View>
                <Text className="text-white/70 text-sm mt-3">Net {score.recommendedCategory} Score</Text>
              </View>

              {/* Point Count - Prominent Display */}
              <View className="bg-blue-600 rounded-xl p-5 mb-6">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Ionicons name="git-branch" size={24} color="white" />
                    <Text className="text-white text-lg font-bold ml-2">Point Count</Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-1">
                    <View className="flex-row items-center mb-1">
                      <Text className="text-white/80 text-sm">Total Points</Text>
                      {manualOverride && (
                        <View className="ml-2 bg-green-600 px-2 py-0.5 rounded">
                          <Text className="text-white text-xs font-bold">Manual Count</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-white text-4xl font-bold">
                      {displayedPointCount}
                    </Text>
                    <Text className="text-white/60 text-xs mt-1">
                      {manualOverride ? (
                        <>User verified count</>
                      ) : (
                        <>({score.measurements.totalPoints} normal + {score.measurements.totalAbnormalPoints} abnormal)</>
                      )}
                    </Text>
                  </View>
                  {score.measurements.totalAbnormalPoints > 0 && (
                    <View className="flex-1 items-end">
                      <Text className="text-white/80 text-sm mb-1">Abnormal Points</Text>
                      <Text className="text-yellow-300 text-4xl font-bold">{score.measurements.totalAbnormalPoints}</Text>
                      <Text className="text-yellow-200 text-xs mt-1">
                        {score.measurements.totalAbnormalPoints >= 8 ? "Highly Non-Typical" : "Non-Typical"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Explainable Rack Scoring */}
              {explainableRackScore && explainableRackScore.detectedCues && explainableRackScore.detectedCues.length > 0 && (
                <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                  <View className="flex-row items-center mb-4">
                    <Ionicons name="bulb" size={20} color="#a855f7" />
                    <Text className="text-white text-lg font-bold ml-2">Score Breakdown Explained</Text>
                  </View>
                  {explainableRackScore.detectedCues
                    .filter(c => Math.abs(c.contribution) > 1) // Only show significant contributors
                    .slice(0, 6)
                    .map((cue, idx) => (
                      <View key={idx} className="mb-3">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-white text-sm font-semibold">{cue.displayName}</Text>
                          <Text className={`text-sm font-bold ${cue.contribution >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {cue.contribution >= 0 ? "+" : ""}{cue.contribution.toFixed(1)}&quot;
                          </Text>
                        </View>
                        <Text className="text-gray-400 text-xs">{cue.detectedMeasurement}</Text>
                      </View>
                    ))}
                </View>
              )}

              {/* Score Breakdown */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Score Breakdown</Text>
                <ScoreRow label="Gross Typical" value={formatScore(score.grossTypical)} />
                <ScoreRow label="Gross Non-Typical" value={formatScore(score.grossNonTypical)} />
                <View className="h-px bg-neutral-700 my-3" />
                <ScoreRow label="Net Typical" value={formatScore(score.netTypical)} highlight />
                <ScoreRow label="Net Non-Typical" value={formatScore(score.netNonTypical)} highlight />
                <View className="h-px bg-neutral-700 my-3" />
                <ScoreRow label="Symmetry Deductions" value={formatScore(score.symmetryDeductions)} deduction />
                <ScoreRow label="Abnormal Points Total" value={formatScore(score.abnormalPointsTotal)} />
              </View>

              {/* Component Measurements */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Component Totals</Text>
                <ScoreRow label="Total Main Beam Length" value={formatScore(score.totalMainBeamLength)} />
                <ScoreRow label="Total Tine Length" value={formatScore(score.totalTineLength)} />
                <ScoreRow label="Total Mass (Circumferences)" value={formatScore(score.totalMass)} />
                <ScoreRow label="Inside Spread Credit" value={formatScore(score.spreadCredit)} />
              </View>

              {/* Quick Age Summary */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Quick Age Estimate</Text>
                <View className="flex-row items-center justify-between">
                  <Text className="text-gray-400 text-sm">Estimated Age</Text>
                  <Text className="text-white text-2xl font-bold">{age.estimatedAge}</Text>
                </View>
                <Text className="text-gray-500 text-xs mt-3">
                  Note: For precise age estimation, use &quot;Age My Deer&quot; mode
                </Text>
              </View>

              {/* B&C Qualification */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Boone & Crockett Qualification</Text>
                <View className="flex-row items-center mb-2">
                  <Ionicons
                    name={bcMinimum.typical ? "checkmark-circle" : "close-circle"}
                    size={20}
                    color={bcMinimum.typical ? "#22c55e" : "#666"}
                  />
                  <Text className={`ml-2 text-sm ${bcMinimum.typical ? "text-green-400" : "text-gray-500"}`}>
                    Typical Minimum (160&quot;): {bcMinimum.typical ? "Qualified" : "Not Qualified"}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons
                    name={bcMinimum.nonTypical ? "checkmark-circle" : "close-circle"}
                    size={20}
                    color={bcMinimum.nonTypical ? "#22c55e" : "#666"}
                  />
                  <Text className={`ml-2 text-sm ${bcMinimum.nonTypical ? "text-green-400" : "text-gray-500"}`}>
                    Non-Typical Minimum (185&quot;): {bcMinimum.nonTypical ? "Qualified" : "Not Qualified"}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Analysis Details - Common to both modes */}
          <View className="bg-neutral-800 rounded-xl p-5 mb-6">
            <Text className="text-white text-lg font-bold mb-4">Analysis Details</Text>
            <DetailRow label="Frames Analyzed" value={fusedFrameCount.toString()} />
            <DetailRow label="Processing Time" value={`${(processingTime / 1000).toFixed(1)}s`} />
            <DetailRow label="Scale Method" value={scale.method} />
            <DetailRow label="Scale Confidence" value={scale.confidence} />
            <DetailRow label="Cloud AI" value="GPT-4.1" />
            {cloudRefinementUsed && (
              <DetailRow label="Extra Refinement" value="Yes" />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

// Reuse components from ResultsScreen
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

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <View className="flex-row justify-between items-center mb-2">
      <Text className="text-gray-400 text-sm">{label}</Text>
      <Text className="text-white text-sm">{value}</Text>
    </View>
  );
};

const ScoreRow: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
  deduction?: boolean;
}> = ({ label, value, highlight, deduction }) => {
  return (
    <View className="flex-row justify-between items-center mb-2">
      <Text
        className={`text-sm ${
          highlight ? "text-white font-semibold" : deduction ? "text-red-400" : "text-gray-400"
        }`}
      >
        {label}
      </Text>
      <Text
        className={`text-sm font-mono ${
          highlight ? "text-white font-bold text-lg" : deduction ? "text-red-400" : "text-gray-300"
        }`}
      >
        {value}
      </Text>
    </View>
  );
};
