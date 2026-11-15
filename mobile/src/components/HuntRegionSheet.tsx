/**
 * One tap at the first scan of the day. GPS is used only when the same
 * foreground permission as the pre-shot record is already granted.
 */

import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { STATE_HUNT_CHOICES, TEXAS_HUNT_CHOICES, regionAt, regionHeadsUp, type Place } from "../lib/regions";
import { activeHunt, homePlace, rememberedHunt, useHunterProfile } from "../state/hunterProfile";
import { useRemoteConfig } from "../state/remoteConfig";
import { optionalStandLocation } from "../state/shotRecordStore";

async function detectGrantedRegion(): Promise<Place | null> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status !== "granted") return null;
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (!fix || !("coords" in fix)) return null;
    return regionAt(fix.coords.latitude, fix.coords.longitude);
  } catch {
    return null;
  }
}

export const HuntRegionSheet = () => {
  const insets = useSafeAreaInsets();
  const confirmHunt = useHunterProfile((s) => s.confirmHunt);
  const fallback = useHunterProfile((s) => rememberedHunt(s) ?? homePlace(s));
  const [guess, setGuess] = useState<Place | null>(null);
  const [changing, setChanging] = useState(false);
  const [asked, setAsked] = useState(false);
  const suggestion = guess ?? fallback;

  useEffect(() => {
    let alive = true;
    void detectGrantedRegion().then((place) => {
      if (alive && place) setGuess(place);
    });
    return () => {
      alive = false;
    };
  }, []);

  const suggestWithLocation = async () => {
    setAsked(true);
    const fix = await optionalStandLocation();
    if (!fix) return;
    const place = regionAt(fix.latitude, fix.longitude);
    if (place) setGuess(place);
  };

  if (changing) {
    return (
      <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View style={{ padding: 24 }}>
          <Text style={{ color: "#F5F5DC", fontSize: 24, fontWeight: "800" }}>Where are you hunting?</Text>
          <Text style={{ color: "#E5D4B8", marginTop: 6 }}>One tap. Remembered for today.</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
          <Text style={{ color: "#D4AF37", fontWeight: "700", marginBottom: 8 }}>Texas</Text>
          {TEXAS_HUNT_CHOICES.map((place) => (
            <Pressable key={place.label} onPress={() => confirmHunt(place)} style={{ paddingVertical: 10 }}>
              <Text style={{ color: "#F5F5DC", fontSize: 18 }}>{place.label}</Text>
            </Pressable>
          ))}
          <Text style={{ color: "#D4AF37", fontWeight: "700", marginTop: 16, marginBottom: 8 }}>Other states</Text>
          {STATE_HUNT_CHOICES.map((place) => (
            <Pressable key={place.stateCode} onPress={() => confirmHunt(place)} style={{ paddingVertical: 10 }}>
              <Text style={{ color: "#F5F5DC", fontSize: 18 }}>{place.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  const prompted = guess
    ? `Looks like you're in the ${suggestion.label}. Hunting here today?`
    : `Hunting in ${suggestion.label} today?`;

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top, paddingBottom: insets.bottom, paddingHorizontal: 24, justifyContent: "center" }}>
      <Text style={{ color: "#D4AF37", fontWeight: "700" }}>HUNT REGION</Text>
      <Text style={{ color: "#F5F5DC", fontSize: 28, fontWeight: "800", marginTop: 10, lineHeight: 34 }}>{prompted}</Text>
      <Text style={{ color: "#E5D4B8", marginTop: 10 }}>Remembered for today. Home stays what you set in onboarding.</Text>
      <Pressable onPress={() => confirmHunt(suggestion)} style={{ marginTop: 22, backgroundColor: "#D4AF37", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}>
        <Text style={{ color: "#1a1f16", fontWeight: "800", fontSize: 18 }}>Yes</Text>
      </Pressable>
      <Pressable onPress={() => setChanging(true)} style={{ marginTop: 12, backgroundColor: "#3D4A2F", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}>
        <Text style={{ color: "#F5F5DC", fontWeight: "700", fontSize: 18 }}>Change</Text>
      </Pressable>
      {!guess && !asked ? (
        <Pressable onPress={() => { void suggestWithLocation(); }} style={{ marginTop: 16, alignItems: "center" }}>
          <Text style={{ color: "#8B7355" }}>Use location to suggest a region</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

export const RegionHeadsUp = () => {
  const home = useHunterProfile((s) => homePlace(s));
  const hunt = useHunterProfile((s) => activeHunt(s));
  const remote = useRemoteConfig((s) => s.copy.regionHeadsUp);
  const text = regionHeadsUp(home, hunt, remote);
  if (!text) return null;
  return (
    <Text style={{ color: "#E5D4B8", marginTop: 8, lineHeight: 20 }}>{text}</Text>
  );
};
