/**
 * History Screen - View all analyzed deer
 * Age and Rack analyses, plus Quick Check records saved on this phone.
 */

import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useShotRecordStore } from "../state/shotRecordStore";
import type { ShotRecord } from "../types/shot-record";
import { quickRecordsNewestFirst } from "../lib/quick-records";
import { analysisKind, historyTabCounts, showsOnTab, timeMs, type HistoryKind, type HistoryTab } from "../lib/history-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { DeerScoringResult } from "../types/deer-scoring";
import { format } from "date-fns";
import { formatAgeClass, shownAge } from "../utils/age-class";
import { fieldRead, normalizeFieldCall } from "../utils/field-call";
import { ErrorModal } from "../components/ErrorModal";
import { softPulse } from "../lib/haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from "react-native-reanimated";
import { CARD, CREAM, GOLD, SECONDARY } from "../theme/contrast";

type NavigationProp = NativeStackNavigationProp<any>;

const TYPE: Record<HistoryKind, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  quick: { label: "Quick", icon: "flash" },
  age: { label: "Age", icon: "body" },
  score: { label: "Rack", icon: "ribbon" },
  other: { label: "Saved", icon: "document-text" },
};

type HistoryRow =
  | { key: string; kind: "quick"; time: number; record: ShotRecord }
  | { key: string; kind: Exclude<HistoryKind, "quick">; time: number; result: DeerScoringResult };

