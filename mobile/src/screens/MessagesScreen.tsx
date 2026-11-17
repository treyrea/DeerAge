import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { answerRescan, deleteReportPhoto, loadMessages, markMessageRead, postCallReport, rescanReport, type DeerMessage } from "../api/call-report";
import { SecondLookLink } from "../components/SecondLookLink";
import { FAIR_LIMIT_NOTE } from "../lib/fair-limit";

export const MessagesScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [messages, setMessages] = useState<DeerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState("");
  const [proofFor, setProofFor] = useState("");
  const [proofAge, setProofAge] = useState("");
  const [proofMethod, setProofMethod] = useState<"lab_tooth" | "jawbone" | "other" | "">("");

  const refresh = useCallback(async () => {
    const loaded = await loadMessages();
    setMessages(loaded.messages);
    setLoading(false);
    await Promise.all(loaded.messages.filter((item) => item.reply && !item.read).map((item) => markMessageRead(item.id)));
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const rescan = async (id: string) => {
    setBusyId(id);
    setNote("");
    const result = await rescanReport(id);
    setBusyId("");
    if (!result) {
      setNote("The re-scan didn't finish. Try again when you have a signal.");
      return;
    }
    await refresh();
  };

  const answer = async (id: string, right: boolean) => {
    setBusyId(id);
    const ok = await answerRescan(id, right);
    setBusyId("");
    setNote(ok ? (right ? "Thanks. We'll keep this fix." : "Thanks. The report is open again.") : "Couldn't save that answer.");
    if (ok) await refresh();
  };

  const removePhoto = async (id: string) => {
    setBusyId(id);
    const ok = await deleteReportPhoto(id);
    setBusyId("");
    setNote(ok ? "The report photo was deleted. The note stays." : "Couldn't delete that photo.");
    if (ok) await refresh();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 }}>
        <Pressable testID="messages-back" onPress={() => navigation.goBack()} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-back" size={24} color="#F5F5DC" />
        </Pressable>
        <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "700", marginLeft: 8 }}>Messages from DeerAge</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        {loading ? <ActivityIndicator color="#D4AF37" /> : null}
        {!loading && messages.length === 0 ? (
          <Text style={{ color: "#E5D4B8", lineHeight: 22 }}>No replies yet. A note from us will show up here.</Text>
        ) : null}
        {messages.map((item) => (
          <View key={item.id} style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 14 }}>
            {item.tracker ? (
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {item.tracker.steps.map((step) => (
                    <Text key={step.id} style={{ color: step.current ? "#D4AF37" : "#8B7355", marginRight: 10, marginBottom: 4, fontWeight: step.current ? "800" : "500" }}>
                      {step.label}
                    </Text>
                  ))}
                </View>
                {item.tracker.expected ? <Text style={{ color: "#E5D4B8", marginTop: 4 }}>{item.tracker.expected}</Text> : null}
                {item.tracker.overdue ? <Text style={{ color: "#D4AF37", marginTop: 4 }}>This step is past the time we expected.</Text> : null}
              </View>
            ) : (
              <Text style={{ color: "#D4AF37", fontSize: 12, fontWeight: "700" }}>{item.status.toUpperCase()}</Text>
            )}
            {item.reply ? <Text style={{ color: "#F5F5DC", marginTop: 8, lineHeight: 22 }}>{item.reply}</Text> : null}
            {item.scanId ? (
              <SecondLookLink scanId={item.scanId} fieldCall={item.originalCall} age={Number(item.originalAge) || null} />
            ) : null}
            {item.dispute ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: "#8B7355", lineHeight: 18 }}>{FAIR_LIMIT_NOTE}</Text>
                <Pressable onPress={() => setProofFor(item.id)} style={{ marginTop: 8 }}>
                  <Text style={{ color: "#D4AF37", textDecorationLine: "underline" }}>Send jawbone or lab age</Text>
                </Pressable>
                {proofFor === item.id ? (
                  <View style={{ marginTop: 8 }}>
                    {([["lab_tooth", "Lab tooth (cementum)"], ["jawbone", "Jawbone (tooth wear)"], ["other", "Other"]] as const).map(([id, label]) => (
                      <Pressable key={id} onPress={() => setProofMethod(id)} style={{ paddingVertical: 4 }}>
                        <Text style={{ color: proofMethod === id ? "#D4AF37" : "#E5D4B8" }}>{label}</Text>
                      </Pressable>
                    ))}
                    <TextInput
                      value={proofAge}
                      onChangeText={setProofAge}
                      placeholder="Age"
                      placeholderTextColor="#8B7355"
                      keyboardType="decimal-pad"
                      style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 8, padding: 10, marginTop: 6 }}
                    />
                    <Pressable
                      onPress={() => {
                        void postCallReport({
                          kind: "wrong_call",
                          scanId: item.scanId,
                          fieldCall: item.originalCall,
                          reportedAge: proofAge.trim(),
                          proofMethod: proofMethod || null,
                        }).then(() => setNote("That age is on the report."));
                      }}
                      style={{ marginTop: 8 }}
                    >
                      <Text style={{ color: "#D4AF37", fontWeight: "700" }}>Send age</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", marginTop: 14 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: "#8B7355", fontSize: 12, fontWeight: "700" }}>ORIGINAL</Text>
                <Text style={{ color: "#F5F5DC", fontSize: 18, fontWeight: "800", marginTop: 4 }}>{item.originalCall || "Call"}</Text>
                {item.originalAge ? <Text style={{ color: "#E5D4B8" }}>{item.originalAge}</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#8B7355", fontSize: 12, fontWeight: "700" }}>RE-SCAN</Text>
                <Text style={{ color: "#D4AF37", fontSize: 18, fontWeight: "800", marginTop: 4 }}>{item.rescan?.fieldCall || "Not yet"}</Text>
                {item.rescan?.ageYears != null ? <Text style={{ color: "#E5D4B8" }}>{item.rescan.ageYears}</Text> : null}
              </View>
            </View>
            {item.offerRescan ? (
              <Pressable
                onPress={() => { void rescan(item.id); }}
                disabled={busyId === item.id}
                style={{ marginTop: 14, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                {busyId === item.id ? <ActivityIndicator color="#1a1f16" /> : <Text style={{ color: "#1a1f16", fontWeight: "800" }}>Re-scan this buck free</Text>}
              </Pressable>
            ) : null}
            {item.rescan && item.status !== "rescanned-right" && item.status !== "rescanned-wrong" ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>Is this right now?</Text>
                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  <Pressable onPress={() => { void answer(item.id, true); }} style={{ flex: 1, marginRight: 8, backgroundColor: "#5A6447", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}>
                    <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>Yes</Text>
                  </Pressable>
                  <Pressable onPress={() => { void answer(item.id, false); }} style={{ flex: 1, backgroundColor: "#5A6447", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}>
                    <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>No</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {item.hasKeptPhoto ? (
              <Pressable onPress={() => { void removePhoto(item.id); }} style={{ marginTop: 12, alignItems: "center" }}>
                <Text style={{ color: "#D4AF37", fontWeight: "700" }}>Delete my report photo</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {note ? <Text style={{ color: "#D4AF37", lineHeight: 20 }}>{note}</Text> : null}
      </ScrollView>
    </View>
  );
};
