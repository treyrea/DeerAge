/**
 * Deer Camera Screen - One-Tap Burst Capture
 * Now includes distance capture for improved accuracy
 */

import React, { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator, Dimensions, Image } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useDistanceStore } from "../state/distanceStore";
import { useNetworkStore } from "../state/networkStore";
import { DeerAnalysisFrame } from "../types/deer-scoring";
import type { DistanceMeasurement } from "../types/distance";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { DistancePicker } from "../components/DistancePicker";
import { DistanceChip } from "../components/DistanceDisplay";

// Antler silhouette image for score mode viewfinder
const antlerSilhouette = require("../../assets/deer-head-antlers.png");

type NavigationProp = NativeStackNavigationProp<any>;

const { width, height } = Dimensions.get("window");

export const DeerCameraScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const cameraRef = useRef<Camera>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const [isActive, setIsActive] = useState(true);

  const [captureProgress, setCaptureProgress] = useState(0);
  const [isBurstCapturing, setIsBurstCapturing] = useState(false);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const [zoom, setZoom] = useState(1);

  // Distance capture state
  const [showDistancePicker, setShowDistancePicker] = useState(false);
  const [capturedDistance, setCapturedDistance] = useState<DistanceMeasurement | null>(null);
  const [pendingFrames, setPendingFrames] = useState<DeerAnalysisFrame[]>([]);

  // Use individual selectors to avoid unnecessary re-renders
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const stopCapture = useDeerScoringStore((s) => s.stopCapture);
  const processFrames = useDeerScoringStore((s) => s.processFrames);
  const isProcessing = useDeerScoringStore((s) => s.isProcessing);
  const analysisMode = useDeerScoringStore((s) => s.analysisMode);

  // Distance store
  const distanceSettings = useDistanceStore((s) => s.settings);
  const getSuggestedDistance = useDistanceStore((s) => s.getSuggestedDistance);
  const setPendingDistance = useDistanceStore((s) => s.setPendingDistance);
  const setLastDistance = useDistanceStore((s) => s.setLastDistance);
  const enableRangefinder = useDistanceStore((s) => s.enableBluetoothRangefinder);

  // Network state
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const addToQueue = useNetworkStore((s) => s.addToQueue);
  const propertyRules = useDeerScoringStore((s) => s.propertyRules);

  const [showProTips, setShowProTips] = useState(false);

  // Get min and max zoom from device
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 10, 10); // Cap at 10x for usability

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

  // Handle countdown before burst capture
  const startCountdown = async () => {
    if (!cameraRef.current || isBurstCapturing || isCountingDown) return;

    setIsCountingDown(true);
    setCountdownValue(3);

    // Haptic for countdown start
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Countdown from 3 to 1
    for (let i = 3; i >= 1; i--) {
      setCountdownValue(i);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsCountingDown(false);
    // Start the actual burst capture
    handleBurstCapture();
  };

  // Proceed to analysis after distance capture
  const proceedToAnalysis = async (frames: DeerAnalysisFrame[]) => {
    // Check if we're offline
    const isOffline = !isConnected || isInternetReachable === false;

    // For Age mode: Block if offline (requires real-time analysis)
    if (analysisMode === "age" && isOffline) {
      console.log("Age mode offline - cannot proceed");
      return;
    }

    // For Rack mode: Queue if offline, process if online
    if (analysisMode === "score" && isOffline) {
      console.log("Rack mode offline - adding to queue");
      addToQueue({
        type: "score",
        imageUris: frames.map(f => f.imageUri),
        propertyRules: {
          minimumShooterAge: propertyRules.minimumShooterAge,
        },
      });

      navigation.navigate("OfflineQueued", {
        frameCount: frames.length,
      });
      return;
    }

    // IMPORTANT: Start processing BEFORE navigating to avoid race condition
    console.log("[DeerCamera] Starting processFrames() before navigation");
    const processPromise = processFrames();

    // Small delay to ensure isProcessing state is set before navigation
    await new Promise(resolve => setTimeout(resolve, 50));

    // Navigate to processing screen
    navigation.navigate("Processing");

    // Wait for processing to complete
    await processPromise;
  };

  // Handle distance save
  const handleDistanceSave = (distance: DistanceMeasurement) => {
    setCapturedDistance(distance);
    setLastDistance(distance);
    setPendingDistance(distance);
    setShowDistancePicker(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Proceed to analysis with saved frames
    if (pendingFrames.length > 0) {
      proceedToAnalysis(pendingFrames);
      setPendingFrames([]);
    }
  };

  // Handle distance skip
  const handleDistanceSkip = () => {
    setPendingDistance(null);
    setShowDistancePicker(false);

    // Proceed to analysis without distance
    if (pendingFrames.length > 0) {
      proceedToAnalysis(pendingFrames);
      setPendingFrames([]);
    }
  };

  // Handle one-tap burst capture
  const handleBurstCapture = async () => {
    if (!cameraRef.current || isBurstCapturing) return;

    setIsBurstCapturing(true);
    startCapture();
    // Haptic feedback when capture starts
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Capture 8 frames over 2 seconds (4 FPS)
      const totalFrames = 8;
      const intervalMs = 250; // 250ms between frames
      const capturedFrames: DeerAnalysisFrame[] = [];

      for (let i = 0; i < totalFrames; i++) {
        try {
          // Check if camera is still available
          if (!cameraRef.current) {
            console.warn(`Camera ref became null at frame ${i}`);
            // If we have at least 1 frame, continue with what we have
            if (capturedFrames.length > 0) {
              console.log(`Continuing with ${capturedFrames.length} captured frames`);
              break;
            } else {
              throw new Error("Camera unavailable - no frames captured");
            }
          }

          console.log(`Capturing frame ${i + 1}/${totalFrames}`);

          // Take photo
          const photo = await cameraRef.current.takePhoto({
            flash: "off",
            enableShutterSound: false,
          });

          console.log(`Frame ${i + 1} captured: ${photo.path}`);

          // Create frame object
          const frame: DeerAnalysisFrame = {
            frameIndex: i,
            imageUri: `file://${photo.path}`,
            detectedAntlers: false, // Will be determined during analysis
            confidence: "Low",
            partialOcclusion: false,
          };

          capturedFrames.push(frame);
          addFrame(frame);

          // Update progress
          setCaptureProgress(((i + 1) / totalFrames) * 100);

          // Wait for next interval (but not after last frame)
          if (i < totalFrames - 1) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
          }
        } catch (frameError) {
          console.error(`Frame ${i} capture failed:`, frameError);
          // If we have at least 1 frame, we can continue
          if (capturedFrames.length > 0) {
            console.log(`Continuing with ${capturedFrames.length} frames after error`);
            break;
          }
          // Otherwise, continue trying
        }
      }

      console.log(`Burst capture complete: ${capturedFrames.length} frames captured`);

      stopCapture();
      setCaptureProgress(0);
      setIsBurstCapturing(false);

      // Only proceed if we captured at least 1 frame
      if (capturedFrames.length === 0) {
        console.error("No frames captured successfully");
        return;
      }

      // If distance prompting is enabled, show distance picker
      if (distanceSettings.promptOnEveryAnalysis) {
        setPendingFrames(capturedFrames);
        setShowDistancePicker(true);
      } else {
        // Proceed directly to analysis
        await proceedToAnalysis(capturedFrames);
      }
    } catch (error) {
      console.error("Burst capture error:", error);
      setIsBurstCapturing(false);
      setCaptureProgress(0);
      stopCapture();
      // Haptic feedback for error
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // Get suggested distance
  const suggested = getSuggestedDistance();

  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Ionicons name="camera-outline" size={64} color="#666" />
        <Text className="text-white text-lg mt-4">Camera permission required</Text>
        <Text className="text-gray-400 text-sm mt-2 text-center px-8">
          Please enable camera access to use the Deer Age scoring feature.
        </Text>
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
        isActive={isActive && !isProcessing}
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
        {/* Top Info Bar */}
        <View className="flex-row items-center justify-between px-6 py-4">
          <Pressable
            onPress={() => navigation.goBack()}
            className="w-10 h-10 items-center justify-center bg-black/50 rounded-full"
          >
            <Ionicons name="close" size={24} color="white" />
          </Pressable>

          <View className="bg-black/70 px-4 py-2 rounded-full">
            <Text className="text-white text-sm font-semibold">Deer Age Camera</Text>
          </View>

          <View className="w-10" />
        </View>

        {/* Center Viewfinder Guide */}
        <View className="flex-1 items-center justify-center" pointerEvents="none">
          {isCountingDown ? (
            <View className="items-center">
              <View className="w-32 h-32 rounded-full bg-black/70 items-center justify-center border-4 border-amber-500">
                <Text className="text-white text-6xl font-black">{countdownValue}</Text>
              </View>
              <View className="mt-4 bg-amber-600/90 px-6 py-3 rounded-full">
                <Text className="text-white text-base font-bold text-center">
                  GET READY - Hold still for 8 photos!
                </Text>
              </View>
            </View>
          ) : isBurstCapturing ? (
            <View className="items-center">
              <View
                className="border-2 border-green-500/60 rounded-xl items-center justify-center"
                style={{ width: width * 0.85, height: analysisMode === "age" ? height * 0.35 : height * 0.30 }}
              >
                {analysisMode === "age" ? (
                  <Text className="text-8xl opacity-20">🦌</Text>
                ) : (
                  <Image
                    source={antlerSilhouette}
                    style={{ width: 120, height: 120, opacity: 0.25 }}
                    resizeMode="contain"
                  />
                )}
              </View>
              <View className="mt-4 bg-green-600/90 px-6 py-3 rounded-full">
                <Text className="text-white text-base font-bold text-center">
                  HOLD STILL - Capturing 8 photos...
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View
                className="border-2 rounded-xl items-center justify-center"
                style={{
                  width: width * 0.85,
                  height: analysisMode === "age" ? height * 0.35 : height * 0.30,
                  borderColor: analysisMode === "age" ? "rgba(34, 197, 94, 0.5)" : "rgba(168, 85, 247, 0.5)",
                }}
              >
                {analysisMode === "age" ? (
                  // Full deer body silhouette for age estimation
                  <Text className="text-8xl opacity-25">🦌</Text>
                ) : (
                  // Antler silhouette for rack scoring
                  <Image
                    source={antlerSilhouette}
                    style={{ width: 140, height: 140, opacity: 0.3 }}
                    resizeMode="contain"
                  />
                )}
              </View>

              <View className="mt-6 bg-black/70 px-4 py-3 rounded-xl mx-8">
                <Text
                  className="text-center font-bold text-base"
                  style={{ color: analysisMode === "age" ? "#22c55e" : "#a855f7" }}
                >
                  {analysisMode === "age" ? "Frame the FULL BODY" : "Frame the ANTLERS"}
                </Text>
                <Text className="text-white/70 text-center text-sm mt-1">
                  {analysisMode === "age"
                    ? "Side view: neck, chest, belly & legs"
                    : "Side angle with all tines visible"}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Bottom Controls */}
        <View className="items-center pb-8">
          {/* Horizontal Zoom Slider - Easy one-handed operation */}
          {!isBurstCapturing && !isCountingDown && (
            <View className="mb-4 px-6 w-full">
              <View className="bg-black/60 rounded-xl p-3">
                <View className="flex-row items-center">
                  <Ionicons name="remove" size={20} color="white" />
                  <Slider
                    style={{ flex: 1, height: 40, marginHorizontal: 8 }}
                    minimumValue={minZoom}
                    maximumValue={maxZoom}
                    value={zoom}
                    onValueChange={setZoom}
                    minimumTrackTintColor={analysisMode === "age" ? "#22c55e" : "#a855f7"}
                    maximumTrackTintColor="rgba(255,255,255,0.3)"
                    thumbTintColor="#ffffff"
                  />
                  <Ionicons name="add" size={20} color="white" />
                  <View className="ml-2 bg-black/70 px-2 py-1 rounded min-w-[48px] items-center">
                    <Text className="text-white text-xs font-semibold">{zoom.toFixed(1)}x</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Pro Tips Section */}
          {!isBurstCapturing && !isCountingDown && (
            <View className="mb-4 px-6 w-full">
              <Pressable
                onPress={() => setShowProTips(!showProTips)}
                className="flex-row items-center justify-center bg-blue-600/80 px-4 py-3 rounded-lg mb-3"
              >
                <Ionicons name="bulb" size={20} color="white" />
                <Text className="text-white font-semibold ml-2">
                  {showProTips ? "Hide Pro Tips" : "Show Pro Tips for Best Results"}
                </Text>
                <Ionicons
                  name={showProTips ? "chevron-up" : "chevron-down"}
                  size={20}
                  color="white"
                  style={{ marginLeft: 8 }}
                />
              </Pressable>

              {showProTips && (
                <View className="bg-black/80 rounded-lg p-4">
                  <Text className="text-white font-bold text-base mb-3">
                    {analysisMode === "age" ? "Age My Deer - Pro Tips" : "Score My Rack - Pro Tips"}
                  </Text>

                  {analysisMode === "age" ? (
                    <>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 2 }} />
                        <Text className="text-white text-sm ml-2 flex-1">
                          Frame the FULL BODY from side view - neck, chest, belly, legs visible
                        </Text>
                      </View>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 2 }} />
                        <Text className="text-white text-sm ml-2 flex-1">
                          Deer moving naturally? Perfect! Burst mode captures multiple angles
                        </Text>
                      </View>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 2 }} />
                        <Text className="text-white text-sm ml-2 flex-1">
                          Best during rut when neck is swollen (Sept-Nov)
                        </Text>
                      </View>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="alert-circle" size={16} color="#f59e0b" style={{ marginTop: 2 }} />
                        <Text className="text-gray-300 text-sm ml-2 flex-1">
                          Avoid head-only shots or mounted deer - needs full body features
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 2 }} />
                        <Text className="text-white text-sm ml-2 flex-1">
                          Frame the ENTIRE RACK from side or slight angle - all tines visible
                        </Text>
                      </View>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 2 }} />
                        <Text className="text-white text-sm ml-2 flex-1">
                          Deer moving head? Perfect! Burst captures different angles for better 3D measurements
                        </Text>
                      </View>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 2 }} />
                        <Text className="text-white text-sm ml-2 flex-1">
                          Good lighting with clear contrast - avoid shadows on antlers
                        </Text>
                      </View>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 2 }} />
                        <Text className="text-white text-sm ml-2 flex-1">
                          Skull/ears visible help AI estimate scale (pixels-per-inch)
                        </Text>
                      </View>
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="alert-circle" size={16} color="#f59e0b" style={{ marginTop: 2 }} />
                        <Text className="text-gray-300 text-sm ml-2 flex-1">
                          Avoid straight-on frontal views - tines overlap and hide true length
                        </Text>
                      </View>
                    </>
                  )}

                  <View className="mt-3 pt-3 border-t border-white/20">
                    <Text className="text-blue-400 text-xs font-semibold mb-1">
                      WHY MOVEMENT HELPS:
                    </Text>
                    <Text className="text-gray-300 text-xs leading-5">
                      Natural head movement during the 2-second burst gives the AI multiple perspectives. This helps overcome occlusions (branches, overlapping tines) and improves 3D depth estimation using parallax - the same way your eyes judge distance.
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Offline Warning */}
          {!isBurstCapturing && !isCountingDown && (!isConnected || isInternetReachable === false) && (
            <View className="mb-4 px-6 w-full">
              <View className="bg-red-600/90 rounded-xl p-4 border-2 border-red-400">
                <View className="flex-row items-start mb-3">
                  <Ionicons name="cloud-offline" size={24} color="white" />
                  <Text className="text-white font-bold text-base ml-2 flex-1">
                    {analysisMode === "age" ? "Age Estimation Unavailable" : "Limited Connectivity Detected"}
                  </Text>
                </View>

                {analysisMode === "age" ? (
                  <>
                    <Text className="text-white text-sm mb-3 leading-5">
                      <Text className="font-bold">Age My Deer</Text> requires internet for real-time AI analysis. You are currently in a low/no signal area.
                    </Text>

                    {/* Manual Guide Button */}
                    <Pressable
                      onPress={() => navigation.navigate("OfflineAgeGuide")}
                      className="rounded-lg p-4 mb-3"
                      style={{ backgroundColor: "#22c55e" }}
                    >
                      <View className="flex-row items-center justify-center mb-1">
                        <Ionicons name="book" size={20} color="white" />
                        <Text className="text-white font-bold text-base ml-2">
                          Use Manual Field Guide
                        </Text>
                      </View>
                      <Text className="text-white/90 text-xs text-center">
                        Interactive checklist for manual age estimation
                      </Text>
                    </Pressable>

                    <View className="bg-white/20 rounded-lg p-3">
                      <Text className="text-white text-xs font-semibold mb-2">
                        COMING SOON: Offline Mode
                      </Text>
                      <Text className="text-white/90 text-xs leading-4">
                        We are building offline age estimation for remote hunting areas. Get notified when this feature launches by visiting Settings.
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text className="text-white text-sm mb-3 leading-5">
                      You can <Text className="font-bold">still capture photos</Text> for rack scoring. Analysis will start automatically when signal returns.
                    </Text>
                    <View className="bg-white/20 rounded-lg p-3">
                      <View className="flex-row items-start mb-2">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 1 }} />
                        <Text className="text-white/90 text-xs ml-2 flex-1">
                          Photos saved to queue
                        </Text>
                      </View>
                      <View className="flex-row items-start">
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginTop: 1 }} />
                        <Text className="text-white/90 text-xs ml-2 flex-1">
                          Auto-sync when connected
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Progress Bar and Hold Still Message */}
          {isBurstCapturing && (
            <View className="mb-6 items-center">
              <View className="w-64 h-2 bg-white/20 rounded-full overflow-hidden mb-3">
                <View
                  className="h-full bg-green-500"
                  style={{ width: `${captureProgress}%` }}
                />
              </View>
              <Text className="text-white text-lg font-bold mb-1">
                Keep Camera Steady!
              </Text>
              <Text className="text-white/80 text-sm">
                Capturing frame {Math.ceil((captureProgress / 100) * 8)} of 8
              </Text>
            </View>
          )}

          {/* Capture Button */}
          <Pressable
            onPress={startCountdown}
            disabled={isBurstCapturing || isProcessing || isCountingDown}
            className="items-center"
          >
            <View className="w-20 h-20 rounded-full bg-white/20 items-center justify-center">
              <View className="w-16 h-16 rounded-full bg-white items-center justify-center">
                {isBurstCapturing || isProcessing || isCountingDown ? (
                  <ActivityIndicator size="large" color="#000" />
                ) : (
                  <Ionicons name="camera" size={32} color="#000" />
                )}
              </View>
            </View>
            <Text className="text-white text-sm mt-3 font-medium">
              {isCountingDown ? "Get Ready..." : isBurstCapturing ? "Capturing..." : isProcessing ? "Processing..." : "Tap to Capture"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Distance Picker Modal */}
      <DistancePicker
        visible={showDistancePicker}
        onSave={handleDistanceSave}
        onSkip={handleDistanceSkip}
        suggestedDistance={suggested?.distance}
        suggestedDistanceTimestamp={suggested?.timestamp}
        showBanner={false}
        enableRangefinderButton={enableRangefinder}
      />
    </View>
  );
};
