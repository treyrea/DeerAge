import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { apiBaseUrl } from "../api/proxy";
import { useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";
import { useE2eFlags } from "../e2e/flags";
import { APP_STORE_URL, liveStoreVersion } from "../lib/store-version";
import { compareVersions, installedAppVersion } from "../lib/version";

export const UpdateAvailableBanner = () => {
  const dismissed = useHunterProfile((s) => s.dismissedUpdateVersion);
  const dismissUpdate = useHunterProfile((s) => s.dismissUpdate);
  const recommendedVersion = useRemoteConfig((s) => s.recommendedVersion);
  const previewUpdate = useE2eFlags((s) => s.showUpdateCard);
  const [minVersion, setMinVersion] = useState<string | null>(null);
  const [storeVersion, setStoreVersion] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    void liveStoreVersion().then((version) => {
      if (active && version) setStoreVersion(version);
    });
    return () => {
      active = false;
    };
  }, []);

  const installed = installedAppVersion(Application.nativeApplicationVersion, Constants.expoConfig?.version);
  const candidates = [recommendedVersion, minVersion, storeVersion].filter((item): item is string => Boolean(item));
  const target = candidates.sort((left, right) => compareVersions(left, right)).at(-1) ?? null;
  const newer = Boolean(target) && compareVersions(installed, target ?? installed) < 0 && dismissed !== target;
  if (!previewUpdate && !newer) return null;
  const shown = newer ? target : "the App Store version";

  return (
    <Pressable
      testID="update-available"
      onPress={() => {
        void Linking.openURL(APP_STORE_URL);
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
          DeerAge {shown} is out. This copy is {installed}.
        </Text>
      </View>
      <Pressable onPress={() => dismissUpdate(shown ?? installed)} hitSlop={8}>
        <Ionicons name="close" size={18} color="#E5D4B8" />
      </Pressable>
    </Pressable>
  );
};
