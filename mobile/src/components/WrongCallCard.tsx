import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { followUpEmailOrNull, postCallReport } from "../api/call-report";
import { FAIR_LIMIT_NOTE } from "../lib/fair-limit";
import { maybeRequestReview } from "../lib/review";
import { useHunterProfile } from "../state/hunterProfile";

const METHODS: { id: "lab_tooth" | "jawbone" | "other"; label: string }[] = [
  { id: "lab_tooth", label: "Lab tooth (cementum)" },
  { id: "jawbone", label: "Jawbone (tooth wear)" },
  { id: "other", label: "Other" },
];

/**
 * One text link under a result. The sheet opens only after the tap.
 */
export const WrongCallCard = ({
  scanId,
  fieldCall,
  minimum = 4.5,
  photos = [],
  snapshot,
}: {
  scanId: string;
  fieldCall: string;
  minimum?: number;
  photos?: string[];
  snapshot?: Record<string, unknown>;
}) => {
  const [open, setOpen] = useState(false);
  const [age, setAge] = useState("");
  const [method, setMethod] = useState<"lab_tooth" | "jawbone" | "other" | "">("");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!scanId) return null;

  const sendRight = async () => {
    setBusy(true);
    const result = await postCallReport({ kind: "call_right", scanId, fieldCall });
    setBusy(false);
    if (!result.ok) {
      setMessage("Couldn't send that. Try again when you have a signal.");
      return;
    }
    setMessage("Thanks. Glad that call matched what you saw.");
    if (fieldCall !== "BORDERLINE") void maybeRequestReview(fieldCall);
  };

  const sendWrong = async () => {
    const mail = followUpEmailOrNull(email);
    if (mail === "invalid") {
      setMessage("Enter a valid email, or leave it blank.");
      return;
    }
    useHunterProfile.getState().noteWrongReport();
    setBusy(true);
    const scanImages: string[] = [];
    for (const uri of photos.slice(0, 3)) {
      const resized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (resized.base64) scanImages.push(resized.base64);
    }
    const result = await postCallReport({
      kind: "wrong_call",
      scanId,
      fieldCall,
      reportedAge: age.trim(),
      proofMethod: method || null,
      minimum,
      note: note.trim(),
      followUpEmail: mail,
      keepPhoto: true,
      scanImages,
      resultSnapshot: snapshot,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage("Couldn't send that. Try again when you have a signal.");
      return;
    }
    setOpen(false);
    setMessage("Thanks. This is the place to tell us, not the App Store.");
  };

  if (!open) {
    return (
      <View style={{ marginBottom: 12 }}>
        {message ? <Text style={{ color: "#D4AF37", marginBottom: 6 }}>{message}</Text> : null}
        <Pressable onPress={() => setOpen(true)}>
          <Text style={{ color: "#C9B48F", textDecorationLine: "underline" }}>Was this call wrong?</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>Was this call wrong?</Text>
      <TextInput
        value={age}
        onChangeText={setAge}
        placeholder="Actual age, if you know it"
        placeholderTextColor="#F5F5DC"
        keyboardType="decimal-pad"
        style={{ backgroundColor: "#3D4A2F", color: "#F5F5DC", borderRadius: 10, padding: 12, marginTop: 10 }}
      />
      <View style={{ marginTop: 10 }}>
        {METHODS.map((item) => (
          <Pressable key={item.id} onPress={() => setMethod(item.id)} style={{ paddingVertical: 6 }}>
            <Text style={{ color: method === item.id ? "#D4AF37" : "#E5D4B8" }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="What did you see?"
        placeholderTextColor="#F5F5DC"
        style={{ backgroundColor: "#3D4A2F", color: "#F5F5DC", borderRadius: 10, padding: 12, marginTop: 8 }}
      />
      <Text style={{ color: "#F5F5DC", marginTop: 12 }}>Want us to follow up? Leave your email (optional).</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#F5F5DC"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={{ backgroundColor: "#3D4A2F", color: "#F5F5DC", borderRadius: 10, padding: 12, marginTop: 8 }}
      />
      <Text style={{ color: "#E5D4B8", marginTop: 6, lineHeight: 18 }}>{"We'll only use it to answer this report, never for marketing."}</Text>
      <Text style={{ color: "#E5D4B8", marginTop: 10, lineHeight: 20 }}>Reporting keeps this photo so we can study the miss.</Text>
      <Text style={{ color: "#C9B48F", marginTop: 8, lineHeight: 18 }}>{FAIR_LIMIT_NOTE}</Text>
      {message ? <Text style={{ color: "#D4AF37", marginTop: 8 }}>{message}</Text> : null}
      <Pressable onPress={() => { void sendWrong(); }} disabled={busy} style={{ marginTop: 12 }}>
        {busy ? <ActivityIndicator color="#D4AF37" /> : <Text style={{ color: "#D4AF37", fontWeight: "700" }}>Send report</Text>}
      </Pressable>
      <Pressable onPress={() => { void sendRight(); }} style={{ marginTop: 10 }}>
        <Text style={{ color: "#C9B48F", textDecorationLine: "underline" }}>It was right</Text>
      </Pressable>
    </View>
  );
};
