/**
 * One composer for the result text.
 * "Text [Name] · Lease Manager" opens Messages to the saved number.
 * "Share..." opens the system sheet for any recipient, with the same words.
 * DeerAge never sends. The hunter presses Send.
 */

import React, { useState } from "react";
import { Modal, Pressable, Share, Text, TextInput, View } from "react-native";
import * as SMS from "expo-sms";
import { apiBaseUrl } from "../api/proxy";
import { leaseButtonLabel, leaseManagerMessage } from "../lib/lease-text";
import { useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";

export interface LeaseNote {
  ageClass: string;
  call: string;
  minimum: number | string;
  region: string;
  time: string;
  receiptId?: string | null;
  photoUri?: string | null;
}

function verifyLink(receiptId?: string | null): string {
  const id = receiptId?.trim() ?? "";
  const base = apiBaseUrl();
  if (!id || !base) return "";
  return `${base}/api/verify-record?id=${encodeURIComponent(id)}`;
}

function messageFor(note: LeaseNote, template: string): string {
  return leaseManagerMessage({
    ageClass: note.ageClass,
    call: note.call,
    minimum: note.minimum,
    region: note.region,
    time: note.time,
    link: verifyLink(note.receiptId),
  }, template);
}

export async function shareRead(note: LeaseNote, target: "lease" | "anyone"): Promise<boolean> {
  const template = useRemoteConfig.getState().copy.leaseManagerText;
  const message = messageFor(note, template);
  const photo = note.photoUri?.trim() ?? "";
  const payload = photo ? { message, url: photo } : { message };
  if (target === "anyone") {
    const shared = await Share.share(payload);
    return shared.action !== Share.dismissedAction;
  }
  const phone = useHunterProfile.getState().leaseManagerPhone.trim();
  const available = await SMS.isAvailableAsync();
  if (available) {
    const sent = await SMS.sendSMSAsync(phone ? [phone] : [], message, photo ? {
      attachments: { uri: photo, mimeType: "image/jpeg", filename: "deerage-read.jpg" },
    } : undefined);
    return sent.result !== "cancelled";
  }
  const shared = await Share.share(payload);
  return shared.action !== Share.dismissedAction;
}

export const LeaseManagerButton = ({ onShared, ...note }: LeaseNote & { onShared?: () => void }) => {
  const remoteLabel = useRemoteConfig((s) => s.copy.leaseManagerButton);
  const managerName = useHunterProfile((s) => s.leaseManagerName);
  const managerPhone = useHunterProfile((s) => s.leaseManagerPhone);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const [name, setName] = useState(managerName);
  const [phone, setPhone] = useState(managerPhone);
  const button = leaseButtonLabel(managerName, managerPhone, remoteLabel);

  const run = async (target: "lease" | "anyone") => {
    if (busy) return;
    setBusy(true);
    try {
      const sent = await shareRead(note, target);
      if (sent) onShared?.();
    } catch {
      // He closed the sheet. Nothing was sent.
    } finally {
      setBusy(false);
    }
  };

  const saveAndText = async () => {
    if (!phone.trim()) return;
    useHunterProfile.getState().setLeaseManager(name, phone);
    setSetup(false);
    await run("lease");
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={() => {
            if (button.ready) void run("lease");
            else setSetup(true);
          }}
          style={{ flex: 1, backgroundColor: "#D4AF37", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#1a1f16", fontWeight: "800", textAlign: "center" }}>{button.label}</Text>
        </Pressable>
        <Pressable
          onPress={() => { void run("anyone"); }}
          style={{ marginLeft: 8, backgroundColor: "#3D4A2F", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14 }}
        >
          <Text style={{ color: "#F5F5DC", fontWeight: "600" }}>Share...</Text>
        </Pressable>
      </View>
      <Modal visible={setup} transparent animationType="fade" onRequestClose={() => setSetup(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: "#2B3420", borderRadius: 16, padding: 20 }}>
            <Text style={{ color: "#F5F5DC", fontSize: 20, fontWeight: "800" }}>Lease manager</Text>
            <Text style={{ color: "#E5D4B8", marginTop: 6, marginBottom: 12 }}>
              Saved on this phone. DeerAge does not send the text.
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor="#F5F5DC"
              style={{ backgroundColor: "#3D4A2F", color: "#F5F5DC", borderRadius: 10, padding: 12, marginBottom: 8 }}
            />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor="#F5F5DC"
              keyboardType="phone-pad"
              style={{ backgroundColor: "#3D4A2F", color: "#F5F5DC", borderRadius: 10, padding: 12 }}
            />
            <Pressable onPress={() => { void saveAndText(); }} style={{ marginTop: 14, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}>
              <Text style={{ color: "#1a1f16", fontWeight: "800" }}>Save and text</Text>
            </Pressable>
            <Pressable onPress={() => setSetup(false)} style={{ marginTop: 8, paddingVertical: 10, alignItems: "center" }}>
              <Text style={{ color: "#E5D4B8" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};
