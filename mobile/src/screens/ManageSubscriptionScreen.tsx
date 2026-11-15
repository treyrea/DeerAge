import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { followUpEmailOrNull, postCallReport } from "../api/call-report";
import { openAppleSubscriptions } from "../lib/revenuecatClient";
import { useSubscriptionStore } from "../state/subscriptionStore";

const REASONS = [
  "I only hunt in the fall",
  "It costs too much in the off-season",
  "The age calls were not useful",
  "I don't use it enough",
  "Something else",
];

export const ManageSubscriptionScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const planLabel = useSubscriptionStore((s) => s.planLabel);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const continueToApple = async () => {
    if (!reason) return;
    const mail = followUpEmailOrNull(email);
    if (mail === "invalid") {
      setEmailError("Enter a valid email, or leave it blank.");
      return;
    }
    setEmailError("");
    setBusy(true);
    const result = await postCallReport({
      kind: "cancel_reason",
      scanId: "account",
      note: note.trim() ? `${reason}. ${note.trim()}` : reason,
      followUpEmail: mail,
    });
    setBusy(false);
    setSaved(result.ok);
    await openAppleSubscriptions();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable onPress={() => navigation.goBack()} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
        </Pressable>
        <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700", marginLeft: 8 }}>Manage subscription</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        <Text style={{ color: "#E5D4B8", lineHeight: 22 }}>
          {planLabel === "Free" ? "No plan is active on this Apple ID." : `Current plan: ${planLabel}.`} Apple handles cancellation and refunds. DeerAge cannot cancel the plan from inside the app.
        </Text>
        <Text style={{ color: "#F5F5DC", fontWeight: "700", fontSize: 18, marginTop: 20 }}>Before you go</Text>
        <Text style={{ color: "#E5D4B8", marginTop: 6, lineHeight: 20 }}>
          A short note helps. Then we open the Apple subscription page.
        </Text>
        {REASONS.map((item) => (
          <Pressable
            key={item}
            onPress={() => setReason(item)}
            style={{
              marginTop: 10,
              borderRadius: 12,
              padding: 14,
              backgroundColor: reason === item ? "#D4AF37" : "#3D4A2F",
            }}
          >
            <Text style={{ color: reason === item ? "#1a1f16" : "#F5F5DC", fontWeight: "600" }}>{item}</Text>
          </Pressable>
        ))}
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Optional note"
          placeholderTextColor="#8B7355"
          style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 12, padding: 12, marginTop: 14 }}
        />
        <Text style={{ color: "#F5F5DC", marginTop: 16 }}>Want us to follow up? Leave your email (optional).</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#8B7355"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 12, padding: 12, marginTop: 8 }}
        />
        <Text style={{ color: "#E5D4B8", marginTop: 6, lineHeight: 18 }}>{"We'll only use it to answer this report, never for marketing."}</Text>
        {emailError ? <Text style={{ color: "#fecaca", marginTop: 8 }}>{emailError}</Text> : null}
        <Pressable
          onPress={() => { void continueToApple(); }}
          disabled={!reason || busy}
          style={{ marginTop: 16, backgroundColor: reason ? "#D4AF37" : "#5A6447", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
        >
          {busy ? <ActivityIndicator color="#1a1f16" /> : <Text style={{ color: "#1a1f16", fontWeight: "800" }}>Continue to Apple subscriptions</Text>}
        </Pressable>
        {saved ? <Text style={{ color: "#D4AF37", marginTop: 12 }}>Thanks. That note was saved.</Text> : null}
      </ScrollView>
    </View>
  );
};
