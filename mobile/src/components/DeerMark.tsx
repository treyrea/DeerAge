/**
 * Original buck mark, drawn for DeerAge.
 * A line-art profile, not an emoji or a stock illustration.
 */

import React from "react";
import Svg, { Path } from "react-native-svg";

interface MarkProps {
  size?: number;
  color?: string;
  opacity?: number;
}

/** Side-profile head for buttons, splash, and the share card. */
export const DeerMark = ({ size = 48, color = "#F5F5DC", opacity = 1 }: MarkProps) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <Path d="M34 34 C30 24 22 16 14 12" stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={opacity} />
      <Path d="M32 28 C26 20 24 20 16 22" stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={opacity} />
      <Path d="M36 32 C42 22 50 16 58 14" stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={opacity} />
      <Path d="M38 26 C46 18 52 18 58 20" stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={opacity} />
      <Path d="M30 36 L22 26 L34 34" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
      <Path d="M32 38 C40 34 52 36 60 42 C66 48 64 56 56 58 C48 60 40 56 36 50" stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={opacity} />
      <Path d="M36 50 C34 58 30 68 26 76" stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={opacity} />
      <Path d="M58 44 C64 46 66 50 60 52" stroke={color} strokeWidth={2.4} strokeLinecap="round" opacity={opacity} />
    </Svg>
  );
};

/** Standing profile for the camera frame. Shows neck, back, belly, and legs. */
export const DeerBodyMark = ({ size = 160, color = "#FFFFFF", opacity = 0.85 }: MarkProps) => {
  return (
    <Svg width={size} height={size * 0.56} viewBox="0 0 160 90" fill="none">
      <Path d="M22 78 L30 58" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M38 78 L34 58" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M30 58 C48 54 86 50 108 46" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M108 46 L116 38 C122 32 118 26 110 28" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M110 28 L104 16 L114 26" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
      <Path d="M116 34 C126 32 134 38 130 46 C126 50 118 50 114 46" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M104 24 C96 14 88 12 82 18" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M102 20 C94 12 92 16 86 20" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M114 48 L124 78" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M108 78 L112 58" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M48 56 L52 78" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
      <Path d="M34 58 C40 66 70 68 108 62" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={opacity} />
    </Svg>
  );
};
