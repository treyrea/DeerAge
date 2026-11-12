/**
 * ActionButton - Standardized button component for one-handed operation
 * Follows Apple HIG with minimum 44pt touch targets and consistent styling
 */

import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "success";
type ButtonSize = "small" | "medium" | "large";

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: "left" | "right";
  subtitle?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  hapticStyle?: "light" | "medium" | "heavy";
}

const COLORS = {
  primary: {
    bg: "#22c55e",
    text: "#ffffff",
    icon: "#ffffff",
  },
  secondary: {
    bg: "#5A6447",
    text: "#ffffff",
    icon: "#D4AF37",
  },
  tertiary: {
    bg: "#3D4A2F",
    text: "#E5D4B8",
    icon: "#D4AF37",
  },
  danger: {
    bg: "#ef4444",
    text: "#ffffff",
    icon: "#ffffff",
  },
  success: {
    bg: "#22c55e",
    text: "#ffffff",
    icon: "#ffffff",
  },
};

const SIZES = {
  small: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 14,
    iconSize: 18,
    minHeight: 44, // Apple HIG minimum
  },
  medium: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    fontSize: 16,
    iconSize: 20,
    minHeight: 48,
  },
  large: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    fontSize: 18,
    iconSize: 24,
    minHeight: 56,
  },
};

export const ActionButton: React.FC<ActionButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  icon,
  iconPosition = "left",
  subtitle,
  disabled = false,
  fullWidth = true,
  hapticStyle = "medium",
}) => {
  const colors = COLORS[variant];
  const sizeStyles = SIZES[size];

  const handlePress = () => {
    if (disabled) return;

    // Haptic feedback
    const hapticMap = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    };
    Haptics.impactAsync(hapticMap[hapticStyle]);

    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.button,
        {
          backgroundColor: disabled ? "#666" : colors.bg,
          paddingVertical: sizeStyles.paddingVertical,
          paddingHorizontal: sizeStyles.paddingHorizontal,
          minHeight: sizeStyles.minHeight,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth && styles.fullWidth,
      ]}
    >
      <View style={styles.content}>
        {icon && iconPosition === "left" && (
          <Ionicons
            name={icon}
            size={sizeStyles.iconSize}
            color={colors.icon}
            style={styles.iconLeft}
          />
        )}
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.title,
              {
                color: colors.text,
                fontSize: sizeStyles.fontSize,
              },
            ]}
          >
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, { color: colors.text }]}>
              {subtitle}
            </Text>
          )}
        </View>
        {icon && iconPosition === "right" && (
          <Ionicons
            name={icon}
            size={sizeStyles.iconSize}
            color={colors.icon}
            style={styles.iconRight}
          />
        )}
      </View>
    </Pressable>
  );
};

/**
 * IconButton - Compact button for toolbars and action bars
 * Always 44x44pt minimum for touch targets
 */
interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: number;
  disabled?: boolean;
  hapticStyle?: "light" | "medium" | "heavy";
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onPress,
  variant = "secondary",
  size = 48,
  disabled = false,
  hapticStyle = "light",
}) => {
  const colors = COLORS[variant];

  const handlePress = () => {
    if (disabled) return;

    const hapticMap = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    };
    Haptics.impactAsync(hapticMap[hapticStyle]);

    onPress();
  };

  // Ensure minimum 44pt touch target
  const actualSize = Math.max(size, 44);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.iconButton,
        {
          backgroundColor: disabled ? "#666" : colors.bg,
          width: actualSize,
          height: actualSize,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={colors.icon} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fullWidth: {
    width: "100%",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    alignItems: "center",
  },
  title: {
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  iconButton: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
