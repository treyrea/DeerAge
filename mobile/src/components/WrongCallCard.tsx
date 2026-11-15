import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { postCallReport } from "../api/call-report";
import { maybeRequestReview } from "../lib/review";
import { useHunterProfile } from "../state/hunterProfile";

/**
 * The in-app place to say a call was wrong. A review prompt is not this screen.
 */
export const WrongCallCard = ({ scanId, fieldCall }: { scanId: string; fieldCall: string }) => {
  const [open, setOpen] = useState(false);
  const [age, setAge] = useState("");
  const [jaw, setJaw] = useState(false);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!scanId) return null;

  const thank = (photoStored: boolean) => {
    setOpen(false);
    setMessage(photoStored || !photo
      ? "Thanks. This is the place to tell us, not the App Store. We'll use it to check the reads."
      : "Thanks. The note was saved. The photo was too large, so it stayed on this phone.");
  };

  const send = async (right: boolean) => {
    if (right) {
      setBusy(true);
      const result = await postCallReport({ kind: "call_right", scanId, fieldCall });
      setBusy(false);
      if (!result.ok) {
        setMessage("Couldn't send that. Try again when you have a signal.");
        return;
      }
      setMessage("Thanks. Glad that call matched what you saw.");
      if (fieldCall !== "BORDERLINE") void maybeRequestReview(fieldCall);
      return;
    }
    useHunterProfile.getState().noteWrongReport();
    setBusy(true);
    const result = await postCallReport({
      kind: "wrong_call",
      scanId,
      fieldCall,
      reportedAge: age.trim(),
      jawboneAged: jaw,
      note: note.trim(),
      photoBase64: photo,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage("Couldn't send that. Try again when you have a signal.");
      return;
    }
    thank(result.photoStored);
  };

  const pickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const resized = await ImageManipulator.manipulateAsync(
      picked.assets[0].uri,
      [{ resize: { width: 800 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    setPhoto(resized.base64 ?? null);
  };

  return (
    <View style={{ backgroundColor: "#3D4A2F", borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <Text style={{ color: "#F5F5DC", fontWeight: "700", fontSize: 16 }}>Was this call wrong?</Text>
      <Text style={{ color: "#E5D4B8", marginTop: 6, lineHeight: 20 }}>
        Tell us here. A wrong call does not belong in an App Store review.
      </Text>
      {message ? <Text style={{ color: "#D4AF37", marginTop: 10, lineHeight: 20 }}>{message}</Text> : null}
      {!message ? (
        <View style={{ flexDirection: "row", marginTop: 12 }}>
          <Pressable
            onPress={() => { void send(true); }}
            disabled={busy}
            style={{ flex: 1, marginRight: 8, backgroundColor: "#5A6447", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>It was right</Text>
          </Pressable>
          <Pressable
            onPress={() => setOpen(true)}
            style={{ flex: 1, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#1a1f16", fontWeight: "700" }}>Report it</Text>
          </Pressable>
        </View>
      ) : null}
      {open && !message ? (
        <View style={{ marginTop: 12 }}>
          <Text style={{ color: "#D4AF37", fontSize: 12, fontWeight: "700" }}>ACTUAL AGE, IF YOU KNOW IT</Text>
          <TextInput
            value={age}
            onChangeText={setAge}
            placeholder="2.5"
            placeholderTextColor="#8B7355"
            keyboardType="decimal-pad"
            style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 10, padding: 12, marginTop: 8 }}
          />
          <Pressable onPress={() => setJaw((value) => !value)} style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            <View style={{ width: 22, height: 22, borderRadius: 4, marginRight: 10, backgroundColor: jaw ? "#D4AF37" : "#5A6447" }} />
            <Text style={{ color: "#F5F5DC" }}>Aged from the jawbone</Text>
          </Pressable>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="What did you see?"
            placeholderTextColor="#8B7355"
            style={{ backgroundColor: "#5A6447", color: "#F5F5DC", borderRadius: 10, padding: 12, marginTop: 12 }}
          />
          <Pressable onPress={() => { void pickPhoto(); }} style={{ marginTop: 12 }}>
            <Text style={{ color: "#D4AF37", fontWeight: "700" }}>{photo ? "Photo attached" : "Add an optional photo"}</Text>
          </Pressable>
          {photo ? (
            <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={{ width: 72, height: 72, borderRadius: 8, marginTop: 8 }} />
          ) : null}
          <Pressable
            onPress={() => { void send(false); }}
            disabled={busy}
            style={{ marginTop: 14, backgroundColor: "#D4AF37", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            {busy ? <ActivityIndicator color="#1a1f16" /> : <Text style={{ color: "#1a1f16", fontWeight: "700" }}>Send report</Text>}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};
