/**
 * Distance Chip Component
 * Displays distance in a compact chip format for history list and detail views
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DistanceConfidence, DistanceSource } from "../types/distance";

interface DistanceChipProps {
  distanceYards: number;
  confidence?: DistanceConfidence;
  source?: DistanceSource;
  size?: "small" | "medium" | "large";
  showIcon?: boolean;
  showTooltip?: boolean;
  onPress?: () => void;
}

export const DistanceChip: React.FC<DistanceChipProps> = ({
  distanceYards,
  confidence = "medium",
  source,
  size = "small",
  showIcon = true,
  showTooltip = false,
  onPress,
}) => {
  // Color based on confidence
  const getConfidenceColor = () => {
    switch (confidence) {
      case "high":
        return "#22c55e"; // Green
      case "medium":
        return "#D4AF37"; // Gold
      case "low":
        return "#f59e0b"; // Orange/amber
      default:
        return "#6b7280"; // Gray
    }
  };

  // Get source label
  const getSourceLabel = () => {
    switch (source) {
      case "rangefinder_bluetooth":
      case "rangefinder_manual":
        return "Ranged";
      case "preset":
        return "Preset";
      case "manual":
        return "Manual";
      case "estimated_ai":
        return "AI Est.";
      default:
        return null;
    }
  };

  // Size styles
  const getSizeStyles = () => {
    switch (size) {
      case "large":
        return {
          paddingHorizontal: 12,
          paddingVertical: 6,
          fontSize: 16,
          iconSize: 16,
        };
      case "medium":
        return {
          paddingHorizontal: 10,
          paddingVertical: 4,
          fontSize: 14,
          iconSize: 14,
        };
      case "small":
      default:
        return {
          paddingHorizontal: 8,
          paddingVertical: 3,
          fontSize: 12,
          iconSize: 12,
        };
    }
  };

  const styles = getSizeStyles();
  const backgroundColor = `${getConfidenceColor()}20`; // 20% opacity
  const textColor = getConfidenceColor();
  const sourceLabel = getSourceLabel();

  const ChipContent = (
    <View
      className="flex-row items-center rounded-full"
      style={{
        backgroundColor,
        paddingHorizontal: styles.paddingHorizontal,
        paddingVertical: styles.paddingVertical,
      }}
    >
      {showIcon && (
        <Ionicons
          name="locate"
          size={styles.iconSize}
          color={textColor}
          style={{ marginRight: 4 }}
        />
      )}
      <Text
        className="font-semibold"
        style={{
          color: textColor,
          fontSize: styles.fontSize,
        }}
      >
        {distanceYards} yd
      </Text>
      {sourceLabel && size !== "small" && (
        <Text
          className="ml-1"
          style={{
            color: textColor,
            fontSize: styles.fontSize - 2,
            opacity: 0.8,
          }}
        >
          ({sourceLabel})
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress}>
        {ChipContent}
      </Pressable>
    );
  }

  return ChipContent;
};

/**
 * Distance Detail View Component
 * Shows full distance information in observation detail page
 */
interface DistanceDetailViewProps {
  distanceYards: number;
  confidence: DistanceConfidence;
  source: DistanceSource;
  timestamp?: string;
  notes?: string;
  onEdit?: () => void;
}

