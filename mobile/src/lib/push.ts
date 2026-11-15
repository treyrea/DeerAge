import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken, unregisterPushToken } from "../api/community";
import { useCommunityStore } from "../state/communityStore";

export type PushEnableResult = "enabled" | "denied" | "unavailable";

export function configurePushHandling(): void {
  if (Platform.OS !== "ios") return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function readExpoToken(): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId || !Device.isDevice) return null;
  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data || null;
  } catch {
    return null;
  }
}

export async function enablePush(): Promise<PushEnableResult> {
  if (Platform.OS !== "ios" || !Device.isDevice) return "unavailable";
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== "granted") return "denied";
    const token = await readExpoToken();
    if (!token) return "unavailable";
    const saved = await registerPushToken(token);
    if (!saved) return "unavailable";
    useCommunityStore.getState().setPushEnabled(true);
    return "enabled";
  } catch {
    return "unavailable";
  }
}

export async function disablePush(): Promise<void> {
  await unregisterPushToken();
  useCommunityStore.getState().setPushEnabled(false);
}

/** Refreshes a token the hunter already allowed. Does not ask for permission. */
export async function refreshPushRegistration(): Promise<void> {
  if (Platform.OS !== "ios") return;
  if (!useCommunityStore.getState().pushEnabled) return;
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== "granted") {
      useCommunityStore.getState().setPushEnabled(false);
      return;
    }
    const token = await readExpoToken();
    if (token) await registerPushToken(token);
  } catch {
    // A failed refresh leaves the saved opt-in in place for the next launch.
  }
}

export function subscribePushTokenRefresh(): () => void {
  if (Platform.OS !== "ios") return () => undefined;
  const subscription = Notifications.addPushTokenListener(() => {
    void refreshPushRegistration();
  });
  return () => subscription.remove();
}
