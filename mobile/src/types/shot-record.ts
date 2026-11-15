export interface ShotReceiptSummary {
  mode: string;
  ageClass: string;
  ageRange: string;
  confidence: number;
  leaseMinimum: number;
  fieldCall: string;
  fieldCallNote: string;
  cues: string[];
}

/** Returned with an analysis. Photo bytes are not included. */
export interface ShotReceipt {
  id: string;
  serverTime: string;
  contentHash: string;
  signature: string;
  imageHashes: string[];
  summary: ShotReceiptSummary;
}

export interface ShotRecord {
  localId: string;
  receiptId: string | null;
  deviceTime: string;
  serverTime: string | null;
  mode: "quick" | "age" | "score";
  photoUris: string[];
  ageClass: string;
  ageRange: string;
  confidence: number;
  leaseMinimum: number;
  fieldCall: string;
  fieldCallNote: string;
  cues: string[];
  appVersion: string;
  contentHash: string | null;
  signature: string | null;
  latitude: number | null;
  longitude: number | null;
  scoreLabel: string | null;
  huntLabel: string;
  fastAge: number | null;
  mainAge: number | null;
  bodyOnlyAge: number | null;
}

export interface ShotDraft {
  localId: string;
  mode: "quick" | "age" | "score";
  photoUris: string[];
  receipt: ShotReceipt | null;
  ageClass: string;
  ageRange: string;
  confidence: number;
  leaseMinimum: number;
  fieldCall: string;
  fieldCallNote: string;
  cues: string[];
  scoreLabel?: string | null;
  huntLabel?: string;
  fastAge?: number | null;
  mainAge?: number | null;
  bodyOnlyAge?: number | null;
}
