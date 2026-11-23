import React, { type Ref } from "react";
import { Text, View } from "react-native";
import { FRAME_GOLD, FRAME_GREEN } from "../lib/frame-fill";
import { CREAM } from "../theme/contrast";
import { FramingBrackets } from "./FramingBrackets";

interface FramingGuideProps {
  width: number;
  height: number;
  filled: boolean;
  hint: string;
  goodHint: string;
  /** Short second line under the hint. Stays up in the gold and green states. */
  detail?: string;
  showCaption?: boolean;
  guideRef?: Ref<View>;
  onGuideLayout?: () => void;
}

/**
 * Shared camera viewfinder. Gold corner brackets, no center icon.
 * Turns green with the good hint when the subject fills the box.
 * Age My Deer, Score My Rack, and Quick Check all use this.
 */
export function FramingGuide({
  width,
  height,
  filled,
  hint,
  goodHint,
  detail,
  showCaption = true,
  guideRef,
  onGuideLayout,
}: FramingGuideProps) {
  const color = filled ? FRAME_GREEN : FRAME_GOLD;
  return (
    <>
      <View ref={guideRef} onLayout={onGuideLayout} style={{ width, height }}>
        <FramingBrackets width={width} height={height} color={color} />
      </View>
      {showCaption ? (
        <View className="mt-6 bg-black/70 px-4 py-3 rounded-xl mx-8">
          <Text className="text-center font-bold text-base" style={{ color }}>
            {filled ? goodHint : hint}
          </Text>
          {detail ? (
            <Text className="text-center text-sm mt-1" style={{ color: CREAM }}>
              {detail}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
