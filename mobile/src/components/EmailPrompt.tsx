/**
 * Email Prompt Component - Captures user emails for Pro features
 * Shows after 1st and 5th analysis if not already collected
 */

import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, Alert, Keyboard, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useDeerScoringStore } from "../state/deerScoringStore";

interface EmailPromptProps {
  visible: boolean;
  onDismiss: () => void;
}

export const EmailPrompt: React.FC<EmailPromptProps> = ({ visible, onDismiss }) => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const setUserEmail = useDeerScoringStore((s) => s.setUserEmail);
  const analysisCount = useDeerScoringStore((s) => s.analysisCount);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const sendToAirtable = async (emailAddress: string) => {
    const AIRTABLE_API_TOKEN = Constants.expoConfig?.extra?.AIRTABLE_API_TOKEN;
    const AIRTABLE_BASE_ID = Constants.expoConfig?.extra?.AIRTABLE_BASE_ID;
    const AIRTABLE_TABLE_ID = Constants.expoConfig?.extra?.AIRTABLE_TABLE_ID;

    // If credentials not configured, skip Airtable (still save locally)
    if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
      console.log("Airtable credentials not configured, saving locally only");
      return;
    }

    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${AIRTABLE_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fields: {
              "Email": emailAddress,
              "Signed Up At": new Date().toISOString(),
              "Platform": Platform.OS === "ios" ? "iOS" : "Android",
              "Analysis Count": analysisCount,
              "App Version": Constants.expoConfig?.version || "unknown",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
      }

      console.log("Email successfully sent to Airtable");
    } catch (error) {
      console.error("Failed to send email to Airtable:", error);
      // Don't throw - we still want to save locally even if Airtable fails
    }
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert("Email Required", "Please enter your email address.");
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    Keyboard.dismiss();

    try {
      // Save email to local store first (always succeeds)
      setUserEmail(email);

      // Send to Airtable (won't throw if it fails)
      await sendToAirtable(email);

      Alert.alert(
        "Thanks!",
        "You'll be the first to know when Pro features launch: offline mode, batch scoring, PDF exports, and more.",
        [{ text: "Got it", onPress: onDismiss }]
      );
    } catch (error) {
      console.error("Failed to save email:", error);
      Alert.alert("Error", "Failed to save email. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        className="flex-1 bg-black/70 items-center justify-center"
        onPress={onDismiss}
      >
        <Pressable
          className="bg-neutral-800 rounded-2xl p-6 mx-6 max-w-md"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View className="w-10 h-10 bg-green-600 rounded-full items-center justify-center mr-3">
                <Ionicons name="rocket" size={20} color="white" />
              </View>
              <Text className="text-white text-lg font-bold">Get Pro Features Early</Text>
            </View>
            <Pressable onPress={onDismiss} className="w-8 h-8 items-center justify-center">
              <Ionicons name="close" size={24} color="#999" />
            </Pressable>
          </View>

          {/* Benefits */}
          <View className="mb-4">
            <Text className="text-gray-300 text-sm mb-3">
              Be the first to access upcoming Pro features:
            </Text>
            <View className="space-y-2">
              <View className="flex-row items-start">
                <Ionicons name="checkmark-circle" size={18} color="#22c55e" style={{ marginRight: 8, marginTop: 2 }} />
                <Text className="text-gray-300 text-sm flex-1">
                  <Text className="font-semibold">Offline Mode</Text> - Analyze in the field without signal
                </Text>
              </View>
              <View className="flex-row items-start mt-2">
                <Ionicons name="checkmark-circle" size={18} color="#22c55e" style={{ marginRight: 8, marginTop: 2 }} />
                <Text className="text-gray-300 text-sm flex-1">
                  <Text className="font-semibold">Batch Scoring</Text> - Analyze multiple deer at once
                </Text>
              </View>
              <View className="flex-row items-start mt-2">
                <Ionicons name="checkmark-circle" size={18} color="#22c55e" style={{ marginRight: 8, marginTop: 2 }} />
                <Text className="text-gray-300 text-sm flex-1">
                  <Text className="font-semibold">PDF Reports</Text> - Professional scorecards you can print
                </Text>
              </View>
            </View>
          </View>

          {/* Email Input */}
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor="#666"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-neutral-700 text-white rounded-lg px-4 py-3 mb-4"
          />

          {/* Actions */}
          <View className="flex-row gap-3">
            <Pressable
              onPress={onDismiss}
              className="flex-1 rounded-lg py-3 items-center bg-neutral-700"
            >
              <Text className="text-gray-300 font-semibold">Maybe Later</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 rounded-lg py-3 items-center bg-green-600"
            >
              <Text className="text-white font-bold">
                {isSubmitting ? "Saving..." : "Notify Me"}
              </Text>
            </Pressable>
          </View>

          {/* Privacy note */}
          <Text className="text-gray-500 text-xs text-center mt-3">
            We respect your privacy. No spam, unsubscribe anytime.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
