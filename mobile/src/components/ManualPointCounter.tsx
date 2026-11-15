/**
 * Manual Point Counter v6 - Two-step left/right side counting with button-based pan
 * Uses directional buttons for panning to avoid gesture conflicts with tap-to-count
 */

import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import Slider from "@react-native-community/slider";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

interface Point {
  x: number;
  y: number;
  id: number;
}

interface ManualPointCounterProps {
  imageUri: string;
  initialLeftCount?: number;
  initialRightCount?: number;
  onConfirm?: (leftCount: number, rightCount: number, totalCount: number) => void;
  onCancel?: () => void;
}

type CountingStep = "right" | "left" | "review";

const IMAGE_SIZE = 350;
const CONTAINER_HEIGHT = 350;
const PAN_STEP = 30; // Pixels to move per button press

export const ManualPointCounter: React.FC<ManualPointCounterProps> = ({
  imageUri,
  initialLeftCount = 0,
  initialRightCount = 0,
  onConfirm,
  onCancel,
}) => {
  const [step, setStep] = React.useState<CountingStep>("right");
  const [rightPoints, setRightPoints] = React.useState<Point[]>([]);
  const [leftPoints, setLeftPoints] = React.useState<Point[]>([]);
  const [zoom, setZoom] = React.useState(1);
  const [containerWidth, setContainerWidth] = React.useState(350);
  const [panX, setPanX] = React.useState(0);
  const [panY, setPanY] = React.useState(0);

  // Animated values for smooth pan transitions
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scaleValue = useSharedValue(1);

  // Keep scale in sync with zoom state
  React.useEffect(() => {
    scaleValue.value = withSpring(zoom);
  }, [zoom, scaleValue]);

  // Get current points based on step
  const currentPoints = step === "right" ? rightPoints : leftPoints;
  const setCurrentPoints = step === "right" ? setRightPoints : setLeftPoints;

  // Calculate max pan bounds
  const getMaxPan = React.useCallback(() => {
    const scaledSize = IMAGE_SIZE * zoom;
    return {
      x: Math.max(0, (scaledSize - containerWidth) / 2),
      y: Math.max(0, (scaledSize - CONTAINER_HEIGHT) / 2),
    };
  }, [zoom, containerWidth]);

  // Reset pan when zoom changes
  React.useEffect(() => {
    setPanX(0);
    setPanY(0);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
  }, [zoom, translateX, translateY]);

  // Pan control functions
  const handlePan = React.useCallback((direction: "up" | "down" | "left" | "right") => {
    const maxPan = getMaxPan();

    setPanX(prev => {
      let newX = prev;
      if (direction === "left") newX = Math.min(maxPan.x, prev + PAN_STEP);
      if (direction === "right") newX = Math.max(-maxPan.x, prev - PAN_STEP);
      translateX.value = withSpring(newX);
      return newX;
    });

    setPanY(prev => {
      let newY = prev;
      if (direction === "up") newY = Math.min(maxPan.y, prev + PAN_STEP);
      if (direction === "down") newY = Math.max(-maxPan.y, prev - PAN_STEP);
      translateY.value = withSpring(newY);
      return newY;
    });
  }, [getMaxPan, translateX, translateY]);

  const handleResetPan = React.useCallback(() => {
    setPanX(0);
    setPanY(0);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
  }, [translateX, translateY]);

  // Handle tap on image to add point
  const handleImagePress = React.useCallback((event: { nativeEvent: { locationX: number; locationY: number } }) => {
    if (step === "review") return;

    const { locationX, locationY } = event.nativeEvent;

    // The Pressable is inside the Animated.View which is scaled,
    // so locationX/locationY are already in the image's coordinate space (0-350)
    const imageX = locationX;
    const imageY = locationY;

    // Only add point if within image bounds
    if (imageX >= 0 && imageX <= IMAGE_SIZE && imageY >= 0 && imageY <= IMAGE_SIZE) {
      const newPoint: Point = {
        x: imageX,
        y: imageY,
        id: Date.now(),
      };
      setCurrentPoints((prevPoints) => [...prevPoints, newPoint]);
    }
  }, [step, setCurrentPoints]);

  // Animated style for the image container
  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scaleValue.value },
    ],
  }));

  const handleUndo = React.useCallback(() => {
    setCurrentPoints((prevPoints) => {
      if (prevPoints.length === 0) return prevPoints;
      return prevPoints.slice(0, -1);
    });
  }, [setCurrentPoints]);

  const handleReset = React.useCallback(() => {
    setCurrentPoints([]);
  }, [setCurrentPoints]);

  const handleNextStep = () => {
    if (step === "right") {
      setStep("left");
      setZoom(1);
    } else if (step === "left") {
      setStep("review");
    }
  };

  const handlePreviousStep = () => {
    if (step === "left") {
      setStep("right");
      setZoom(1);
    } else if (step === "review") {
      setStep("left");
    }
  };

  const handleConfirmPress = React.useCallback(() => {
    const total = rightPoints.length + leftPoints.length;
    onConfirm?.(leftPoints.length, rightPoints.length, total);
  }, [onConfirm, rightPoints.length, leftPoints.length]);

  const handleContainerLayout = (event: { nativeEvent: { layout: { width: number } } }) => {
    const { width } = event.nativeEvent.layout;
    setContainerWidth(width);
  };

  const getStepTitle = () => {
    switch (step) {
      case "right":
        return "Step 1: Count RIGHT Antler";
      case "left":
        return "Step 2: Count LEFT Antler";
      case "review":
        return "Review Your Count";
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case "right":
        return "Tap each point on the RIGHT antler (deer's right side - LEFT side of image)";
      case "left":
        return "Tap each point on the LEFT antler (deer's left side - RIGHT side of image)";
      case "review":
        return "Review both sides and confirm your count";
    }
  };

  const getStepColor = () => {
    switch (step) {
      case "right":
        return "#3b82f6"; // Blue
      case "left":
        return "#22c55e"; // Green
      case "review":
        return "#D4AF37"; // Gold
    }
  };

  const canPan = zoom > 1;

  return (
    <View className="bg-neutral-800 rounded-xl overflow-hidden">
      {/* Header */}
      <View style={{ backgroundColor: `${getStepColor()}20` }} className="p-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <Ionicons
              name={step === "review" ? "checkmark-circle" : "hand-left"}
              size={20}
              color={getStepColor()}
            />
            <Text style={{ color: getStepColor() }} className="font-semibold ml-2">
              {getStepTitle()}
            </Text>
          </View>
          {/* Step indicators */}
          <View className="flex-row items-center">
            <View
              className="w-2 h-2 rounded-full mx-0.5"
              style={{ backgroundColor: step === "right" ? getStepColor() : "#666" }}
            />
            <View
              className="w-2 h-2 rounded-full mx-0.5"
              style={{ backgroundColor: step === "left" ? "#22c55e" : "#666" }}
            />
            <View
              className="w-2 h-2 rounded-full mx-0.5"
              style={{ backgroundColor: step === "review" ? "#D4AF37" : "#666" }}
            />
          </View>
        </View>
        <Text className="text-gray-300 text-xs">{getStepDescription()}</Text>

        {/* Current count display */}
        {step !== "review" && (
          <View className="flex-row items-center mt-2">
            <Text className="text-gray-300 text-xs">
              {step === "right" ? "Right" : "Left"} antler points:{" "}
            </Text>
            <Text className="text-white font-bold text-xl ml-1">
              {currentPoints.length}
            </Text>
          </View>
        )}
      </View>

      {/* Review Summary */}
      {step === "review" && (
        <View className="bg-neutral-700/50 p-4">
          <View className="flex-row justify-around">
            <View className="items-center">
              <Text className="text-gray-400 text-xs mb-1">Right Antler</Text>
              <Text className="text-3xl font-bold text-blue-400">{rightPoints.length}</Text>
            </View>
            <View className="items-center">
              <Text className="text-gray-400 text-xs mb-1">Left Antler</Text>
              <Text className="text-3xl font-bold text-green-400">{leftPoints.length}</Text>
            </View>
            <View className="items-center">
              <Text className="text-gray-400 text-xs mb-1">Total</Text>
              <Text className="text-3xl font-bold text-yellow-400">
                {rightPoints.length + leftPoints.length}
              </Text>
            </View>
          </View>
          <Text className="text-center text-gray-400 text-xs mt-2">
            {rightPoints.length}x{leftPoints.length} = {rightPoints.length + leftPoints.length} point buck
          </Text>
        </View>
      )}

      {/* Zoom Slider (not shown in review) */}
      {step !== "review" && (
        <View className="bg-neutral-700/50 px-6 py-3">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <Ionicons name="search" size={16} color="#9ca3af" />
              <Text className="text-gray-400 text-xs ml-2">Zoom</Text>
            </View>
            <Text className="text-white font-bold text-sm">{zoom.toFixed(1)}x</Text>
          </View>
          <Slider
            style={{ width: "100%", height: 30 }}
            minimumValue={1}
            maximumValue={5}
            step={0.1}
            value={zoom}
            onValueChange={setZoom}
            minimumTrackTintColor={getStepColor()}
            maximumTrackTintColor="#4b5563"
            thumbTintColor={getStepColor()}
          />
        </View>
      )}

      {/* Image Area and Pan Controls */}
      <View className="flex-row">
        {/* Image Container */}
        <View style={styles.imageContainer} onLayout={handleContainerLayout} className="flex-1">
          <View style={styles.imageWrapper}>
            <Animated.View style={[styles.animatedContainer, animatedImageStyle]}>
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="contain"
              />

              {/* Point Markers - Show all points in review, only current side otherwise */}
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                {/* Right antler points (blue) - show when counting right or in review */}
                {(step === "right" || step === "review") && rightPoints.map((point) => (
                  <React.Fragment key={`right-${point.id}`}>
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={12 / zoom}
                      stroke="#3b82f6"
                      strokeWidth={2 / zoom}
                      fill="rgba(59, 130, 246, 0.3)"
                    />
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={2 / zoom}
                      fill="#ffffff"
                    />
                  </React.Fragment>
                ))}

                {/* Left antler points (green) - show when counting left or in review */}
                {(step === "left" || step === "review") && leftPoints.map((point) => (
                  <React.Fragment key={`left-${point.id}`}>
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={12 / zoom}
                      stroke="#22c55e"
                      strokeWidth={2 / zoom}
                      fill="rgba(34, 197, 94, 0.3)"
                    />
                    <Circle
                      cx={point.x}
                      cy={point.y}
                      r={2 / zoom}
                      fill="#ffffff"
                    />
                  </React.Fragment>
                ))}
              </Svg>

              {/* Tap overlay for adding points - covers the image area */}
              {step !== "review" && (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={handleImagePress}
                />
              )}
            </Animated.View>
          </View>
        </View>

        {/* Pan Controls - D-Pad style, shown when zoomed in */}
        {canPan && step !== "review" && (
          <View className="w-20 bg-neutral-700/50 justify-center items-center py-2">
            <Text className="text-gray-400 text-xs mb-2">Pan</Text>

            {/* Up */}
            <Pressable
              onPress={() => handlePan("up")}
              className="bg-neutral-600 rounded-lg p-2 mb-1 active:bg-neutral-500"
            >
              <Ionicons name="chevron-up" size={20} color="#fff" />
            </Pressable>

            {/* Left, Center, Right */}
            <View className="flex-row items-center">
              <Pressable
                onPress={() => handlePan("left")}
                className="bg-neutral-600 rounded-lg p-2 mr-1 active:bg-neutral-500"
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </Pressable>

              {/* Center reset button */}
              <Pressable
                onPress={handleResetPan}
                className="bg-neutral-500 rounded-full p-2 active:bg-neutral-400"
              >
                <Ionicons name="locate" size={16} color="#fff" />
              </Pressable>

              <Pressable
                onPress={() => handlePan("right")}
                className="bg-neutral-600 rounded-lg p-2 ml-1 active:bg-neutral-500"
              >
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </Pressable>
            </View>

            {/* Down */}
            <Pressable
              onPress={() => handlePan("down")}
              className="bg-neutral-600 rounded-lg p-2 mt-1 active:bg-neutral-500"
            >
              <Ionicons name="chevron-down" size={20} color="#fff" />
            </Pressable>
          </View>
        )}
      </View>

      {/* Legend in review mode */}
      {step === "review" && (
        <View className="flex-row justify-center py-2 bg-neutral-700/30">
          <View className="flex-row items-center mx-4">
            <View className="w-3 h-3 rounded-full bg-blue-500 mr-2" />
            <Text className="text-gray-300 text-xs">Right ({rightPoints.length})</Text>
          </View>
          <View className="flex-row items-center mx-4">
            <View className="w-3 h-3 rounded-full bg-green-500 mr-2" />
            <Text className="text-gray-300 text-xs">Left ({leftPoints.length})</Text>
          </View>
        </View>
      )}

      {/* Controls */}
      <View className="p-3 gap-2">
        {/* Undo/Reset (not in review) */}
        {step !== "review" && (
          <View className="flex-row gap-2">
            <Pressable
              onPress={handleUndo}
              disabled={currentPoints.length === 0}
              className={`flex-1 rounded-lg py-3 items-center ${
                currentPoints.length === 0 ? "bg-neutral-700" : "bg-orange-600"
              }`}
            >
              <View className="flex-row items-center">
                <Ionicons name="arrow-undo" size={18} color="white" />
                <Text className="text-white font-semibold ml-2">Undo</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handleReset}
              disabled={currentPoints.length === 0}
              className={`flex-1 rounded-lg py-3 items-center ${
                currentPoints.length === 0 ? "bg-neutral-700" : "bg-red-600"
              }`}
            >
              <View className="flex-row items-center">
                <Ionicons name="refresh" size={18} color="white" />
                <Text className="text-white font-semibold ml-2">Reset</Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Navigation buttons */}
        <View className="flex-row gap-2">
          {/* Back button */}
          {step !== "right" && (
            <Pressable
              onPress={handlePreviousStep}
              className="flex-1 rounded-lg py-3 items-center bg-neutral-600"
            >
              <View className="flex-row items-center">
                <Ionicons name="arrow-back" size={18} color="white" />
                <Text className="text-white font-semibold ml-2">
                  {step === "left" ? "Back to Right" : "Back to Left"}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Next/Confirm button */}
          {step !== "review" ? (
            <Pressable
              onPress={handleNextStep}
              style={{ backgroundColor: getStepColor() }}
              className="flex-1 rounded-lg py-3 items-center"
            >
              <View className="flex-row items-center">
                <Text className="text-white font-semibold mr-2">
                  {step === "right" ? `Next: Left Side (${rightPoints.length} marked)` : `Review (${leftPoints.length} marked)`}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="white" />
              </View>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleConfirmPress}
              className="flex-1 rounded-lg py-4 items-center bg-green-600"
            >
              <View className="flex-row items-center">
                <Ionicons name="checkmark-circle" size={20} color="white" />
                <Text className="text-white font-bold ml-2">
                  Confirm: {rightPoints.length + leftPoints.length} Points
                </Text>
              </View>
              <Text className="text-white/80 text-xs mt-1">
                {rightPoints.length} right + {leftPoints.length} left
              </Text>
            </Pressable>
          )}
        </View>

        {/* Cancel button */}
        {onCancel && (
          <Pressable
            onPress={onCancel}
            className="rounded-lg py-2 items-center"
          >
            <Text className="text-gray-400 text-sm">Cancel</Text>
          </Pressable>
        )}
      </View>

      {/* AI comparison footer */}
      {step === "review" && (initialLeftCount > 0 || initialRightCount > 0) && (
        <View className="bg-neutral-700/50 p-3">
          <Text className="text-gray-400 text-center text-xs">
            AI counted: {initialRightCount} right + {initialLeftCount} left = {initialLeftCount + initialRightCount} total
          </Text>
          {(rightPoints.length + leftPoints.length) !== (initialLeftCount + initialRightCount) && (
            <Text className="text-yellow-400 text-center text-xs mt-1">
              Difference: {(rightPoints.length + leftPoints.length) > (initialLeftCount + initialRightCount) ? "+" : ""}
              {(rightPoints.length + leftPoints.length) - (initialLeftCount + initialRightCount)} points
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  imageContainer: {
    height: CONTAINER_HEIGHT,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  imageWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  animatedContainer: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
});
