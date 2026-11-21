import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as Location from "expo-location";
import Constants from "expo-constants";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { e2eEnabled } from "../e2e/flags";
import { flagEnabled } from "./remoteConfig";
import { useSubscriptionStore } from "./subscriptionStore";
import type { ShotDraft, ShotRecord } from "../types/shot-record";

interface ShotRecordState {
  records: Record<string, ShotRecord>;
  locationAsked: boolean;
  locationDenied: boolean;
  put: (record: ShotRecord) => void;
}

export const useShotRecordStore = create<ShotRecordState>()(
  persist(
    (set) => ({
      records: {},
      locationAsked: false,
      locationDenied: false,
      put: (record) => set((state) => ({ records: { ...state.records, [record.localId]: record } })),
    }),
    {
      name: "deerage-shot-records",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

let permissionRequest: Promise<boolean> | null = null;

/** Asks once. A decline, or a failure, still lets the record save. */
export async function optionalStandLocation(): Promise<{ latitude: number; longitude: number } | null> {
  // The simulator build declines here. The system sheet is modal, so Maestro
  // cannot see the age underneath it. A decline already saves the record.
  if (e2eEnabled) return null;
  const state = useShotRecordStore.getState();
  if (state.locationDenied) return null;
  try {
    const current = await Location.getForegroundPermissionsAsync();
    let granted = current.status === "granted";
    if (!granted) {
      if (state.locationAsked) return null;
      if (!permissionRequest) {
        permissionRequest = (async () => {
          useShotRecordStore.setState({ locationAsked: true });
          const asked = await Location.requestForegroundPermissionsAsync();
          const ok = asked.status === "granted";
          if (!ok) useShotRecordStore.setState({ locationDenied: true });
          return ok;
        })().finally(() => {
          permissionRequest = null;
        });
      }
      granted = await permissionRequest;
    }
    if (!granted) return null;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  } catch {
    return null;
  }
}

async function thumbnail(uri: string, localId: string, index: number): Promise<string> {
  const dir = FileSystem.documentDirectory;
  if (!dir || !uri) return uri;
  try {
    const compressed = await manipulateAsync(uri, [{ resize: { width: 320 } }], {
      compress: 0.6,
      format: SaveFormat.JPEG,
    });
    const dest = `${dir}shot-${localId.replace(/[^a-zA-Z0-9_-]/g, "")}-${index}.jpg`;
    await FileSystem.copyAsync({ from: compressed.uri, to: dest });
    return dest;
  } catch {
    return uri;
  }
}

export function newestRecordId(): string | null {
  const records = Object.values(useShotRecordStore.getState().records);
  records.sort((a, b) => (a.deviceTime < b.deviceTime ? 1 : -1));
  return records[0]?.localId ?? null;
}

/** Paid plans export every record. The newest record stays free. */
export function recordExportAllowed(localId: string): boolean {
  if (useSubscriptionStore.getState().entitled) return true;
  return newestRecordId() === localId;
}

export async function saveShotRecord(draft: ShotDraft): Promise<ShotRecord | null> {
  if (!flagEnabled("preShotRecord") || !draft.localId) return null;
  const existing = useShotRecordStore.getState().records[draft.localId];
  if (existing) return existing;
  const receipt = draft.receipt;
  const summary = receipt?.summary;
  const location = await optionalStandLocation();
  const photos = await Promise.all(draft.photoUris.filter(Boolean).slice(0, 4).map((uri, index) => thumbnail(uri, draft.localId, index)));
  const record: ShotRecord = {
    localId: draft.localId,
    receiptId: receipt?.id ?? null,
    deviceTime: new Date().toISOString(),
    serverTime: receipt?.serverTime ?? null,
    mode: draft.mode,
    photoUris: photos,
    ageClass: summary?.ageClass || draft.ageClass,
    ageRange: summary?.ageRange || draft.ageRange,
    confidence: summary?.confidence ?? draft.confidence,
    leaseMinimum: summary?.leaseMinimum ?? draft.leaseMinimum,
    fieldCall: summary?.fieldCall || draft.fieldCall,
    fieldCallNote: summary?.fieldCallNote || draft.fieldCallNote,
    cues: summary?.cues?.length ? summary.cues : draft.cues,
    appVersion: Constants.expoConfig?.version ?? "1.0.9",
    contentHash: receipt?.contentHash ?? null,
    signature: receipt?.signature ?? null,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    scoreLabel: draft.scoreLabel ?? null,
    huntLabel: draft.huntLabel ?? "",
    fastAge: draft.fastAge ?? null,
    mainAge: draft.mainAge ?? null,
    bodyOnlyAge: draft.bodyOnlyAge ?? null,
  };
  useShotRecordStore.getState().put(record);
  return record;
}
