import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { fetchFeed } from "../api/community";
import { unseenFeedCount, useCommunityStore } from "../state/communityStore";
import { useNetworkStore } from "../state/networkStore";

type NavigationProp = NativeStackNavigationProp<Record<string, object | undefined>>;

export const FeedHomeCard = () => {
  const navigation = useNavigation<NavigationProp>();
  const feed = useCommunityStore((s) => s.cachedFeed);
  const seenIds = useCommunityStore((s) => s.seenIds);
  const dismissedIds = useCommunityStore((s) => s.dismissedIds);
  const setCachedFeed = useCommunityStore((s) => s.setCachedFeed);
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const isOnline = isConnected && isInternetReachable !== false;

  const [stale, setStale] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!isOnline) {
      setStale(Boolean(useCommunityStore.getState().cachedFeed));
      return;
    }
    let cancelled = false;
    void fetchFeed().then((next) => {
      if (cancelled) return;
      if (next) {
        setCachedFeed(next);
        setStale(false);
      } else {
        setStale(Boolean(useCommunityStore.getState().cachedFeed));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOnline, setCachedFeed]));

  const visibleAnnouncements = feed?.announcements.filter((item) => !dismissedIds.includes(item.id)) ?? [];
  const visiblePolls = feed?.polls.filter((item) => !dismissedIds.includes(item.id)) ?? [];
  if (visibleAnnouncements.length + visiblePolls.length === 0) return null;

  const preview = visibleAnnouncements[0]?.title ?? visiblePolls[0]?.question ?? "See what just landed";
  const unseen = unseenFeedCount(feed, seenIds, dismissedIds);

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("Feed");
      }}
      style={{
        backgroundColor: "#3D4A2F",
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "#8B7355",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="megaphone-outline" size={22} color="#D4AF37" />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>What&apos;s new</Text>
          <Text style={{ color: "#D4AF37", fontSize: 13, marginTop: 1 }}>Vote on what&apos;s next</Text>
          <Text numberOfLines={1} style={{ color: "#E5D4B8", fontSize: 13, marginTop: 4 }}>{preview}</Text>
          {stale ? (
            <Text style={{ color: "#8B7355", fontSize: 12, marginTop: 4 }}>Showing saved updates</Text>
          ) : null}
        </View>
        {unseen > 0 ? (
          <View style={{
            backgroundColor: "#D4AF37",
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 6,
            marginRight: 8,
          }}
          >
            <Text style={{ color: "#1a1f16", fontSize: 12, fontWeight: "700" }}>{unseen}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="#8B7355" />
      </View>
    </Pressable>
  );
};
