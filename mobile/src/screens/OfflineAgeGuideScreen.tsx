/**
 * Offline Aging Guide
 * Interactive field guide for estimating deer age when you can't run a scan.
 * Scoring follows the same body-cue rules as the aging engine.
 */

import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNetworkStore } from "../state/networkStore";
import { useDeerScoringStore } from "../state/deerScoringStore";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { TraitPictureCard } from "../components/TraitPictureCard";
import { softPulse } from "../lib/haptics";
import { TRAITS, scoreGuide, type ScoreValue, type TraitDef, type TraitId } from "../lib/offline-age-guide";
import { pictureCaption, type IllustratedTraitId } from "../lib/offline-age-guide-art";

const GUIDE = {
  screen: "#2B3420",
  card: "#3D4A2F",
  cream: "#F5F5DC",
  creamMuted: "#E5D4B8",
  gold: "#D4AF37",
  button: "#5A6447",
} as const;

type NavigationProp = NativeStackNavigationProp<any>;

const TIPS: { title: string; text: string }[] = [
  {
    title: "Standing broadside only",
    text: "Score a deer that is standing and broadside. Quartering, head-on, or bedded deer are hard to judge.",
  },
  {
    title: "Neck swells in the rut",
    text: "A thick neck is a strong rut cue, but it can't set the age alone. Out of the rut it can mislead.",
  },
  { title: "Hidden legs", text: "Skip the legs if the lower legs are hidden. Don't guess." },
  {
    title: "Slope isn't a tucked belly",
    text: "A slight upward slope toward the hind legs is normal, not a tucked-up belly.",
  },
  {
    title: "Front vs rear mass",
    text: "A front half heavier than the hindquarters points to 3.5+, and strongly so at 5.5+.",
  },
  { title: "3.5 vs 4.5", text: "A 3.5 is the athletic racehorse. Bucks are mature at 4.5." },
  { title: "Old deer", text: "A pot belly is a 5.5+ sign. A deeply swayed back is 6.5+ / old." },
  {
    title: "Antlers last",
    text: "Don't rely on antler size alone. Nutrition varies by region. Use antlers only as a tie-breaker.",
  },
  { title: "Don't age by the face; use the body.", text: "" },
  { title: "5.5+", text: "Guides: eyes may look squinty; look for scars." },
];

