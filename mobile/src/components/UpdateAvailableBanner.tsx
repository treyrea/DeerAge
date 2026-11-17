import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { apiBaseUrl } from "../api/proxy";
import { useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";
import { compareVersions, installedAppVersion } from "../lib/version";

const STORE_URL = "https://apps.apple.com/app/id6755117006";

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

  const installed = installedAppVersion(Application.nativeApplicationVersion, Constants.expoConfig?.version);
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
