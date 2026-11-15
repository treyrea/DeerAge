/**
 * Three steps, then the camera. No account.
 */

import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { goalToMinimumAge, speciesForEcoregion, useHunterProfile, type HuntGoal, type LandType } from "../state/hunterProfile";
import { useDeerScoringStore } from "../state/deerScoringStore";

type Nav = NativeStackNavigationProp<Record<string, object | undefined>>;

const STATES: Array<{ code: string; name: string; ecoregion: string }> = [
  { code: "AL", name: "Alabama", ecoregion: "Southeast" },
  { code: "AR", name: "Arkansas", ecoregion: "Southeast" },
  { code: "AZ", name: "Arizona", ecoregion: "West/mule deer" },
  { code: "CO", name: "Colorado", ecoregion: "West/mule deer" },
  { code: "FL", name: "Florida", ecoregion: "Southeast" },
  { code: "GA", name: "Georgia", ecoregion: "Southeast" },
  { code: "IA", name: "Iowa", ecoregion: "Midwest" },
  { code: "ID", name: "Idaho", ecoregion: "West/mule deer" },
  { code: "IL", name: "Illinois", ecoregion: "Midwest" },
  { code: "IN", name: "Indiana", ecoregion: "Midwest" },
  { code: "KS", name: "Kansas", ecoregion: "Plains" },
  { code: "KY", name: "Kentucky", ecoregion: "Southeast" },
  { code: "LA", name: "Louisiana", ecoregion: "Southeast" },
  { code: "MD", name: "Maryland", ecoregion: "Northeast/Mid-Atlantic" },
  { code: "MI", name: "Michigan", ecoregion: "Midwest" },
  { code: "MN", name: "Minnesota", ecoregion: "Midwest" },
  { code: "MO", name: "Missouri", ecoregion: "Midwest" },
  { code: "MS", name: "Mississippi", ecoregion: "Southeast" },
  { code: "MT", name: "Montana", ecoregion: "West/mule deer" },
  { code: "NC", name: "North Carolina", ecoregion: "Southeast" },
  { code: "ND", name: "North Dakota", ecoregion: "Plains" },
  { code: "NE", name: "Nebraska", ecoregion: "Plains" },
  { code: "NM", name: "New Mexico", ecoregion: "West/mule deer" },
  { code: "NY", name: "New York", ecoregion: "Northeast/Mid-Atlantic" },
  { code: "OH", name: "Ohio", ecoregion: "Midwest" },
  { code: "OK", name: "Oklahoma", ecoregion: "Plains" },
  { code: "OR", name: "Oregon", ecoregion: "West/mule deer" },
  { code: "PA", name: "Pennsylvania", ecoregion: "Northeast/Mid-Atlantic" },
  { code: "SC", name: "South Carolina", ecoregion: "Southeast" },
  { code: "SD", name: "South Dakota", ecoregion: "Plains" },
  { code: "TN", name: "Tennessee", ecoregion: "Southeast" },
  { code: "TX", name: "Texas", ecoregion: "" },
  { code: "UT", name: "Utah", ecoregion: "West/mule deer" },
  { code: "VA", name: "Virginia", ecoregion: "Northeast/Mid-Atlantic" },
  { code: "WI", name: "Wisconsin", ecoregion: "Midwest" },
  { code: "WV", name: "West Virginia", ecoregion: "Northeast/Mid-Atlantic" },
  { code: "WY", name: "Wyoming", ecoregion: "West/mule deer" },
  { code: "AB", name: "Alberta", ecoregion: "West/mule deer" },
  { code: "SK", name: "Saskatchewan", ecoregion: "Plains" },
];

const TEXAS_REGIONS = [
  "East Texas Pineywoods",
  "South Texas Brush Country",
  "Hill Country/Edwards Plateau",
  "North-Central Texas prairies",
  "West Texas/Trans-Pecos",
];

const LAND: Array<{ id: LandType; label: string }> = [
  { id: "private", label: "Private land" },
  { id: "lease", label: "Hunting lease" },
  { id: "public", label: "Public land" },
  { id: "high_fence", label: "High fence" },
];

const GOALS: Array<{ id: HuntGoal; label: string }> = [
  { id: "any_buck", label: "Any buck" },
  { id: "shooters_3.5", label: "Shooters 3.5+" },
  { id: "shooters_4.5", label: "Shooters 4.5+" },
  { id: "trophy", label: "Trophy 5.5+" },
];

function legacyRegion(ecoregion: string): "midwest" | "south" | "northeast" | "west" {
  const value = ecoregion.toLowerCase();
  if (value.includes("mule") || value.includes("west")) return "west";
  if (value.includes("northeast") || value.includes("mid-atlantic")) return "northeast";
  if (value.includes("midwest") || value.includes("plains")) return "midwest";
  return "south";
}

