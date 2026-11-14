import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { SplashScreen } from "./src/screens/SplashScreen";
import { useState, useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useNetworkStore } from "./src/state/networkStore";
import { useSubscriptionStore } from "./src/state/subscriptionStore";
import { addCustomerInfoUpdateListener } from "./src/lib/revenuecatClient";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// AI keys stay on the server. The app only reads the RevenueCat public SDK key and the proxy URL.
export default MainApp;

function MainApp() {
  const [showSplash, setShowSplash] = useState(true);
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const refreshEntitlement = useSubscriptionStore((s) => s.refreshEntitlement);
  const applyCustomerInfo = useSubscriptionStore((s) => s.applyCustomerInfo);

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
    // Read CustomerInfo only. Restore runs when the hunter taps Restore.
    void refreshEntitlement();

    const unsubscribe = addCustomerInfoUpdateListener((customerInfo) => {
      applyCustomerInfo(customerInfo);
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
