/**
 * Age result for a blind. The verdict is the whole decision.
 * Why and More stay collapsed until he asks.
 */

import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StatusBar, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { softPulse } from "../lib/haptics";
import { ResultLead } from "../components/ResultLead";
import { extraBodyNotes, regionRows } from "../utils/body-cues";
import { tapSquare } from "../theme/tap";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { useResultFollowUp } from "../hooks/useResultFollowUp";
import { PreShotBar } from "../components/PreShotBar";
import { WrongCallCard } from "../components/WrongCallCard";
import { RegionHeadsUp } from "../components/HuntRegionSheet";
import { LeaseManagerButton, type LeaseNote } from "../components/LeaseManagerButton";
import { activeHunt, huntConfirmedToday, useHunterProfile } from "../state/hunterProfile";
import { RealAgeRow } from "../components/RealAgeRow";
import { optionalStandLocation } from "../state/shotRecordStore";
import { useRemoteConfig } from "../state/remoteConfig";
import { showPreShotRecord } from "../lib/lease-rules";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { shownAge } from "../utils/age-class";
import { PhotoViewer } from "../components/PhotoViewer";
import { ErrorModal } from "../components/ErrorModal";
import {
  BLIND,
  FIELD_READ_NOTE,
  SET_MINIMUM_PROMPT,
  bodyRead,
  formatMinimum,
  minimumIsSet,
  verdictColor,
  verdictKind,
  verdictWord,
} from "../utils/blind-verdict";

type NavigationProp = NativeStackNavigationProp<any>;

