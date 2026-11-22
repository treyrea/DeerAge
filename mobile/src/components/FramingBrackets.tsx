import React from "react";
import { View, StyleSheet } from "react-native";
import { FRAME_ARM_PT, FRAME_GOLD, FRAME_OUTLINE, FRAME_STROKE_PT } from "../lib/frame-fill";

interface FramingBracketsProps {
  width: number;
  height: number;
  color?: string;
  strokePt?: number;
  armPt?: number;
  outlineColor?: string;
  outlinePt?: number;
}

const CORNERS = [
  { vertical: "top", horizontal: "left" },
  { vertical: "top", horizontal: "right" },
  { vertical: "bottom", horizontal: "left" },
  { vertical: "bottom", horizontal: "right" },
] as const;

/**
 * Four fully opaque corner brackets with a thin dark outline so they read
 * on bright snow and dark woods. Static — color is passed in by the caller.
 */
export function FramingBrackets({
  width,
  height,
  color = FRAME_GOLD,
  strokePt = FRAME_STROKE_PT,
  armPt = FRAME_ARM_PT,
  outlineColor = FRAME_OUTLINE,
  outlinePt = 1.5,
}: FramingBracketsProps) {
  return (
    <View pointerEvents="none" style={{ width, height }}>
      {CORNERS.map((corner) => (
        <View
          key={`${corner.vertical}-${corner.horizontal}`}
          style={[styles.corner, { width: armPt, height: armPt, [corner.vertical]: 0, [corner.horizontal]: 0 }]}
        >
          <View
            style={[
              styles.arm,
              {
                backgroundColor: outlineColor,
                width: armPt + outlinePt * 2,
                height: strokePt + outlinePt * 2,
                [corner.vertical]: -outlinePt,
                [corner.horizontal]: -outlinePt,
              },
            ]}
          />
          <View
            style={[
              styles.arm,
              {
                backgroundColor: outlineColor,
                width: strokePt + outlinePt * 2,
                height: armPt + outlinePt * 2,
                [corner.vertical]: -outlinePt,
                [corner.horizontal]: -outlinePt,
              },
            ]}
          />
          <View
            style={[
              styles.arm,
              {
                backgroundColor: color,
                width: armPt,
                height: strokePt,
                [corner.vertical]: 0,
                [corner.horizontal]: 0,
              },
            ]}
          />
          <View
            style={[
              styles.arm,
              {
                backgroundColor: color,
                width: strokePt,
                height: armPt,
                [corner.vertical]: 0,
                [corner.horizontal]: 0,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: "absolute",
  },
  arm: {
    position: "absolute",
  },
});
