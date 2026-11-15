/**
 * Score Adjustment Modal
 * Allows users to adjust B&C score based on manual point count differences
 * Handles both over-counted (AI counted too many) and under-counted (AI missed) scenarios
 */

import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface MissedTineCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  suggestedRange: string;
}

const MISSED_TINE_CATEGORIES: MissedTineCategory[] = [
  {
    id: "stickers",
    name: "Short Stickers/Kickers",
    description: "Small offshoots from main tines, typically 1-3 inches",
    icon: "flash-outline",
    suggestedRange: "1-3",
  },
  {
    id: "drop",
    name: "Drop Tines",
    description: "Tines growing downward, can vary widely in length",
    icon: "arrow-down-outline",
    suggestedRange: "3-12",
  },
  {
    id: "hidden",
    name: "Hidden Behind Other Tines",
    description: "Longer tines obscured by angle or overlapping antlers",
    icon: "eye-off-outline",
    suggestedRange: "4-10",
  },
  {
    id: "background",
    name: "Lost in Background",
    description: "Tines difficult to distinguish from brush/trees",
    icon: "leaf-outline",
    suggestedRange: "3-8",
  },
];

const OVERCOUNTED_CATEGORIES = [
  {
    id: "split_counted",
    name: "Split Tines Double-Counted",
    description: "AI may have counted forked tine as two separate points",
    icon: "git-branch-outline",
    suggestedRange: "3-8",
  },
  {
    id: "shadow_tine",
    name: "Shadow or Reflection",
    description: "AI detected a shadow or reflection as a tine",
    icon: "contrast-outline",
    suggestedRange: "2-6",
  },
  {
    id: "background_branch",
    name: "Background Branch/Debris",
    description: "AI mistook background branches for antler tines",
    icon: "leaf-outline",
    suggestedRange: "3-10",
  },
  {
    id: "burr_counted",
    name: "Burr or Base Irregularity",
    description: "AI counted burr or base protrusion as a point",
    icon: "ellipse-outline",
    suggestedRange: "1-3",
  },
];

interface TineMeasurement {
  length: number;
  side: "left" | "right";
}

interface ScoreAdjustmentModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (averageLength: number, adjustedScore: number, explanation: string) => void;
  missedPointCount: number;
  currentNetScore: number;
  aiPointCount: number;
  manualPointCount: number;
  /** AI's individual tine measurements - used to calculate average length for over-count adjustments */
  aiTineMeasurements?: TineMeasurement[];
}

