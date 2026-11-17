import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { useRemoteConfig } from "../state/remoteConfig";
import { useE2eFlags } from "../e2e/flags";
import { APP_STORE_URL } from "../lib/store-version";
import { compareVersions, installedAppVersion } from "../lib/version";

export const UpdateGate = () => {
  const loaded = useRemoteConfig((s) => s.loaded);
  const minimum = useRemoteConfig((s) => s.minSupportedVersion);
  const forceUpdate = useE2eFlags((s) => s.forceUpdate);
  const installed = installedAppVersion(Application.nativeApplicationVersion, Constants.expoConfig?.version);
  const blocked = forceUpdate || (loaded && Boolean(minimum) && compareVersions(installed, minimum) < 0);
  if (!blocked) return null;
  const required = forceUpdate ? "the App Store version" : minimum;
  return (
    <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "#1a1f16", justifyContent: "center", padding: 28, zIndex: 50 }}>
      <Text style={{ color: "#D4AF37", fontWeight: "700" }}>Please update</Text>
      <Text testID="forced-update" style={{ color: "#F5F5DC", fontSize: 28, fontWeight: "800", marginTop: 8 }}>DeerAge {required} is required</Text>
      <Text style={{ color: "#E5D4B8", marginTop: 10, lineHeight: 22 }}>
        This copy is {installed}. The App Store has the version that keeps scoring and age reads working.
      </Text>
      <Pressable
        onPress={() => { void Linking.openURL(APP_STORE_URL); }}
        style={{ marginTop: 22, backgroundColor: "#D4AF37", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
      >
        <Text style={{ color: "#1a1f16", fontWeight: "800" }}>Open the App Store</Text>
      </Pressable>
    </View>
  );
};
