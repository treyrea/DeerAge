/**
 * Quick test component to analyze the deer image point count
 * Add this to App.tsx temporarily to run the test
 */

import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Image } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { countAntlerPointsAccurately, AccuratePointCountResult } from "./src/api/deer-analysis";
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from "expo-asset";

export default function TestPointCount() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AccuratePointCountResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);

  useEffect(() => {
    runTest();
  }, []);

  const runTest = async () => {
    try {
      console.log("Starting point count test...");

      // Load the test image from assets
      const asset = Asset.fromModule(require("./assets/image-1765518825.jpeg"));
      await asset.downloadAsync();

      if (!asset.localUri) {
        throw new Error("Failed to load test image");
      }

      setImageUri(asset.localUri);
      console.log("Image loaded:", asset.localUri);

      // Run the point counting
      console.log("Calling AI point counter...");
      const pointResult = await countAntlerPointsAccurately(asset.localUri);

      console.log("===========================================");
      console.log("POINT COUNT RESULTS:");
      console.log("Left Antler:", pointResult.leftAntlerPoints);
      console.log("Right Antler:", pointResult.rightAntlerPoints);
      console.log("Total:", pointResult.totalCount);
      console.log("Confidence:", pointResult.confidence);
      console.log("Left G-tines:", pointResult.leftGtines);
      console.log("Right G-tines:", pointResult.rightGtines);
      console.log("Explanation:", pointResult.explanation);
      console.log("===========================================");

      setResult(pointResult);
    } catch (err: any) {
      console.error("Test error:", err);
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-[#2B3420]">
        <ScrollView className="flex-1 p-4">
          <Text className="text-2xl font-bold text-[#F5F5DC] mb-4 text-center">
            Point Count Test
          </Text>

          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              className="w-full h-48 rounded-lg mb-4"
              resizeMode="contain"
            />
          )}

          {loading && (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color="#D4AF37" />
              <Text className="text-[#F5F5DC] mt-4">Analyzing antler points...</Text>
            </View>
          )}

          {error && (
            <View className="bg-red-900/50 p-4 rounded-lg">
              <Text className="text-red-300 font-bold">Error:</Text>
              <Text className="text-red-200">{error}</Text>
            </View>
          )}

          {result && (
            <View className="bg-[#3D4A2F] p-4 rounded-lg">
              <Text className="text-xl font-bold text-[#D4AF37] mb-4 text-center">
                Results
              </Text>

              <View className="flex-row justify-around mb-4">
                <View className="items-center">
                  <Text className="text-[#F5F5DC] text-sm">Left Antler</Text>
                  <Text className="text-3xl font-bold text-[#D4AF37]">
                    {result.leftAntlerPoints}
                  </Text>
                </View>
                <View className="items-center">
                  <Text className="text-[#F5F5DC] text-sm">Right Antler</Text>
                  <Text className="text-3xl font-bold text-[#D4AF37]">
                    {result.rightAntlerPoints}
                  </Text>
                </View>
                <View className="items-center">
                  <Text className="text-[#F5F5DC] text-sm">Total</Text>
                  <Text className="text-3xl font-bold text-[#D4AF37]">
                    {result.totalCount}
                  </Text>
                </View>
              </View>

              <View className="border-t border-[#5A6447] pt-4">
                <Text className="text-[#F5F5DC] font-bold mb-2">
                  Confidence: {result.confidence}
                </Text>

                <Text className="text-[#F5F5DC] font-bold mb-1">Left G-tines:</Text>
                <Text className="text-[#E5D4B8] mb-2">
                  {result.leftGtines.join(", ") || "None detected"}
                </Text>

                <Text className="text-[#F5F5DC] font-bold mb-1">Right G-tines:</Text>
                <Text className="text-[#E5D4B8] mb-2">
                  {result.rightGtines.join(", ") || "None detected"}
                </Text>

                <Text className="text-[#F5F5DC] font-bold mb-1">AI Explanation:</Text>
                <Text className="text-[#E5D4B8] text-sm">
                  {result.explanation}
                </Text>
              </View>

              {result.leftAntlerPoints === result.rightAntlerPoints && (
                <View className="bg-yellow-900/50 p-3 rounded-lg mt-4">
                  <Text className="text-yellow-300 font-bold">⚠️ Symmetrical Count</Text>
                  <Text className="text-yellow-200 text-sm">
                    AI reported equal points on both sides. Most racks are asymmetrical - verify this is correct.
                  </Text>
                </View>
              )}

              {result.leftAntlerPoints !== result.rightAntlerPoints && (
                <View className="bg-green-900/50 p-3 rounded-lg mt-4">
                  <Text className="text-green-300 font-bold">✅ Asymmetrical Count</Text>
                  <Text className="text-green-200 text-sm">
                    AI detected different point counts per side (expected for most deer).
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
