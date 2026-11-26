/**
 * History Detail Screen - View full scorecard from history
 */

import React, { useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { formatScore, hasAntlerMeasurements, hasCountedPoints, hasRealScore, meetsBooneAndCrockettMinimum, NOT_SCORED } from "../utils/boone-crockett-calculator";
import { ConfidenceLevel, MeasurementRange, DeerScoringResult } from "../types/deer-scoring";
import { format } from "date-fns";
import { shownAge } from "../utils/age-class";
import { HarvestPanel } from "../components/HarvestPanel";
import { WrongCallCard } from "../components/WrongCallCard";
import { PreShotBar, ShotRecordPage } from "../components/PreShotBar";
import { LeaseManagerButton, shareRead } from "../components/LeaseManagerButton";
import { useShotRecordStore } from "../state/shotRecordStore";
import { useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";
import { showPreShotRecord } from "../lib/lease-rules";
import { fieldRead, normalizeFieldCall } from "../utils/field-call";
import { prepareRackScore } from "../lib/score-this-rack";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { usePhotoAspect } from "../hooks/usePhotoAspect";
import { fittedPhotoHeight } from "../lib/photo-fit";

type NavigationProp = NativeStackNavigationProp<any>;

export const HistoryDetailScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const params = route.params as { result?: DeerScoringResult; shotId?: string };
  const result = params.result;
  const scoringRack = useRef(false);
  const savedMinimum = useDeerScoringStore((s) => s.propertyRules.minimumShooterAge);
  const linkedId = result?.analysisId ?? params.shotId ?? "";
  const linked = useShotRecordStore((s) => (linkedId ? s.records[linkedId] : undefined));
  const leaseRules = useHunterProfile((s) => s.leaseRules);
  const recordsOn = showPreShotRecord(leaseRules, useRemoteConfig((s) => s.flags.preShotRecord));

  if (!result) {
    if (!params.shotId) {
      navigation.goBack();
      return null;
    }
    return (
      <ShotRecordPage
        localId={params.shotId}
        onBack={() => navigation.goBack()}
        onNeedPlan={() => navigation.navigate("Home", { screen: "TierPaywall", params: { reason: "records" } })}
      />
    );
  }

  const { score, age, scale, fusedFrameCount, processingTime, cloudRefinementUsed, timestamp, capturedFrames, manualPointCount, manualOverride, analysisMode, explainableAge, explainableRackScore } = result;
  const rackScored = hasRealScore(score);
  const pointsKnown = hasCountedPoints(score);
  const itemized = hasAntlerMeasurements(score?.measurements);
  const bcMinimum = score?.measurements
    ? meetsBooneAndCrockettMinimum(score)
    : { typical: false, nonTypical: false };

  // Determine if this is age mode or rack mode
  const isAgeMode = analysisMode === "age";

  // Use manual count if override is active, otherwise use AI count
  const displayedPointCount = manualOverride && manualPointCount
    ? manualPointCount
    : (score?.measurements?.totalPoints ?? 0) + (score?.measurements?.totalAbnormalPoints ?? 0);

  const canScoreRack = capturedFrames.some((frame) => frame.imageUri);
  const scoreThisRack = async () => {
    if (scoringRack.current) return;
    scoringRack.current = true;
    try {
      const start = await prepareRackScore(capturedFrames);
      if (!start) return;
      const processPromise = start();
      navigation.navigate("Home", { screen: "Processing" });
      await processPromise;
    } catch {
      // The processing screen shows the failure.
    } finally {
      scoringRack.current = false;
    }
  };

  const getValue = (measurement: number | MeasurementRange | undefined): number => {
    if (!measurement) return 0;
    if (typeof measurement === "number") return measurement;
    return measurement.average;
  };
  const netInches = score
    ? getValue(score.recommendedCategory === "Typical" ? score.netTypical : score.netNonTypical)
    : 0;

  const handleExportPDF = async () => {
    try {
      await shareRead({
        ageClass: shownAge(explainableAge?.ageLabel, explainableAge?.estimatedAge || age.estimatedAge),
        call: linked?.fieldCall || result.shotReceipt?.summary.fieldCall || explainableAge?.fieldCall || explainableAge?.shooterPassLabel || "",
        minimum: linked?.leaseMinimum ?? explainableAge?.minimumAgeThreshold ?? savedMinimum,
        region: linked?.huntLabel || "Hunt region not set",
        time: new Date(timestamp).toLocaleString(),
        receiptId: linked?.receiptId || result.shotReceipt?.id,
        photoUri: capturedFrames[0]?.imageUri,
      }, "anyone");
    } catch {
      // He closed the sheet.
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-6 py-4 border-b border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable accessibilityLabel="Back" onPress={() => navigation.goBack()} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text className="text-white text-lg font-bold">Scorecard</Text>
          <Pressable accessibilityLabel="Share" onPress={handleExportPDF} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="share-outline" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="px-6 py-6">
          <HarvestPanel
            scanId={result.analysisId}
            leaseMinimum={explainableAge?.minimumAgeThreshold ?? savedMinimum}
            fieldCall={explainableAge?.fieldCall || result.shotReceipt?.summary.fieldCall || ""}
            showReport={false}
          />
          <WrongCallCard
            scanId={result.analysisId}
            fieldCall={explainableAge?.fieldCall || result.shotReceipt?.summary.fieldCall || ""}
            photos={result.capturedFrames.map((frame) => frame.imageUri)}
            snapshot={{
              fieldCall: explainableAge?.fieldCall || result.shotReceipt?.summary.fieldCall,
              ageYears: explainableAge?.estimatedAgeYears,
              leaseMinimum: explainableAge?.minimumAgeThreshold ?? savedMinimum,
            }}
          />
          {recordsOn && (result.shotReceipt || linked) ? (
            <PreShotBar
              compact
              draft={{
                localId: result.analysisId,
                mode: result.analysisMode,
                photoUris: result.capturedFrames.map((frame) => frame.imageUri),
                receipt: result.shotReceipt ?? null,
                ageClass: linked?.ageClass || result.shotReceipt?.summary.ageClass || shownAge(explainableAge?.ageLabel, explainableAge?.estimatedAge || age.estimatedAge),
                ageRange: linked?.ageRange || result.shotReceipt?.summary.ageRange || String(explainableAge?.estimatedAge || age.estimatedAge || ""),
                confidence: linked?.confidence ?? result.shotReceipt?.summary.confidence ?? explainableAge?.overallConfidence ?? 0,
                leaseMinimum: linked?.leaseMinimum ?? explainableAge?.minimumAgeThreshold ?? savedMinimum,
                fieldCall: linked?.fieldCall || result.shotReceipt?.summary.fieldCall || explainableAge?.fieldCall || "",
                fieldCallNote: linked?.fieldCallNote || result.shotReceipt?.summary.fieldCallNote || "",
                cues: linked?.cues ?? result.shotReceipt?.summary.cues ?? [],
                scoreLabel: linked?.scoreLabel ?? null,
              }}
              onNeedPlan={() => navigation.navigate("Home", { screen: "TierPaywall", params: { reason: "records" } })}
            />
          ) : null}
          {leaseRules ? (
          <LeaseManagerButton
            ageClass={shownAge(explainableAge?.ageLabel, explainableAge?.estimatedAge || age.estimatedAge)}
            call={linked?.fieldCall || result.shotReceipt?.summary.fieldCall || explainableAge?.fieldCall || explainableAge?.shooterPassLabel || ""}
            minimum={linked?.leaseMinimum ?? explainableAge?.minimumAgeThreshold ?? savedMinimum}
            region={linked?.huntLabel || "Hunt region not set"}
            time={new Date(timestamp).toLocaleString()}
            receiptId={linked?.receiptId || result.shotReceipt?.id}
            photoUri={capturedFrames[0]?.imageUri}
          />
          ) : null}
          {/* Image Preview */}
          {capturedFrames[0]?.imageUri && (
            <FittedPhoto uri={capturedFrames[0].imageUri} />
          )}

          {/* Date & Mode Badge */}
          <View className="flex-row items-center justify-between mb-6">
            <View className="flex-row items-center">
              <Ionicons name="calendar" size={16} color="#666" />
              <Text className="text-gray-400 text-sm ml-2">
                {format(new Date(timestamp), "MMMM d, yyyy 'at' h:mm a")}
              </Text>
            </View>
            <View
              className={`px-3 py-1.5 rounded-lg flex-row items-center ${
                isAgeMode ? "bg-blue-600" : "bg-orange-600"
              }`}
            >
              <Ionicons
                name={isAgeMode ? "body" : "ribbon"}
                size={14}
                color="white"
                style={{ marginRight: 6 }}
              />
              <Text className="text-white text-xs font-bold">
                {isAgeMode ? "AGE MY DEER" : "SCORE MY RACK"}
              </Text>
            </View>
          </View>

          {isAgeMode ? (
            // AGE MODE SCORECARD
            <>
              {/* Primary Age Result */}
              <View className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 mb-6">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-white/80 text-sm font-medium">ESTIMATED AGE</Text>
                  {explainableAge?.overallConfidence ? (
                    <View className="bg-white/20 px-3 py-1 rounded-full">
                      <Text className="text-white text-xs font-bold">{explainableAge.overallConfidence}% Confident</Text>
                    </View>
                  ) : (
                    <ConfidenceBadge confidence={age.confidence} />
                  )}
                </View>
                <Text className="text-white text-5xl font-bold mb-3">
                  {shownAge(explainableAge?.ageLabel, explainableAge?.estimatedAge || age.estimatedAge)}
                </Text>
                {(() => {
                  const minimum = explainableAge?.minimumAgeThreshold ?? savedMinimum;
                  const years = explainableAge?.estimatedAgeYears ?? 0;
                  const read = years
                    ? fieldRead(years, explainableAge?.overallConfidence ?? 60, minimum)
                    : null;
                  const call = normalizeFieldCall(explainableAge?.fieldCall) ?? read?.fieldCall ?? explainableAge?.shooterPassLabel;
                  if (!call) return null;
                  return (
                    <View style={{ marginTop: 8 }}>
                      <Text className="text-white text-xl font-bold">{call}</Text>
                      <Text className="text-white/80 text-sm mt-1">Your lease minimum: {minimum}</Text>
                    </View>
                  );
                })()}
                <Text className="text-white/70 text-sm mt-3">{age.regionalPrior || "Based on body and antler characteristics"}</Text>
              </View>

              {/* Age Characteristics (if explainable age available) */}
              {explainableAge && explainableAge.detectedCues && explainableAge.detectedCues.length > 0 && (
                <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                  <View className="flex-row items-center mb-4">
                    <Ionicons name="bulb" size={20} color="#a855f7" />
                    <Text className="text-white text-lg font-bold ml-2">What We Observed</Text>
                  </View>
                  {explainableAge.detectedCues.slice(0, 5).map((cue, idx) => (
                    <View key={idx} className="mb-3">
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-white text-sm font-semibold">{cue.displayName}</Text>
                        <Text className="text-gray-400 text-xs">{cue.confidence}% sure</Text>
                      </View>
                      <Text className="text-gray-400 text-xs leading-relaxed">{cue.explanation}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Quick Rack Summary */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Quick Rack Summary</Text>
                {score && rackScored && netInches > 0 ? (
                  <>
                    {pointsKnown ? (
                      <View className="flex-row items-center justify-between">
                        <Text className="text-gray-400 text-sm">Estimated Points</Text>
                        <Text className="text-white text-2xl font-bold">~{displayedPointCount}pt</Text>
                      </View>
                    ) : null}
                    <View className="flex-row items-center justify-between mt-3">
                      <Text className="text-gray-400 text-sm">Estimated B&C Score</Text>
                      <Text className="text-white text-lg font-semibold">
                        ~{netInches.toFixed(0)}&quot;
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text className="text-white text-2xl font-bold">{NOT_SCORED}</Text>
                    {canScoreRack ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Score this rack"
                        onPress={() => { void scoreThisRack(); }}
                        style={{ marginTop: 16, minHeight: 44, borderRadius: 12, backgroundColor: "#c2410c", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}
                      >
                        <Text className="text-white text-base font-bold">Score this rack</Text>
                      </Pressable>
                    ) : (
                      <Text className="text-gray-500 text-xs mt-3">
                        Note: For precise scoring, use &quot;Score My Rack&quot; mode
                      </Text>
                    )}
                  </>
                )}
              </View>
            </>
          ) : score && rackScored ? (
            // RACK MODE SCORECARD
            <>
              {/* Primary Score Result */}
              <View className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 mb-6">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-white/80 text-sm font-medium">RECOMMENDED CATEGORY</Text>
                  <ConfidenceBadge confidence={score.overallConfidence} />
                </View>
                <Text className="text-white text-3xl font-bold mb-2">{score.recommendedCategory}</Text>
                <View className="flex-row items-baseline">
                  {netInches > 0 ? (
                    <>
                      <Text className="text-white text-5xl font-bold">{netInches.toFixed(1)}</Text>
                      <Text className="text-white/80 text-xl ml-2">inches</Text>
                    </>
                  ) : (
                    <Text className="text-white text-5xl font-bold">{NOT_SCORED}</Text>
                  )}
                </View>
                <Text className="text-white/70 text-sm mt-3">Net {score.recommendedCategory} Score</Text>
              </View>

              {/* Point Count - Prominent Display */}
              <View className="bg-blue-600 rounded-xl p-5 mb-6">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Ionicons name="git-branch" size={24} color="white" />
                    <Text className="text-white text-lg font-bold ml-2">Point Count</Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-1">
                    <View className="flex-row items-center mb-1">
                      <Text className="text-white/80 text-sm">Total Points</Text>
                      {manualOverride && (
                        <View className="ml-2 bg-green-600 px-2 py-0.5 rounded">
                          <Text className="text-white text-xs font-bold">Manual Count</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-white text-4xl font-bold">
                      {pointsKnown ? displayedPointCount : "\u2014"}
                    </Text>
                    {pointsKnown ? (
                      <Text className="text-white/60 text-xs mt-1">
                        {manualOverride ? (
                          <>User verified count</>
                        ) : (
                          <>({score.measurements.totalPoints} normal + {score.measurements.totalAbnormalPoints} abnormal)</>
                        )}
                      </Text>
                    ) : null}
                  </View>
                  {score.measurements.totalAbnormalPoints > 0 && (
                    <View className="flex-1 items-end">
                      <Text className="text-white/80 text-sm mb-1">Abnormal Points</Text>
                      <Text className="text-yellow-300 text-4xl font-bold">{score.measurements.totalAbnormalPoints}</Text>
                      <Text className="text-yellow-200 text-xs mt-1">
                        {score.measurements.totalAbnormalPoints >= 8 ? "Highly Non-Typical" : "Non-Typical"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Explainable Rack Scoring */}
              {explainableRackScore && explainableRackScore.detectedCues && explainableRackScore.detectedCues.length > 0 && (
                <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                  <View className="flex-row items-center mb-4">
                    <Ionicons name="bulb" size={20} color="#a855f7" />
                    <Text className="text-white text-lg font-bold ml-2">Score Breakdown Explained</Text>
                  </View>
                  {explainableRackScore.detectedCues
                    .filter(c => Math.abs(c.contribution) > 1) // Only show significant contributors
                    .slice(0, 6)
                    .map((cue, idx) => (
                      <View key={idx} className="mb-3">
                        <View className="flex-row items-center justify-between mb-1">
                          <Text className="text-white text-sm font-semibold">{cue.displayName}</Text>
                          <Text className={`text-sm font-bold ${cue.contribution >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {cue.contribution >= 0 ? "+" : ""}{cue.contribution.toFixed(1)}&quot;
                          </Text>
                        </View>
                        <Text className="text-gray-400 text-xs">{cue.detectedMeasurement}</Text>
                      </View>
                    ))}
                </View>
              )}

              {/* Score Breakdown */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Score Breakdown</Text>
                <ScoreRow label="Gross Typical" value={formatScore(score.grossTypical)} />
                <ScoreRow label="Gross Non-Typical" value={formatScore(score.grossNonTypical)} />
                <View className="h-px bg-neutral-700 my-3" />
                <ScoreRow label="Net Typical" value={formatScore(score.netTypical)} highlight />
                <ScoreRow label="Net Non-Typical" value={formatScore(score.netNonTypical)} highlight />
                <View className="h-px bg-neutral-700 my-3" />
                <ScoreRow label="Symmetry Deductions" value={formatScore(score.symmetryDeductions)} deduction />
                <ScoreRow label="Abnormal Points Total" value={formatScore(score.abnormalPointsTotal)} />
              </View>

              {itemized ? (
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Component Totals</Text>
                <ScoreRow label="Total Main Beam Length" value={formatScore(score.totalMainBeamLength)} />
                <ScoreRow label="Total Tine Length" value={formatScore(score.totalTineLength)} />
                <ScoreRow label="Total Mass (Circumferences)" value={formatScore(score.totalMass)} />
                <ScoreRow label="Inside Spread Credit" value={formatScore(score.spreadCredit)} />
              </View>
              ) : null}

              {/* Quick Age Summary */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Quick Age Estimate</Text>
                <View className="flex-row items-center justify-between">
                  <Text className="text-gray-400 text-sm">Estimated Age</Text>
                  <Text className="text-white text-2xl font-bold">{shownAge(explainableAge?.ageLabel, explainableAge?.estimatedAge || age.estimatedAge)}</Text>
                </View>
                <Text className="text-gray-500 text-xs mt-3">
                  Note: For precise age estimation, use &quot;Age My Deer&quot; mode
                </Text>
              </View>

              {/* B&C Qualification */}
              <View className="bg-neutral-800 rounded-xl p-5 mb-6">
                <Text className="text-white text-lg font-bold mb-4">Boone & Crockett Qualification</Text>
                <View className="flex-row items-center mb-2">
                  <Ionicons
                    name={bcMinimum.typical ? "checkmark-circle" : "close-circle"}
                    size={20}
                    color={bcMinimum.typical ? "#22c55e" : "#666"}
                  />
                  <Text className={`ml-2 text-sm ${bcMinimum.typical ? "text-green-400" : "text-gray-500"}`}>
                    Typical Minimum (160&quot;): {bcMinimum.typical ? "Qualified" : "Not Qualified"}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Ionicons
                    name={bcMinimum.nonTypical ? "checkmark-circle" : "close-circle"}
                    size={20}
                    color={bcMinimum.nonTypical ? "#22c55e" : "#666"}
                  />
                  <Text className={`ml-2 text-sm ${bcMinimum.nonTypical ? "text-green-400" : "text-gray-500"}`}>
                    Non-Typical Minimum (185&quot;): {bcMinimum.nonTypical ? "Qualified" : "Not Qualified"}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <View className="bg-neutral-800 rounded-xl p-5 mb-6">
              <Text className="text-white text-lg font-bold mb-2">Rack Score</Text>
              <Text className="text-white text-3xl font-bold">{NOT_SCORED}</Text>
            </View>
          )}

          {/* Analysis Details - Common to both modes */}
          <View className="bg-neutral-800 rounded-xl p-5 mb-6">
            <Text className="text-white text-lg font-bold mb-4">Analysis Details</Text>
            <DetailRow label="Frames Analyzed" value={fusedFrameCount.toString()} />
            <DetailRow label="Processing Time" value={`${(processingTime / 1000).toFixed(1)}s`} />
            <DetailRow label="Scale Method" value={scale.method} />
            <DetailRow label="Scale Confidence" value={scale.confidence} />
            {cloudRefinementUsed && (
              <DetailRow label="Extra Refinement" value="Yes" />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

// Reuse components from ResultsScreen
const ConfidenceBadge: React.FC<{ confidence: ConfidenceLevel }> = ({ confidence }) => {
  const colors = {
    Low: "bg-yellow-500/20 text-yellow-500",
    Med: "bg-blue-500/20 text-blue-500",
    High: "bg-green-500/20 text-green-500",
  };

  return (
    <View className={`${colors[confidence]} px-3 py-1 rounded-full`}>
      <Text className={`${colors[confidence].split(" ")[1]} text-xs font-bold`}>{confidence}</Text>
    </View>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  return (
    <View className="flex-row justify-between items-center mb-2">
      <Text className="text-gray-400 text-sm">{label}</Text>
      <Text className="text-white text-sm">{value}</Text>
    </View>
  );
};

const ScoreRow: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
  deduction?: boolean;
}> = ({ label, value, highlight, deduction }) => {
  return (
    <View className="flex-row justify-between items-center mb-2">
      <Text
        className={`text-sm ${
          highlight ? "text-white font-semibold" : deduction ? "text-red-400" : "text-gray-400"
        }`}
      >
        {label}
      </Text>
      <Text
        className={`text-sm font-mono ${
          highlight ? "text-white font-bold text-lg" : deduction ? "text-red-400" : "text-gray-300"
        }`}
      >
        {value}
      </Text>
    </View>
  );
};

/** Whole photo, no cover crop, so the full rack or body is visible. */
const FittedPhoto: React.FC<{ uri: string }> = ({ uri }) => {
  const aspect = usePhotoAspect(uri);
  const [frameWidth, setFrameWidth] = useState(0);
  const height = fittedPhotoHeight(frameWidth, aspect, 460, 250);
  return (
    <View
      className="mb-6 rounded-xl overflow-hidden bg-black"
      onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}
    >
      <Image source={{ uri }} style={{ width: "100%", height }} resizeMode="contain" />
    </View>
  );
};
