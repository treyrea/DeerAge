/**
 * Offline Queued Screen - Confirmation when photos are queued offline
 */

import React from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNetworkStore } from "../state/networkStore";

type NavigationProp = NativeStackNavigationProp<any>;

export const OfflineQueuedScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const { frameCount = 8 } = (route.params as { frameCount?: number }) || {};
  const queuedCount = useNetworkStore((s) => s.getQueuedCount());

  return (
    <View className="flex-1 bg-neutral-900" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-1 items-center justify-center px-6">
        {/* Success Icon */}
        <View className="w-24 h-24 bg-green-500/20 rounded-full items-center justify-center mb-6">
          <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
        </View>

        {/* Title */}
        <Text className="text-white text-2xl font-bold mb-3 text-center">
          Photos Saved to Queue
        </Text>

        {/* Description */}
        <Text className="text-gray-400 text-center mb-8 px-4 leading-6">
          Your {frameCount} photos have been saved. Analysis will start automatically when you return to an area with signal.
        </Text>

        {/* Queue Info Box */}
        <View className="bg-neutral-800 rounded-xl p-6 mb-8 w-full max-w-md">
          <View className="flex-row items-center mb-4">
            <View className="w-12 h-12 bg-blue-500/20 rounded-full items-center justify-center">
              <Ionicons name="cloud-upload" size={24} color="#3b82f6" />
            </View>
            <View className="flex-1 ml-4">
              <Text className="text-white text-lg font-bold">{queuedCount} {queuedCount === 1 ? "Analysis" : "Analyses"} Queued</Text>
              <Text className="text-gray-400 text-sm">Will process when online</Text>
            </View>
          </View>

          <View className="border-t border-neutral-700 pt-4">
            <View className="flex-row items-start mb-3">
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" style={{ marginTop: 2 }} />
              <Text className="text-gray-300 text-sm ml-3 flex-1">
                Photos safely stored on your device
              </Text>
            </View>
            <View className="flex-row items-start mb-3">
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" style={{ marginTop: 2 }} />
              <Text className="text-gray-300 text-sm ml-3 flex-1">
                Auto-sync when connectivity returns
              </Text>
            </View>
            <View className="flex-row items-start">
              <Ionicons name="checkmark-circle" size={18} color="#22c55e" style={{ marginTop: 2 }} />
              <Text className="text-gray-300 text-sm ml-3 flex-1">
                Results saved to history automatically
              </Text>
            </View>
          </View>
        </View>

        {/* Info Note */}
        <View className="bg-blue-500/20 rounded-xl p-4 mb-8 w-full max-w-md">
          <View className="flex-row items-start">
            <Ionicons name="information-circle" size={20} color="#3b82f6" />
            <View className="flex-1 ml-3">
              <Text className="text-blue-300 text-sm leading-5">
                You can continue scoring deer offline. All photos will be processed once you have signal.
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="w-full max-w-md space-y-3">
          <Pressable
            onPress={() => navigation.navigate("HomeMain")}
            className="bg-green-600 rounded-xl py-4 items-center"
          >
            <Text className="text-white text-lg font-bold">Score Another Deer</Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("History")}
            className="bg-neutral-800 rounded-xl py-4 items-center"
          >
            <Text className="text-white text-base font-semibold">View History</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};
