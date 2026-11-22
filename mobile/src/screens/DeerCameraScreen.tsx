/**
 * Deer Camera Screen - One-Tap Burst Capture
 */

import React, { useState, useRef, useEffect } from "react";
import { Alert, View, Text, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useNetworkStore } from "../state/networkStore";
import { DeerAnalysisFrame } from "../types/deer-scoring";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { AntlerSilhouette } from "../components/AntlerSilhouette";
import { FramingBrackets } from "../components/FramingBrackets";
import { HuntRegionSheet } from "../components/HuntRegionSheet";
import { huntConfirmedToday, useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";
import { useSubjectFill } from "../hooks/useSubjectFill";
import { useWindowBox } from "../hooks/useWindowBox";
import { isSubjectFillAvailable } from "../lib/subject-fill";
import {
  FRAME_GOLD,
  FRAME_GREEN,
  frameBodyGoodHintFromCopy,
  frameBodyHintFromCopy,
} from "../lib/frame-fill";
import { BURST_INTERVAL_MS, burstFrameCount } from "../lib/burst";
import { BODY_BOX_ASPECT, BODY_BOX_LIFT, BODY_BOX_WIDTH } from "../lib/frame-fill";

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


  // Use individual selectors to avoid unnecessary re-renders
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const stopCapture = useDeerScoringStore((s) => s.stopCapture);
  const processFrames = useDeerScoringStore((s) => s.processFrames);
  const isProcessing = useDeerScoringStore((s) => s.isProcessing);
  const analysisMode = useDeerScoringStore((s) => s.analysisMode);
  const burstFrames = burstFrameCount(analysisMode);
  const huntReady = useHunterProfile((s) => huntConfirmedToday(s));
  const frameBodyHint = frameBodyHintFromCopy(useRemoteConfig((s) => s.copy.frameBodyHint));
  const frameBodyGoodHint = frameBodyGoodHintFromCopy(useRemoteConfig((s) => s.copy.frameBodyGoodHint));
  const previewLayout = useWindowBox();
  const guideLayout = useWindowBox();
  const bodyMode = analysisMode === "age";
  const canDetectFill = bodyMode && isSubjectFillAvailable();
  const bodyFilled = useSubjectFill({
    enabled: canDetectFill && !isBurstCapturing && !isCountingDown && !isProcessing,
    cameraRef,
    preview: previewLayout.box,
    guide: guideLayout.box,
  });
  const bracketColor = bodyFilled ? FRAME_GREEN : FRAME_GOLD;
  // Body box: about 90% of screen width, 3:2 wide like a deer standing broadside.
  // Rack mode keeps its old box. The green-fill check measures this box on screen.
  const guideWidth = bodyMode ? width * BODY_BOX_WIDTH : width * 0.85;
  const guideHeight = bodyMode ? guideWidth / BODY_BOX_ASPECT : height * 0.30;


  // Network state
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);

  const [showProTips, setShowProTips] = useState(false);

  // Get min and max zoom from device
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 10, 10); // Cap at 10x for usability

  // Request camera permissions
  useEffect(() => {
    if (!huntReady || hasPermission) return;
    requestPermission();
  }, [huntReady, hasPermission, requestPermission]);

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

  const proceedToAnalysis = async (frames: DeerAnalysisFrame[]) => {
    // Check if we're offline
    const isOffline = !isConnected || isInternetReachable === false;

    if (isOffline) {
      Alert.alert(
        analysisMode === "age" ? "Age mode is offline" : "You're offline",
        "DeerAge needs a connection to estimate age and score. The manual field guide on Home works without a signal.",
      );
      return;
    }

    if (frames.length === 0) {
      Alert.alert("No frames captured", "The burst didn't capture any frames. Hold the phone steady and try again.");
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

  // Handle one-tap burst capture
  const handleBurstCapture = async () => {
    if (!cameraRef.current || isBurstCapturing) return;

    setIsBurstCapturing(true);
    startCapture();
    // Haptic feedback when capture starts
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Age: 4 frames over about 1 s. Rack/score: 8 frames over about 2 s. Same 4 fps interval.
      const totalFrames = burstFrames;
      const intervalMs = BURST_INTERVAL_MS;
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
        Alert.alert("No frames captured", "The burst didn't capture any frames. Hold the phone steady and try again.");
        return;
      }

      await proceedToAnalysis(capturedFrames);
    } catch (error) {
      console.error("Burst capture error:", error);
      setIsBurstCapturing(false);
      setCaptureProgress(0);
      stopCapture();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Couldn't capture", "The burst didn't finish. Hold the phone steady and try again.");
    }
  };


  if (!huntReady) return <HuntRegionSheet />;

  if (!hasPermission) {
    return (
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
        <Pressable
          testID="camera-close"
          onPress={() => navigation.goBack()}
          className="w-10 h-10 items-center justify-center ml-6 mt-4"
        >
          <Ionicons name="close" size={24} color="white" />
        </Pressable>
        <View className="flex-1 items-center justify-center">
          <Ionicons name="camera-outline" size={64} color="#666" />
          <Text className="text-white text-lg mt-4">Camera permission required</Text>
          <Text className="text-gray-400 text-sm mt-2 text-center px-8">
            Please enable camera access to use the Deer Age scoring feature.
          </Text>
        </View>
      </View>
    );
  }

  if (!device) {
    return (
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
        <Pressable
          testID="camera-close"
          onPress={() => navigation.goBack()}
          className="w-10 h-10 items-center justify-center ml-6 mt-4"
        >
          <Ionicons name="close" size={24} color="white" />
        </Pressable>
        <View className="flex-1 items-center justify-center">
          <Ionicons name="camera-outline" size={64} color="#666" />
          <Text className="text-white text-lg mt-4">No camera available</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* Camera View */}
      <View
        ref={previewLayout.ref}
        onLayout={previewLayout.onLayout}
        style={{ width, height }}
      >
      <Camera
        ref={cameraRef}
        style={{ width, height }}
        device={device}
        isActive={isActive && !isProcessing}
        photo={true}
        video={canDetectFill}
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

        {/* Center Viewfinder Guide (body box sits slightly above middle) */}
        <View
          className="flex-1 items-center justify-center"
          pointerEvents="none"
          style={bodyMode ? { paddingBottom: height * BODY_BOX_LIFT } : undefined}
        >
          {isCountingDown ? (
            <View className="items-center">
              <View className="w-32 h-32 rounded-full bg-black/70 items-center justify-center border-4 border-amber-500">
                <Text className="text-white text-6xl font-black">{countdownValue}</Text>
              </View>
              <View className="mt-4 bg-amber-600/90 px-6 py-3 rounded-full">
                <Text className="text-white text-base font-bold text-center">
                  {`GET READY - Hold still for ${burstFrames} photos!`}
                </Text>
              </View>
            </View>
          ) : isBurstCapturing ? (
            <View className="items-center">
              {bodyMode ? (
                <View style={{ width: guideWidth, height: guideHeight }}>
                  <FramingBrackets width={guideWidth} height={guideHeight} color={bracketColor} />
                </View>
              ) : (
                <View
                  className="border-2 border-green-500/60 rounded-xl items-center justify-center"
                  style={{ width: guideWidth, height: guideHeight }}
                >
                  <AntlerSilhouette size={130} color="#F5F5DC" opacity={0.85} />
                </View>
              )}
              <View className="mt-4 bg-green-600/90 px-6 py-3 rounded-full">
                <Text className="text-white text-base font-bold text-center">
                  {`HOLD STILL - Capturing ${burstFrames} photos...`}
                </Text>
              </View>
            </View>
          ) : (
            <>
              {bodyMode ? (
                <View
                  ref={guideLayout.ref}
                  onLayout={guideLayout.onLayout}
                  style={{ width: guideWidth, height: guideHeight }}
                >
                  <FramingBrackets width={guideWidth} height={guideHeight} color={bracketColor} />
                </View>
              ) : (
                <View
                  className="border-2 rounded-xl items-center justify-center"
                  style={{
                    width: guideWidth,
                    height: guideHeight,
                    borderColor: "rgba(168, 85, 247, 0.5)",
                  }}
                >
                  <AntlerSilhouette size={150} color="#F5F5DC" opacity={0.85} />
                </View>
              )}

              <View className="mt-6 bg-black/70 px-4 py-3 rounded-xl mx-8">
                {bodyMode ? (
                  <Text className="text-center font-bold text-base" style={{ color: bracketColor }}>
                    {bodyFilled ? frameBodyGoodHint : frameBodyHint}
                  </Text>
                ) : (
                  <>
                    <Text className="text-center font-bold text-base" style={{ color: "#a855f7" }}>
                      Frame the ANTLERS
                    </Text>
                    <Text className="text-white/70 text-center text-sm mt-1">
                      Side angle with all tines visible
                    </Text>
                  </>
                )}
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
                          Hold the phone steady so DeerAge can pick the sharpest shot
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
                    {analysisMode === "age" ? (
                      <>
                        <Text className="text-blue-400 text-xs font-semibold mb-1">
                          WHY HOLD STEADY:
                        </Text>
                        <Text className="text-gray-300 text-xs leading-5">
                          The burst takes several shots in about one second. DeerAge keeps the sharpest one for the age read.
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text className="text-blue-400 text-xs font-semibold mb-1">
                          WHY MOVEMENT HELPS:
                        </Text>
                        <Text className="text-gray-300 text-xs leading-5">
                          Natural head movement during the 2-second burst gives the AI multiple perspectives. This helps overcome occlusions (branches, overlapping tines) and improves 3D depth estimation using parallax - the same way your eyes judge distance.
                        </Text>
                      </>
                    )}
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
                Capturing frame {Math.ceil((captureProgress / 100) * burstFrames) || 1} of {burstFrames}
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

      </View>
    </View>
  );
};
