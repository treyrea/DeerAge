/**
 * Photo Select Screen - Upload photo from gallery
 * Now includes distance capture for improved accuracy
 */

import React, { useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useDistanceStore } from "../state/distanceStore";
import { DeerAnalysisFrame } from "../types/deer-scoring";
import type { DistanceMeasurement } from "../types/distance";
import { DistancePicker } from "../components/DistancePicker";
import { DistanceChip } from "../components/DistanceDisplay";

type NavigationProp = NativeStackNavigationProp<any>;

export const PhotoSelectScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showDistancePicker, setShowDistancePicker] = useState(false);
  const [capturedDistance, setCapturedDistance] = useState<DistanceMeasurement | null>(null);

  // Use individual selectors to avoid unnecessary re-renders
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const stopCapture = useDeerScoringStore((s) => s.stopCapture);
  const processFrames = useDeerScoringStore((s) => s.processFrames);

  // Distance store
  const distanceSettings = useDistanceStore((s) => s.settings);
  const getSuggestedDistance = useDistanceStore((s) => s.getSuggestedDistance);
  const setPendingDistance = useDistanceStore((s) => s.setPendingDistance);
  const setLastDistance = useDistanceStore((s) => s.setLastDistance);
  const enableRangefinder = useDistanceStore((s) => s.enableBluetoothRangefinder);

  const handlePickImage = async () => {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== "granted") {
      alert("Sorry, we need camera roll permissions to upload photos!");
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setCapturedDistance(null); // Reset distance when new image selected
    }
  };

  // Handle distance save
  const handleDistanceSave = (distance: DistanceMeasurement) => {
    setCapturedDistance(distance);
    setLastDistance(distance);
    setPendingDistance(distance);
    setShowDistancePicker(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // Handle distance skip
  const handleDistanceSkip = () => {
    setPendingDistance(null);
    setShowDistancePicker(false);
  };

  // Start analysis - may prompt for distance first
  const handleAnalyzePress = () => {
    if (!selectedImage) return;

    // If distance prompting is enabled and no distance captured, show picker
    if (distanceSettings.promptOnEveryAnalysis && !capturedDistance) {
      setShowDistancePicker(true);
    } else {
      // Proceed directly to analysis
      runAnalysis();
    }
  };

  // Run the actual analysis
  const runAnalysis = async () => {
    if (!selectedImage) return;

    try {
      console.log("[PhotoSelect] Starting analysis for image:", selectedImage);

      // Store pending distance if captured
      if (capturedDistance) {
        setPendingDistance(capturedDistance);
        console.log("[PhotoSelect] Distance captured:", capturedDistance.distanceYards, "yards");
      }

      // Start capture and prepare frame
      startCapture();

      // Create a single frame from the uploaded photo
      const frame: DeerAnalysisFrame = {
        frameIndex: 0,
        imageUri: selectedImage,
        detectedAntlers: false, // Will be determined during analysis
        confidence: "Low",
        partialOcclusion: false,
      };

      console.log("[PhotoSelect] Adding frame to store");
      addFrame(frame);
      stopCapture();

      // IMPORTANT: Start processing BEFORE navigating to avoid race condition
      // This ensures isProcessing is true when ProcessingScreen mounts
      console.log("[PhotoSelect] Starting processFrames() before navigation");
      const processPromise = processFrames();

      // Small delay to ensure isProcessing state is set before navigation
      await new Promise(resolve => setTimeout(resolve, 50));

      console.log("[PhotoSelect] Navigating to Processing screen");
      navigation.navigate("Processing");

      // Wait for processing to complete (ProcessingScreen will handle navigation to results)
      await processPromise;
    } catch (error) {
      console.error("[PhotoSelect] Analysis error:", error);
      // Haptic feedback for error
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // Get suggested distance for picker
  const suggested = getSuggestedDistance();

  return (
    <View className="flex-1 bg-neutral-900" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => navigation.goBack()} className="w-10 h-10 items-center justify-center">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text className="text-white text-lg font-bold">Upload Photo</Text>
          <View className="w-10" />
        </View>
      </View>

      {/* Content */}
      <View className="flex-1 px-6 py-6">
        {selectedImage ? (
          <View className="flex-1">
            {/* Image Preview */}
            <View className="flex-1 bg-neutral-800 rounded-xl overflow-hidden mb-4">
              <Image
                source={{ uri: selectedImage }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
              />
            </View>

            {/* Distance Info Banner */}
            <Pressable
              onPress={() => setShowDistancePicker(true)}
              className="rounded-xl p-4 mb-4 flex-row items-center"
              style={{ backgroundColor: capturedDistance ? "#22c55e20" : "#3b82f620" }}
            >
              <Ionicons
                name={capturedDistance ? "checkmark-circle" : "locate"}
                size={24}
                color={capturedDistance ? "#22c55e" : "#3b82f6"}
              />
              <View className="flex-1 ml-3">
                {capturedDistance ? (
                  <>
                    <View className="flex-row items-center">
                      <Text className="text-white font-semibold">Distance: </Text>
                      <DistanceChip
                        distanceYards={capturedDistance.distanceYards}
                        confidence={capturedDistance.confidence}
                        source={capturedDistance.source}
                        size="medium"
                      />
                    </View>
                    <Text className="text-xs mt-1" style={{ color: "#9ca3af" }}>
                      Tap to change
                    </Text>
                  </>
                ) : (
                  <>
                    <Text className="text-white font-semibold">Add distance for better accuracy</Text>
                    <Text className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
                      Tap to add distance (optional)
                    </Text>
                  </>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </Pressable>

            {/* Action Buttons */}
            <View className="space-y-3">
              <Pressable
                onPress={handleAnalyzePress}
                className="bg-green-600 rounded-xl py-4 items-center"
              >
                <Text className="text-white text-lg font-bold">Analyze Photo</Text>
                <Text className="text-white/80 text-sm mt-1">Score this deer</Text>
              </Pressable>

              <Pressable
                onPress={handlePickImage}
                className="bg-neutral-800 rounded-xl py-4 items-center"
              >
                <Text className="text-white text-base font-semibold">Choose Different Photo</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center">
            {/* Upload Prompt */}
            <View className="w-32 h-32 bg-neutral-800 rounded-full items-center justify-center mb-8">
              <Ionicons name="images-outline" size={64} color="#22c55e" />
            </View>

            <Text className="text-white text-2xl font-bold mb-3">Select a Photo</Text>
            <Text className="text-gray-400 text-center mb-8 px-8">
              Choose a photo of a deer with visible antlers from your gallery
            </Text>

            <Pressable
              onPress={handlePickImage}
              className="bg-green-600 rounded-xl py-4 px-8 items-center"
            >
              <View className="flex-row items-center">
                <Ionicons name="image" size={24} color="white" />
                <Text className="text-white text-lg font-bold ml-2">Open Gallery</Text>
              </View>
            </Pressable>

            {/* Info */}
            <View className="mt-12 mx-6">
              <View className="flex-row items-center justify-center">
                <Ionicons name="bulb-outline" size={16} color="#22c55e" />
                <Text className="text-gray-400 text-sm ml-2 text-center">
                  Tip: Camera burst mode gives higher accuracy
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Distance Picker Modal */}
      <DistancePicker
        visible={showDistancePicker}
        onSave={(distance) => {
          handleDistanceSave(distance);
          // After saving distance, proceed to analysis
          runAnalysis();
        }}
        onSkip={() => {
          handleDistanceSkip();
          // After skipping, proceed to analysis
          runAnalysis();
        }}
        suggestedDistance={suggested?.distance}
        suggestedDistanceTimestamp={suggested?.timestamp}
        showBanner={true}
        enableRangefinderButton={enableRangefinder}
      />
    </View>
  );
};
