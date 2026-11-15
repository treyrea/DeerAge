/**
 * Annotated Image Component - Shows image with red circles marking detected points
 */

import React, { useState } from "react";
import { View, Image, Dimensions } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

interface PointLocation {
  x: number;
  y: number;
  label: string;
  type: "normal" | "abnormal";
}

interface AnnotatedImageProps {
  imageUri: string;
  pointLocations?: PointLocation[];
  style?: any;
}

export const AnnotatedImage: React.FC<AnnotatedImageProps> = ({
  imageUri,
  pointLocations = [],
  style,
}) => {
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [layoutDimensions, setLayoutDimensions] = useState({ width: 0, height: 0 });

  // Get image dimensions when loaded
  React.useEffect(() => {
    Image.getSize(imageUri, (width, height) => {
      setImageDimensions({ width, height });
    });
  }, [imageUri]);

  // Calculate scale factor to map AI's pixel coordinates to display coordinates
  const scaleX = layoutDimensions.width / imageDimensions.width || 1;
  const scaleY = layoutDimensions.height / imageDimensions.height || 1;

  return (
    <View
      style={style}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setLayoutDimensions({ width, height });
      }}
    >
      <Image
        source={{ uri: imageUri }}
        style={{ width: "100%", height: "100%" }}
        resizeMode="contain"
      />

      {/* SVG Overlay with red circles */}
      {pointLocations.length > 0 && layoutDimensions.width > 0 && (
        <Svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        >
          {pointLocations.map((point, index) => {
            const displayX = point.x * scaleX;
            const displayY = point.y * scaleY;

            return (
              <React.Fragment key={index}>
                {/* Red circle */}
                <Circle
                  cx={displayX}
                  cy={displayY}
                  r={8}
                  stroke={point.type === "abnormal" ? "#fbbf24" : "#ef4444"}
                  strokeWidth={3}
                  fill="transparent"
                />
                {/* Small dot in center */}
                <Circle
                  cx={displayX}
                  cy={displayY}
                  r={2}
                  fill={point.type === "abnormal" ? "#fbbf24" : "#ef4444"}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      )}
    </View>
  );
};
