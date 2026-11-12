/**
 * Quick Check Camera Screen - Single tap, instant SHOOTER/LET WALK decision
 * Optimized for speed in hunting scenarios (3-5 second analysis)
 */

import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Slider from "@react-native-community/slider";
import { quickAgeCheck } from "../api/quick-age-check";
import { useDeerScoringStore } from "../state/deerScoringStore";
import * as Haptics from "expo-haptics";

type NavigationProp = NativeStackNavigationProp<any>;

const { width, height } = Dimensions.get("window");

export const QuickCheckCameraScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const cameraRef = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [isActive, setIsActive] = useState(true);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [zoom, setZoom] = useState(1);

  const propertyRules = useDeerScoringStore((s) => s.propertyRules);

  // Get min and max zoom from device
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 10, 10);

  // Request camera permissions
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    return () => {
      setIsActive(false);
    };
  }, []);

  // Single tap capture and analyze
  const handleQuickCapture = async () => {
    if (!cameraRef.current || isCapturing || isAnalyzing) return;

    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Take single photo
      const photo = await cameraRef.current.takePhoto({
        flash: "off",
        enableShutterSound: true, // Audible feedback
      });

      // Use the photo directly - the camera zoom already frames the subject
      const imageUri = `file://${photo.path}`;

      setIsCapturing(false);
      setIsAnalyzing(true);

      // Run quick analysis (3-5 seconds)
      const result = await quickAgeCheck(imageUri, propertyRules.minimumShooterAge);

      setIsAnalyzing(false);

      // Navigate to result screen
      navigation.replace("QuickCheckResult", {
        result,
        imageUri,
      });
    } catch (error) {
      console.error("Quick capture error:", error);
      setIsCapturing(false);
      setIsAnalyzing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Ionicons name="camera-outline" size={64} color="#666" />
        <Text className="text-white text-lg mt-4">Camera permission required</Text>
        <Pressable
          onPress={requestPermission}
          className="mt-4 bg-green-600 px-6 py-3 rounded-lg"
        >
          <Text className="text-white font-semibold">Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Ionicons name="camera-outline" size={64} color="#666" />
        <Text className="text-white text-lg mt-4">No camera available</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Camera View */}
      <Camera
        ref={cameraRef}
        style={{ width, height }}
        device={device}
        isActive={isActive && !isAnalyzing}
        photo={true}
        zoom={zoom}
        onError={(error) => {
          console.error("Camera error:", error);
        }}
      />

      {/* Overlay UI */}
      <View
        className="absolute top-0 left-0 right-0 bottom-0"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
        pointerEvents="box-none"
      >
        {/* Top Bar */}
        <View className="flex-row items-center justify-between px-6 py-4">
          <Pressable
            onPress={() => navigation.goBack()}
            className="w-10 h-10 items-center justify-center bg-black/50 rounded-full"
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>

          <View className="bg-amber-500/90 px-4 py-2 rounded-full flex-row items-center">
            <Ionicons name="flash" size={16} color="white" />
            <Text className="text-white text-sm font-bold ml-2">QUICK CHECK</Text>
          </View>

          <View className="w-10" />
        </View>

        {/* Center Guide - Body focused - LARGER */}
        <View className="flex-1 items-center justify-center" pointerEvents="none">
          {isAnalyzing ? (
            // Analyzing state
            <View className="items-center">
              <View className="w-24 h-24 bg-amber-500/30 rounded-full items-center justify-center mb-4">
                <ActivityIndicator size="large" color="#f59e0b" />
              </View>
              <Text className="text-white text-xl font-bold">Analyzing...</Text>
              <Text className="text-white/70 text-sm mt-2">3-5 seconds</Text>
            </View>
          ) : (
            // Ready to capture - LARGER viewer window
            <>
              <View
                className="border-2 border-amber-500/50 rounded-xl items-center justify-center"
                style={{ width: width * 0.85, height: height * 0.30 }}
              >
                {/* Body silhouette hint */}
                <Text className="text-7xl opacity-30">🦌</Text>
              </View>

              <View className="mt-4 bg-black/70 px-4 py-2 rounded-xl mx-8">
                <Text className="text-amber-400 text-center font-bold text-base">
                  Frame the FULL BODY
                </Text>
                <Text className="text-white/70 text-center text-sm mt-1">
                  Neck, chest, belly & legs visible
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Bottom Controls */}
        <View style={{ paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }}>
          {/* Capture Button */}
          <View className="items-center mb-4">
            <Pressable
              onPress={handleQuickCapture}
              disabled={isCapturing || isAnalyzing}
              className="items-center"
            >
              <View
                className="w-20 h-20 rounded-full items-center justify-center"
                style={{ backgroundColor: isAnalyzing ? "rgba(245, 158, 11, 0.3)" : "rgba(245, 158, 11, 0.5)" }}
              >
                <View
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: isAnalyzing ? "#78716c" : "#f59e0b" }}
                >
                  {isCapturing ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : isAnalyzing ? (
                    <Ionicons name="hourglass" size={32} color="#fff" />
                  ) : (
                    <Ionicons name="flash" size={32} color="#fff" />
                  )}
                </View>
              </View>
              <Text className="text-white text-sm mt-2 font-semibold">
                {isCapturing ? "Capturing..." : isAnalyzing ? "Analyzing..." : "Quick Check"}
              </Text>
            </Pressable>
          </View>

          {/* Horizontal Zoom Slider */}
          {!isAnalyzing && !isCapturing && (
            <View className="bg-black/60 rounded-xl p-3 mb-3">
              <View className="flex-row items-center">
                <Ionicons name="remove" size={20} color="white" />
                <Slider
                  style={{ flex: 1, height: 40, marginHorizontal: 8 }}
                  minimumValue={minZoom}
                  maximumValue={maxZoom}
                  value={zoom}
                  onValueChange={setZoom}
                  minimumTrackTintColor="#f59e0b"
                  maximumTrackTintColor="rgba(255,255,255,0.3)"
                  thumbTintColor="#ffffff"
                />
                <Ionicons name="add" size={20} color="white" />
                <View className="ml-2 bg-black/70 px-2 py-1 rounded min-w-[48px] items-center">
                  <Text className="text-white text-xs font-semibold">{zoom.toFixed(1)}x</Text>
                </View>
              </View>
            </View>
          )}

          {/* Bottom info row */}
          {!isAnalyzing && (
            <View className="flex-row items-center justify-between">
              <View className="bg-green-600/80 px-3 py-1.5 rounded-full flex-row items-center">
                <Ionicons name="timer" size={14} color="white" />
                <Text className="text-white text-xs font-semibold ml-1.5">~5 sec result</Text>
              </View>
              <Text className="text-white/50 text-xs">
                Threshold: {propertyRules.minimumShooterAge}+ yrs
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};