export const HistoryScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const { history, deleteFromHistory, clearHistory } = useDeerScoringStore();
  // Select the stored object, then derive the list. A selector that returns a new array
  // makes zustand 5 re-render forever and crashed this screen.
  const shotRecords = useShotRecordStore((s) => s.records);
  const quickRecords = useMemo(() => quickRecordsNewestFirst(shotRecords), [shotRecords]);
  const [activeTab, setActiveTab] = useState<HistoryTab>("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const counts = historyTabCounts(history.map((result) => result.analysisMode), quickRecords.length);
  const rows = useMemo(() => {
    const quickRows: HistoryRow[] = quickRecords.map((record) => ({
      key: `quick-${record.localId}`,
      kind: "quick",
      time: timeMs(record.deviceTime),
      record,
    }));
    const analysisRows: HistoryRow[] = history.map((result) => {
      const kind = analysisKind(result.analysisMode);
      return {
        key: `analysis-${result.analysisId}`,
        kind: kind === "quick" ? "other" : kind,
        time: timeMs(result.timestamp),
        result,
      };
    });
    return [...quickRows, ...analysisRows].sort((a, b) => b.time - a.time);
  }, [history, quickRecords]);
  const visible = rows.filter((row) => showsOnTab(activeTab, row.kind));
  const analysisCount = counts.age + counts.score + counts.other;

  const handleViewDetails = (result: DeerScoringResult) => {
    navigation.navigate("HistoryDetail", { result });
  };

  const confirmDelete = () => {
    if (deleteTargetId) {
      deleteFromHistory(deleteTargetId);
      setDeleteTargetId(null);
    }
  };

  const emptyTitle = counts.all === 0
    ? "No History Yet"
    : activeTab === "quick"
      ? "No Quick Checks"
      : activeTab === "age"
        ? "No Age Analyses"
        : activeTab === "score"
          ? "No Rack Scores"
          : "No History Yet";

  return (
    <View className="flex-1 bg-neutral-900" style={{ paddingTop: insets.top }}>
      <View className="px-4 py-4 border-b border-neutral-800">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Pressable accessibilityLabel="Back" onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: 4 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </Pressable>
            <Text className="text-white text-lg font-bold">History</Text>
          </View>
          {analysisCount > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear all analyses" onPress={() => setShowClearAllModal(true)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
              <Text style={{ color: SECONDARY, fontSize: 14, fontWeight: "600" }}>Clear All</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row rounded-lg p-1" style={{ backgroundColor: "#262626" }}>
          <HistoryTabButton label={`All (${counts.all})`} selected={activeTab === "all"} onPress={() => setActiveTab("all")} />
          <HistoryTabButton label={`Quick (${counts.quick})`} selected={activeTab === "quick"} onPress={() => setActiveTab("quick")} />
          <HistoryTabButton label={`Age (${counts.age})`} selected={activeTab === "age"} onPress={() => setActiveTab("age")} />
          <HistoryTabButton label={`Rack (${counts.score})`} selected={activeTab === "score"} onPress={() => setActiveTab("score")} />
        </View>
      </View>

      {visible.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-24 h-24 bg-neutral-800 rounded-full items-center justify-center mb-6">
            <Ionicons name="file-tray-outline" size={48} color="#666" />
          </View>
          <Text className="text-white text-xl font-bold mb-2">{emptyTitle}</Text>
          <Text className="text-center mb-8" style={{ color: SECONDARY }}>
            {counts.all === 0
              ? "Analyzed deer will appear here."
              : "The other tabs still have saved reads."}
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Home", { screen: "HomeMain" })}
            style={{ backgroundColor: "#14532D", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, minHeight: 44, justifyContent: "center" }}
          >
            <Text className="text-base font-bold" style={{ color: CREAM }}>Back to Home</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView className="flex-1">
          <View className="px-4 py-4">
            <Text style={{ color: SECONDARY, fontSize: 13, marginBottom: 12 }}>
              {`${visible.length} ${visible.length === 1 ? "entry" : "entries"}`}
            </Text>
            {visible.map((row) => (
              <HistoryRowCard
                key={row.key}
                row={row}
                onPress={() => {
                  if (row.kind === "quick") navigation.navigate("HistoryDetail", { shotId: row.record.localId });
                  else handleViewDetails(row.result);
                }}
                onDelete={row.kind === "quick" ? undefined : () => {
                  setDeleteTargetId(row.result.analysisId);
                  setShowDeleteModal(true);
                }}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <ErrorModal
        visible={showDeleteModal}
        title="Delete Entry"
        message="Delete this analysis from this phone? This cannot be undone."
        type="confirm"
        onDismiss={() => {
          setShowDeleteModal(false);
          setDeleteTargetId(null);
        }}
        onConfirm={confirmDelete}
        confirmText="Delete"
        cancelText="Cancel"
      />

      <ErrorModal
        visible={showClearAllModal}
        title="Clear analyses"
        message="This removes every Age and Rack analysis saved on this phone. Quick Check records stay. This cannot be undone."
        type="confirm"
        onDismiss={() => setShowClearAllModal(false)}
        onConfirm={clearHistory}
        confirmText="Clear All"
        cancelText="Cancel"
      />
    </View>
  );
};

function HistoryTabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 44,
        paddingHorizontal: 2,
        borderRadius: 6,
        justifyContent: "center",
        backgroundColor: selected ? CARD : "transparent",
        borderWidth: selected ? 1 : 0,
        borderColor: GOLD,
      }}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ color: selected ? CREAM : SECONDARY, fontSize: 12, fontWeight: "700", textAlign: "center" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function rowHeadline(row: HistoryRow): string {
  if (row.kind === "quick") {
    const age = row.record.ageClass || "Age class";
    return row.record.fieldCall ? `${age} · ${row.record.fieldCall}` : age;
  }
  const result = row.result;
  if (row.kind === "score") {
    const net = result.score?.recommendedCategory === "Typical" ? result.score?.netTypical : result.score?.netNonTypical;
    const scoreValue = typeof net === "number" ? net : net?.average;
    const points = (result.manualOverride && result.manualPointCount)
      ? result.manualPointCount
      : (result.score?.measurements?.totalPoints ?? 0) + (result.score?.measurements?.totalAbnormalPoints ?? 0);
    return typeof scoreValue === "number" ? `${scoreValue.toFixed(1)} in · ${points} pt` : "Rack score";
  }
  const age = shownAge(result.explainableAge?.ageLabel, result.explainableAge?.estimatedAge || result.age?.estimatedAge);
  const minimum = result.explainableAge?.minimumAgeThreshold;
  const years = result.explainableAge?.estimatedAgeYears ?? 0;
  const call = normalizeFieldCall(result.explainableAge?.fieldCall)
    ?? (years && typeof minimum === "number" ? fieldRead(years, result.explainableAge?.overallConfidence ?? 60, minimum).fieldCall : result.explainableAge?.shooterPassLabel);
  if (row.kind === "other") {
    return age || formatAgeClass(result.explainableAge?.estimatedAge || result.age?.estimatedAge) || "Saved analysis";
  }
  return call ? `${age} · ${call}` : age;
}

function rowPhoto(row: HistoryRow): string | null {
  if (row.kind === "quick") return row.record.photoUris?.find((uri) => uri.trim()) ?? null;
  return row.result.capturedFrames?.[0]?.imageUri ?? null;
}

function rowWhen(row: HistoryRow): string {
  const ms = row.time;
  if (!ms) return "";
  return format(new Date(ms), "MMM d, yyyy h:mm a");
}

const HistoryRowCard = ({ row, onPress, onDelete }: { row: HistoryRow; onPress: () => void; onDelete?: () => void }) => {
  const translateX = useSharedValue(0);
  const type = TYPE[row.kind];
  const photo = rowPhoto(row);

  const triggerDelete = () => {
    softPulse();
    onDelete?.();
  };

  const panGesture = Gesture.Pan()
    .enabled(Boolean(onDelete))
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (event.translationX < 0) translateX.value = Math.max(event.translationX, -120);
    })
    .onEnd(() => {
      if (translateX.value < -80) runOnJS(triggerDelete)();
      translateX.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
  const deleteBackgroundStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.abs(translateX.value) / 80, 1),
  }));

  const card = (
    <Pressable
      onPress={() => {
        softPulse();
        onPress();
      }}
      style={{ backgroundColor: CARD, borderRadius: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", overflow: "hidden", minHeight: 76 }}
    >
      {photo ? (
        <Image source={{ uri: photo }} style={{ width: 64, height: 76 }} resizeMode="cover" accessible={false} />
      ) : (
        <View style={{ width: 64, height: 76, alignItems: "center", justifyContent: "center", backgroundColor: "#2B3420" }}>
          <Ionicons name={type.icon} size={22} color={GOLD} />
        </View>
      )}
      <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name={type.icon} size={14} color={GOLD} />
          <Text style={{ color: GOLD, fontSize: 12, fontWeight: "700", marginLeft: 4 }}>{type.label}</Text>
        </View>
        <Text numberOfLines={1} style={{ color: CREAM, fontSize: 16, fontWeight: "800", marginTop: 2 }}>{rowHeadline(row)}</Text>
        <Text numberOfLines={1} style={{ color: SECONDARY, fontSize: 12, marginTop: 2 }}>{rowWhen(row)}</Text>
      </View>
      {onDelete ? (
        <Pressable
          accessibilityLabel="Delete"
          onPress={(event) => {
            event.stopPropagation();
            softPulse();
            onDelete();
          }}
          hitSlop={4}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: 4 }}
        >
          <Ionicons name="trash-outline" size={20} color={SECONDARY} />
        </Pressable>
      ) : null}
    </Pressable>
  );

  if (!onDelete) return card;

  return (
    <View style={{ marginBottom: 0 }}>
      <Animated.View
        pointerEvents="none"
        style={[{ position: "absolute", top: 0, right: 0, bottom: 10, width: 88, borderRadius: 14, backgroundColor: "#4A3C2E", alignItems: "center", justifyContent: "center" }, deleteBackgroundStyle]}
      >
        <Ionicons name="trash" size={22} color={CREAM} />
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>{card}</Animated.View>
      </GestureDetector>
    </View>
  );
};
