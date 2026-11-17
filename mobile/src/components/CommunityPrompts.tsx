import React, { useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { submitEmail } from "../api/community";
import { setRevenueCatEmail } from "../lib/revenuecatClient";
import { enablePush } from "../lib/push";
import { useCommunityStore } from "../state/communityStore";
import { e2eEnabled } from "../e2e/flags";
import { useDeerScoringStore } from "../state/deerScoringStore";

export const EMAIL_PRIVACY_NOTE = "DeerAge stores this email only to send rut-timing alerts and an end-of-season recap. It is tied to this install, not an account. Unsubscribe anytime in Settings.";

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function leafRouteName(state: { index?: number; routes?: { name: string; state?: unknown }[] } | undefined): string {
  if (!state?.routes || typeof state.index !== "number") return "";
  const route = state.routes[state.index];
  if (!route) return "";
  if (route.state && typeof route.state === "object") {
    const nested = leafRouteName(route.state as { index?: number; routes?: { name: string; state?: unknown }[] });
    if (nested) return nested;
  }
  return route.name;
}

export const CommunityPrompts = ({ routeName = "" }: { routeName?: string }) => {
  const activePrompt = useCommunityStore((s) => s.activePrompt);
  const setPushPromptHandled = useCommunityStore((s) => s.setPushPromptHandled);
  const setEmail = useCommunityStore((s) => s.setEmail);
  const dismissEmailPrompt = useCommunityStore((s) => s.dismissEmailPrompt);
  const setUserEmail = useDeerScoringStore((s) => s.setUserEmail);
  const [email, setEmailText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [pushNote, setPushNote] = useState("");

  if (e2eEnabled || !activePrompt || routeName === "TierPaywall") return null;

  const closeEmail = () => {
    setEmailText("");
    setError("");
    setThanks(false);
    dismissEmailPrompt();
  };

  const saveEmail = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email.");
      return;
    }
    setBusy(true);
    setError("");
    Keyboard.dismiss();
    const result = await submitEmail(trimmed);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEmail(trimmed, result.unsubscribeToken);
    setUserEmail(trimmed);
    void setRevenueCatEmail(trimmed);
    setThanks(true);
  };

  const turnOnPush = async () => {
    setBusy(true);
    setPushNote("");
    const result = await enablePush();
    setBusy(false);
    useCommunityStore.setState({ pushPromptHandled: true });
    if (result === "enabled") return;
    if (result === "denied") {
      setPushNote("Notifications stay off until iOS allows them. You can turn them on in Settings.");
      return;
    }
    setPushNote("Notifications need a real iPhone and a TestFlight or App Store build. You can try again in Settings.");
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => {
        if (thanks) {
          setThanks(false);
          setEmailText("");
          useCommunityStore.getState().setActivePrompt(null);
          return;
        }
        if (activePrompt === "email") closeEmail();
        else setPushPromptHandled();
      }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: 24 }}
          onPress={() => {
            if (activePrompt === "push") {
              setPushPromptHandled();
              return;
            }
            if (thanks) {
              setThanks(false);
              setEmailText("");
              useCommunityStore.getState().setActivePrompt(null);
              return;
            }
            closeEmail();
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ backgroundColor: "#3D4A2F", borderRadius: 18, padding: 20, width: "100%", maxWidth: 420 }}
          >
            {activePrompt === "push" ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                  <Ionicons name="notifications-outline" size={22} color="#D4AF37" />
                  <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700", marginLeft: 8, flex: 1 }}>Hear about updates?</Text>
                </View>
                <Text style={{ color: "#E5D4B8", lineHeight: 21 }}>
                  DeerAge can notify you when there is something new or a poll to vote on. That is all. You can turn this off in Settings.
                </Text>
                {pushNote ? <Text style={{ color: "#F5F5DC", marginTop: 10, lineHeight: 20 }}>{pushNote}</Text> : null}
                <View style={{ flexDirection: "row", marginTop: 16 }}>
                  <Pressable onPress={setPushPromptHandled} style={{ flex: 1, paddingVertical: 12, alignItems: "center", marginRight: 8 }}>
                    <Text style={{ color: "#E5D4B8", fontWeight: "600" }}>Not now</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { void turnOnPush(); }}
                    disabled={busy}
                    style={{ flex: 1, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
                  >
                    <Text style={{ color: "#1a1f16", fontWeight: "700" }}>{busy ? "Turning on..." : "Turn on"}</Text>
                  </Pressable>
                </View>
              </>
            ) : thanks ? (
              <>
                <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700" }}>You are on the list</Text>
                <Text style={{ color: "#E5D4B8", marginTop: 8, lineHeight: 21 }}>
                  Rut-timing alerts and the end-of-season recap will come to that email. Unsubscribe anytime in Settings.
                </Text>
                <Pressable
                  onPress={() => {
                    setThanks(false);
                    setEmailText("");
                    useCommunityStore.getState().setActivePrompt(null);
                  }}
                  style={{ marginTop: 16, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
                >
                  <Text style={{ color: "#1a1f16", fontWeight: "700" }}>Done</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700" }}>Rut-timing alerts</Text>
                <Text style={{ color: "#E5D4B8", marginTop: 8, lineHeight: 21 }}>
                  Want rut-timing alerts and an end-of-season recap? Email is optional, and you can skip this.
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmailText}
                  placeholder="you@email.com"
                  placeholderTextColor="#8B7355"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 }}
                />
                {error ? <Text style={{ color: "#F5F5DC", marginTop: 8 }}>{error}</Text> : null}
                <Text style={{ color: "#8B7355", fontSize: 12, marginTop: 10, lineHeight: 17 }}>{EMAIL_PRIVACY_NOTE}</Text>
                <View style={{ flexDirection: "row", marginTop: 16 }}>
                  <Pressable onPress={closeEmail} style={{ flex: 1, paddingVertical: 12, alignItems: "center", marginRight: 8 }}>
                    <Text style={{ color: "#E5D4B8", fontWeight: "600" }}>Skip</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { void saveEmail(); }}
                    disabled={busy}
                    style={{ flex: 1, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
                  >
                    <Text style={{ color: "#1a1f16", fontWeight: "700" }}>{busy ? "Saving..." : "Send me alerts"}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};
