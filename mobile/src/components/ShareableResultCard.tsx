/**
 * Shareable Result Card Component (Constitution-Compliant)
 * ========================================================
 *
 * CONSTITUTION RULES ENFORCED:
 * - Zero AI cost for sharing (no additional API calls)
 * - Subtle branding watermark
 * - Screenshot-friendly layouts
 * - Functions without login friction
 *
 * VIRALITY RULES:
 * - Shareable artifacts must NOT trigger additional AI calls
 * - Include subtle branding watermark
 * - Encourage organic sharing
 */

import React, { useRef, useCallback } from "react";
import { View, Text, Pressable, Share, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as MediaLibrary from "expo-media-library";

// ============================================================================
// TYPES
// ============================================================================

export interface AgeResultData {
  type: "age";
  imageUri: string;
  ageEstimate: string;
  ageRange: string;
  confidence: number;
  decision: "SHOOT" | "LET WALK";
  keyFeature?: string;
}

export interface ScoreResultData {
  type: "score";
  imageUri: string;
  grossScore: number;
  netScore: number;
  pointCount: number;
  category: "Typical" | "Non-Typical";
  confidence: number;
  meetsMinimum: boolean;
}

export type ShareableResultData = AgeResultData | ScoreResultData;

// ============================================================================
// SHAREABLE RESULT CARD
// ============================================================================

interface ShareableResultCardProps {
  data: ShareableResultData;
  onShare?: () => void;
  compact?: boolean;
}

export const ShareableResultCard: React.FC<ShareableResultCardProps> = ({
  data,
  onShare,
  compact = false,
}) => {
  const viewShotRef = useRef<ViewShot>(null);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: "image/png",
            dialogTitle: "Share your DeerAge result",
          });
          onShare?.();
        } else {
          // Fallback to text share
          const text = getShareText(data);
          await Share.share({ message: text });
          onShare?.();
        }
      }
    } catch (error) {
      console.log("[Share] Error sharing result:", error);
    }
  }, [data, onShare]);

  const handleSaveToGallery = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        return;
      }

      if (viewShotRef.current?.capture) {
        const uri = await viewShotRef.current.capture();
        await MediaLibrary.saveToLibraryAsync(uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.log("[Share] Error saving to gallery:", error);
    }
  }, []);

  return (
    <View>
      <ViewShot
        ref={viewShotRef}
        options={{ format: "png", quality: 1 }}
        style={{ backgroundColor: "#1a1f16" }}
      >
        {data.type === "age" ? (
          <AgeResultCardContent data={data} compact={compact} />
        ) : (
          <ScoreResultCardContent data={data} compact={compact} />
        )}
      </ViewShot>

      {/* Share Actions */}
      <View className="flex-row justify-center mt-4 space-x-4">
        <Pressable
          onPress={handleShare}
          className="flex-row items-center px-6 py-3 rounded-xl"
          style={{ backgroundColor: "#D4AF37" }}
        >
          <Ionicons name="share-outline" size={20} color="#1a1f16" />
          <Text className="font-bold ml-2" style={{ color: "#1a1f16" }}>
            Share
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSaveToGallery}
          className="flex-row items-center px-6 py-3 rounded-xl"
          style={{ backgroundColor: "#3D4A2F" }}
        >
          <Ionicons name="download-outline" size={20} color="#F5F5DC" />
          <Text className="font-bold ml-2" style={{ color: "#F5F5DC" }}>
            Save
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

// ============================================================================
// AGE RESULT CARD CONTENT
// ============================================================================

interface AgeResultCardContentProps {
  data: AgeResultData;
  compact: boolean;
}

const AgeResultCardContent: React.FC<AgeResultCardContentProps> = ({
  data,
  compact,
}) => {
  const isShoot = data.decision === "SHOOT";

  return (
    <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: "#1a1f16" }}>
      {/* Image with overlay */}
      <View style={{ height: compact ? 200 : 280 }}>
        <Image
          source={{ uri: data.imageUri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
        {/* Gradient overlay */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
          }}
        />
        {/* Decision badge */}
        <View
          className="absolute bottom-4 left-4 px-4 py-2 rounded-full"
          style={{
            backgroundColor: isShoot ? "#166534" : "#dc2626",
          }}
        >
          <Text className="text-white font-black text-lg">{data.decision}</Text>
        </View>
      </View>

      {/* Content */}
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-2xl font-bold" style={{ color: "#F5F5DC" }}>
              {data.ageEstimate}
            </Text>
            <Text className="text-sm" style={{ color: "#8B7355" }}>
              Estimated Age
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-xl font-bold" style={{ color: "#D4AF37" }}>
              {data.confidence}%
            </Text>
            <Text className="text-sm" style={{ color: "#8B7355" }}>
              Confidence
            </Text>
          </View>
        </View>

        {data.keyFeature && (
          <View
            className="rounded-lg p-3 mb-3"
            style={{ backgroundColor: "#2B3420" }}
          >
            <Text className="text-sm" style={{ color: "#E5D4B8" }}>
              Key indicator: {data.keyFeature}
            </Text>
          </View>
        )}

        {/* Branding watermark */}
        <BrandingWatermark />
      </View>
    </View>
  );
};

