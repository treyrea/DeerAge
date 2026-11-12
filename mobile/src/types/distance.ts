/**
 * Distance Measurement Types for Deer Observation
 *
 * Distance affects perceived scale and therefore body/antler measurements
 * and age confidence. These types support capturing distance at observation time.
 */

/**
 * Source of the distance measurement
 */
export type DistanceSource =
  | "manual"              // User typed in a value
  | "preset"              // User selected from preset buttons
  | "rangefinder_bluetooth" // From connected Bluetooth rangefinder (Phase 2)
  | "rangefinder_manual"  // User ranged with device, entered value manually
  | "estimated_ai";       // AI estimated from image (future)

/**
 * Confidence level for the distance measurement
 */
export type DistanceConfidence = "high" | "medium" | "low";

/**
 * Device metadata for distance measurement
 */
export interface DistanceDeviceMeta {
  platform: string;      // iOS, Android
  appVersion: string;
}

/**
 * Historical distance entry for audit trail
 */
export interface DistanceHistoryEntry {
  distanceYards: number;
  source: DistanceSource;
  confidence: DistanceConfidence;
  timestamp: string;     // ISO string
  editedBy: "user";      // Who made the change
}

/**
 * Core distance measurement object
 * Attached to Observation/Capture records
 */
export interface DistanceMeasurement {
  distanceYards: number;           // Required if distance is provided
  source: DistanceSource;          // How was this distance obtained
  confidence: DistanceConfidence;  // How reliable is this distance
  timestamp: string;               // ISO string when captured
  notes?: string;                  // Optional user notes
  deviceMeta?: DistanceDeviceMeta; // Optional device info
}

/**
 * Zoom metadata from camera capture
 */
export interface ZoomMeta {
  cameraFocalLength?: number;  // Camera focal length in mm
  zoomFactor?: number;         // Digital/optical zoom factor
  isDigitalZoom?: boolean;     // True if digital zoom was used
}

/**
 * Distance adjustment result from scoring pipeline
 */
export interface DistanceAdjustmentResult {
  confidenceMultiplier: number;  // 0.7 - 1.0, applied to analysis confidence
  warnings: string[];            // Up to 2 warnings for user display
  traitWeightAdjustments?: {     // Optional trait weight changes
    antlerMassThickness?: number;  // e.g., -0.15 to -0.25 at long range
    brisketSag?: number;           // e.g., -0.15 to -0.25 at long range
    antlerConfiguration?: number;  // e.g., +0.10 to +0.15 at long range
  };
}

/**
 * Distance settings for user preferences
 */
export interface DistanceSettings {
  promptOnEveryAnalysis: boolean;       // Default: true
  rememberLastDistanceMinutes: number;  // Default: 15 (0 = disabled)
  defaultUnit: "yards" | "meters";      // Default: yards (meters for future)
}

/**
 * Rangefinder provider interface (Phase 2 scaffold)
 */
export interface RangefinderProvider {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  getLastMeasurement(): Promise<{ distanceYards: number; timestamp: string } | null>;
  isConnected(): boolean;
  getConnectionState(): "disconnected" | "searching" | "connected" | "failed";
}

/**
 * Distance telemetry data for analytics
 */
export interface DistanceTelemetry {
  analysisId: string;
  hasDistance: boolean;
  distanceYards?: number;
  source?: DistanceSource;
  confidence?: DistanceConfidence;
  timestamp: string;
}

// Constants
export const DISTANCE_PRESETS = [50, 75, 100, 125, 150, 175, 200] as const;
export const DISTANCE_MIN = 10;
export const DISTANCE_MAX = 600;
export const DISTANCE_STEP = 5;
export const LAST_DISTANCE_EXPIRE_MINUTES = 15;
