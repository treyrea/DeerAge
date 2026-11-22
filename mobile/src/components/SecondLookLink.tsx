import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import { requestSecondLook, type SecondLook } from "../api/call-report";

/**
 * A text link, then the two reads. Used on the pre-shot record and in a reply, not on the stand result.
 */
export const SecondLookLink = ({
  scanId,
  fieldCall,
  age,
  minimum = 4.5,
  photos = [],
}: {
  scanId: string;
  fieldCall: string;
  age?: number | null;
  minimum?: number;
  photos?: string[];
}) => {
  const [look, setLook] = useState<SecondLook | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!scanId) return null;

  const run = async () => {
    setBusy(true);
    setError("");
    let imageBase64 = "";
    const uri = photos[0];
    if (uri) {
      const resized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      imageBase64 = resized.base64 ?? "";
    }
    const result = await requestSecondLook({
      scanId,
      originalCall: fieldCall,
      originalAge: age,
      minimum,
      imageBase64,
    });
    setBusy(false);
    if (!result) {
      setError("The second look didn't finish. Try again when you have a signal.");
      return;
    }
    setLook(result);
  };

  if (!look) {
    return (
      <View style={{ marginTop: 8, marginBottom: 8 }}>
        <Pressable onPress={() => { void run(); }} disabled={busy}>
          {busy ? <ActivityIndicator color="#D4AF37" /> : (
            <Text style={{ color: "#D4AF37", textDecorationLine: "underline" }}>Get a second look.</Text>
          )}
        </Pressable>
        {error ? <Text style={{ color: "#E5D4B8", marginTop: 6 }}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8, marginBottom: 8 }}>
      <Text style={{ color: "#C9B48F", fontSize: 12, fontWeight: "700" }}>SECOND LOOK</Text>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#F5F5DC", fontWeight: "800" }}>{look.originalCall || fieldCall || "First call"}</Text>
          <Text style={{ color: "#E5D4B8" }}>{look.originalAge ?? age ?? ""}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#D4AF37", fontWeight: "800" }}>{look.secondCall || "Second look"}</Text>
          <Text style={{ color: "#E5D4B8" }}>{look.secondAge ?? ""}</Text>
        </View>
      </View>
      <Text style={{ color: "#F5F5DC", marginTop: 6, lineHeight: 20 }}>{look.note}</Text>
    </View>
  );
};
