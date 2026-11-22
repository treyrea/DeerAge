import React, { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { postCallReport } from "../api/call-report";
import { presentPromotionalOffer } from "../lib/revenuecatClient";
import { useSubscriptionStore } from "../state/subscriptionStore";
import { DEFAULT_PRODUCTS, useRemoteConfig } from "../state/remoteConfig";

const REASONS = [
  "Too expensive in the off-season",
  "I only hunt a few weeks",
  "The calls were not useful",
  "Something else",
];

export const WinBackPrompt = () => {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const lapsed = useSubscriptionStore((s) => s.lapsed);
  const seen = useSubscriptionStore((s) => s.winBackSeen);
  const entitled = useSubscriptionStore((s) => s.entitled);
  const markSeen = useSubscriptionStore((s) => s.markWinBackSeen);
  const refreshEntitlement = useSubscriptionStore((s) => s.refreshEntitlement);
  const products = useRemoteConfig((s) => s.products) ?? DEFAULT_PRODUCTS;
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const visible = lapsed && !entitled && !seen;

  const close = () => markSeen();

  const send = async () => {
    await postCallReport({
      kind: "win_back",
      scanId: "account",
      note: [reason, note.trim()].filter(Boolean).join(". "),
    });
    setMessage("Thanks. That's the note we needed.");
  };

  const seeOffer = async () => {
    if (!message) await send();
    const result = await presentPromotionalOffer({
      offerId: products.winBackOfferId,
      offeringId: products.offeringId,
      productIds: [products.seasonPassId].filter(Boolean),
    });
    if (result === "purchased") {
      await refreshEntitlement();
      markSeen();
      return;
    }
    markSeen();
    navigation.navigate("TierPaywall", { reason: "win_back" });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#2B3420", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
          <Text style={{ color: "#F5F5DC", fontSize: 22, fontWeight: "800" }}>What could we do better?</Text>
          <Text style={{ color: "#E5D4B8", marginTop: 8, lineHeight: 20 }}>
            Your plan is no longer active. One note is enough. Any return offer is the price Apple shows, not a discount we made up.
          </Text>
          {REASONS.map((item) => (
            <Pressable key={item} onPress={() => setReason(item)} style={{ marginTop: 10, borderRadius: 10, padding: 12, backgroundColor: reason === item ? "#D4AF37" : "#3D4A2F" }}>
              <Text style={{ color: reason === item ? "#1a1f16" : "#F5F5DC" }}>{item}</Text>
            </Pressable>
          ))}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note"
            placeholderTextColor="#F5F5DC"
            style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 10, padding: 12, marginTop: 12 }}
          />
          {message ? <Text style={{ color: "#D4AF37", marginTop: 10 }}>{message}</Text> : null}
          <Pressable onPress={() => { void seeOffer(); }} style={{ marginTop: 14, backgroundColor: "#D4AF37", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}>
            <Text style={{ color: "#1a1f16", fontWeight: "800" }}>{products.winBackOfferId ? "See the return offer" : "See Season Pass"}</Text>
          </Pressable>
          <Pressable onPress={close} style={{ marginTop: 8, paddingVertical: 10, alignItems: "center" }}>
            <Text style={{ color: "#E5D4B8" }}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};