export const OnboardingScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<{ Onboarding: { edit?: boolean } }, "Onboarding">>();
  const editing = Boolean(route.params?.edit);
  const insets = useSafeAreaInsets();
  const saved = useHunterProfile();
  const setPropertyRules = useDeerScoringStore((s) => s.setPropertyRules);
  const [step, setStep] = useState(0);
  const [stateCode, setStateCode] = useState(saved.stateCode || "TX");
  const chosen = STATES.find((state) => state.code === stateCode) ?? STATES[0];
  const [ecoregion, setEcoregion] = useState(saved.ecoregion || (chosen.code === "TX" ? TEXAS_REGIONS[2] : chosen.ecoregion));
  const [landType, setLandType] = useState<LandType>(saved.landType);
  const [goal, setGoal] = useState<HuntGoal>(saved.goal || "shooters_4.5");

  const selectState = (code: string) => {
    const next = STATES.find((state) => state.code === code);
    if (!next) return;
    setStateCode(code);
    setEcoregion(code === "TX" ? (ecoregion && TEXAS_REGIONS.includes(ecoregion) ? ecoregion : TEXAS_REGIONS[2]) : next.ecoregion);
  };

  const finish = () => {
    const region = stateCode === "TX" ? ecoregion : chosen.ecoregion;
    useHunterProfile.getState().complete({
      stateCode,
      stateName: chosen.name,
      ecoregion: region,
      landType,
      goal,
    });
    setPropertyRules({
      minimumShooterAge: goalToMinimumAge(goal),
      species: speciesForEcoregion(region),
      region: legacyRegion(region),
    });
    if (editing && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.reset({
      index: 1,
      routes: [{ name: "HomeMain" }, { name: "QuickCheckCamera" }],
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#2B3420", paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
        <Text style={{ color: "#D4AF37", fontWeight: "700" }}>{step + 1} of 3</Text>
        <Text style={{ color: "#F5F5DC", fontSize: 28, fontWeight: "800", marginTop: 8 }}>
          {step === 0 ? "Where do you hunt?" : step === 1 ? "What are you looking for?" : "Here's a sample"}
        </Text>
        <Text style={{ color: "#E5D4B8", marginTop: 6 }}>
          {step === 0
            ? "Body shape travels. Antler size does not. Your state keeps the age call honest."
            : step === 1
              ? "This sets the shoot or let-walk line. You can change it later in Settings."
              : "Your first real check is next. No account."}
        </Text>
      </View>

      {step === 0 ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {STATES.map((state) => {
              const on = state.code === stateCode;
              return (
                <Pressable
                  key={state.code}
                  onPress={() => selectState(state.code)}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 20,
                    margin: 4,
                    backgroundColor: on ? "#D4AF37" : "#3D4A2F",
                  }}
                >
                  <Text style={{ color: on ? "#1a1f16" : "#F5F5DC", fontWeight: "700" }}>{state.name}</Text>
                </Pressable>
              );
            })}
          </View>
          {stateCode === "TX" ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: "#D4AF37", fontWeight: "700", marginBottom: 8 }}>Texas region</Text>
              {TEXAS_REGIONS.map((region) => {
                const on = region === ecoregion;
                return (
                  <Pressable key={region} onPress={() => setEcoregion(region)} style={{ paddingVertical: 10 }}>
                    <Text style={{ color: on ? "#D4AF37" : "#F5F5DC", fontWeight: on ? "800" : "500" }}>{region}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: "#E5D4B8", marginTop: 16 }}>Region: {chosen.ecoregion}</Text>
          )}
        </ScrollView>
      ) : null}

      {step === 1 ? (
        <View style={{ padding: 24 }}>
          <Text style={{ color: "#D4AF37", fontWeight: "700", marginBottom: 8 }}>Land</Text>
          {LAND.map((item) => (
            <Pressable key={item.id} onPress={() => setLandType(item.id)} style={{ paddingVertical: 10 }}>
              <Text style={{ color: landType === item.id ? "#D4AF37" : "#F5F5DC", fontSize: 18, fontWeight: "700" }}>{item.label}</Text>
            </Pressable>
          ))}
          <Text style={{ color: "#D4AF37", fontWeight: "700", marginTop: 16, marginBottom: 8 }}>Goal</Text>
          {GOALS.map((item) => (
            <Pressable key={item.id} onPress={() => setGoal(item.id)} style={{ paddingVertical: 10 }}>
              <Text style={{ color: goal === item.id ? "#D4AF37" : "#F5F5DC", fontSize: 18, fontWeight: "700" }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ margin: 24, backgroundColor: "#1a1f16", borderRadius: 18, padding: 18 }}>
          <Text style={{ color: "#D4AF37", fontSize: 12, fontWeight: "700" }}>SAMPLE</Text>
          <Text style={{ color: "#F5F5DC", fontSize: 32, fontWeight: "800", marginTop: 6 }}>4.5 · SHOOTER</Text>
          <Text style={{ color: "#D4AF37", fontSize: 16, fontWeight: "700", marginTop: 4 }}>Your lease minimum: 4.5</Text>
          <Text style={{ color: "#E5D4B8", marginTop: 10 }}>Neck blends into the chest. Belly has some sag. Legs look short for the body.</Text>
          <Text style={{ color: "#8B7355", marginTop: 14 }}>Aged with DeerAge</Text>
        </View>
      ) : null}

      <View style={{ padding: 24 }}>
        <Pressable
          onPress={() => {
            if (step < 2) setStep(step + 1);
            else finish();
          }}
          style={{ backgroundColor: "#D4AF37", borderRadius: 14, paddingVertical: 16, alignItems: "center" }}
        >
          <Text style={{ color: "#1a1f16", fontWeight: "800", fontSize: 17 }}>
            {step === 2 ? "Open the camera" : "Continue"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};