export const AgeResultScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const currentResult = useDeerScoringStore((s) => s.currentResult);
  const clearCurrentResult = useDeerScoringStore((s) => s.clearCurrentResult);
  const saveToHistory = useDeerScoringStore((s) => s.saveToHistory);
  const updateHistory = useDeerScoringStore((s) => s.updateHistory);
  const setAnalysisMode = useDeerScoringStore((s) => s.setAnalysisMode);
  const startCapture = useDeerScoringStore((s) => s.startCapture);
  const addFrame = useDeerScoringStore((s) => s.addFrame);
  const processFrames = useDeerScoringStore((s) => s.processFrames);
  const [hasSaved, setHasSaved] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showModelCard, setShowModelCard] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [manualNotes, setManualNotes] = useState("");
  const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const explainable = currentResult?.explainableAge;
  const ageClassLabel = shownAge(explainable?.ageLabel, explainable?.estimatedAge ?? explainable?.estimatedAgeYears);
  const shootOrPass = useRemoteConfig((s) => s.flags.shootOrPass);
  const recordFlag = useRemoteConfig((s) => s.flags.preShotRecord);
  const copy = useRemoteConfig((s) => s.copy);
  const leaseRules = useHunterProfile((s) => s.leaseRules);
  const pendingPaywall = useSubscriptionStore((s) => s.pendingPaywall);
  const recordsOn = showPreShotRecord(leaseRules, recordFlag);
  const followUp = useResultFollowUp(Boolean(explainable), explainable?.fieldCall);

  useEffect(() => {
    if (currentResult && !hasSaved) {
      const timer = setTimeout(async () => {
        try {
          const location = await optionalStandLocation();
          if (location) {
            setGpsLocation(location);
            await saveToHistory({ ...currentResult, gpsLocation: location });
          } else {
            await saveToHistory(currentResult);
          }
        } catch {
          await saveToHistory(currentResult);
        }
        setHasSaved(true);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentResult, hasSaved, saveToHistory]);

  // Leave only while this screen is on top. A retake clears the result and
  // opens Processing. Replacing the route from a covered screen sends that
  // Processing screen home.
  useEffect(() => {
    if (currentResult || !navigation.isFocused()) return;
    navigation.replace("HomeMain");
  }, [currentResult, navigation]);

  useEffect(() => {
    if (!currentResult?.analysisId) return;
    softPulse();
  }, [currentResult?.analysisId]);

  if (!currentResult || !currentResult.explainableAge) {
    return null;
  }

  const explainableAge = currentResult.explainableAge;
  const imageUri = currentResult.capturedFrames[0]?.imageUri;
  const read = bodyRead({
    lookFor: explainableAge.lookFor,
    hunterCue: explainableAge.hunterCue,
    reasons: explainableAge.reasons,
    cueBullets: explainableAge.cueBullets,
    detectedCues: explainableAge.detectedCues,
  });
  const kind = verdictKind({
    fieldCall: explainableAge.fieldCall,
    meetsMinimum: explainableAge.meetsMinimumAge,
    imageQuality: explainableAge.imageQuality,
    minimum: explainableAge.minimumAgeThreshold,
    shootOrPass,
  });
  const word = verdictWord(kind, {
    take: copy?.verdictTake,
    walk: copy?.verdictWalk,
    look: copy?.verdictLook,
  });
  const photoTip = explainableAge.photoTips?.find((tip) => tip.trim())?.trim()
    || explainableAge.betterAngle?.trim()
    || "";
  const surface = (kind === "look" ? photoTip || read.lookFor : read.lookFor).trim();
  const clues = read.clues.filter((line) => line.trim().toLowerCase() !== surface.toLowerCase());
  const bodyNotes = extraBodyNotes(clues, explainableAge.bodyFeatureOverlays);
  const moreRows = regionRows(explainableAge.bodyFeatureOverlays).slice(3);
  const hasMinimum = minimumIsSet(explainableAge.minimumAgeThreshold);
  const note = copy?.verdictNote?.trim() || FIELD_READ_NOTE;
  const minimumPrompt = copy?.setMinimumPrompt?.trim() || SET_MINIMUM_PROMPT;
  const hunt = activeHunt(useHunterProfile.getState());

  const leave = (next: "home" | "scan") => {
    softPulse();
    setHasSaved(false);
    if (next === "scan") {
      setAnalysisMode("age");
      if (huntConfirmedToday(useHunterProfile.getState())) navigation.navigate("Camera");
      else navigation.navigate("ModeSelect", { mode: "age" });
    } else {
      navigation.navigate("HomeMain");
    }
    clearCurrentResult();
  };

  const readNote: LeaseNote = {
    ageClass: ageClassLabel,
    call: explainableAge.fieldCall || explainableAge.shooterPassLabel,
    minimum: explainableAge.minimumAgeThreshold,
    region: hunt.label,
    time: new Date(currentResult.timestamp).toLocaleString(),
    receiptId: currentResult.shotReceipt?.id,
    photoUri: imageUri,
  };

  const openSettings = () => {
    const parent = navigation.getParent();
    if (parent) parent.navigate("Settings");
    else navigation.navigate("Settings");
  };

  const runRack = async () => {
    followUp.markRescan();
    setAnalysisMode("score");
    await new Promise((resolve) => setTimeout(resolve, 100));
    startCapture();
    currentResult.capturedFrames.forEach((frame) => {
      addFrame(frame);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const processPromise = processFrames();
    navigation.navigate("Processing");
    try {
      await processPromise;
    } catch {
      // The processing screen shows the failure.
    }
  };

  const saveNotes = () => {
    updateHistory({
      ...currentResult,
      manualNotes,
      gpsLocation: gpsLocation || undefined,
    });
    setShowNotesModal(false);
    setShowSuccessModal(true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: BLIND.bg, paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <View style={{ paddingHorizontal: 8 }}>
        <Pressable
          testID="age-close"
          accessibilityLabel="Close"
          onPress={() => leave("home")}
          hitSlop={8}
          style={tapSquare}
        >
          <Ionicons name="close" size={26} color={BLIND.muted} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
      >
        {imageUri ? (
          <ResultLead
            imageUri={imageUri}
            call={word || undefined}
            callTestID="age-verdict"
            callColor={verdictColor(kind)}
            overlays={explainableAge.bodyFeatureOverlays}
            onPressPhoto={() => {
              softPulse();
              setPhotoOpen(true);
            }}
          />
        ) : word ? (
          <Text
            testID="age-verdict"
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            numberOfLines={1}
            style={{ color: verdictColor(kind), fontSize: 42, fontWeight: "800", letterSpacing: 0.3, textAlign: "center" }}
          >
            {word}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BLIND.ink, fontSize: word ? 28 : 40, fontWeight: "800" }}>{ageClassLabel}</Text>
            {hasMinimum ? (
              <Text style={{ color: BLIND.muted, fontSize: 17, marginTop: 4 }}>
                {`your minimum is ${formatMinimum(explainableAge.minimumAgeThreshold)}`}
              </Text>
            ) : (
              <Pressable testID="age-set-minimum" onPress={openSettings} style={{ marginTop: 8, minHeight: 44, justifyContent: "center" }}>
                <Text style={{ color: BLIND.walk, fontSize: 16, lineHeight: 22 }}>{minimumPrompt}</Text>
              </Pressable>
            )}
          </View>
        </View>

        <Text style={{ color: BLIND.muted, fontSize: 13, lineHeight: 18, marginTop: 10 }}>{note}</Text>

        {surface ? (
          <Text testID="age-look-for" style={{ color: BLIND.ink, fontSize: 17, lineHeight: 24, marginTop: 14 }}>
            {surface}
          </Text>
        ) : null}

        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          {recordsOn ? (
        <PreShotBar
          compact
          draft={{
            localId: currentResult.analysisId,
            mode: "age",
            photoUris: currentResult.capturedFrames.map((frame) => frame.imageUri),
            receipt: currentResult.shotReceipt ?? null,
            ageClass: currentResult.shotReceipt?.summary.ageClass || ageClassLabel,
            ageRange: currentResult.shotReceipt?.summary.ageRange || explainableAge.estimatedAge,
            confidence: explainableAge.overallConfidence,
            leaseMinimum: explainableAge.minimumAgeThreshold,
            fieldCall: explainableAge.fieldCall || "",
            fieldCallNote: explainableAge.fieldCallNote || "",
            cues: clues,
            huntLabel: hunt.label,
            fastAge: explainableAge.fastAge,
            mainAge: explainableAge.mainAge,
            bodyOnlyAge: explainableAge.bodyOnlyAge,
          }}
          onNeedPlan={() => navigation.navigate("TierPaywall", { reason: "records" })}
        />
          ) : null}
          {pendingPaywall ? (
            <Pressable
              onPress={() => navigation.navigate("TierPaywall", { reason: "free_limit" })}
              style={{ minHeight: 44, justifyContent: "center", marginTop: 14, marginLeft: recordsOn ? 16 : 0 }}
            >
              <Text style={{ color: BLIND.muted, fontSize: 15 }}>See plans</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          testID="age-why"
          onPress={() => setShowWhy((open) => !open)}
          style={{ minHeight: 52, marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BLIND.line }}
        >
          <Text style={{ color: BLIND.ink, fontSize: 17, fontWeight: "700" }}>Why this age</Text>
          <Ionicons name={showWhy ? "chevron-up" : "chevron-down"} size={22} color={BLIND.muted} />
        </Pressable>
        {showWhy ? (
          <View style={{ paddingBottom: 8 }}>
            {moreRows.map((row) => (
              <Text key={row.featureId} style={{ color: BLIND.ink, fontSize: 16, lineHeight: 23, marginTop: 12 }}>
                {`${row.number}. ${row.name}${row.cue && row.cue.toLowerCase() !== row.name.toLowerCase() ? ` · ${row.cue}` : ""}`}
              </Text>
            ))}
            {bodyNotes.map((line) => (
              <Text key={line} style={{ color: BLIND.ink, fontSize: 16, lineHeight: 23, marginTop: 12 }}>{line}</Text>
            ))}
            {bodyNotes.length === 0 && moreRows.length === 0 ? (
              <Text style={{ color: BLIND.muted, fontSize: 16, lineHeight: 23, marginTop: 12 }}>
                No other body note on this photo.
              </Text>
            ) : null}
          </View>
        ) : null}

        <Pressable
          testID="age-more"
          onPress={() => setShowMore((open) => !open)}
          style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BLIND.line }}
        >
          <Text style={{ color: BLIND.ink, fontSize: 17, fontWeight: "700" }}>More</Text>
          <Ionicons name={showMore ? "chevron-up" : "chevron-down"} size={22} color={BLIND.muted} />
        </Pressable>
        {showMore ? (
          <View style={{ paddingBottom: 12 }}>
            <MoreRow label="Rack score" onPress={() => { void runRack(); }} />
            <MoreRow label={manualNotes ? "Notes" : "Add notes"} onPress={() => setShowNotesModal(true)} />
            {leaseRules ? (
            <View style={{ marginTop: 8 }}>
              <LeaseManagerButton {...readNote} />
            </View>
            ) : null}
            <MoreRow label="How this works" onPress={() => setShowModelCard(true)} />
            <RealAgeRow jobId={explainableAge.scanJobId} color={BLIND.ink} />
            <View style={{ marginTop: 8 }}>
              <WrongCallCard
                scanId={currentResult.analysisId}
                fieldCall={explainableAge.fieldCall || ""}
                minimum={explainableAge.minimumAgeThreshold}
                photos={currentResult.capturedFrames.map((frame) => frame.imageUri)}
                snapshot={{
                  fieldCall: explainableAge.fieldCall,
                  ageYears: explainableAge.estimatedAgeYears,
                  fastAge: explainableAge.fastAge,
                  mainAge: explainableAge.mainAge,
                  bodyOnlyAge: explainableAge.bodyOnlyAge,
                  leaseMinimum: explainableAge.minimumAgeThreshold,
                }}
              />
            </View>
            <RegionHeadsUp />
          </View>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12, backgroundColor: BLIND.bg }}>
        <Pressable
          testID="age-scan-again"
          onPress={() => leave("scan")}
          style={{ flex: 1, minHeight: 60, borderRadius: 14, borderWidth: 1.5, borderColor: "#3A3832", backgroundColor: "#1C1B17", alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: BLIND.ink, fontSize: 18, fontWeight: "700" }}>Scan again</Text>
        </Pressable>
        <Pressable
          testID="age-done"
          onPress={() => leave("home")}
          style={{ flex: 1, minHeight: 60, borderRadius: 14, backgroundColor: BLIND.button, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: BLIND.buttonInk, fontSize: 18, fontWeight: "700" }}>Done</Text>
        </Pressable>
      </View>

      <Modal visible={showModelCard} transparent animationType="slide" onRequestClose={() => setShowModelCard(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View style={{ backgroundColor: "#1C1B17", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "80%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ color: BLIND.ink, fontSize: 20, fontWeight: "700", flex: 1 }}>How this works</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setShowModelCard(false)} hitSlop={8} style={tapSquare}>
                <Ionicons name="close" size={26} color={BLIND.muted} />
              </Pressable>
            </View>
            <ScrollView>
              <ModelBlock title="How it works" body="The read compares the buck's body in the photo with age cues hunters and biologists use: chest, neck, belly, and legs. It is a field read from that photo." />
              <ModelBlock title="What it is not" body="It is not a jawbone age, and it is not a finding about a lease rule or a fine. The harvest decision stays with the hunter." />
              <ModelBlock title="A better photo" body={"A side view, in daylight, with the whole body in the frame.\nBrush, darkness, and a head-down buck make the read weaker."} />
            </ScrollView>
            <Pressable onPress={() => setShowModelCard(false)} style={{ borderRadius: 14, minHeight: 52, alignItems: "center", justifyContent: "center", backgroundColor: "#2C2A24", marginTop: 12 }}>
              <Text style={{ color: BLIND.ink, fontWeight: "700" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showNotesModal} transparent animationType="slide" onRequestClose={() => setShowNotesModal(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" }}>
          <View style={{ backgroundColor: "#1C1B17", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ color: BLIND.ink, fontSize: 20, fontWeight: "700" }}>Notes</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setShowNotesModal(false)} hitSlop={8} style={tapSquare}>
                <Ionicons name="close" size={26} color={BLIND.muted} />
              </Pressable>
            </View>
            <Text style={{ color: BLIND.muted, marginBottom: 8 }}>
              {gpsLocation ? `${gpsLocation.latitude.toFixed(5)}, ${gpsLocation.longitude.toFixed(5)}` : "No stand location on this read"}
            </Text>
            <TextInput
              value={manualNotes}
              onChangeText={setManualNotes}
              placeholder="Wind, distance, what he was doing"
              placeholderTextColor="#6F6A60"
              multiline
              style={{ backgroundColor: "#2C2A24", color: BLIND.ink, borderRadius: 12, padding: 14, minHeight: 100, textAlignVertical: "top" }}
            />
            <Pressable onPress={saveNotes} style={{ marginTop: 14, minHeight: 52, borderRadius: 14, backgroundColor: BLIND.button, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: BLIND.buttonInk, fontWeight: "700" }}>Save notes</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ErrorModal
        visible={showSuccessModal}
        title="Notes saved"
        message="Your notes are on this analysis."
        type="success"
        onDismiss={() => setShowSuccessModal(false)}
        confirmText="OK"
      />
      {imageUri ? <PhotoViewer visible={photoOpen} imageUri={imageUri} onClose={() => setPhotoOpen(false)} /> : null}
    </View>
  );
};

function MoreRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ minHeight: 52, justifyContent: "center" }}>
      <Text style={{ color: BLIND.ink, fontSize: 17 }}>{label}</Text>
    </Pressable>
  );
}

function ModelBlock({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: BLIND.walk, fontSize: 16, fontWeight: "700", marginBottom: 6 }}>{title}</Text>
      <Text style={{ color: BLIND.ink, fontSize: 15, lineHeight: 22 }}>{body}</Text>
    </View>
  );
}
