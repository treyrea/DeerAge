import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createNavigationContainerRef, NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { SplashScreen } from "./src/screens/SplashScreen";
import { useState, useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useNetworkStore } from "./src/state/networkStore";
import { e2eEnabled, useE2eFlags } from "./src/e2e/flags";
import { useSubscriptionStore } from "./src/state/subscriptionStore";
import { refreshScanCredits } from "./src/api/scan-credits";
import { addCustomerInfoUpdateListener } from "./src/lib/revenuecatClient";
import { CommunityPrompts, leafRouteName } from "./src/components/CommunityPrompts";
import { UpdateGate } from "./src/components/UpdateGate";
import { refreshRemoteConfig } from "./src/state/remoteConfig";
import { settleLeaseRules, useHunterProfile } from "./src/state/hunterProfile";
import { useShotRecordStore } from "./src/state/shotRecordStore";
import { useHarvestStore } from "./src/state/harvestStore";
import { configurePushHandling, refreshPushRegistration, subscribePushTokenRefresh } from "./src/lib/push";
import { useCommunityStore } from "./src/state/communityStore";
import { Appearance, AppState } from "react-native";
import { OfflineChip } from "./src/components/OfflineChip";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";

// React Native 0.81 sets overrideUserInterfaceStyle on the current windows.
// That darkens alerts, the keyboard, and share sheets without an app.json change.
const navigationRef = createNavigationContainerRef();

function applyDarkSystemUi() {
  Appearance.setColorScheme("dark");
}

function openOfflineGuide() {
  if (!navigationRef.isReady()) return;
  const nav = navigationRef as unknown as { navigate: (name: string, params?: { screen: string }) => void };
  nav.navigate("Home", { screen: "OfflineAgeGuide" });
}

// AI keys stay on the server. The app only reads the RevenueCat public SDK key and the proxy URL.
export default MainApp;

function MainApp() {
  const [showSplash, setShowSplash] = useState(true);
  const [routeName, setRouteName] = useState("");
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);

  useEffect(() => {
    applyDarkSystemUi();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") applyDarkSystemUi();
    });
    return () => sub.remove();
  }, []);
  const refreshEntitlement = useSubscriptionStore((s) => s.refreshEntitlement);
  const applyCustomerInfo = useSubscriptionStore((s) => s.applyCustomerInfo);

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (e2eEnabled && useE2eFlags.getState().holdOffline) return;
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
    void refreshScanCredits();

    const unsubscribe = addCustomerInfoUpdateListener((customerInfo) => {
      applyCustomerInfo(customerInfo);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    void refreshRemoteConfig();
    let noted = false;
    const note = () => {
      if (noted) return;
      noted = true;
      useHunterProfile.getState().noteSession();
    };
    if (useHunterProfile.persist.hasHydrated()) note();
    const unsub = useHunterProfile.persist.onFinishHydration(note);
    const settle = () => {
      if (!useHunterProfile.persist.hasHydrated() || !useShotRecordStore.persist.hasHydrated()) return;
      settleLeaseRules(Object.keys(useShotRecordStore.getState().records).length);
    };
    if (useHunterProfile.persist.hasHydrated() && useShotRecordStore.persist.hasHydrated()) settle();
    const unsubProfile = useHunterProfile.persist.onFinishHydration(settle);
    const unsubRecords = useShotRecordStore.persist.onFinishHydration(settle);
    Object.values(useHarvestStore.getState().entries).filter((entry) => !entry.synced).forEach((entry) => {
      useHarvestStore.getState().save(entry);
    });
    return () => {
      unsub();
      unsubProfile();
      unsubRecords();
    };
  }, []);

  useEffect(() => {
    configurePushHandling();
    const refresh = () => {
      void refreshPushRegistration();
    };
    if (useCommunityStore.persist.hasHydrated()) refresh();
    const unsubHydration = useCommunityStore.persist.onFinishHydration(refresh);
    const unsubToken = subscribePushTokenRefresh();
    return () => {
      unsubHydration();
      unsubToken();
    };
  }, []);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  const showOfflineBanner = !isConnected || isInternetReachable === false;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#121410" }}>
      <AppErrorBoundary>
        <SafeAreaProvider>
          {showOfflineBanner ? <OfflineChip onPress={openOfflineGuide} /> : null}
          <NavigationContainer ref={navigationRef} onStateChange={(state) => setRouteName(leafRouteName(state))}>
            <RootNavigator />
            <CommunityPrompts routeName={routeName} />
            <UpdateGate />
            <StatusBar style="light" />
          </NavigationContainer>
        </SafeAreaProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
