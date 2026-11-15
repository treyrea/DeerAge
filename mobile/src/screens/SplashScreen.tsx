/**
 * SplashScreen - Introductory load screen for Deer Age app
 * Shows for 2-3 seconds with hunting-themed branding before transitioning to main camera interface
 */

import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";

// Preload the rack icon during splash screen
const RackRulerIcon = require("../../assets/image-1765760310.png");

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const opacity = useSharedValue(0);
  const logoScale = useSharedValue(0.8);

  useEffect(() => {
    // Prefetch the rack icon image into expo-image cache
    Image.prefetch(RackRulerIcon);

    // Fade in animation
    opacity.value = withTiming(1, {
      duration: 400,
      easing: Easing.out(Easing.quad),
    });

    // Logo scale animation
    logoScale.value = withSequence(
      withTiming(1.05, { duration: 600, easing: Easing.out(Easing.back(1.2)) }),
      withTiming(1, { duration: 200 })
    );

    // Auto-dismiss after 2.5 seconds
    const timer = setTimeout(() => {
      opacity.value = withTiming(
        0,
        { duration: 300, easing: Easing.in(Easing.quad) },
        (finished) => {
          if (finished) {
            runOnJS(onFinish)();
          }
        }
      );
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const animatedLogoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animatedContainerStyle]}>
      {/* Camouflage-inspired gradient background - West Texas brush colors */}
      <LinearGradient
        colors={["#3D4A2F", "#5A6447", "#4A5339", "#2B3420"]}
        locations={[0, 0.3, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1 }}
      >
        {/* Dark overlay gradient for text contrast */}
        <LinearGradient
          colors={["rgba(20,20,20,0.6)", "rgba(10,10,10,0.8)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          {/* Subtle deer silhouette background (using text as icon) */}
          <View
            style={{
              position: "absolute",
              opacity: 0.08,
              top: "20%",
            }}
          >
            <Text style={{ fontSize: 180, color: "#F5F5DC" }}>🦌</Text>
          </View>

          <Animated.View
            style={[
              { alignItems: "center", justifyContent: "center", zIndex: 10 },
              animatedLogoStyle,
            ]}
          >
            {/* Main Logo Text - Rugged stencil-style */}
            <Text
              style={{
                fontSize: 64,
                fontWeight: "900",
                color: "#F5F5DC",
                letterSpacing: 3,
                textTransform: "uppercase",
                textShadowColor: "rgba(0,0,0,0.9)",
                textShadowOffset: { width: 2, height: 3 },
                textShadowRadius: 5,
                fontFamily: "System",
              }}
            >
              DEER AGE
            </Text>

            {/* Main Tagline */}
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: "#E5D4B8",
                letterSpacing: 2,
                marginTop: 14,
                textAlign: "center",
                textShadowColor: "rgba(0,0,0,0.9)",
                textShadowOffset: { width: 1, height: 2 },
                textShadowRadius: 4,
                paddingHorizontal: 20,
              }}
            >
              KNOW BEFORE YOU PULL THE TRIGGER
            </Text>

            {/* RackScore™ AI Branding */}
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: "#D4AF37",
                letterSpacing: 1.5,
                marginTop: 10,
                textAlign: "center",
                textShadowColor: "rgba(0,0,0,0.9)",
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 3,
                paddingHorizontal: 20,
              }}
            >
              Scoring powered by RackScore™ AI
            </Text>

            {/* Loading indicator in hunter orange */}
            <View style={{ marginTop: 44 }}>
              <ActivityIndicator size="large" color="#FF6600" />
            </View>
          </Animated.View>
        </LinearGradient>
      </LinearGradient>
    </Animated.View>
  );
};
