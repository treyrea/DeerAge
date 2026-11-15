/**
 * Opens the Messages composer. DeerAge does not send the text.
 * The lease manager's number stays on the phone and is only used as the To line.
 */

import React, { useState } from "react";
import { Pressable, Share, Text } from "react-native";
import * as SMS from "expo-sms";
import { apiBaseUrl } from "../api/proxy";
import { leaseManagerMessage } from "../lib/lease-text";
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

export async function openLeaseManagerText(note: LeaseNote, template: string): Promise<void> {
  const message = leaseManagerMessage({
    ageClass: note.ageClass,
    call: note.call,
    minimum: note.minimum,
    region: note.region,
    time: note.time,
    link: verifyLink(note.receiptId),
  }, template);
  const phone = useHunterProfile.getState().leaseManagerPhone.trim();
  const photo = note.photoUri?.trim() ?? "";
  const available = await SMS.isAvailableAsync();
  if (available) {
    await SMS.sendSMSAsync(phone ? [phone] : [], message, photo ? {
      attachments: { uri: photo, mimeType: "image/jpeg", filename: "deerage-read.jpg" },
    } : undefined);
    return;
  }
  await Share.share(photo ? { message, url: photo } : { message });
}

export const LeaseManagerButton = (note: LeaseNote) => {
  const template = useRemoteConfig((s) => s.copy.leaseManagerText);
  const remoteLabel = useRemoteConfig((s) => s.copy.leaseManagerButton);
  const name = useHunterProfile((s) => s.leaseManagerName);
  const [busy, setBusy] = useState(false);
  const label = remoteLabel.trim() || "Text this to my lease manager";

  const press = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openLeaseManagerText(note, template);
    } catch {
      // He closed the composer, or Messages is unavailable. Nothing was sent.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={() => { void press(); }}
      style={{ marginBottom: 16, backgroundColor: "#3D4A2F", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" }}
    >
      <Text style={{ color: "#F5F5DC", fontWeight: "700", textAlign: "center" }}>{label}</Text>
      <Text style={{ color: "#8B7355", marginTop: 4, fontSize: 12, textAlign: "center" }}>
        {name.trim() ? `Opens Messages to ${name.trim()}. You press Send.` : "Opens Messages. You press Send."}
      </Text>
    </Pressable>
  );
};