export const OfflineAgeGuideScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const isOnline = isConnected && isInternetReachable !== false;
  const leaseMinimum = useDeerScoringStore((s) => s.propertyRules.minimumShooterAge);

  const [scores, setScores] = useState<Partial<Record<TraitId, ScoreValue>>>({});

  const handleScore = (traitId: TraitId, value: ScoreValue) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScores((prev) => ({ ...prev, [traitId]: value }));
  };

  const clearScore = (traitId: TraitId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScores((prev) => {
      const next = { ...prev };
      delete next[traitId];
      return next;
    });
  };

  const resetAll = () => {
    softPulse();
    setScores({});
  };

  const result = scoreGuide(scores, leaseMinimum);
  const showBar = result.scoredCount > 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      <View className="px-6 py-4 border-b" style={{ borderBottomColor: "#3D4A2F" }}>
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
          </Pressable>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold" style={{ color: "#F5F5DC" }}>
              Offline Aging Guide
            </Text>
            <Text className="text-xs mt-0.5" style={{ color: "#D4AF37" }}>
              Manual Field Estimation
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 140 }}
        stickyHeaderIndices={stickyHeaderIndices(TRAITS)}
        removeClippedSubviews={false}
      >
        <View className="px-6 pt-6">
          {isOnline && (
            <View className="bg-blue-600/20 border-2 border-blue-500 rounded-xl p-4 mb-4">
              <View className="flex-row items-center justify-center">
                <Ionicons name="school" size={20} color="#3b82f6" />
                <Text className="text-blue-300 font-bold text-base ml-2">Practice Mode</Text>
              </View>
              <Text className="text-blue-200 text-xs text-center mt-1">
                You have internet access — a good time to practice before the hunt.
              </Text>
            </View>
          )}

          {!isOnline && (
            <View className="bg-green-600/20 border-2 border-green-500 rounded-xl p-4 mb-4">
              <View className="flex-row items-center justify-center">
                <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                <Text className="text-green-300 font-bold text-base ml-2">Field Mode — Offline</Text>
              </View>
              <Text className="text-green-200 text-xs text-center mt-1">This guide works without internet.</Text>
            </View>
          )}

          <View className="bg-blue-600/20 border-2 border-blue-500 rounded-xl p-4 mb-6">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={24} color="#3b82f6" />
              <View className="flex-1 ml-3">
                <Text className="text-blue-300 font-bold text-base mb-2">How to use this guide</Text>
                <Text className="text-blue-200 text-sm leading-5 mb-2">
                  Score what you can clearly see on a standing, broadside deer. You need about 3 body traits, or the
                  neck plus 2, before an age is shown. The neck alone cannot set it.
                </Text>
                <Text className="text-blue-200 text-sm leading-5">
                  The harvest call uses your lease minimum in Settings (currently {leaseMinimum}).
                </Text>
              </View>
            </View>
          </View>
        </View>

        {traitBlocks(scores, handleScore, clearScore)}

        <View className="px-6">
          <View className="rounded-2xl p-5 mb-6" style={{ backgroundColor: "#3D4A2F" }}>
            <View className="flex-row items-center mb-3">
              <Ionicons name="bulb" size={24} color="#D4AF37" />
              <Text className="text-white font-bold text-lg ml-2">Tips</Text>
            </View>
            <View>
              {TIPS.map((tip) => (
                <Text key={tip.title} className="text-sm leading-5 mb-2" style={{ color: "#E5D4B8" }}>
                  •{" "}
                  {tip.text ? (
                    <>
                      <Text className="font-bold">{tip.title}.</Text> {tip.text}
                    </>
                  ) : (
                    <Text className="font-bold">{tip.title}</Text>
                  )}
                </Text>
              ))}
            </View>
          </View>

          <View className="rounded-xl p-4 mb-6" style={{ backgroundColor: "#5A6447" }}>
            <View className="flex-row items-start">
              <Ionicons name="alert-circle" size={20} color="#f59e0b" />
              <Text className="text-xs flex-1 ml-2 leading-5" style={{ color: GUIDE.creamMuted }}>
                This is a field guide for when a scan is not available. It is a guideline, not a jawbone age. Follow
                local regulations, landowner rules, and your lease minimum.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {showBar && result.ready ? (
        <Animated.View
          entering={FadeIn.duration(300)}
          className="absolute bottom-0 left-0 right-0"
          style={{
            backgroundColor:
              result.fieldCall === "SHOOTER" ? "#166534" : result.fieldCall === "BORDERLINE" ? "#854d0e" : "#92400e",
            borderTopWidth: 2,
            borderTopColor: result.fieldCall === "SHOOTER" ? "#22c55e" : "#f59e0b",
            paddingBottom: insets.bottom + 8,
          }}
        >
          <View className="px-4 pt-3 pb-2">
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-1 pr-3">
                <Text className="text-white font-bold text-2xl">{result.ageLabel}</Text>
                <Text className="text-white font-semibold text-sm mt-0.5">{result.fieldCall}</Text>
                <Text className="text-white/80 text-xs mt-1">{result.statusLine}</Text>
                <Text className="text-white/70 text-xs mt-0.5">Lease minimum {result.leaseMinimum}</Text>
              </View>
              <Pressable
                onPress={resetAll}
                accessibilityLabel="Reset"
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  minHeight: 44,
                  minWidth: 44,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text className="text-white text-xs font-semibold">Reset</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 pt-3"
          style={{
            backgroundColor: "#1a1f16",
            borderTopWidth: 1,
            borderTopColor: "#3D4A2F",
            paddingBottom: insets.bottom + 8,
          }}
        >
          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 pr-3">
              <Text className="text-sm" style={{ color: "#E5D4B8" }}>
                {result.scoredCount > 0 ? result.statusLine : "Score body features to see an age"}
              </Text>
              <Text className="text-xs mt-1" style={{ color: "#C9B48F" }}>
                {result.fieldCallNote ?? "Score 3 body traits, or the neck plus 2, to see an age."}
              </Text>
            </View>
            {result.scoredCount > 0 && (
              <Pressable
                onPress={resetAll}
                accessibilityLabel="Reset"
                style={{
                  backgroundColor: "rgba(255,255,255,0.15)",
                  minHeight: 44,
                  minWidth: 44,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text className="text-white text-xs font-semibold">Reset</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

function stickyHeaderIndices(traits: TraitDef[]): number[] {
  const indices: number[] = [];
  let index = 1;
  for (const trait of traits) {
    if (trait.picture) indices.push(index);
    index += trait.picture ? 2 : 1;
  }
  return indices;
}

function traitBlocks(
  scores: Partial<Record<TraitId, ScoreValue>>,
  onScore: (traitId: TraitId, value: ScoreValue) => void,
  onClear: (traitId: TraitId) => void,
) {
  return TRAITS.flatMap((trait) => {
    const selected = scores[trait.id];
    const selectedChoice = trait.scores.find((row) => row.value === selected);
    const options = (
      <TraitOptions
        key={`${trait.id}-opts`}
        trait={trait}
        selected={selected}
        showTitle={!trait.picture}
        onScore={onScore}
        onClear={onClear}
      />
    );
    if (!trait.picture) return [options];
    const tapped = pictureCaption(trait.id as IllustratedTraitId, selected);
    const caption = tapped ?? (selected == null ? "Select the closest match" : (selectedChoice?.label ?? ""));
    return [
      <View key={`${trait.id}-art`} style={{ backgroundColor: GUIDE.screen, paddingHorizontal: 24, paddingBottom: 8 }}>
        <TraitPictureCard
          traitId={trait.id as IllustratedTraitId}
          name={trait.name}
          icon={trait.icon}
          selected={selected}
          caption={caption}
          onClear={() => onClear(trait.id)}
        />
      </View>,
      options,
    ];
  });
}

function TraitOptions({
  trait,
  selected,
  showTitle,
  onScore,
  onClear,
}: {
  trait: TraitDef;
  selected: ScoreValue | undefined;
  showTitle: boolean;
  onScore: (traitId: TraitId, value: ScoreValue) => void;
  onClear: (traitId: TraitId) => void;
}) {
  const skipped = selected === "skip";
  return (
    <View className="px-6 mb-4">
      <View className="rounded-2xl p-4" style={{ backgroundColor: GUIDE.card }}>
        {showTitle && (
          <View className="flex-row items-center mb-3">
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: GUIDE.button }}
            >
              <Ionicons name={trait.icon as keyof typeof Ionicons.glyphMap} size={20} color={GUIDE.gold} />
            </View>
            <Text className="flex-1 ml-3 font-bold text-base" style={{ color: GUIDE.cream }}>
              {trait.name}
            </Text>
            {selected != null && (
              <Pressable
                onPress={() => onClear(trait.id)}
                className="w-12 h-12 rounded-full items-center justify-center"
                style={{ backgroundColor: GUIDE.gold }}
                accessibilityLabel={`Clear ${trait.name}`}
              >
                <Text className="font-bold text-base" style={{ color: GUIDE.screen }}>
                  {selected === "skip" ? "—" : String(selected)}
                </Text>
              </Pressable>
            )}
          </View>
        )}
        <Text className="text-xs leading-4 mb-3" style={{ color: GUIDE.creamMuted }}>
          {trait.description}
        </Text>
        <View className="space-y-2">
          {trait.scores.map((score) => {
            const on = selected === score.value;
            const ink = on ? GUIDE.screen : GUIDE.cream;
            const gold = on ? GUIDE.screen : GUIDE.gold;
            const body = on ? GUIDE.screen : GUIDE.creamMuted;
            return (
              <Pressable
                key={String(score.value)}
                onPress={() => onScore(trait.id, score.value)}
                className="rounded-lg p-3"
                style={{ backgroundColor: on ? GUIDE.gold : GUIDE.button }}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="font-bold text-sm flex-1 pr-2" style={{ color: ink }}>
                    {score.value === "skip" ? score.label : `${score.value}. ${score.label}`}
                  </Text>
                  <Text className="text-xs" style={{ color: gold }}>
                    {score.ageIndication}
                  </Text>
                </View>
                <Text className="text-xs" style={{ color: body }}>
                  {score.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {skipped && (
          <Text className="text-xs mt-2" style={{ color: GUIDE.gold }}>
            Legs skipped — they will not count toward the age.
          </Text>
        )}
      </View>
    </View>
  );
}
