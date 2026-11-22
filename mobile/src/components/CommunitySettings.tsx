import React, { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { submitEmail, unsubscribeEmail } from "../api/community";
import { EMAIL_PRIVACY_NOTE } from "./CommunityPrompts";
import { setRevenueCatEmail } from "../lib/revenuecatClient";
import { disablePush, enablePush } from "../lib/push";
import { useCommunityStore } from "../state/communityStore";
import { useRemoteConfig } from "../state/remoteConfig";
import { useDeerScoringStore } from "../state/deerScoringStore";

type NavigationProp = NativeStackNavigationProp<Record<string, object | undefined>>;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export const CommunitySettings = () => {
  const navigation = useNavigation<NavigationProp>();
  const pushEnabled = useCommunityStore((s) => s.pushEnabled);
  const email = useCommunityStore((s) => s.email);
  const unsubscribeToken = useCommunityStore((s) => s.unsubscribeToken);
  const setEmail = useCommunityStore((s) => s.setEmail);
  const setUserEmail = useDeerScoringStore((s) => s.setUserEmail);
  const localEmail = useDeerScoringStore((s) => s.userEmail);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const feedOn = useRemoteConfig((s) => s.flags.feed);
  const pushOn = useRemoteConfig((s) => s.flags.pushPrompt);
  const emailOn = useRemoteConfig((s) => s.flags.emailPrompt);

  const onPush = async (next: boolean) => {
    setBusy(true);
    setNote("");
    useCommunityStore.setState({ pushPromptHandled: true });
    if (!next) {
      await disablePush();
      setBusy(false);
      return;
    }
    const result = await enablePush();
    setBusy(false);
    if (result === "denied") {
      setNote("iOS has notifications off for DeerAge. Allow them in the iPhone Settings app, then try again.");
    } else if (result === "unavailable") {
      setNote("Notifications need a real iPhone and a TestFlight or App Store build.");
    }
  };

  const save = async () => {
    const trimmed = (draft || localEmail || "").trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setNote("Enter a valid email.");
      return;
    }
    setBusy(true);
    setNote("");
    const result = await submitEmail(trimmed);
    setBusy(false);
    if (!result.ok) {
      setNote(result.message);
      return;
    }
    setEmail(trimmed, result.unsubscribeToken);
    setUserEmail(trimmed);
    void setRevenueCatEmail(trimmed);
    setDraft("");
    setNote("You are signed up for rut-timing alerts and the end-of-season recap.");
  };

  const unsubscribe = async () => {
    setBusy(true);
    setNote("");
    const ok = await unsubscribeEmail(unsubscribeToken);
    setBusy(false);
    if (!ok) {
      setNote("Couldn't unsubscribe just now. Try again when you have a signal.");
      return;
    }
    setEmail(null, null);
    void setRevenueCatEmail(null);
    setNote("Unsubscribed. DeerAge will not email that address.");
  };

  return (
    <>
      {feedOn ? <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("Home", { screen: "Feed" });
        }}
        style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 16, flexDirection: "row", alignItems: "center" }}
      >
        <Ionicons name="megaphone-outline" size={22} color="#D4AF37" />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>What&apos;s new</Text>
          <Text style={{ color: "#E5D4B8", fontSize: 13, marginTop: 2 }}>Updates and votes</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#C9B48F" />
      </Pressable> : null}

      {pushOn ? <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>Updates and polls</Text>
            <Text style={{ color: "#E5D4B8", fontSize: 13, marginTop: 4, lineHeight: 18 }}>
              A notification when there is something new. DeerAge asks only after you turn this on.
            </Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={(value) => { void onPush(value); }}
            disabled={busy}
            trackColor={{ false: "#5A6447", true: "#D4AF37" }}
            thumbColor="#F5F5DC"
          />
        </View>
      </View> : null}

      {emailOn ? <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>Rut-timing alerts</Text>
        <Text style={{ color: "#E5D4B8", fontSize: 13, marginTop: 4, lineHeight: 18 }}>
          Optional email for rut-timing alerts and an end-of-season recap. Skip it and DeerAge still works.
        </Text>
        {email ? (
          <>
            <Text style={{ color: "#D4AF37", marginTop: 12 }}>{email}</Text>
            <Pressable
              onPress={() => { void unsubscribe(); }}
              disabled={busy}
              style={{ marginTop: 12, paddingVertical: 12, alignItems: "center", borderRadius: 10, backgroundColor: "#5A6447" }}
            >
              <Text style={{ color: "#F5F5DC", fontWeight: "600" }}>{busy ? "Working..." : "Unsubscribe"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={localEmail ?? "you@email.com"}
              placeholderTextColor="#F5F5DC"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 }}
            />
            <Pressable
              onPress={() => { void save(); }}
              disabled={busy}
              style={{ marginTop: 12, paddingVertical: 12, alignItems: "center", borderRadius: 10, backgroundColor: "#D4AF37" }}
            >
              <Text style={{ color: "#1a1f16", fontWeight: "700" }}>{busy ? "Saving..." : "Send me alerts"}</Text>
            </Pressable>
          </>
        )}
        <Text style={{ color: "#C9B48F", fontSize: 12, marginTop: 10, lineHeight: 17 }}>{EMAIL_PRIVACY_NOTE}</Text>
        {note ? <Text style={{ color: "#F5F5DC", marginTop: 10, lineHeight: 18 }}>{note}</Text> : null}
      </View> : null}
    </>
  );
};
