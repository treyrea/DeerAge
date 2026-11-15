import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { apiBaseUrl } from "../api/proxy";
import { useHunterProfile } from "../state/hunterProfile";
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

export const UpdateAvailableBanner = () => {
  const dismissed = useHunterProfile((s) => s.dismissedUpdateVersion);
  const dismissUpdate = useHunterProfile((s) => s.dismissUpdate);
  const recommendedVersion = useRemoteConfig((s) => s.recommendedVersion);
  const [minVersion, setMinVersion] = useState<string | null>(null);

  useEffect(() => {
    const base = apiBaseUrl();
    if (!base) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(`${base}/api/config`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { minVersion?: string } | null) => {
        if (body?.minVersion) setMinVersion(body.minVersion);
      })
      .catch(() => {
        // A missed version check stays quiet. Analysis errors are separate.
      })
      .finally(() => clearTimeout(timer));
    return () => controller.abort();
  }, []);

  const installed = Application.nativeApplicationVersion || Constants.expoConfig?.version || "0.0.0";
  const target = recommendedVersion || minVersion;
  if (!target || compareVersions(installed, target) >= 0 || dismissed === target) {
    return null;
  }

  return (
    <Pressable
      onPress={() => {
        void Linking.openURL(STORE_URL);
      }}
      style={{
        backgroundColor: "#3D4A2F",
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Ionicons name="arrow-up-circle" size={22} color="#D4AF37" />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ color: "#F5F5DC", fontWeight: "700" }}>Update available</Text>
        <Text style={{ color: "#E5D4B8", fontSize: 13, marginTop: 2 }}>
          DeerAge {target} is out. This copy is {installed}.
        </Text>
      </View>
      <Pressable onPress={() => dismissUpdate(target)} hitSlop={8}>
        <Ionicons name="close" size={18} color="#E5D4B8" />
      </Pressable>
    </Pressable>
  );
};
