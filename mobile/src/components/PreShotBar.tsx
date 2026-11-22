import React, { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { HarvestPanel } from "./HarvestPanel";
import { SecondLookLink } from "./SecondLookLink";
import { WrongCallCard } from "./WrongCallCard";
import { FAIR_LIMIT_NOTE } from "../lib/fair-limit";
import { LeaseManagerButton } from "./LeaseManagerButton";
import { useRemoteConfig } from "../state/remoteConfig";
import { recordExportAllowed, saveShotRecord, useShotRecordStore } from "../state/shotRecordStore";
import { sharePreShotRecord } from "../lib/preShotPdf";
import type { ShotDraft } from "../types/shot-record";

export const PreShotBar = ({ draft, onNeedPlan, compact = false }: { draft: ShotDraft | null; onNeedPlan: () => void; compact?: boolean }) => {
  const enabled = useRemoteConfig((s) => s.flags.preShotRecord);
  const localId = draft?.localId ?? "";
  const record = useShotRecordStore((s) => (localId ? s.records[localId] : undefined));
  const [note, setNote] = useState("");

  if (!enabled || !draft) return null;

  const save = async () => {
    const saved = await saveShotRecord(draft);
    if (!saved) setNote("Couldn't save that on this phone.");
  };

  const share = async () => {
    const saved = await saveShotRecord(draft);
    if (!saved) return;
    if (!recordExportAllowed(saved.localId)) {
      onNeedPlan();
      return;
    }
    try {
      await sharePreShotRecord(saved.localId);
      setNote("");
    } catch {
      setNote("The record couldn't be shared. It is still saved on this phone.");
    }
  };

  if (compact) {
    if (!record) {
      return (
        <View style={{ marginTop: 14 }}>
          <Pressable testID="record-save" onPress={() => { void save(); }} hitSlop={12} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: "#E6E0D4", fontSize: 15 }}>Save pre-shot record</Text>
          </Pressable>
          {note ? <Text style={{ color: "#9C9486", marginTop: 4 }}>{note}</Text> : null}
        </View>
      );
    }
    return (
      <View style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color: "#9C9486", fontSize: 15 }}>Saved ✓</Text>
          <Text style={{ color: "#9C9486", fontSize: 15 }}>{"  ·  "}</Text>
          <Pressable testID="record-share" onPress={() => { void share(); }} hitSlop={14} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: "#E6E0D4", fontSize: 15, fontWeight: "700" }}>Share</Text>
          </Pressable>
        </View>
        {note ? <Text style={{ color: "#9C9486", marginTop: 4 }}>{note}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <Text style={{ color: "#D4AF37", fontSize: 12, fontWeight: "700" }}>PRE-SHOT RECORD</Text>
      <Text style={{ color: "#E5D4B8", marginTop: 6, lineHeight: 20 }}>
        {record
          ? "Saved on this phone after the call. It documents a good-faith read. It is not a legal finding, and it does not override your lease manager or a game warden."
          : "Saving this read on this phone."}
      </Text>
      <Pressable
        onPress={() => { void share(); }}
        style={{ marginTop: 12, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
      >
        <Text style={{ color: "#1a1f16", fontWeight: "700" }}>Share pre-shot record</Text>
      </Pressable>
      {note ? <Text style={{ color: "#E5D4B8", marginTop: 8 }}>{note}</Text> : null}
    </View>
  );
};

export const ShotRecordPage = ({
  localId,
  onBack,
  onNeedPlan,
}: {
  localId: string;
  onBack: () => void;
  onNeedPlan: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const record = useShotRecordStore((s) => s.records[localId]);
  if (!record) {
    return (
      <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top, padding: 24 }}>
        <Pressable onPress={onBack}><Ionicons name="arrow-back" size={24} color="#F5F5DC" /></Pressable>
        <Text style={{ color: "#F5F5DC", marginTop: 24 }}>That record is not on this phone.</Text>
      </View>
    );
  }
  const draft: ShotDraft = {
    localId: record.localId,
    mode: record.mode,
    photoUris: record.photoUris,
    receipt: null,
    ageClass: record.ageClass,
    ageRange: record.ageRange,
    confidence: record.confidence,
    leaseMinimum: record.leaseMinimum,
    fieldCall: record.fieldCall,
    fieldCallNote: record.fieldCallNote,
    cues: record.cues,
    scoreLabel: record.scoreLabel,
  };
  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
        </Pressable>
        <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700", marginLeft: 8 }}>Pre-shot record</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {record.photoUris.map((uri) => (
            <Image key={uri} source={{ uri }} style={{ width: 160, height: 160, borderRadius: 12, marginRight: 8, backgroundColor: "#000" }} resizeMode="contain" />
          ))}
        </ScrollView>
        <Text style={{ color: "#C9B48F", fontWeight: "700" }}>Your lease minimum: {record.leaseMinimum}</Text>
        <Text style={{ color: "#F5F5DC", fontSize: 36, fontWeight: "800", marginTop: 6 }}>{record.ageClass || "Age class unavailable"}</Text>
        <Text style={{ color: "#D4AF37", fontSize: 28, fontWeight: "800" }}>{record.fieldCall}</Text>
        {record.fieldCallNote ? <Text style={{ color: "#E5D4B8", marginTop: 8, lineHeight: 20 }}>{record.fieldCallNote}</Text> : null}
        <SecondLookLink
          scanId={record.localId}
          fieldCall={record.fieldCall}
          age={Number(record.ageClass) || null}
          minimum={record.leaseMinimum}
          photos={record.photoUris}
        />
        <Text style={{ color: "#C9B48F", marginTop: 8, lineHeight: 18 }}>{FAIR_LIMIT_NOTE}</Text>
        <Text style={{ color: "#E5D4B8", marginTop: 10 }}>Phone time: {new Date(record.deviceTime).toLocaleString()}</Text>
        <Text style={{ color: "#E5D4B8", marginTop: 4 }}>Server time: {record.serverTime ? new Date(record.serverTime).toLocaleString() : "Not signed"}</Text>
        <Text style={{ color: "#E5D4B8", marginTop: 4 }}>
          Location: {record.latitude != null && record.longitude != null ? `${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}` : "Not attached"}
        </Text>
        <View style={{ marginTop: 16 }}>
          <HarvestPanel scanId={record.localId} leaseMinimum={record.leaseMinimum} fieldCall={record.fieldCall} showReport={false} />
          <WrongCallCard
            scanId={record.localId}
            fieldCall={record.fieldCall}
            minimum={record.leaseMinimum}
            photos={record.photoUris}
            snapshot={{
              fieldCall: record.fieldCall,
              ageClass: record.ageClass,
              fastAge: record.fastAge,
              mainAge: record.mainAge,
              bodyOnlyAge: record.bodyOnlyAge,
              leaseMinimum: record.leaseMinimum,
              grossScore: record.scoreLabel,
            }}
          />
        </View>
        <LeaseManagerButton
          ageClass={record.ageClass}
          call={record.fieldCall}
          minimum={record.leaseMinimum}
          region={record.huntLabel || "Hunt region not set"}
          time={new Date(record.deviceTime).toLocaleString()}
          receiptId={record.receiptId}
          photoUri={record.photoUris[0]}
        />
        <PreShotBar draft={draft} onNeedPlan={onNeedPlan} />
      </ScrollView>
    </View>
  );
};