export const ScoreAdjustmentModal: React.FC<ScoreAdjustmentModalProps> = ({
  visible,
  onClose,
  onConfirm,
  missedPointCount,
  currentNetScore,
  aiPointCount,
  manualPointCount,
  aiTineMeasurements,
}) => {
  const insets = useSafeAreaInsets();
  const [averageLength, setAverageLength] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const isOverCounted = missedPointCount < 0;
  const pointDifference = Math.abs(missedPointCount);

  // For over-count scenarios, calculate the average tine length from AI measurements
  const aiCalculatedAvgLength = React.useMemo(() => {
    if (!isOverCounted || !aiTineMeasurements || aiTineMeasurements.length === 0) {
      return null;
    }
    const totalLength = aiTineMeasurements.reduce((sum, t) => sum + t.length, 0);
    return totalLength / aiTineMeasurements.length;
  }, [isOverCounted, aiTineMeasurements]);

  // For over-count, use AI-calculated average; for under-count, use user input
  const numericLength = isOverCounted && aiCalculatedAvgLength
    ? aiCalculatedAvgLength
    : parseFloat(averageLength) || 0;
  const adjustmentAmount = pointDifference * numericLength;
  const adjustedScore = isOverCounted
    ? currentNetScore - adjustmentAmount
    : currentNetScore + adjustmentAmount;

  const categories = isOverCounted ? OVERCOUNTED_CATEGORIES : MISSED_TINE_CATEGORIES;

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    // For over-count with AI data, use auto-calculated length; otherwise require user input
    const effectiveLength = isOverCounted && aiCalculatedAvgLength
      ? aiCalculatedAvgLength
      : parseFloat(averageLength) || 0;

    if (effectiveLength <= 0) return;

    const categoryNames = selectedCategories
      .map((id) => categories.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");

    const effectiveAdjustment = pointDifference * effectiveLength;
    const effectiveAdjustedScore = isOverCounted
      ? currentNetScore - effectiveAdjustment
      : currentNetScore + effectiveAdjustment;

    let explanation: string;
    if (isOverCounted) {
      explanation =
        `AI detected ${aiPointCount} points. You counted ${manualPointCount} points (${pointDifference} fewer). ` +
        `Using AI's average tine length of ${effectiveLength.toFixed(1)}" for phantom points: ` +
        `${pointDifference} points × ${effectiveLength.toFixed(1)}" = -${effectiveAdjustment.toFixed(1)}" removed from score.` +
        (categoryNames ? ` Over-count reasons: ${categoryNames}.` : "");
    } else {
      explanation =
        `AI detected ${aiPointCount} points. You counted ${manualPointCount} points (+${pointDifference} additional). ` +
        `Using your estimate of ${effectiveLength.toFixed(1)}" average length for missed tines: ` +
        `${pointDifference} points × ${effectiveLength.toFixed(1)}" = +${effectiveAdjustment.toFixed(1)}" added to score.` +
        (categoryNames ? ` Missed tine types: ${categoryNames}.` : "");
    }

    onConfirm(effectiveLength, effectiveAdjustedScore, explanation);
  };

  const getSuggestedAverage = () => {
    if (selectedCategories.length === 0) return null;

    let totalMin = 0;
    let totalMax = 0;
    selectedCategories.forEach((id) => {
      const cat = categories.find((c) => c.id === id);
      if (cat) {
        const [min, max] = cat.suggestedRange.split("-").map(Number);
        totalMin += min;
        totalMax += max;
      }
    });

    const avgMin = totalMin / selectedCategories.length;
    const avgMax = totalMax / selectedCategories.length;
    return { min: avgMin.toFixed(1), max: avgMax.toFixed(1) };
  };

  const suggested = getSuggestedAverage();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/80 justify-end">
        <View
          className="bg-neutral-900 rounded-t-3xl"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between p-4 border-b border-neutral-700">
            <View className="flex-row items-center">
              <Ionicons name="calculator" size={24} color="#D4AF37" />
              <Text className="text-white text-lg font-bold ml-2">
                Adjust B&C Score
              </Text>
            </View>
            <Pressable onPress={onClose} className="p-2">
              <Ionicons name="close" size={24} color="#9ca3af" />
            </Pressable>
          </View>

          <ScrollView className="max-h-96">
            <View className="p-4">
              {/* Difference Summary */}
              <View className={`${isOverCounted ? "bg-orange-600/20" : "bg-blue-600/20"} rounded-xl p-4 mb-4`}>
                <Text className={`${isOverCounted ? "text-orange-400" : "text-blue-400"} font-semibold mb-2`}>
                  {isOverCounted ? "AI Over-Counted Points" : "AI Missed Points"}
                </Text>
                <View className="flex-row items-center justify-between">
                  <View className="items-center">
                    <Text className="text-gray-400 text-xs">AI Count</Text>
                    <Text className="text-white text-2xl font-bold">
                      {aiPointCount}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={20} color={isOverCounted ? "#fb923c" : "#60a5fa"} />
                  <View className="items-center">
                    <Text className="text-gray-400 text-xs">Your Count</Text>
                    <Text className="text-white text-2xl font-bold">
                      {manualPointCount}
                    </Text>
                  </View>
                  <Ionicons name={isOverCounted ? "remove" : "add"} size={20} color={isOverCounted ? "#fb923c" : "#22c55e"} />
                  <View className="items-center">
                    <Text className="text-gray-400 text-xs">{isOverCounted ? "Over" : "Missed"}</Text>
                    <Text className={`${isOverCounted ? "text-orange-400" : "text-green-400"} text-2xl font-bold`}>
                      {isOverCounted ? `-${pointDifference}` : `+${pointDifference}`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Why the difference? - Only show for under-count (optional context) */}
              {!isOverCounted && (
                <>
                  <Text className="text-white font-semibold mb-2">
                    Why were these points missed? (optional)
                  </Text>
                  <Text className="text-gray-400 text-xs mb-3">
                    Select the types that apply - helps estimate length
                  </Text>

                  <View className="gap-2 mb-4">
                    {categories.map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => toggleCategory(category.id)}
                        className={`flex-row items-center p-3 rounded-lg border ${
                          selectedCategories.includes(category.id)
                            ? "border-green-500 bg-green-500/10"
                            : "border-neutral-700 bg-neutral-800"
                        }`}
                      >
                        <Ionicons
                          name={category.icon as any}
                          size={20}
                          color={
                            selectedCategories.includes(category.id)
                              ? "#22c55e"
                              : "#9ca3af"
                          }
                        />
                        <View className="flex-1 ml-3">
                          <Text className="text-white text-sm font-medium">
                            {category.name}
                          </Text>
                          <Text className="text-gray-400 text-xs">
                            {category.description}
                          </Text>
                        </View>
                        <Text className="text-gray-500 text-xs">
                          {category.suggestedRange}&quot;
                        </Text>
                        {selectedCategories.includes(category.id) && (
                          <Ionicons
                            name="checkmark-circle"
                            size={20}
                            color="#22c55e"
                            style={{ marginLeft: 8 }}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Over-count: Show auto-calculated average from AI */}
              {isOverCounted && aiCalculatedAvgLength && (
                <View className="bg-orange-600/20 rounded-xl p-4 mb-4">
                  <View className="flex-row items-center mb-2">
                    <Ionicons name="calculator" size={18} color="#fb923c" />
                    <Text className="text-orange-400 font-semibold ml-2">
                      Auto-Calculated Adjustment
                    </Text>
                  </View>
                  <Text className="text-gray-300 text-sm mb-2">
                    Using the average tine length from AI measurements to subtract phantom points:
                  </Text>
                  <View className="bg-neutral-800 rounded-lg p-3">
                    <Text className="text-white text-center">
                      Average tine length: <Text className="font-bold text-orange-400">{aiCalculatedAvgLength.toFixed(1)}&quot;</Text>
                    </Text>
                  </View>
                </View>
              )}

              {/* Over-count without AI data: Show warning */}
              {isOverCounted && !aiCalculatedAvgLength && (
                <View className="bg-yellow-600/20 rounded-xl p-4 mb-4">
                  <View className="flex-row items-center mb-2">
                    <Ionicons name="warning" size={18} color="#fbbf24" />
                    <Text className="text-yellow-400 font-semibold ml-2">
                      Manual Estimate Required
                    </Text>
                  </View>
                  <Text className="text-gray-300 text-sm">
                    AI measurement data not available. Please estimate the average length of the phantom points below.
                  </Text>
                </View>
              )}

              {/* Average Length Input - Only for under-count OR over-count without AI data */}
              {(!isOverCounted || !aiCalculatedAvgLength) && (
                <>
                  <Text className="text-white font-semibold mb-2">
                    {isOverCounted
                      ? "Estimated Average Length of Over-Counted Points"
                      : "Estimated Average Length of Missed Tines"}
                  </Text>
                  {suggested && (
                    <Text className="text-green-400 text-xs mb-2">
                      Based on your selections, suggested range: {suggested.min}&quot; -{" "}
                      {suggested.max}&quot;
                    </Text>
                  )}

                  <View className="flex-row items-center bg-neutral-800 rounded-xl px-4 py-3 mb-4">
                    <TextInput
                      value={averageLength}
                      onChangeText={setAverageLength}
                      placeholder="Enter inches (e.g., 4.5)"
                      placeholderTextColor="#6b7280"
                      keyboardType="decimal-pad"
                      className="flex-1 text-white text-lg"
                      style={{ fontSize: 18 }}
                    />
                    <Text className="text-gray-400 text-lg ml-2">inches</Text>
                  </View>

                  {/* Quick select buttons */}
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {[2, 3, 4, 5, 6, 8].map((val) => (
                      <Pressable
                        key={val}
                        onPress={() => setAverageLength(val.toString())}
                        className={`px-4 py-2 rounded-full ${
                          averageLength === val.toString()
                            ? isOverCounted ? "bg-orange-600" : "bg-green-600"
                            : "bg-neutral-700"
                        }`}
                      >
                        <Text className="text-white font-medium">{val}&quot;</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {/* Score Preview */}
              {numericLength > 0 && (
                <View className={`${isOverCounted ? "bg-orange-600/20" : "bg-green-600/20"} rounded-xl p-4 mb-4`}>
                  <Text className={`${isOverCounted ? "text-orange-400" : "text-green-400"} font-semibold mb-3`}>
                    Adjusted Score Preview
                  </Text>

                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-gray-300">Current AI Score:</Text>
                    <Text className="text-white font-bold">
                      {currentNetScore.toFixed(1)}&quot;
                    </Text>
                  </View>

                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-gray-300">
                      {isOverCounted ? "Reduction" : "Additional"} ({pointDifference} × {numericLength.toFixed(1)}&quot;):
                    </Text>
                    <Text className={`${isOverCounted ? "text-orange-400" : "text-green-400"} font-bold`}>
                      {isOverCounted ? `-${adjustmentAmount.toFixed(1)}` : `+${adjustmentAmount.toFixed(1)}`}&quot;
                    </Text>
                  </View>

                  <View className="h-px bg-neutral-600 my-2" />

                  <View className="flex-row items-center justify-between">
                    <Text className="text-white font-semibold">
                      Adjusted Estimate:
                    </Text>
                    <Text className={`${isOverCounted ? "text-orange-400" : "text-green-400"} text-2xl font-bold`}>
                      {adjustedScore.toFixed(1)}&quot;
                    </Text>
                  </View>
                </View>
              )}

              {/* Disclaimer */}
              <View className="bg-yellow-600/10 rounded-lg p-3 mb-4">
                <View className="flex-row items-start">
                  <Ionicons
                    name="information-circle"
                    size={18}
                    color="#fbbf24"
                  />
                  <Text className="text-yellow-200 text-xs ml-2 flex-1">
                    This adjusted score is an estimate based on your input. For
                    official B&C scoring, all tines must be physically measured
                    by a certified scorer.
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View className="px-4 gap-2">
            <Pressable
              onPress={handleConfirm}
              disabled={numericLength <= 0}
              className={`rounded-xl py-4 items-center ${
                numericLength > 0
                  ? isOverCounted ? "bg-orange-600" : "bg-green-600"
                  : "bg-neutral-700"
              }`}
            >
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={20} color="white" />
                <Text className="text-white font-bold ml-2">
                  Update to Adjusted Score
                </Text>
              </View>
              {numericLength > 0 && (
                <Text className="text-white/80 text-xs mt-1">
                  {currentNetScore.toFixed(1)}&quot; → {adjustedScore.toFixed(1)}&quot;
                </Text>
              )}
            </Pressable>

            <Pressable onPress={onClose} className="py-3 items-center">
              <Text className="text-gray-400">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};