// ============================================================================
// SCORE RESULT CARD CONTENT
// ============================================================================

interface ScoreResultCardContentProps {
  data: ScoreResultData;
  compact: boolean;
}

const ScoreResultCardContent: React.FC<ScoreResultCardContentProps> = ({
  data,
  compact,
}) => {
  return (
    <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: "#1a1f16" }}>
      {/* Image with overlay */}
      <View style={{ height: compact ? 200 : 280 }}>
        <Image
          source={{ uri: data.imageUri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
        {/* Gradient overlay */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.8)"]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
          }}
        />
        {/* Point count badge */}
        <View
          className="absolute bottom-4 left-4 px-4 py-2 rounded-full"
          style={{ backgroundColor: "#D4AF37" }}
        >
          <Text className="font-black text-lg" style={{ color: "#1a1f16" }}>
            {data.pointCount} POINTS
          </Text>
        </View>
      </View>

      {/* Content */}
      <View className="p-4">
        {/* Score display */}
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-3xl font-bold" style={{ color: "#D4AF37" }}>
              {data.netScore.toFixed(1)}&quot;
            </Text>
            <Text className="text-sm" style={{ color: "#8B7355" }}>
              B&C Net {data.category}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-xl" style={{ color: "#F5F5DC" }}>
              {data.grossScore.toFixed(1)}&quot; Gross
            </Text>
            <Text className="text-sm" style={{ color: "#8B7355" }}>
              {data.confidence}% confidence
            </Text>
          </View>
        </View>

        {/* B&C Qualification badge */}
        {data.meetsMinimum && (
          <View
            className="rounded-lg p-3 mb-3 flex-row items-center"
            style={{ backgroundColor: "#166534" }}
          >
            <Ionicons name="trophy" size={20} color="#D4AF37" />
            <Text className="text-white font-bold ml-2">
              Meets B&C Minimum ({data.category === "Typical" ? '160"' : '185"'})
            </Text>
          </View>
        )}

        {/* Branding watermark */}
        <BrandingWatermark />
      </View>
    </View>
  );
};

// ============================================================================
// BRANDING WATERMARK
// ============================================================================

const BrandingWatermark: React.FC = () => {
  return (
    <View className="flex-row items-center justify-center pt-2 border-t border-white/10">
      <Text style={{ fontSize: 14 }}>🦌</Text>
      <Text className="text-xs ml-1" style={{ color: "#8B7355" }}>
        DeerAge • Powered by RackScore™ AI
      </Text>
    </View>
  );
};

// ============================================================================
// HELPERS
// ============================================================================

const getShareText = (data: ShareableResultData): string => {
  if (data.type === "age") {
    return `🦌 DeerAge Analysis\n\nAge: ${data.ageEstimate}\nDecision: ${data.decision}\nConfidence: ${data.confidence}%\n\nKnow before you pull the trigger.\nPowered by RackScore™ AI`;
  }

  return `🦌 DeerAge B&C Score\n\n${data.pointCount} Points\nNet Score: ${data.netScore.toFixed(1)}"\nGross Score: ${data.grossScore.toFixed(1)}"\nCategory: ${data.category}\n${data.meetsMinimum ? "✓ Meets B&C Minimum!" : ""}\n\nKnow before you pull the trigger.\nPowered by RackScore™ AI`;
};

// ============================================================================
// MINI SHARE BADGE (for inline sharing)
// ============================================================================

interface MiniShareBadgeProps {
  type: "age" | "score";
  primaryValue: string;
  secondaryValue?: string;
  onPress: () => void;
}

export const MiniShareBadge: React.FC<MiniShareBadgeProps> = ({
  type,
  primaryValue,
  secondaryValue,
  onPress,
}) => {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="flex-row items-center px-3 py-2 rounded-full"
      style={{ backgroundColor: "#D4AF37" }}
    >
      <Ionicons
        name={type === "age" ? "analytics" : "ribbon"}
        size={16}
        color="#1a1f16"
      />
      <Text className="font-bold text-sm mx-2" style={{ color: "#1a1f16" }}>
        {primaryValue}
      </Text>
      {secondaryValue && (
        <Text className="text-xs" style={{ color: "#1a1f16", opacity: 0.7 }}>
          {secondaryValue}
        </Text>
      )}
      <Ionicons name="share-outline" size={14} color="#1a1f16" />
    </Pressable>
  );
};
