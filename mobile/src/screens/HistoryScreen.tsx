/**
 * History Screen - View all analyzed deer
 * Now includes distance display
 */

import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { formatScore } from "../utils/boone-crockett-calculator";
import { DeerScoringResult } from "../types/deer-scoring";
import { format } from "date-fns";
import { ErrorModal } from "../components/ErrorModal";
import { DistanceChip } from "../components/DistanceDisplay";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";

type NavigationProp = NativeStackNavigationProp<any>;

export const HistoryScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const { history, deleteFromHistory, clearHistory } = useDeerScoringStore();
  const [activeTab, setActiveTab] = useState<"all" | "age" | "score">("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Filter history based on active tab
  const filteredHistory = history.filter((result) => {
    if (activeTab === "all") return true;
    return result.analysisMode === activeTab;
  });

  const ageCount = history.filter((r) => r.analysisMode === "age").length;
  const scoreCount = history.filter((r) => r.analysisMode === "score").length;

  const handleViewDetails = (result: DeerScoringResult) => {
    navigation.navigate("HistoryDetail", { result });
  };

  const handleDelete = (analysisId: string) => {
    setDeleteTargetId(analysisId);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (deleteTargetId) {
      deleteFromHistory(deleteTargetId);
      setDeleteTargetId(null);
    }
  };

  const handleClearAll = () => {
    setShowClearAllModal(true);
  };

  return (
    <View className="flex-1 bg-neutral-900" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-neutral-800">
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <Pressable onPress={() => navigation.goBack()} className="w-10 h-10 items-center justify-center mr-2">
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </Pressable>
            <Text className="text-white text-lg font-bold">History</Text>
          </View>
          {history.length > 0 && (
            <Pressable onPress={handleClearAll} className="px-4 py-2">
              <Text className="text-red-500 text-sm font-semibold">Clear All</Text>
            </Pressable>
          )}
        </View>

        {/* Tab Selector */}
        <View className="flex-row bg-neutral-800 rounded-lg p-1">
          <Pressable
            onPress={() => setActiveTab("all")}
            className={`flex-1 py-2 px-3 rounded-md ${activeTab === "all" ? "bg-green-600" : ""}`}
          >
            <Text className={`text-center text-sm font-semibold ${activeTab === "all" ? "text-white" : "text-gray-400"}`}>
              All ({history.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("age")}
            className={`flex-1 py-2 px-3 rounded-md ${activeTab === "age" ? "bg-blue-600" : ""}`}
          >
            <Text className={`text-center text-sm font-semibold ${activeTab === "age" ? "text-white" : "text-gray-400"}`}>
              Age ({ageCount})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab("score")}
            className={`flex-1 py-2 px-3 rounded-md ${activeTab === "score" ? "bg-orange-600" : ""}`}
          >
            <Text className={`text-center text-sm font-semibold ${activeTab === "score" ? "text-white" : "text-gray-400"}`}>
              Rack ({scoreCount})
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {filteredHistory.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-24 h-24 bg-neutral-800 rounded-full items-center justify-center mb-6">
            <Ionicons name="file-tray-outline" size={48} color="#666" />
          </View>
          <Text className="text-white text-xl font-bold mb-2">
            {history.length === 0 ? "No History Yet" : `No ${activeTab === "age" ? "Age" : "Rack"} Analyses`}
          </Text>
          <Text className="text-gray-400 text-center mb-8">
            {history.length === 0
              ? "Analyzed deer will appear here. Start by scoring your first deer!"
              : `Switch to the "${activeTab === "age" ? "Rack" : "Age"}" tab to see other analyses.`}
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Home", { screen: "HomeMain" })}
            className="bg-green-600 rounded-xl py-3 px-6"
          >
            <Text className="text-white text-base font-bold">Score a Deer</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView className="flex-1">
          <View className="px-6 py-4">
            <Text className="text-gray-400 text-sm mb-4">
              {`${filteredHistory.length} ${filteredHistory.length === 1 ? "entry" : "entries"}`}
              {activeTab !== "all" && ` - ${activeTab === "age" ? "Age My Deer" : "Score My Rack"}`}
            </Text>

            {filteredHistory.length > 0 ? (
              filteredHistory.map((result, index) => (
                <HistoryCard
                  key={`${result.analysisId}-${index}`}
                  result={result}
                  onPress={() => handleViewDetails(result)}
                  onDelete={() => handleDelete(result.analysisId)}
                />
              ))
            ) : (
              <Text className="text-gray-400 text-center mt-8">
                No history entries yet
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      {/* Delete Confirmation Modal */}
      <ErrorModal
        visible={showDeleteModal}
        title="Delete Entry"
        message="Are you sure you want to delete this deer analysis?"
        type="confirm"
        onDismiss={() => {
          setShowDeleteModal(false);
          setDeleteTargetId(null);
        }}
        onConfirm={confirmDelete}
        confirmText="Delete"
        cancelText="Cancel"
      />

      {/* Clear All Confirmation Modal */}
      <ErrorModal
        visible={showClearAllModal}
        title="Clear All History"
        message="Are you sure you want to delete all deer analyses? This cannot be undone."
        type="confirm"
        onDismiss={() => setShowClearAllModal(false)}
        onConfirm={clearHistory}
        confirmText="Clear All"
        cancelText="Cancel"
      />
    </View>
  );
};

interface HistoryCardProps {
  result: DeerScoringResult;
  onPress: () => void;
  onDelete: () => void;
}

const HistoryCard: React.FC<HistoryCardProps> = ({ result, onPress, onDelete }) => {
  // Swipe-to-delete gesture - hooks must be called before any conditional returns
  const translateX = useSharedValue(0);
  const DELETE_THRESHOLD = -80;

  const triggerHapticAndDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      // Only allow swipe left
      if (event.translationX < 0) {
        translateX.value = Math.max(event.translationX, -120);
      }
    })
    .onEnd(() => {
      if (translateX.value < DELETE_THRESHOLD) {
        // Trigger delete
        runOnJS(triggerHapticAndDelete)();
      }
      translateX.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteBackgroundStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.abs(translateX.value) / 80, 1),
  }));

  // Safety check after hooks
  if (!result || !result.score || !result.age) {
    return (
      <View className="bg-neutral-800 rounded-xl mb-4 p-4">
        <Text className="text-gray-400">Invalid entry</Text>
      </View>
    );
  }

  const thumbnailUri = result.capturedFrames?.[0]?.imageUri ?? null;
  const isAgeMode = result.analysisMode === "age";

  const netScore = result.score.recommendedCategory === "Typical"
    ? result.score.netTypical
    : result.score.netNonTypical;

  const scoreValue = typeof netScore === "number" ? netScore : netScore.average;

  const displayedPointCount = (result.manualOverride && result.manualPointCount)
    ? result.manualPointCount
    : (result.score.measurements.totalPoints + result.score.measurements.totalAbnormalPoints);

  return (
    <View className="mb-4">
      {/* Delete background indicator */}
      <Animated.View
        className="absolute top-0 right-0 bottom-0 w-24 bg-red-600 rounded-r-xl items-center justify-center"
        style={deleteBackgroundStyle}
      >
        <Ionicons name="trash" size={28} color="white" />
        <Text className="text-white text-xs font-bold mt-1">Delete</Text>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPress();
            }}
            className="bg-neutral-800 rounded-xl overflow-hidden"
          >
            <View className="flex-row">
              {thumbnailUri ? (
                <Image
                  source={{ uri: thumbnailUri }}
                  style={{ width: 100, height: 100 }}
                  resizeMode="cover"
                />
              ) : (
                <View className="w-24 h-24 bg-neutral-700 items-center justify-center">
                  <Ionicons name="image-outline" size={32} color="#666" />
                </View>
              )}

              <View className="flex-1 p-4">
                <View className="flex-row items-start justify-between mb-2">
                  <View className="flex-1">
                    {isAgeMode ? (
                      <>
                        <View className="flex-row items-baseline mb-1">
                          <Text className="text-white text-lg font-bold">
                            {result.explainableAge?.estimatedAge || result.age.estimatedAge}
                          </Text>
                          {result.explainableAge?.overallConfidence ? (
                            <Text className="text-gray-400 text-sm ml-2">
                              {result.explainableAge.overallConfidence}% conf
                            </Text>
                          ) : null}
                        </View>
                        {result.explainableAge?.shooterPassLabel ? (
                          <View className="flex-row items-center mt-1">
                            <View
                              className="px-2 py-0.5 rounded"
                              style={{
                                backgroundColor:
                                  result.explainableAge.shooterPassLabel === "SHOOTER"
                                    ? "#22c55e"
                                    : result.explainableAge.shooterPassLabel === "NICE HARVEST" || result.explainableAge.shooterPassLabel === "NICE MOUNT"
                                    ? "#3b82f6"
                                    : "#f59e0b",
                              }}
                            >
                              <Text className="text-white text-xs font-bold">
                                {result.explainableAge.shooterPassLabel}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                        <Text className="text-gray-500 text-xs mt-2">
                          Quick est: approx {displayedPointCount}pt rack
                        </Text>
                      </>
                    ) : (
                      <>
                        <View className="flex-row items-baseline mb-1">
                          <Text className="text-white text-lg font-bold">
                            {scoreValue.toFixed(1)} in
                          </Text>
                          <Text className="text-gray-400 text-sm ml-2">
                            {displayedPointCount}pt
                          </Text>
                          {result.manualOverride ? (
                            <View className="ml-2 bg-green-600 px-1.5 py-0.5 rounded">
                              <Text className="text-white text-xs font-bold">Manual</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-gray-400 text-sm">
                          {result.score.recommendedCategory}
                        </Text>
                        <Text className="text-gray-500 text-xs mt-1">
                          Est age: {result.age.estimatedAge}
                        </Text>
                      </>
                    )}
                  </View>
                  {/* Larger delete button - 44x44pt minimum touch target */}
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      onDelete();
                    }}
                    className="w-11 h-11 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}
                  >
                    <Ionicons name="trash-outline" size={22} color="#ef4444" />
                  </Pressable>
                </View>

                <View className="flex-row items-center mt-2">
                  <Ionicons name="calendar-outline" size={14} color="#666" />
                  <Text className="text-gray-500 text-xs ml-1">
                    {format(new Date(result.timestamp), "MMM d, yyyy h:mm a")}
                  </Text>
                  {/* Distance Chip */}
                  {result.distanceMeasurement && (
                    <View className="ml-2">
                      <DistanceChip
                        distanceYards={result.distanceMeasurement.distanceYards}
                        confidence={result.distanceMeasurement.confidence}
                        source={result.distanceMeasurement.source}
                        size="small"
                        showIcon={false}
                      />
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View className="absolute top-2 left-2">
              <View
                className={`px-2 py-1 rounded ${
                  isAgeMode && result.explainableAge?.overallConfidence
                    ? result.explainableAge.overallConfidence >= 75
                      ? "bg-green-500/90"
                      : result.explainableAge.overallConfidence >= 50
                      ? "bg-blue-500/90"
                      : "bg-yellow-500/90"
                    : result.score.overallConfidence === "High"
                    ? "bg-green-500/90"
                    : result.score.overallConfidence === "Med"
                    ? "bg-blue-500/90"
                    : "bg-yellow-500/90"
                }`}
              >
                <Text className="text-white text-xs font-bold">
                  {isAgeMode && result.explainableAge?.overallConfidence
                    ? `${result.explainableAge.overallConfidence}%`
                    : result.score.overallConfidence}
                </Text>
              </View>
            </View>

            <View className="absolute top-2 right-14">
              <View
                className={`px-2 py-1 rounded flex-row items-center ${
                  isAgeMode ? "bg-blue-600/90" : "bg-orange-600/90"
                }`}
              >
                <Ionicons
                  name={isAgeMode ? "body" : "ribbon"}
                  size={12}
                  color="white"
                  style={{ marginRight: 4 }}
                />
                <Text className="text-white text-xs font-bold">
                  {isAgeMode ? "AGE" : "RACK"}
                </Text>
              </View>
            </View>

            {(isAgeMode && result.explainableAge) || (!isAgeMode && result.explainableRackScore) ? (
              <View className="absolute bottom-2 right-2">
                <View className="bg-purple-600/90 px-2 py-1 rounded flex-row items-center">
                  <Ionicons name="bulb" size={10} color="white" style={{ marginRight: 3 }} />
                  <Text className="text-white text-xs font-bold">Explained</Text>
                </View>
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {/* Swipe hint on first card */}
      <Text className="text-gray-600 text-xs text-center mt-1">Swipe left to delete</Text>
    </View>
  );
};
