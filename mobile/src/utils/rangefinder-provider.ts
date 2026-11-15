/**
 * Bluetooth Rangefinder Provider (Phase 2 Scaffold)
 *
 * This is a placeholder implementation for future Bluetooth rangefinder integration.
 * The feature flag `enableBluetoothRangefinder` controls whether this is active.
 *
 * When fully implemented, this will support devices like:
 * - Sig Sauer rangefinders with Bluetooth
 * - Vortex Fury rangefinder binoculars
 * - Leupold RX rangefinders
 * - Other BLE-enabled rangefinders
 */

import type { RangefinderProvider } from "../types/distance";

/**
 * Connection state for UI display
 */
export type RangefinderConnectionState =
  | "disconnected"
  | "searching"
  | "connected"
  | "failed";

/**
 * Mock/Placeholder Rangefinder Provider
 * Replace with actual BLE implementation in Phase 2
 */
class PlaceholderRangefinderProvider implements RangefinderProvider {
  private connectionState: RangefinderConnectionState = "disconnected";
  private lastMeasurement: { distanceYards: number; timestamp: string } | null = null;

  async connect(): Promise<boolean> {
    // Phase 2: Implement actual BLE scanning and connection
    console.log("[Rangefinder] Connect called - placeholder implementation");

    this.connectionState = "searching";

    // Simulate connection attempt
    return new Promise((resolve) => {
      setTimeout(() => {
        // In Phase 2, this would actually attempt BLE connection
        this.connectionState = "failed";
        console.log("[Rangefinder] Connection failed - not implemented");
        resolve(false);
      }, 2000);
    });
  }

  async disconnect(): Promise<void> {
    console.log("[Rangefinder] Disconnect called");
    this.connectionState = "disconnected";
    this.lastMeasurement = null;
  }

  async getLastMeasurement(): Promise<{ distanceYards: number; timestamp: string } | null> {
    // Phase 2: Read from BLE characteristic
    console.log("[Rangefinder] getLastMeasurement called");
    return this.lastMeasurement;
  }

  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  getConnectionState(): RangefinderConnectionState {
    return this.connectionState;
  }
}

/**
 * Singleton instance of the rangefinder provider
 */
export const rangefinderProvider = new PlaceholderRangefinderProvider();

/**
 * Supported rangefinder devices (for future implementation)
 */
export const SUPPORTED_RANGEFINDER_DEVICES = [
  {
    brand: "Sig Sauer",
    models: ["KILO1800BDX", "KILO2400ABS", "KILO3000BDX"],
    protocol: "BLE_GATT",
    status: "planned",
  },
  {
    brand: "Vortex",
    models: ["Fury HD 5000 AB", "Ranger 1500"],
    protocol: "BLE_GATT",
    status: "planned",
  },
  {
    brand: "Leupold",
    models: ["RX-2800 TBR/W", "RX-1600i TBR/W"],
    protocol: "BLE_GATT",
    status: "researching",
  },
];

/**
 * Check if Bluetooth is available on this device
 * Phase 2: Actually check BLE capabilities
 */
export async function checkBluetoothAvailable(): Promise<boolean> {
  // Placeholder - always return false until implemented
  return false;
}

/**
 * Scan for nearby rangefinder devices
 * Phase 2: Implement BLE scanning
 */
export async function scanForRangefinders(): Promise<
  Array<{ id: string; name: string; rssi: number }>
> {
  console.log("[Rangefinder] Scanning for devices - not implemented");
  return [];
}

/**
 * Parse distance from BLE characteristic data
 * Phase 2: Implement actual parsing based on device protocol
 */
export function parseDistanceFromBLE(data: ArrayBuffer): number | null {
  // Placeholder - different devices have different data formats
  console.log("[Rangefinder] parseDistanceFromBLE - not implemented");
  return null;
}

export default rangefinderProvider;
