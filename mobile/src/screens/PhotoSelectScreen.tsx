/**
 * Photo Select Screen - Upload photo from gallery
 */

import React, { useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { softPulse } from "../lib/haptics";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { DeerAnalysisFrame } from "../types/deer-scoring";
import { HuntRegionSheet } from "../components/HuntRegionSheet";
import { huntConfirmedToday, useHunterProfile } from "../state/hunterProfile";
import { e2eEnabled } from "../e2e/flags";
import { seededPhotoUri } from "../e2e/seed-photo";

type NavigationProp = NativeStackNavigationProp<any>;

export const PhotoSelectScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Use individual selectors to avoid unnecessary re-renders
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const stopCapture = useDeerScoringStore((s) => s.stopCapture);
  const processFrames = useDeerScoringStore((s) => s.processFrames);
  const huntReady = useHunterProfile((s) => huntConfirmedToday(s));


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
    }
  };

  const handleAnalyzePress = () => {
    if (!selectedImage) return;
    void runAnalysis();
  };

  // Run the actual analysis
  const runAnalysis = async (imageUri = selectedImage) => {
    if (!imageUri) return;

    try {
      console.log("[PhotoSelect] Starting analysis for image:", imageUri);

      // Start capture and prepare frame
      startCapture();

      // Create a single frame from the uploaded photo
      const frame: DeerAnalysisFrame = {
        frameIndex: 0,
        imageUri,
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
      softPulse();
    }
  };

  if (!huntReady) return <HuntRegionSheet />;

  return (
    <View className="flex-1 bg-neutral-900" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable testID="photo-back" accessibilityLabel="Back" onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text className="text-white text-lg font-bold">Upload Photo</Text>
          <View style={{ width: 44 }} />
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

            {/* Action Buttons */}
            <View className="space-y-3">
              <Pressable
                onPress={handleAnalyzePress}
                style={{ backgroundColor: "#14532D", borderRadius: 12, paddingVertical: 16, alignItems: "center", minHeight: 56 }}
              >
                <Text className="text-lg font-bold" style={{ color: "#F5F5DC" }}>Analyze Photo</Text>
                <Text className="text-sm mt-1" style={{ color: "#E5D4B8" }}>Score this deer</Text>
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
              style={{ backgroundColor: "#14532D", borderRadius: 12, paddingVertical: 16, paddingHorizontal: 32, alignItems: "center", minHeight: 56 }}
            >
              <View className="flex-row items-center">
                <Ionicons name="image" size={24} color="#F5F5DC" />
                <Text className="text-lg font-bold ml-2" style={{ color: "#F5F5DC" }}>Open Gallery</Text>
              </View>
            </Pressable>
            {e2eEnabled ? (
              <Pressable
                testID="e2e-seed-photo"
                onPress={() => {
                  void seededPhotoUri().then((uri) => {
                    setSelectedImage(uri);
                    void runAnalysis(uri);
                  });
                }}
                className="bg-neutral-800 rounded-xl py-4 px-8 items-center mt-4"
              >
                <Text className="text-white text-base font-semibold">Use seeded photo</Text>
              </Pressable>
            ) : null}

            {/* Info */}
            <View className="mt-12 mx-6">
              <View className="flex-row items-center justify-center">
                <Ionicons name="bulb-outline" size={16} color="#22c55e" />
                <Text className="text-gray-400 text-sm ml-2 text-center">
                  Tip: Use the camera — DeerAge takes a short burst and keeps the sharpest shot
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

    </View>
  );
};
