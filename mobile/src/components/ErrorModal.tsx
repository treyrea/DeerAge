/**
 * ErrorModal - Custom modal for displaying error messages and confirmations
 * Replaces Alert.alert to follow Vibecode guidelines
 */

import React from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ErrorModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: "error" | "success" | "warning" | "confirm";
  onDismiss: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  visible,
  title,
  message,
  type = "error",
  onDismiss,
  onConfirm,
  confirmText = "OK",
  cancelText = "Cancel",
}) => {
  const isConfirmModal = type === "confirm";

  const iconConfig = {
    error: { name: "alert-circle" as const, color: "#ef4444" },
    success: { name: "checkmark-circle" as const, color: "#22c55e" },
    warning: { name: "warning" as const, color: "#f59e0b" },
    confirm: { name: "help-circle" as const, color: "#3b82f6" },
  };

  const icon = iconConfig[type];

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 justify-center items-center" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
        <View
          className="rounded-2xl p-6 mx-6 w-80 max-w-full"
          style={{ backgroundColor: "#3D4A2F" }}
        >
          {/* Icon */}
          <View className="items-center mb-4">
            <View
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: `${icon.color}20` }}
            >
              <Ionicons name={icon.name} size={40} color={icon.color} />
            </View>
          </View>

          {/* Title */}
          <Text className="text-white text-xl font-bold text-center mb-3">
            {title}
          </Text>

          {/* Message */}
          <Text className="text-sm leading-6 text-center mb-6" style={{ color: "#E5D4B8" }}>
            {message}
          </Text>

          {/* Buttons */}
          {isConfirmModal && onConfirm ? (
            <View className="flex-row gap-3">
              <Pressable
                onPress={onDismiss}
                className="flex-1 rounded-xl py-4 items-center"
                style={{ backgroundColor: "#5A6447" }}
              >
                <Text className="text-white font-bold">{cancelText}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onConfirm();
                  onDismiss();
                }}
                className="flex-1 rounded-xl py-4 items-center"
                style={{ backgroundColor: "#ef4444" }}
              >
                <Text className="text-white font-bold">{confirmText}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={onDismiss}
              className="rounded-xl py-4 items-center"
              style={{ backgroundColor: type === "error" ? "#ef4444" : "#D4AF37" }}
            >
              <Text className="text-white font-bold">{confirmText}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};
