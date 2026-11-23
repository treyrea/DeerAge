/**
 * Pinned picture for one illustrated trait on the offline aging guide.
 * The WebP crossfades when the tapped level changes. No sound.
 */

import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { IllustratedTraitId } from "../lib/offline-age-guide-art";
import { PICTURE_WELL, guidePicture } from "../lib/offline-age-guide-art";
import type { ScoreValue } from "../lib/offline-age-guide";

const DRAWING_HEIGHT = 136;
const FADE_MS = 200;

const CREAM = "#F5F5DC";
const CREAM_MUTED = "#E5D4B8";
const GOLD = "#D4AF37";
const BUTTON = "#5A6447";
const INK = "#2B3420";

type TraitPictureCardProps = {
  traitId: IllustratedTraitId;
  name: string;
  icon: string;
  selected: ScoreValue | undefined;
  caption: string;
  onClear: () => void;
};

export function TraitPictureCard({ traitId, name, icon, selected, caption, onClear }: TraitPictureCardProps) {
  const source = guidePicture(traitId, selected);

  return (
    <View
      style={styles.card}
      accessibilityRole="image"
      accessibilityLabel={selected == null ? name : `${name}. ${caption}`}
    >
      <View style={styles.titleRow}>
        <View style={styles.icon}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={GOLD} />
        </View>
        <Text style={styles.name}>{name}</Text>
        {selected != null && (
          <Pressable onPress={onClear} style={styles.clear} accessibilityLabel={`Clear ${name}`}>
            <Text style={styles.clearText}>{selected === "skip" ? "—" : String(selected)}</Text>
          </Pressable>
        )}
      </View>
      <FadingPicture source={source} />
      <Text style={[styles.caption, selected == null && styles.captionIdle]} numberOfLines={2}>
        {caption}
      </Text>
    </View>
  );
}

function FadingPicture({ source }: { source: number }) {
  const [front, setFront] = useState(source);
  const [back, setBack] = useState(source);
  const opacity = useSharedValue(1);
  const shown = useRef(source);

  useEffect(() => {
    if (source === shown.current) return;
    setBack(shown.current);
    setFront(source);
    shown.current = source;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.quad) });
  }, [opacity, source]);

  const frontStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.art}>
      <Image source={back} contentFit="contain" style={styles.image} />
      <Animated.View style={[StyleSheet.absoluteFill, frontStyle]} pointerEvents="none">
        <Image source={front} contentFit="contain" style={styles.image} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: PICTURE_WELL,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2F5A40",
    overflow: "hidden",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BUTTON,
  },
  name: {
    flex: 1,
    marginLeft: 10,
    color: CREAM,
    fontSize: 15,
    fontWeight: "700",
  },
  clear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GOLD,
  },
  clearText: {
    color: INK,
    fontSize: 16,
    fontWeight: "700",
  },
  art: {
    height: DRAWING_HEIGHT,
    backgroundColor: PICTURE_WELL,
  },
  image: {
    width: "100%",
    height: DRAWING_HEIGHT,
    backgroundColor: PICTURE_WELL,
  },
  caption: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingBottom: 10,
    textAlign: "center",
    color: CREAM,
    fontSize: 13,
    fontWeight: "700",
  },
  captionIdle: {
    color: CREAM_MUTED,
    fontWeight: "500",
  },
});
