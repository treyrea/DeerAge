/**
 * Pinned picture for one trait on the offline aging guide.
 * The buck is drawn from trait-drawings.ts. Only the highlighted part changes.
 */

import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SvgXml } from "react-native-svg";
import type { ScoreValue, TraitId } from "../lib/offline-age-guide";
import { GUIDE_PALETTE, buckSvg } from "../lib/trait-drawings";

const DRAWING_HEIGHT = 136;
const FADE_MS = 200;

type TraitPictureCardProps = {
  traitId: TraitId;
  name: string;
  icon: string;
  selected: ScoreValue | undefined;
  caption: string;
  onClear: () => void;
};

export function TraitPictureCard({ traitId, name, icon, selected, caption, onClear }: TraitPictureCardProps) {
  const xml = buckSvg(traitId, selected, `${traitId}-${String(selected ?? "none")}`);

  return (
    <View
      style={styles.card}
      accessibilityRole="image"
      accessibilityLabel={selected == null ? name : `${name}. ${caption}`}
    >
      <View style={styles.titleRow}>
        <View style={styles.icon}>
          <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={GUIDE_PALETTE.gold} />
        </View>
        <Text style={styles.name}>{name}</Text>
        {selected != null && (
          <Pressable onPress={onClear} style={styles.clear} accessibilityLabel={`Clear ${name}`}>
            <Text style={styles.clearText}>{selected === "skip" ? "—" : String(selected)}</Text>
          </Pressable>
        )}
      </View>
      <FadingBuck xml={xml} />
      <Text style={[styles.caption, selected == null && styles.captionIdle]} numberOfLines={2}>
        {caption}
      </Text>
    </View>
  );
}

function FadingBuck({ xml }: { xml: string }) {
  const [front, setFront] = useState(xml);
  const [back, setBack] = useState(xml);
  const [width, setWidth] = useState(0);
  const opacity = useSharedValue(1);
  const shown = useRef(xml);

  useEffect(() => {
    if (xml === shown.current) return;
    setBack(shown.current);
    setFront(xml);
    shown.current = xml;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.quad) });
  }, [opacity, xml]);

  const frontStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.art} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <SvgXml xml={back} width={width} height={DRAWING_HEIGHT} />
          </View>
          <Animated.View style={[StyleSheet.absoluteFill, frontStyle]} pointerEvents="none">
            <SvgXml xml={front} width={width} height={DRAWING_HEIGHT} />
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: GUIDE_PALETTE.picture,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GUIDE_PALETTE.card,
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
    backgroundColor: GUIDE_PALETTE.button,
  },
  name: {
    flex: 1,
    marginLeft: 10,
    color: GUIDE_PALETTE.cream,
    fontSize: 15,
    fontWeight: "700",
  },
  clear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GUIDE_PALETTE.gold,
  },
  clearText: {
    color: GUIDE_PALETTE.screen,
    fontSize: 16,
    fontWeight: "700",
  },
  art: {
    height: DRAWING_HEIGHT,
  },
  caption: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingBottom: 10,
    textAlign: "center",
    color: GUIDE_PALETTE.cream,
    fontSize: 13,
    fontWeight: "700",
  },
  captionIdle: {
    color: GUIDE_PALETTE.creamMuted,
    fontWeight: "500",
  },
});
