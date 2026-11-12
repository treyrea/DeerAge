import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { SplashScreen } from "./src/screens/SplashScreen";
import { useState, useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useNetworkStore } from "./src/state/networkStore";
import { useSubscriptionStore } from "./src/state/subscriptionStoreV2";
import { addCustomerInfoUpdateListener } from "./src/lib/revenuecatClient";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// TEMPORARY: Import test component for point counting analysis
import TestPointCount from "./TestPointCount";

// Set to true to run point count test, false for normal app
const RUN_POINT_COUNT_TEST = false;

/*
IMPORTANT NOTICE: DO NOT REMOVE
There are already environment keys in the project.
Before telling the user to add them, check if you already have access to the required keys through bash.
Directly access them with process.env.${key}

Correct usage:
process.env.EXPO_PUBLIC_VIBECODE_{key}
//directly access the key

Incorrect usage:
import { OPENAI_API_KEY } from '@env';
//don't use @env, its depreicated

Incorrect usage:
import Constants from 'expo-constants';
const openai_api_key = Constants.expoConfig.extra.apikey;
//don't use expo-constants, its depreicated

*/

// TEMPORARY: Export test component when testing
export default RUN_POINT_COUNT_TEST ? TestPointCount : MainApp;

function MainApp() {
  const [showSplash, setShowSplash] = useState(true);
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const checkAndUpdateTier = useSubscriptionStore((s) => s.checkAndUpdateTier);

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      useNetworkStore.getState().setNetworkState(
        state.isConnected ?? false,
        state.isInternetReachable ?? null,
        state.type
      );
    });

    return () => unsubscribe();
  }, []); // Empty dependency array - this effect should only run once

  // Check subscription status on app launch and listen for updates
  useEffect(() => {
    // Check subscription on launch (handles promo codes, restores, etc.)
    console.log("[App] Checking subscription status on launch...");
    checkAndUpdateTier();

    // Listen for real-time entitlement updates (purchases, promo code redemptions, etc.)
    const unsubscribe = addCustomerInfoUpdateListener((customerInfo) => {
      console.log("[App] Customer info updated, refreshing tier...");
      checkAndUpdateTier();
    });

    return () => unsubscribe();
  }, []);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  const showOfflineBanner = !isConnected || isInternetReachable === false;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {showOfflineBanner && (
          <View
            style={{
              backgroundColor: "#dc2626",
              paddingVertical: 8,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="cloud-offline-outline" size={16} color="white" />
            <Text
              style={{
                color: "white",
                fontSize: 13,
                fontWeight: "600",
                marginLeft: 6,
              }}
            >
              Limited Connectivity - Some Features Unavailable
            </Text>
          </View>
        )}
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="light" />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
