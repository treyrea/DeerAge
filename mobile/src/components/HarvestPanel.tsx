import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRemoteConfig } from "../state/remoteConfig";
import { useHarvestStore, type HarvestMethod } from "../state/harvestStore";
import { harvestComparedToMinimum } from "../utils/field-call";

const METHODS: { id: HarvestMethod; label: string }[] = [
  { id: "jawbone", label: "Jawbone" },
  { id: "lab", label: "Lab" },
  { id: "other", label: "Other" },
];

export const HarvestPanel = ({ scanId, leaseMinimum }: { scanId: string; leaseMinimum: number }) => {
  const entry = useHarvestStore((s) => s.entries[scanId]);
  const save = useHarvestStore((s) => s.save);
  const [age, setAge] = useState(entry?.confirmedAge ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [method, setMethod] = useState<HarvestMethod | null>(entry?.method ?? "jawbone");
  const harvestOn = useRemoteConfig((s) => s.flags.harvestCheck);
  if (!harvestOn || !scanId) return null;

  const harvested = Boolean(entry?.harvested);
  const comparison = entry?.confirmedAge ? harvestComparedToMinimum(entry.confirmedAge, leaseMinimum) : null;

  return (
    <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <Text style={{ color: "#F5F5DC", fontWeight: "700", fontSize: 16 }}>Harvest check</Text>
      <Text style={{ color: "#E5D4B8", marginTop: 6, lineHeight: 20 }}>
        If you took this deer, you can add the age from the jaw or a lab later. It stays on this phone and helps check the reads.
      </Text>
      {!harvested ? (
        <Pressable
          onPress={() => save({ scanId, harvested: true, confirmedAge: "", method: null, notes: "" })}
          style={{ marginTop: 12, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#1a1f16", fontWeight: "700" }}>Mark harvested</Text>
        </Pressable>
      ) : (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: "#8B7355", marginBottom: 8 }}>Your lease minimum: {leaseMinimum}</Text>
          {comparison ? <Text style={{ color: "#F5F5DC", marginBottom: 8, lineHeight: 20 }}>{comparison}</Text> : null}
          <Text style={{ color: "#D4AF37", fontSize: 12, fontWeight: "700" }}>CONFIRMED AGE</Text>
          <TextInput
            value={age}
            onChangeText={setAge}
            placeholder="4.5"
            placeholderTextColor="#8B7355"
            keyboardType="decimal-pad"
            style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 10, padding: 12, marginTop: 8 }}
          />
          <View style={{ flexDirection: "row", marginTop: 10 }}>
            {METHODS.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setMethod(item.id)}
                style={{
                  marginRight: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: method === item.id ? "#D4AF37" : "#5A6447",
                }}
              >
                <Text style={{ color: method === item.id ? "#1a1f16" : "#F5F5DC", fontWeight: "600" }}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes"
            placeholderTextColor="#8B7355"
            style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 10, padding: 12, marginTop: 10 }}
          />
          <Pressable
            onPress={() => save({ scanId, harvested: true, confirmedAge: age.trim(), method, notes: notes.trim() })}
            style={{ marginTop: 12, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#1a1f16", fontWeight: "700" }}>{entry?.synced ? "Saved" : "Save age"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};
