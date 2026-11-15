import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { useRemoteConfig } from "../state/remoteConfig";

const STORE_URL = "https://apps.apple.com/app/id6755117006";

function compareVersions(installed: string, minimum: string): number {
  const left = installed.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = minimum.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export const UpdateGate = () => {
  const loaded = useRemoteConfig((s) => s.loaded);
  const minimum = useRemoteConfig((s) => s.minSupportedVersion);
  const installed = Application.nativeApplicationVersion || Constants.expoConfig?.version || "0.0.0";
  if (!loaded || !minimum || compareVersions(installed, minimum) >= 0) return null;
  return (
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#1a1f16", justifyContent: "center", padding: 28, zIndex: 50 }}>
      <Text style={{ color: "#D4AF37", fontWeight: "700" }}>Please update</Text>
      <Text style={{ color: "#F5F5DC", fontSize: 28, fontWeight: "800", marginTop: 8 }}>DeerAge {minimum} is required</Text>
      <Text style={{ color: "#E5D4B8", marginTop: 10, lineHeight: 22 }}>
        This copy is {installed}. The App Store has the version that keeps scoring and age reads working.
      </Text>
      <Pressable
        onPress={() => { void Linking.openURL(STORE_URL); }}
        style={{ marginTop: 22, backgroundColor: "#D4AF37", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
      >
        <Text style={{ color: "#1a1f16", fontWeight: "800" }}>Open the App Store</Text>
      </Pressable>
    </View>
  );
};