export const DistanceDetailView: React.FC<DistanceDetailViewProps> = ({
  distanceYards,
  confidence,
  source,
  timestamp,
  notes,
  onEdit,
}) => {
  // Get confidence label and color
  const getConfidenceInfo = () => {
    switch (confidence) {
      case "high":
        return { label: "High", color: "#22c55e", icon: "checkmark-circle" as const };
      case "medium":
        return { label: "Medium", color: "#D4AF37", icon: "ellipse" as const };
      case "low":
        return { label: "Low", color: "#f59e0b", icon: "alert-circle" as const };
      default:
        return { label: "Unknown", color: "#6b7280", icon: "help-circle" as const };
    }
  };

  // Get source description
  const getSourceDescription = () => {
    switch (source) {
      case "rangefinder_bluetooth":
        return "Bluetooth rangefinder";
      case "rangefinder_manual":
        return "Ranged (entered manually)";
      case "preset":
        return "Quick select preset";
      case "manual":
        return "Manually entered";
      case "estimated_ai":
        return "AI estimated";
      default:
        return "Unknown source";
    }
  };

  const confInfo = getConfidenceInfo();

  return (
    <View className="rounded-xl p-4" style={{ backgroundColor: "#3D4A2F" }}>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center">
          <Ionicons name="locate" size={20} color="#D4AF37" />
          <Text className="text-white font-bold text-lg ml-2">Distance</Text>
        </View>
        {onEdit && (
          <Pressable
            onPress={onEdit}
            className="flex-row items-center px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: "#5A6447" }}
          >
            <Ionicons name="pencil" size={14} color="#E5D4B8" />
            <Text className="text-sm ml-1" style={{ color: "#E5D4B8" }}>
              Edit
            </Text>
          </Pressable>
        )}
      </View>

      {/* Main distance display */}
      <View className="flex-row items-baseline mb-3">
        <Text className="text-3xl font-bold" style={{ color: "#D4AF37" }}>
          {distanceYards}
        </Text>
        <Text className="text-lg ml-2" style={{ color: "#E5D4B8" }}>
          yards
        </Text>
      </View>

      {/* Confidence badge */}
      <View className="flex-row items-center mb-2">
        <View
          className="flex-row items-center px-2 py-1 rounded"
          style={{ backgroundColor: `${confInfo.color}20` }}
        >
          <Ionicons name={confInfo.icon} size={14} color={confInfo.color} />
          <Text className="ml-1 font-medium" style={{ color: confInfo.color }}>
            {confInfo.label} confidence
          </Text>
        </View>
      </View>

      {/* Source */}
      <View className="flex-row items-center">
        <Text className="text-sm" style={{ color: "#8B7355" }}>
          Source:
        </Text>
        <Text className="text-sm ml-2" style={{ color: "#E5D4B8" }}>
          {getSourceDescription()}
        </Text>
      </View>

      {/* Notes if present */}
      {notes && (
        <View className="mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: "#5A6447" }}>
          <Text className="text-xs mb-1" style={{ color: "#8B7355" }}>
            Notes
          </Text>
          <Text className="text-sm" style={{ color: "#E5D4B8" }}>
            {notes}
          </Text>
        </View>
      )}

      {/* Tooltip explaining distance affects accuracy */}
      <View
        className="mt-3 p-3 rounded-lg flex-row items-start"
        style={{ backgroundColor: "#2B3420" }}
      >
        <Ionicons name="information-circle" size={16} color="#D4AF37" />
        <Text className="text-xs ml-2 flex-1" style={{ color: "#8B7355" }}>
          Distance affects scale and confidence. Closer observations (50-100 yd) have higher accuracy than distant ones (150+ yd).
        </Text>
      </View>
    </View>
  );
};

/**
 * Distance Warning Banner
 * Shows in results when distance affects confidence
 */
interface DistanceWarningBannerProps {
  warnings: string[];
  confidence?: DistanceConfidence;
  hasDistance: boolean;
}

export const DistanceWarningBanner: React.FC<DistanceWarningBannerProps> = ({
  warnings,
  confidence,
  hasDistance,
}) => {
  if (warnings.length === 0 && hasDistance) return null;

  // Different styles based on whether distance is provided
  const backgroundColor = hasDistance ? "#f59e0b20" : "#3b82f620";
  const iconColor = hasDistance ? "#f59e0b" : "#3b82f6";
  const textColor = hasDistance ? "#f59e0b" : "#3b82f6";

  return (
    <View
      className="rounded-lg p-3 mb-4"
      style={{ backgroundColor }}
    >
      <View className="flex-row items-start">
        <Ionicons
          name={hasDistance ? "alert-circle" : "information-circle"}
          size={18}
          color={iconColor}
        />
        <View className="flex-1 ml-2">
          {!hasDistance ? (
            <Text className="text-sm" style={{ color: textColor }}>
              No distance provided. Results may be less accurate.
            </Text>
          ) : (
            warnings.slice(0, 2).map((warning, index) => (
              <Text
                key={index}
                className="text-sm"
                style={{ color: textColor, marginBottom: index < warnings.length - 1 ? 4 : 0 }}
              >
                {warning}
              </Text>
            ))
          )}
        </View>
      </View>
    </View>
  );
};

export default DistanceChip;
