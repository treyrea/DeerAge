/**
 * Distance Picker Component
 * Fast, blind-friendly UI for capturing distance at observation time
 *
 * Features:
 * - Large tap targets for field use
 * - Preset buttons: 50, 75, 100, 125, 150, 175, 200 yards
 * - Plus/minus stepper (±5 yards)
 * - Manual numeric entry
 * - Toggle for ranged vs estimated
 * - Last distance suggestion
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  DistanceMeasurement,
  DistanceSource,
  DistanceConfidence,
  DISTANCE_PRESETS,
  DISTANCE_MIN,
  DISTANCE_MAX,
  DISTANCE_STEP,
} from "../types/distance";

interface DistancePickerProps {
  visible: boolean;
  onSave: (distance: DistanceMeasurement) => void;
  onSkip: () => void;
  suggestedDistance?: number | null; // Last distance from recent capture
  suggestedDistanceTimestamp?: string | null;
  showBanner?: boolean; // Show accuracy improvement banner
  enableRangefinderButton?: boolean; // Phase 2: Enable rangefinder pull
  onRangefinderPull?: () => void; // Phase 2: Callback for rangefinder
}

export const DistancePicker: React.FC<DistancePickerProps> = ({
  visible,
  onSave,
  onSkip,
  suggestedDistance,
  suggestedDistanceTimestamp,
  showBanner = false,
  enableRangefinderButton = false,
  onRangefinderPull,
}) => {
  const insets = useSafeAreaInsets();

  // State
  const [distance, setDistance] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<"preset" | "manual">("preset");
  const [manualInput, setManualInput] = useState("");
  const [isRanged, setIsRanged] = useState(false);
  const [isEstimated, setIsEstimated] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setDistance(null);
      setInputMode("preset");
      setManualInput("");
      setIsRanged(false);
      setIsEstimated(true);
      setValidationError(null);
    }
  }, [visible]);

  // Validate distance
  const validateDistance = useCallback((value: number | null): string | null => {
    if (value === null) return null;
    if (value < DISTANCE_MIN) return `Minimum distance is ${DISTANCE_MIN} yards`;
    if (value > DISTANCE_MAX) return `Maximum distance is ${DISTANCE_MAX} yards`;
    return null;
  }, []);

  // Handle preset selection
  const handlePresetSelect = (preset: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDistance(preset);
    setInputMode("preset");
    setManualInput("");
    setValidationError(null);
  };

  // Handle stepper
  const handleStep = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const current = distance ?? 100;
    const newValue = Math.max(DISTANCE_MIN, Math.min(DISTANCE_MAX, current + delta));
    setDistance(newValue);
    setValidationError(validateDistance(newValue));
  };

  // Handle manual input
  const handleManualInputChange = (text: string) => {
    // Only allow numbers
    const numericText = text.replace(/[^0-9]/g, "");
    setManualInput(numericText);

    if (numericText) {
      const value = parseInt(numericText, 10);
      setDistance(value);
      setValidationError(validateDistance(value));
    } else {
      setDistance(null);
      setValidationError(null);
    }
  };

  // Handle manual input focus
  const handleManualFocus = () => {
    setInputMode("manual");
  };

  // Handle use suggested distance
  const handleUseSuggested = () => {
    if (suggestedDistance) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setDistance(suggestedDistance);
      setValidationError(null);
    }
  };

  // Determine confidence based on toggles
  const getConfidence = (): DistanceConfidence => {
    if (isRanged) return "high";
    if (isEstimated) return "medium";
    return "low";
  };

  // Determine source based on state
  const getSource = (): DistanceSource => {
    if (isRanged) return "rangefinder_manual";
    if (inputMode === "preset") return "preset";
    return "manual";
  };

  // Handle save
  const handleSave = () => {
    if (distance === null) return;

    const error = validateDistance(distance);
    if (error) {
      setValidationError(error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const measurement: DistanceMeasurement = {
      distanceYards: distance,
      source: getSource(),
      confidence: getConfidence(),
      timestamp: new Date().toISOString(),
    };

    onSave(measurement);
  };

  // Handle skip
  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSkip();
  };

  // Calculate time since suggested distance
  const getSuggestedTimeAgo = (): string | null => {
    if (!suggestedDistanceTimestamp) return null;
    const diff = Date.now() - new Date(suggestedDistanceTimestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes === 1) return "1 min ago";
    return `${minutes} mins ago`;
  };

  const canSave = distance !== null && !validationError;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleSkip}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View
            className="rounded-t-3xl"
            style={{
              backgroundColor: "#2B3420",
              paddingBottom: insets.bottom + 16,
            }}
          >
            {/* Handle bar */}
            <View className="w-10 h-1 bg-gray-500 rounded-full self-center mt-3 mb-4" />

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-white text-xl font-bold">
                  Distance to Deer
                </Text>
                <Pressable
                  onPress={handleSkip}
                  className="w-10 h-10 items-center justify-center"
                >
                  <Ionicons name="close" size={24} color="#E5D4B8" />
                </Pressable>
              </View>

              {/* Accuracy Banner */}
              {showBanner && (
                <View
                  className="rounded-lg p-4 mb-5 flex-row items-start"
                  style={{ backgroundColor: "#3D4A2F" }}
                >
                  <Ionicons name="information-circle" size={24} color="#D4AF37" />
                  <View className="flex-1 ml-3">
                    <Text className="text-white font-semibold mb-1">
                      Distance improves accuracy
                    </Text>
                    <Text className="text-sm" style={{ color: "#E5D4B8" }}>
                      If you know the distance to the deer, add it now. Skip if unsure.
                    </Text>
                  </View>
                </View>
              )}

              {/* Last Distance Suggestion */}
              {suggestedDistance && (
                <Pressable
                  onPress={handleUseSuggested}
                  className="rounded-lg p-4 mb-5 flex-row items-center"
                  style={{ backgroundColor: "#5A6447" }}
                >
                  <Ionicons name="time" size={20} color="#D4AF37" />
                  <View className="flex-1 ml-3">
                    <Text className="text-white font-medium">
                      Use last distance: {suggestedDistance} yd
                    </Text>
                    {getSuggestedTimeAgo() && (
                      <Text className="text-xs mt-0.5" style={{ color: "#E5D4B8" }}>
                        {getSuggestedTimeAgo()}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#E5D4B8" />
                </Pressable>
              )}

              {/* Current Distance Display */}
              <View className="items-center mb-6">
                <Text
                  className="text-5xl font-bold"
                  style={{ color: distance !== null ? "#D4AF37" : "#5A6447" }}
                >
                  {distance !== null ? distance : "---"}
                </Text>
                <Text className="text-lg mt-1" style={{ color: "#E5D4B8" }}>
                  yards
                </Text>
              </View>

              {/* Validation Error */}
              {validationError && (
                <View className="rounded-lg p-3 mb-4" style={{ backgroundColor: "#dc2626" }}>
                  <Text className="text-white text-sm text-center">{validationError}</Text>
                </View>
              )}

              {/* Preset Buttons */}
              <Text className="text-sm font-medium mb-3" style={{ color: "#E5D4B8" }}>
                QUICK SELECT
              </Text>
              <View className="flex-row flex-wrap gap-2 mb-5">
                {DISTANCE_PRESETS.map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => handlePresetSelect(preset)}
                    className="rounded-lg py-3 px-4"
                    style={{
                      backgroundColor: distance === preset ? "#D4AF37" : "#3D4A2F",
                      minWidth: 70,
                    }}
                  >
                    <Text
                      className="text-center font-bold text-lg"
                      style={{ color: distance === preset ? "#1f2937" : "#E5D4B8" }}
                    >
                      {preset}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Stepper */}
              <View className="flex-row items-center justify-center gap-4 mb-5">
                <Pressable
                  onPress={() => handleStep(-DISTANCE_STEP)}
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: "#3D4A2F" }}
                >
                  <Ionicons name="remove" size={32} color="#E5D4B8" />
                </Pressable>
                <View className="items-center">
                  <Text className="text-sm" style={{ color: "#8B7355" }}>
                    ±{DISTANCE_STEP} yards
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleStep(DISTANCE_STEP)}
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: "#3D4A2F" }}
                >
                  <Ionicons name="add" size={32} color="#E5D4B8" />
                </Pressable>
              </View>

              {/* Manual Input */}
              <Text className="text-sm font-medium mb-2" style={{ color: "#E5D4B8" }}>
                MANUAL ENTRY
              </Text>
              <View className="flex-row items-center mb-5">
                <TextInput
                  value={manualInput}
                  onChangeText={handleManualInputChange}
                  onFocus={handleManualFocus}
                  placeholder="Enter yards"
                  placeholderTextColor="#5A6447"
                  keyboardType="number-pad"
                  maxLength={3}
                  className="flex-1 rounded-lg px-4 py-3 text-lg font-bold"
                  style={{
                    backgroundColor: "#3D4A2F",
                    color: "#E5D4B8",
                  }}
                />
                <Text className="text-lg ml-3" style={{ color: "#E5D4B8" }}>
                  yards
                </Text>
              </View>

              {/* Confidence Toggles */}
              <Text className="text-sm font-medium mb-3" style={{ color: "#E5D4B8" }}>
                MEASUREMENT TYPE
              </Text>
              <View className="gap-3 mb-6">
                {/* Ranged Toggle */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIsRanged(!isRanged);
                    if (!isRanged) setIsEstimated(false);
                  }}
                  className="flex-row items-center p-4 rounded-lg"
                  style={{ backgroundColor: isRanged ? "#22c55e" : "#3D4A2F" }}
                >
                  <View
                    className="w-6 h-6 rounded-md items-center justify-center mr-3"
                    style={{ backgroundColor: isRanged ? "#fff" : "#5A6447" }}
                  >
                    {isRanged && <Ionicons name="checkmark" size={18} color="#22c55e" />}
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-semibold">
                      I ranged this with a rangefinder
                    </Text>
                    <Text className="text-xs mt-0.5" style={{ color: isRanged ? "#fff" : "#8B7355" }}>
                      High confidence - actual measured distance
                    </Text>
                  </View>
                </Pressable>

                {/* Estimated Toggle */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIsEstimated(!isEstimated);
                    if (!isEstimated) setIsRanged(false);
                  }}
                  className="flex-row items-center p-4 rounded-lg"
                  style={{ backgroundColor: !isRanged && isEstimated ? "#f59e0b" : "#3D4A2F" }}
                >
                  <View
                    className="w-6 h-6 rounded-md items-center justify-center mr-3"
                    style={{ backgroundColor: !isRanged && isEstimated ? "#fff" : "#5A6447" }}
                  >
                    {!isRanged && isEstimated && (
                      <Ionicons name="checkmark" size={18} color="#f59e0b" />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-white font-semibold">
                      Estimated / guessed
                    </Text>
                    <Text
                      className="text-xs mt-0.5"
                      style={{ color: !isRanged && isEstimated ? "#fff" : "#8B7355" }}
                    >
                      Medium confidence - your best estimate
                    </Text>
                  </View>
                </Pressable>
              </View>

              {/* Phase 2: Rangefinder Pull Button (scaffolded) */}
              {enableRangefinderButton && (
                <Pressable
                  onPress={onRangefinderPull}
                  className="rounded-lg p-4 mb-6 flex-row items-center justify-center"
                  style={{ backgroundColor: "#3b82f6" }}
                >
                  <Ionicons name="bluetooth" size={20} color="white" />
                  <Text className="text-white font-bold ml-2">
                    Pull from rangefinder
                  </Text>
                </Pressable>
              )}

              {/* Action Buttons */}
              <View className="flex-row gap-3">
                <Pressable
                  onPress={handleSkip}
                  className="flex-1 rounded-xl py-4 items-center"
                  style={{ backgroundColor: "#5A6447" }}
                >
                  <Text className="text-white font-semibold text-base">Skip</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={!canSave}
                  className="flex-1 rounded-xl py-4 items-center"
                  style={{
                    backgroundColor: canSave ? "#D4AF37" : "#3D4A2F",
                    opacity: canSave ? 1 : 0.5,
                  }}
                >
                  <Text
                    className="font-bold text-base"
                    style={{ color: canSave ? "#1f2937" : "#5A6447" }}
                  >
                    Save Distance
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default DistancePicker;
