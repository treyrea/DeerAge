/**
 * Full-screen photo. Pinch, pan, and double-tap are the gesture handler and
 * reanimated already in the 1.0.9 binary. Swipe down or the close button dismisses.
 */

import React, { useEffect } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

interface PhotoViewerProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
}

export const PhotoViewer: React.FC<PhotoViewerProps> = ({ visible, imageUri, onClose }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    dragY.value = 0;
  }, [visible, imageUri, scale, savedScale, translateX, translateY, savedTranslateX, savedTranslateY, dragY]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(4, Math.max(1, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        dragY.value = withSpring(0);
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value > 1.01 || event.numberOfPointers > 1) {
        translateX.value = savedTranslateX.value + event.translationX;
        translateY.value = savedTranslateY.value + event.translationY;
        dragY.value = 0;
        return;
      }
      dragY.value = event.translationY > 0 ? event.translationY : 0;
    })
    .onEnd((event) => {
      if (scale.value > 1.01) {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
        return;
      }
      const dismiss = event.translationY > 120 && event.translationY > Math.abs(event.translationX);
      if (dismiss) {
        runOnJS(onClose)();
        return;
      }
      dragY.value = withSpring(0);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        return;
      }
      scale.value = withSpring(2);
      savedScale.value = 2;
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const frameStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(Math.max(dragY.value, 0) / 380, 0.5),
  }));

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value + dragY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.root, { backgroundColor: "#000" }, frameStyle]}>
          <GestureDetector gesture={gesture}>
            <Animated.Image
              source={{ uri: imageUri }}
              style={[{ width, height }, imageStyle]}
              resizeMode="contain"
              accessibilityLabel="Full size photo"
            />
          </GestureDetector>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={onClose}
            hitSlop={8}
            style={[styles.close, { top: insets.top + 8 }]}
          >
            <View style={styles.closePlate}>
              <Ionicons name="close" size={26} color="#F5F5DC" />
            </View>
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  close: {
    position: "absolute",
    right: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closePlate: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
});
