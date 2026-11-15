import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { HarvestPanel } from "./HarvestPanel";
import { useRemoteConfig } from "../state/remoteConfig";
import { recordExportAllowed, saveShotRecord, useShotRecordStore } from "../state/shotRecordStore";
import { sharePreShotRecord } from "../lib/preShotPdf";
import type { ShotDraft } from "../types/shot-record";

export const PreShotBar = ({ draft, onNeedPlan }: { draft: ShotDraft | null; onNeedPlan: () => void }) => {
  const enabled = useRemoteConfig((s) => s.flags.preShotRecord);
  const localId = draft?.localId ?? "";
  const record = useShotRecordStore((s) => (localId ? s.records[localId] : undefined));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [note, setNote] = useState("");

  useEffect(() => {
    const current = draftRef.current;
    if (!enabled || !current) return;
    void saveShotRecord(current);
  }, [enabled, localId]);

  if (!enabled || !draft) return null;

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
        <Pressable onPress={onBack} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
        </Pressable>
        <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700", marginLeft: 8 }}>Pre-shot record</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {record.photoUris.map((uri) => (
            <Image key={uri} source={{ uri }} style={{ width: 160, height: 160, borderRadius: 12, marginRight: 8 }} />
          ))}
        </ScrollView>
        <Text style={{ color: "#8B7355", fontWeight: "700" }}>Your lease minimum: {record.leaseMinimum}</Text>
        <Text style={{ color: "#F5F5DC", fontSize: 36, fontWeight: "800", marginTop: 6 }}>{record.ageClass || "Age class unavailable"}</Text>
        <Text style={{ color: "#D4AF37", fontSize: 28, fontWeight: "800" }}>{record.fieldCall}</Text>
        {record.fieldCallNote ? <Text style={{ color: "#E5D4B8", marginTop: 8, lineHeight: 20 }}>{record.fieldCallNote}</Text> : null}
        <Text style={{ color: "#E5D4B8", marginTop: 10 }}>Phone time: {new Date(record.deviceTime).toLocaleString()}</Text>
        <Text style={{ color: "#E5D4B8", marginTop: 4 }}>Server time: {record.serverTime ? new Date(record.serverTime).toLocaleString() : "Not signed"}</Text>
        <Text style={{ color: "#E5D4B8", marginTop: 4 }}>
          Location: {record.latitude != null && record.longitude != null ? `${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}` : "Not attached"}
        </Text>
        <View style={{ marginTop: 16 }}>
          <HarvestPanel scanId={record.localId} leaseMinimum={record.leaseMinimum} />
        </View>
        <PreShotBar draft={draft} onNeedPlan={onNeedPlan} />
      </ScrollView>
    </View>
  );
};
