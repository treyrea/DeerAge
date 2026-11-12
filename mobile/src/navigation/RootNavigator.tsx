/**
 * Navigation Structure for DeerAge App
 * Hybrid approach: Bottom tabs for main screens, hidden during capture flow
 */

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeScreen } from "../screens/HomeScreenV2";
import { ModeSelectScreen } from "../screens/ModeSelectScreen";
import { DeerCameraScreen } from "../screens/DeerCameraScreen";
import { PhotoSelectScreen } from "../screens/PhotoSelectScreen";
import { ProcessingScreen } from "../screens/ProcessingScreen";
import { ResultsScreen } from "../screens/ResultsScreen";
import { AgeResultScreen } from "../screens/AgeResultScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { HistoryDetailScreen } from "../screens/HistoryDetailScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { OfflineAgeGuideScreen } from "../screens/OfflineAgeGuideScreen";
import { OfflineQueuedScreen } from "../screens/OfflineQueuedScreen";
import { QuickCheckCameraScreen } from "../screens/QuickCheckCameraScreen";
import { QuickCheckResultScreen } from "../screens/QuickCheckResultScreen";
import { DeerScoringResult } from "../types/deer-scoring";
import type { QuickAgeResult } from "../api/quick-age-check";
import { useDeerScoringStore } from "../state/deerScoringStore";
import { TierPaywallScreen } from "../screens/TierPaywallScreen";
import type { TierId, FeatureType } from "../lib/CONSTITUTION";

// Stack param lists
export type HomeStackParamList = {
  HomeMain: undefined;
  ModeSelect: { mode: "age" | "score" };
  Camera: undefined;
  PhotoSelect: undefined;
  Processing: undefined;
  Results: undefined;
  AgeResults: undefined;
  OfflineAgeGuide: undefined;
  OfflineQueued: { frameCount: number };
  QuickCheckCamera: undefined;
  QuickCheckResult: { result: QuickAgeResult; imageUri: string };
  TierPaywall: { reason?: "quick_check_limit" | "age_limit" | "score_limit" | "upgrade" | "score_locked"; feature?: FeatureType; recommendedTier?: TierId };
};

export type HistoryStackParamList = {
  HistoryMain: undefined;
  HistoryDetail: { result: DeerScoringResult };
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
};

// Combined type for backward compatibility
export type RootStackParamList = HomeStackParamList & HistoryStackParamList & SettingsStackParamList & {
  Home: undefined;
  History: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

// Home stack navigator - contains all capture flow screens
const HomeStackNavigator = () => {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: { backgroundColor: "#2B3420" },
      }}
    >
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="ModeSelect" component={ModeSelectScreen} />
      <HomeStack.Screen name="Camera" component={DeerCameraScreen} />
      <HomeStack.Screen name="PhotoSelect" component={PhotoSelectScreen} />
      <HomeStack.Screen name="Processing" component={ProcessingScreen} />
      <HomeStack.Screen name="Results" component={ResultsScreen} />
      <HomeStack.Screen name="AgeResults" component={AgeResultScreen} />
      <HomeStack.Screen name="OfflineAgeGuide" component={OfflineAgeGuideScreen} />
      <HomeStack.Screen name="OfflineQueued" component={OfflineQueuedScreen} />
      <HomeStack.Screen name="QuickCheckCamera" component={QuickCheckCameraScreen} />
      <HomeStack.Screen name="QuickCheckResult" component={QuickCheckResultScreen} />
      <HomeStack.Screen
        name="TierPaywall"
        component={TierPaywallScreen}
        options={{ presentation: "modal" }}
      />
    </HomeStack.Navigator>
  );
};

// History stack navigator
const HistoryStackNavigator = () => {
  return (
    <HistoryStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: { backgroundColor: "#2B3420" },
      }}
    >
      <HistoryStack.Screen name="HistoryMain" component={HistoryScreen} />
      <HistoryStack.Screen name="HistoryDetail" component={HistoryDetailScreen} />
    </HistoryStack.Navigator>
  );
};

// Settings stack navigator
const SettingsStackNavigator = () => {
  return (
    <SettingsStack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "fade",
        contentStyle: { backgroundColor: "#2B3420" },
      }}
    >
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
    </SettingsStack.Navigator>
  );
};

export const RootNavigator = () => {
  const insets = useSafeAreaInsets();
  const historyCount = useDeerScoringStore((s) => s.history.length);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#1a1f16",
          borderTopColor: "#3D4A2F",
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#D4AF37",
        tabBarInactiveTintColor: "#8B7355",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "home";

          if (route.name === "Home") {
            iconName = focused ? "home" : "home-outline";
          } else if (route.name === "History") {
            iconName = focused ? "time" : "time-outline";
          } else if (route.name === "Settings") {
            iconName = focused ? "settings" : "settings-outline";
          }

          return <Ionicons name={iconName} size={24} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStackNavigator}
        options={({ route }) => ({
          tabBarLabel: "Home",
          // Hide tab bar when in capture flow (any screen beyond HomeMain)
          tabBarStyle: ((navRoute) => {
            const routeName = getFocusedRouteNameFromRoute(navRoute) ?? "HomeMain";
            const hideOnScreens = [
              "ModeSelect",
              "Camera",
              "PhotoSelect",
              "Processing",
              "Results",
              "AgeResults",
              "OfflineAgeGuide",
              "OfflineQueued",
              "QuickCheckCamera",
              "QuickCheckResult",
              "TierPaywall",
            ];
            if (hideOnScreens.includes(routeName)) {
              return { display: "none" };
            }
            return {
              backgroundColor: "#1a1f16",
              borderTopColor: "#3D4A2F",
              borderTopWidth: 1,
              height: 60 + insets.bottom,
              paddingBottom: insets.bottom,
              paddingTop: 8,
            };
          })(route),
        })}
      />
      <Tab.Screen
        name="History"
        component={HistoryStackNavigator}
        options={({ route }) => ({
          tabBarLabel: "History",
          tabBarBadge: historyCount > 0 ? historyCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: "#D4AF37",
            color: "#1a1f16",
            fontSize: 10,
            fontWeight: "bold",
            minWidth: 18,
            height: 18,
            borderRadius: 9,
          },
          // Hide tab bar on detail view
          tabBarStyle: ((navRoute) => {
            const routeName = getFocusedRouteNameFromRoute(navRoute) ?? "HistoryMain";
            if (routeName === "HistoryDetail") {
              return { display: "none" };
            }
            return {
              backgroundColor: "#1a1f16",
              borderTopColor: "#3D4A2F",
              borderTopWidth: 1,
              height: 60 + insets.bottom,
              paddingBottom: insets.bottom,
              paddingTop: 8,
            };
          })(route),
        })}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStackNavigator}
        options={{
          tabBarLabel: "Settings",
        }}
      />
    </Tab.Navigator>
  );
};

