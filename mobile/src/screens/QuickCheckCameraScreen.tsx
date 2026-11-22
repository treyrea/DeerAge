/**
 * Quick Check Camera Screen - Single tap, instant SHOOTER/LET WALK decision
 * Optimized for speed in hunting scenarios (about a 6 second result)
 */

import React, { useState, useRef, useEffect } from "react";
import { Alert, View, Text, Pressable, ActivityIndicator, Dimensions } from "react-native";
import { ScanProgressCompact } from "../components/ScanProgressView";
import { useScanProgress } from "../state/scanProgress";
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Slider from "@react-native-community/slider";
import { quickAgeCheck } from "../api/quick-age-check";
import { isAnalysisError } from "../api/errors";
import { FairUseLimitView } from "../components/FairUseLimit";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useNetworkStore } from "../state/networkStore";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { softPulse } from "../lib/haptics";
import { BUTTON_GREEN, CREAM, GOLD, INK } from "../theme/contrast";
import { tapSquare } from "../theme/tap";
import { FramingBrackets } from "../components/FramingBrackets";
import { HuntRegionSheet } from "../components/HuntRegionSheet";
import { huntConfirmedToday, useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";
import { useSubjectFill } from "../hooks/useSubjectFill";
import { useWindowBox } from "../hooks/useWindowBox";
import { isSubjectFillAvailable } from "../lib/subject-fill";
import { resultTimeBadge } from "../lib/result-time-badge";
import {
  BODY_BOX_ASPECT,
  BODY_BOX_LIFT,
  BODY_BOX_WIDTH,
  FRAME_GOLD,
  FRAME_GREEN,
  frameBodyGoodHintFromCopy,
  frameBodyHintFromCopy,
} from "../lib/frame-fill";

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
  const [fairUse, setFairUse] = useState<{ message: string; limit: "daily" | "monthly" | null; offerPacks: boolean } | null>(null);

  const propertyRules = useDeerScoringStore((s) => s.propertyRules);
  const huntReady = useHunterProfile((s) => huntConfirmedToday(s));
  const frameBodyHint = frameBodyHintFromCopy(useRemoteConfig((s) => s.copy.frameBodyHint));
  const frameBodyGoodHint = frameBodyGoodHintFromCopy(useRemoteConfig((s) => s.copy.frameBodyGoodHint));
  const previewLayout = useWindowBox();
  const guideLayout = useWindowBox();
  const canDetectFill = isSubjectFillAvailable();
  const bodyFilled = useSubjectFill({
    enabled: canDetectFill && !isCapturing && !isAnalyzing,
    cameraRef,
    preview: previewLayout.box,
    guide: guideLayout.box,
  });
  const bracketColor = bodyFilled ? FRAME_GREEN : FRAME_GOLD;
  // Body box: about 90% of screen width, 3:2 wide, slightly above middle.
  const guideWidth = width * BODY_BOX_WIDTH;
  const guideHeight = guideWidth / BODY_BOX_ASPECT;

  // Get min and max zoom from device
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 10, 10);

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

  // Single tap capture and analyze
  const handleQuickCapture = async () => {
    if (!cameraRef.current || isCapturing || isAnalyzing) return;

    const network = useNetworkStore.getState();
    if (!network.isConnected || network.isInternetReachable === false) {
      Alert.alert("You're offline", "Quick Check needs a connection. DeerAge sends the photo to estimate age.");
      return;
    }
    if (!useSubscriptionStore.getState().canStartAnalysis()) {
      navigation.navigate("TierPaywall", { reason: "free_limit" });
      return;
    }

    setIsCapturing(true);
    softPulse();

    try {
      // Take single photo. The shutter stays silent.
      const photo = await cameraRef.current.takePhoto({
        flash: "off",
        enableShutterSound: false,
      });

      // Use the photo directly - the camera zoom already frames the subject
      const imageUri = `file://${photo.path}`;

      setIsCapturing(false);
      useScanProgress.getState().start("quick");
      setIsAnalyzing(true);

      // Run quick analysis (3-5 seconds)
      const result = await quickAgeCheck(imageUri, propertyRules.minimumShooterAge);

      useScanProgress.getState().finish();
      await new Promise((resolve) => setTimeout(resolve, 300));
      setIsAnalyzing(false);

      // Navigate to result screen
      navigation.replace("QuickCheckResult", {
        result,
        imageUri,
      });
    } catch (error) {
      setIsCapturing(false);
      setIsAnalyzing(false);
      const message = isAnalysisError(error) ? error.message : "Quick Check didn't finish. Check your connection and try again.";
      if (isAnalysisError(error) && error.code === "fair_use") {
        setFairUse({ message, limit: error.limit, offerPacks: error.creditsBypass });
        softPulse();
        return;
      }
      console.error("Quick capture error:", error);
      softPulse();
      Alert.alert(isAnalysisError(error) && error.code === "quota" ? "Free analyses used" : isAnalysisError(error) && error.code === "not_configured" ? "Can't reach DeerAge" : "Quick Check failed", message, isAnalysisError(error) && error.code === "quota" ? [
        { text: "Not now", style: "cancel" },
        { text: "See plans", onPress: () => navigation.navigate("TierPaywall", { reason: "free_limit" }) },
      ] : undefined);
    }
  };

  if (fairUse) {
    return (
      <FairUseLimitView
        message={fairUse.message}
        limit={fairUse.limit}
        offerPacks={fairUse.offerPacks}
        onHome={() => navigation.popToTop()}
        onAdded={() => setFairUse(null)}
      />
    );
  }

  if (!huntReady) return <HuntRegionSheet />;

  if (!hasPermission) {
    return (
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
        <Pressable
          testID="camera-close"
          accessibilityLabel="Close"
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={[tapSquare, { marginLeft: 24, marginTop: 16 }]}
        >
          <Ionicons name="close" size={26} color="white" />
        </Pressable>
        <View className="flex-1 items-center justify-center">
          <Ionicons name="camera-outline" size={64} color="#666" />
          <Text className="text-white text-lg mt-4">Camera permission required</Text>
          <Pressable
            onPress={requestPermission}
            style={{ marginTop: 16, backgroundColor: BUTTON_GREEN, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: CREAM, fontWeight: "600" }}>Grant Permission</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!device) {
    return (
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top }}>
        <Pressable
          testID="camera-close"
          accessibilityLabel="Close"
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={[tapSquare, { marginLeft: 24, marginTop: 16 }]}
        >
          <Ionicons name="close" size={26} color="white" />
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
        isActive={isActive && !isAnalyzing}
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
        {/* Top Bar */}
        <View className="flex-row items-center justify-between px-6 py-4">
          <View style={{ width: 44 }} />

          <View className="px-4 py-2 rounded-full flex-row items-center" style={{ backgroundColor: GOLD }}>
            <Ionicons name="flash" size={16} color={INK} />
            <Text className="text-sm font-bold ml-2" style={{ color: INK }}>QUICK CHECK</Text>
          </View>

          <View style={{ width: 44 }} />
        </View>

        {/* Center Guide - Body focused - LARGER */}
        <View
          className="flex-1 items-center justify-center"
          pointerEvents="none"
          style={{ paddingBottom: height * BODY_BOX_LIFT }}
        >
          {isAnalyzing ? (
            // Analyzing: one bar, one line, honest time left
            <ScanProgressCompact fallbackMode="quick" />
          ) : (
            // Ready to capture - LARGER viewer window
            <>
              <View
                ref={guideLayout.ref}
                onLayout={guideLayout.onLayout}
                style={{ width: guideWidth, height: guideHeight }}
              >
                <FramingBrackets width={guideWidth} height={guideHeight} color={bracketColor} />
              </View>

              <View className="mt-4 bg-black/70 px-4 py-2 rounded-xl mx-8">
                <Text className="text-center font-bold text-base" style={{ color: bracketColor }}>
                  {bodyFilled ? frameBodyGoodHint : frameBodyHint}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Bottom Controls */}
        <View style={{ paddingBottom: insets.bottom + 16, paddingHorizontal: 24 }}>
          {/* Capture Button */}
          <View className="flex-row items-center justify-between mb-4">
            <Pressable
              testID="camera-close"
              accessibilityLabel="Close"
              onPress={() => navigation.goBack()}
              hitSlop={8}
              style={[tapSquare, { backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 22 }]}
            >
              <Ionicons name="close" size={26} color="white" />
            </Pressable>
            <Pressable
              onPress={handleQuickCapture}
              disabled={isCapturing || isAnalyzing}
              className="items-center"
            >
              <View
                className="w-20 h-20 rounded-full items-center justify-center"
                style={{ backgroundColor: isAnalyzing ? "rgba(212, 175, 55, 0.3)" : "rgba(212, 175, 55, 0.45)" }}
              >
                <View
                  className="w-16 h-16 rounded-full items-center justify-center"
                  style={{ backgroundColor: isAnalyzing ? "#78716c" : GOLD }}
                >
                  {isCapturing ? (
                    <ActivityIndicator size="large" color={INK} />
                  ) : (
                    <Ionicons name="flash" size={32} color={INK} />
                  )}
                </View>
              </View>
              <Text className="text-white text-sm mt-2 font-semibold">
                {isCapturing ? "Capturing..." : isAnalyzing ? " " : "Quick Check"}
              </Text>
            </Pressable>
            <View style={{ width: 44 }} />
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
              <View className="px-3 py-1.5 rounded-full flex-row items-center" style={{ backgroundColor: BUTTON_GREEN }}>
                <Ionicons name="timer" size={14} color={CREAM} />
                <Text className="text-xs font-semibold ml-1.5" style={{ color: CREAM }}>{resultTimeBadge("quick")}</Text>
              </View>
              <Text className="text-white/50 text-xs">
                Threshold: {propertyRules.minimumShooterAge}+ yrs
              </Text>
            </View>
          )}
        </View>
      </View>
      </View>
    </View>
  );
};
