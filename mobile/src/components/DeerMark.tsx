/**
 * In-app mark. This is a crop of the app icon (mobile/icon.png):
 * the geometric gold-line buck head and magnifier on the green field,
 * with the wordmark left off. It is not a new drawing.
 */

import React from "react";
import { Image } from "react-native";

const MARK = require("../../assets/deerage-mark.png");

/** Width of the crop divided by its height. */
const ASPECT = 854 / 668;

interface MarkProps {
  size?: number;
  opacity?: number;
}

export const DeerMark = ({ size = 48, opacity = 1 }: MarkProps) => {
  return (
    <Image
      source={MARK}
      accessibilityLabel="DeerAge"
      resizeMode="contain"
      style={{ width: size, height: size / ASPECT, opacity }}
    />
  );
};
