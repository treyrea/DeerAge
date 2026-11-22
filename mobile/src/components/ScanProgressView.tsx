/**
 * The waiting screen: his photo, one thin bar, one short line about what is
 * happening, and an honest time left. Nothing else.
 */

import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Image, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BLIND } from "../utils/blind-verdict";
import { MODE_TITLE, progressView, secondsLeftText, type ScanMode } from "../lib/scan-progress";
import { useScanProgress } from "../state/scanProgress";
import { usePhotoAspect } from "../hooks/usePhotoAspect";
import { fittedPhotoHeight } from "../lib/photo-fit";

const TICK_MS = 250;

export function useScanProgressView(fallbackMode: ScanMode) {
  const mode = useScanProgress((s) => s.mode) ?? fallbackMode;
  const startedAt = useScanProgress((s) => s.startedAt);
  const server = useScanProgress((s) => s.server);
  const receivedAt = useScanProgress((s) => s.receivedAt);
  const done = useScanProgress((s) => s.done);
  const shown = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    shown.current = 0;
  }, [startedAt]);
  useEffect(() => {
    if (done) return undefined;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [done]);
  const view = progressView({ mode, startedAt: startedAt || now, now, server, receivedAt, shown: shown.current, done });
  shown.current = view.fraction;
  return { mode, ...view };
}

function PhotoSweep({ width, height }: { width: number; height: number }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const [still, setStill] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (still) return undefined;
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [still, sweep]);
  if (still) return null;
  const band = width * 0.5;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: band,
        transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, width] }) }],
      }}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ width: band, height }}
      />
    </Animated.View>
  );
}

export function ScanProgressBar({ fraction, track = "#2C2C2E", fill = BLIND.ink }: { fraction: number; track?: string; fill?: string }) {
  const width = useRef(new Animated.Value(fraction)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: fraction, duration: fraction >= 1 ? 200 : TICK_MS * 2, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [fraction, width]);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={{ height: 4, borderRadius: 2, backgroundColor: track, overflow: "hidden" }}
    >
      <Animated.View
        style={{
          height: 4,
          borderRadius: 2,
          backgroundColor: fill,
          width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
        }}
      />
    </View>
  );
}

/** Full waiting screen body. */
export function ScanProgressView({ imageUri, fallbackMode, photoWidth }: { imageUri?: string; fallbackMode: ScanMode; photoWidth: number }) {
  const { mode, fraction, label, secondsLeft } = useScanProgressView(fallbackMode);
  // Whole photo (no cover crop) so the rack or body is never cut off.
  const aspect = usePhotoAspect(imageUri);
  const { height: screenHeight } = useWindowDimensions();
  const maxPhotoHeight = Math.round(Math.min(photoWidth * 1.25, screenHeight * 0.5));
  const photoHeight = fittedPhotoHeight(photoWidth, aspect, maxPhotoHeight, Math.round(photoWidth * 0.75));
  return (
    <View style={{ width: photoWidth, alignSelf: "center" }}>
      {imageUri ? (
        <View style={{ width: photoWidth, height: photoHeight, borderRadius: 20, overflow: "hidden", backgroundColor: "#1C1C1E" }}>
          <Image source={{ uri: imageUri }} style={{ width: photoWidth, height: photoHeight }} resizeMode="contain" />
          <PhotoSweep width={photoWidth} height={photoHeight} />
        </View>
      ) : null}
      <Text style={{ color: BLIND.muted, fontSize: 13, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 40 }}>
        {MODE_TITLE[mode]}
      </Text>
      <Text testID="scan-stage" accessibilityLiveRegion="polite" style={{ color: BLIND.ink, fontSize: 22, fontWeight: "600", marginTop: 6 }}>
        {label}
      </Text>
      <View style={{ marginTop: 18 }}>
        <ScanProgressBar fraction={fraction} />
      </View>
      <Text testID="scan-time-left" style={{ color: BLIND.muted, fontSize: 15, marginTop: 12, minHeight: 20 }}>
        {secondsLeftText(secondsLeft)}
      </Text>
    </View>
  );
}

/** Compact version over the Quick Check camera. */
export function ScanProgressCompact({ fallbackMode }: { fallbackMode: ScanMode }) {
  const { fraction, label, secondsLeft } = useScanProgressView(fallbackMode);
  return (
    <View style={{ width: 260, padding: 20, borderRadius: 20, backgroundColor: "rgba(18,20,16,0.82)" }}>
      <Text testID="scan-stage" style={{ color: BLIND.ink, fontSize: 20, fontWeight: "600" }}>{label}</Text>
      <View style={{ marginTop: 14 }}>
        <ScanProgressBar fraction={fraction} track="rgba(255,255,255,0.18)" />
      </View>
      <Text style={{ color: BLIND.muted, fontSize: 15, marginTop: 10, minHeight: 20 }}>{secondsLeftText(secondsLeft)}</Text>
    </View>
  );
}
