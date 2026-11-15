/**
 * Body Feature Overlay Component
 * Renders labeled bounding boxes over deer body features with interactive tap-to-focus
 */

import React, { useState } from "react";
import { View, Text, Image, Pressable, Modal, ScrollView, Dimensions } from "react-native";
import { BodyFeatureOverlay, AgeCue } from "../types/deer-scoring";
import { Ionicons } from "@expo/vector-icons";

interface Props {
  imageUri: string;
  overlays: BodyFeatureOverlay[];
  showOverlays: boolean;
  onToggleOverlays: () => void;
}

export const BodyFeatureOverlayComponent: React.FC<Props> = ({
  imageUri,
  overlays,
  showOverlays,
  onToggleOverlays,
}) => {
  const [selectedOverlay, setSelectedOverlay] = useState<BodyFeatureOverlay | null>(null);
  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0 });

  const handleOverlayPress = (overlay: BodyFeatureOverlay) => {
    setSelectedOverlay(overlay);
  };

  return (
    <View>
      {/* Toggle Button */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-semibold" style={{ color: "#E5D4B8" }}>
          Body Feature Analysis
        </Text>
        <Pressable
          onPress={onToggleOverlays}
          className="flex-row items-center px-3 py-2 rounded-lg"
          style={{ backgroundColor: showOverlays ? "#D4AF37" : "#5A6447" }}
        >
          <Ionicons
            name={showOverlays ? "eye" : "eye-off"}
            size={16}
            color="white"
          />
          <Text className="text-white text-xs font-semibold ml-2">
            {showOverlays ? "Hide" : "Show"} Overlays
          </Text>
        </Pressable>
      </View>

      {/* Image with Overlays */}
      <View className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1a1a1a" }}>
        <Image
          source={{ uri: imageUri }}
          style={{ width: "100%", height: 300 }}
          resizeMode="contain"
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setImageLayout({ width, height });
          }}
        />

        {/* Render overlays if enabled */}
        {showOverlays && imageLayout.width > 0 && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
            }}
          >
            {overlays.map((overlay, index) => {
              const left = (overlay.boundingBox.x / 100) * imageLayout.width;
              const top = (overlay.boundingBox.y / 100) * imageLayout.height;
              const width = (overlay.boundingBox.width / 100) * imageLayout.width;
              const height = (overlay.boundingBox.height / 100) * imageLayout.height;

              return (
                <Pressable
                  key={overlay.featureId}
                  onPress={() => handleOverlayPress(overlay)}
                  style={{
                    position: "absolute",
                    left,
                    top,
                    width,
                    height,
                    borderWidth: 2,
                    borderColor: "#D4AF37",
                    backgroundColor: "rgba(212, 175, 55, 0.1)",
                    borderRadius: 4,
                  }}
                >
                  {/* Label tag */}
                  <View
                    style={{
                      position: "absolute",
                      top: -24,
                      left: 0,
                      backgroundColor: "#D4AF37",
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}
                  >
                    <Text className="text-xs font-bold" style={{ color: "#2B3420" }}>
                      {overlay.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {/* Helper text */}
      {showOverlays && overlays.length > 0 && (
        <View className="mt-2 flex-row items-center">
          <Ionicons name="information-circle" size={16} color="#D4AF37" />
          <Text className="text-xs ml-2" style={{ color: "#E5D4B8" }}>
            Tap any highlighted area to see detailed explanation
          </Text>
        </View>
      )}

      {/* Cue Explanation Modal */}
      <Modal
        visible={selectedOverlay !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedOverlay(null)}
      >
        <Pressable
          className="flex-1 justify-center items-center"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onPress={() => setSelectedOverlay(null)}
        >
          <Pressable
            className="rounded-2xl p-6 mx-6"
            style={{ backgroundColor: "#3D4A2F", maxWidth: 400, width: "90%" }}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedOverlay && (
              <>
                {/* Header */}
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-white">
                      {selectedOverlay.name}
                    </Text>
                    <View className="flex-row items-center mt-1">
                      <View
                        className="rounded px-2 py-0.5"
                        style={{
                          backgroundColor:
                            selectedOverlay.confidence >= 75
                              ? "#22c55e"
                              : selectedOverlay.confidence >= 50
                              ? "#3b82f6"
                              : "#f59e0b",
                        }}
                      >
                        <Text className="text-white text-xs font-bold">
                          {selectedOverlay.confidence}% Confidence
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Pressable onPress={() => setSelectedOverlay(null)}>
                    <Ionicons name="close-circle" size={32} color="#E5D4B8" />
                  </Pressable>
                </View>

                {/* Detected Pattern */}
                {selectedOverlay.cue && (
                  <View className="mb-4">
                    <Text className="text-sm font-semibold mb-2" style={{ color: "#D4AF37" }}>
                      WHAT I SEE:
                    </Text>
                    <Text className="text-base text-white mb-3">
                      {selectedOverlay.cue.detectedPattern}
                    </Text>

                    {/* Age Weight Indicator */}
                    <View className="flex-row items-center mb-3">
                      <Text className="text-sm font-semibold mr-3" style={{ color: "#D4AF37" }}>
                        AGE PUSH:
                      </Text>
                      <View className="flex-1 flex-row items-center">
                        <Text className="text-xs mr-2" style={{ color: "#E5D4B8" }}>
                          Younger
                        </Text>
                        <View className="flex-1 h-2 rounded-full" style={{ backgroundColor: "#5A6447" }}>
                          <View
                            className="h-2 rounded-full"
                            style={{
                              width: `${((selectedOverlay.cue.ageWeight + 3) / 6) * 100}%`,
                              backgroundColor:
                                selectedOverlay.cue.ageWeight < 0
                                  ? "#f59e0b"
                                  : selectedOverlay.cue.ageWeight > 0
                                  ? "#22c55e"
                                  : "#9ca3af",
                            }}
                          />
                        </View>
                        <Text className="text-xs ml-2" style={{ color: "#E5D4B8" }}>
                          Older
                        </Text>
                      </View>
                    </View>

                    {/* Explanation */}
                    <Text className="text-sm font-semibold mb-2" style={{ color: "#D4AF37" }}>
                      WHY THIS MATTERS:
                    </Text>
                    <Text className="text-sm leading-6" style={{ color: "#E5D4B8" }}>
                      {selectedOverlay.cue.explanation}
                    </Text>
                  </View>
                )}

                {/* Close button */}
                <Pressable
                  onPress={() => setSelectedOverlay(null)}
                  className="rounded-lg py-3 items-center mt-2"
                  style={{ backgroundColor: "#5A6447" }}
                >
                  <Text className="text-white font-semibold">Close</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};
