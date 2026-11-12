/**
 * Antler Silhouette SVG Component
 * Used as a viewfinder guide for rack scoring mode
 */

import React from "react";
import Svg, { Path } from "react-native-svg";

interface AntlerSilhouetteProps {
  size?: number;
  color?: string;
  opacity?: number;
}

export const AntlerSilhouette = ({
  size = 120,
  color = "#ffffff",
  opacity = 0.25,
}: AntlerSilhouetteProps) => {
  return (
    <Svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 120 90"
      fill="none"
    >
      {/* Left Antler */}
      <Path
        d="M60 85
           C55 75, 45 65, 35 55
           C30 50, 25 45, 20 35
           C18 30, 15 25, 10 20
           M35 55
           C30 55, 22 50, 15 45
           M25 42
           C20 40, 12 38, 5 35
           M20 35
           C15 30, 8 25, 3 18"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
      {/* Right Antler (mirrored) */}
      <Path
        d="M60 85
           C65 75, 75 65, 85 55
           C90 50, 95 45, 100 35
           C102 30, 105 25, 110 20
           M85 55
           C90 55, 98 50, 105 45
           M95 42
           C100 40, 108 38, 115 35
           M100 35
           C105 30, 112 25, 117 18"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
      />
      {/* Skull/Head base hint */}
      <Path
        d="M50 88 C55 90, 65 90, 70 88"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={opacity * 0.7}
      />
    </Svg>
  );
};
