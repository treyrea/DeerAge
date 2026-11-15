import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { fetchFeed, submitVote } from "../api/community";
import { useCommunityStore } from "../state/communityStore";
import { useRemoteConfig } from "../state/remoteConfig";
import { useNetworkStore } from "../state/networkStore";

type NavigationProp = NativeStackNavigationProp<Record<string, object | undefined>>;

export const FeedScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const feed = useCommunityStore((s) => s.cachedFeed);
  const dismissedIds = useCommunityStore((s) => s.dismissedIds);
  const setCachedFeed = useCommunityStore((s) => s.setCachedFeed);
  const markSeen = useCommunityStore((s) => s.markSeen);
  const dismissItem = useCommunityStore((s) => s.dismissItem);
  const noteVote = useCommunityStore((s) => s.noteVote);
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const isOnline = isConnected && isInternetReachable !== false;
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [voteError, setVoteError] = useState("");
  const [pendingPoll, setPendingPoll] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isOnline) {
      setStale(true);
      return;
    }
    setRefreshing(true);
    const next = await fetchFeed();
    setRefreshing(false);
    if (next) {
      setCachedFeed(next);
      setStale(false);
      markSeen([...next.announcements.map((item) => item.id), ...next.polls.map((item) => item.id)]);
    } else {
      setStale(true);
    }
  }, [isOnline, markSeen, setCachedFeed]);

  useFocusEffect(useCallback(() => {
    const cached = useCommunityStore.getState().cachedFeed;
    if (cached) {
      markSeen([
        ...cached.announcements.map((item) => item.id),
        ...cached.polls.map((item) => item.id),
      ]);
    }
    void refresh();
  }, [markSeen, refresh]));

  const pollsOn = useRemoteConfig((s) => s.flags.polls);
  const announcements = feed?.announcements.filter((item) => !dismissedIds.includes(item.id)) ?? [];
  const polls = pollsOn ? (feed?.polls.filter((item) => !dismissedIds.includes(item.id)) ?? []) : [];
  const empty = announcements.length + polls.length === 0;

  const vote = async (pollId: string, optionId: string) => {
    if (!isOnline) {
      setVoteError("Connect to save your vote.");
      return;
    }
    setPendingPoll(pollId);
    setVoteError("");
    const result = await submitVote(pollId, optionId);
    setPendingPoll(null);
    if (!result.ok) {
      setVoteError("Couldn't save that vote. Try again when you have a signal.");
      return;
    }
    noteVote(pollId, result.optionId);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#3D4A2F", flexDirection: "row", alignItems: "center" }}>
        <Pressable onPress={() => navigation.goBack()} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700" }}>What&apos;s new</Text>
          <Text style={{ color: "#D4AF37", fontSize: 12, marginTop: 2 }}>Vote on what&apos;s next</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor="#D4AF37" />
        )}
      >
        <View style={{ padding: 24 }}>
          {stale ? (
            <Text style={{ color: "#8B7355", fontSize: 13, marginBottom: 14 }}>
              {feed ? "Showing saved updates. Pull to refresh when you have a signal." : "Updates will load when you have a signal."}
            </Text>
          ) : null}
          {voteError ? (
            <Text style={{ color: "#E5D4B8", fontSize: 13, marginBottom: 14 }}>{voteError}</Text>
          ) : null}
          {empty ? (
            <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 20 }}>
              <Text style={{ color: "#F5F5DC", fontWeight: "700", fontSize: 16 }}>Nothing new right now</Text>
              <Text style={{ color: "#E5D4B8", marginTop: 8, lineHeight: 20 }}>
                Updates and polls show up here without an App Store release. Check back after your next hunt.
              </Text>
            </View>
          ) : null}
          {announcements.map((item) => (
            <View key={item.id} style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#F5F5DC", fontWeight: "700", fontSize: 17 }}>{item.title}</Text>
                  {item.publishedAt ? (
                    <Text style={{ color: "#8B7355", fontSize: 12, marginTop: 4 }}>
                      {new Date(item.publishedAt).toLocaleDateString()}
                    </Text>
                  ) : null}
                </View>
                <Pressable onPress={() => dismissItem(item.id)} hitSlop={8} accessibilityLabel="Dismiss update">
                  <Ionicons name="close" size={18} color="#E5D4B8" />
                </Pressable>
              </View>
              <Text style={{ color: "#E5D4B8", marginTop: 10, lineHeight: 21 }}>{item.body}</Text>
            </View>
          ))}
          {polls.map((poll) => (
            <View key={poll.id} style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#8B7355" }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <Text style={{ color: "#F5F5DC", fontWeight: "700", fontSize: 17, flex: 1 }}>{poll.question}</Text>
                <Pressable onPress={() => dismissItem(poll.id)} hitSlop={8} accessibilityLabel="Dismiss poll">
                  <Ionicons name="close" size={18} color="#E5D4B8" />
                </Pressable>
              </View>
              <View style={{ marginTop: 12 }}>
                {poll.options.map((option) => {
                  const selected = poll.myVote === option.id;
                  const locked = Boolean(poll.myVote);
                  return (
                    <Pressable
                      key={option.id}
                      disabled={locked || pendingPoll === poll.id}
                      onPress={() => { void vote(poll.id, option.id); }}
                      style={{
                        backgroundColor: selected ? "#D4AF37" : "#5A6447",
                        borderRadius: 10,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        marginBottom: 8,
                        flexDirection: "row",
                        alignItems: "center",
                        opacity: locked && !selected ? 0.55 : 1,
                      }}
                    >
                      <Text style={{ color: selected ? "#1a1f16" : "#F5F5DC", fontWeight: "600", flex: 1 }}>{option.label}</Text>
                      {selected ? <Ionicons name="checkmark" size={18} color="#1a1f16" /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: "#8B7355", fontSize: 12, marginTop: 4 }}>
                {poll.myVote ? "Vote saved." : isOnline ? "One vote for this install." : "Connect to vote."}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};
