import React from "react";
import { Pressable, Text, View } from "react-native";
import { BLIND } from "../utils/blind-verdict";

/** Shown when a screen would otherwise render nothing, or when the tree throws. */
export function RecoveryScreen({ onHome }: { onHome: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: BLIND.bg, justifyContent: "center", paddingHorizontal: 28 }}>
      <Text style={{ color: BLIND.ink, fontSize: 28, fontWeight: "800", textAlign: "center" }}>
        Something went wrong
      </Text>
      <Text style={{ color: BLIND.muted, fontSize: 17, lineHeight: 24, marginTop: 12, textAlign: "center" }}>
        DeerAge hit a problem showing this screen. Your photo is still on the phone.
      </Text>
      <Pressable
        testID="recovery-home"
        onPress={onHome}
        style={{ marginTop: 28, minHeight: 60, borderRadius: 14, backgroundColor: BLIND.button, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ color: BLIND.buttonInk, fontSize: 18, fontWeight: "700" }}>Back to home</Text>
      </Pressable>
    </View>
  );
}
