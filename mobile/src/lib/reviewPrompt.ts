/**
 * Apple's StoreKit review sheet, after a confident age call or a save/share
 * of that same kind of result. The gate is local: the second qualifying
 * result, once per app version, and at least 30 days between our requests.
 * No pre-screen and no question about whether the hunter liked the call.
 */

export const REVIEW_PROMPT_DELAY_MS = 1500;
export const REVIEW_MIN_GAP_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_QUALIFYING_RESULTS = 2;
export const REVIEW_STORAGE_KEY = "deerage-review-prompt";
/** A reported percent below this is a low-confidence read. 0 means unreported. */
export const LOW_CONFIDENCE_BELOW = 50;

export type ReviewMoment = "scan" | "save" | "share";

export type ReviewSubject = {
  moment: ReviewMoment;
  /** Same id on the scan and a later save/share so that result counts once. */
  resultId?: string | null;
  fieldCall?: string | null;
  confidence?: number | "Low" | "Med" | "High" | string | null;
  imageQuality?: string | null;
  isRange?: boolean | null;
  /** Error code, stop, or the prompt copy the hunter is looking at. */
  outcome?: string | null;
};

export type ReviewLedger = {
  goodResultCount: number;
  countedIds: string[];
  lastRequestedAt: number | null;
  requestedForVersion: string | null;
};

export type ReviewDecision = {
  ask: boolean;
  ledger: ReviewLedger;
  reason: string;
};

export function emptyReviewLedger(): ReviewLedger {
  return {
    goodResultCount: 0,
    countedIds: [],
    lastRequestedAt: null,
    requestedForVersion: null,
  };
}

function normalizeText(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/**
 * Stops and prompts that are not a finished age call.
 * A blank string is not an exclusion.
 */
export function exclusionReason(subject: Pick<ReviewSubject, "outcome" | "fieldCall" | "imageQuality">): string | null {
  if (subject.imageQuality === "poor") return "need_a_better_look";
  const blobs = [subject.outcome, subject.fieldCall];
  for (const blob of blobs) {
    if (typeof blob !== "string" || !blob.trim()) continue;
    const text = normalizeText(blob);
    if (text === "paywall" || text === "quota" || text === "fair use" || /\bpaywall\b/.test(text)) return "paywall";
    if (text === "no antlers" || text === "doe" || /\bno antlers\b/.test(text) || /\bdoe\b/.test(text)) return "no_antlers";
    if (
      text === "harvested"
      || text === "not live"
      || text === "wall mount"
      || text === "head mount"
      || text === "dead deer"
      || /\bwall mount\b/.test(text)
      || /\bhead mount\b/.test(text)
      || /\bdead deer\b/.test(text)
      || /\bharvested\b/.test(text)
      || /\bnot live\b/.test(text)
    ) {
      return "dead_or_mount";
    }
    if (
      text === "broadside"
      || text === "bedded"
      || text === "head only"
      || /\bbroadside\b/.test(text)
      || /\bbedded\b/.test(text)
      || /\bhead only\b/.test(text)
    ) {
      return "pose_prompt";
    }
    if (
      text === "error"
      || text === "not deer"
      || text === "no deer"
      || text === "poor quality"
      || text === "unreadable"
      || text === "retake"
      || text === "timeout"
      || text === "network"
      || text === "unknown"
      || text === "too small"
      || /\bno body\b/.test(text)
      || /\bnot deer\b/.test(text)
      || /\bno deer\b/.test(text)
    ) {
      return "error";
    }
  }
  return null;
}

function confidenceIsFirm(confidence: ReviewSubject["confidence"]): boolean {
  if (confidence == null) return true;
  if (typeof confidence === "string") {
    const level = confidence.trim().toLowerCase();
    if (!level) return true;
    if (level === "low") return false;
    if (level === "med" || level === "medium" || level === "high") return true;
    return false;
  }
  if (!Number.isFinite(confidence) || confidence <= 0) return true;
  return confidence >= LOW_CONFIDENCE_BELOW;
}

/** A finished age the hunter can use: firm call, not a range, not a low read. */
export function isQualifyingGoodResult(subject: ReviewSubject): boolean {
  return blockReason(subject) === null;
}

export function blockReason(subject: ReviewSubject): string | null {
  const excluded = exclusionReason(subject);
  if (excluded) return excluded;
  if (subject.isRange) return "range";
  if (subject.fieldCall === "BORDERLINE") return "borderline";
  if (subject.fieldCall !== "SHOOTER" && subject.fieldCall !== "LET WALK") return "not_a_firm_call";
  if (!confidenceIsFirm(subject.confidence)) return "low_confidence";
  return null;
}

export function decideReview(
  ledger: ReviewLedger,
  subject: ReviewSubject,
  version: string,
  now: number,
): ReviewDecision {
  const block = blockReason(subject);
  if (block) return { ask: false, ledger, reason: block };
  const id = subject.resultId?.trim() ?? "";
  const seen = id.length > 0 && ledger.countedIds.includes(id);
  const next: ReviewLedger = seen
    ? ledger
    : {
        ...ledger,
        goodResultCount: ledger.goodResultCount + 1,
        countedIds: id ? [...ledger.countedIds, id].slice(-40) : ledger.countedIds,
      };
  if (next.goodResultCount < MIN_QUALIFYING_RESULTS) {
    return { ask: false, ledger: next, reason: "need_another_good_result" };
  }
  if (next.requestedForVersion === version) {
    return { ask: false, ledger: next, reason: "already_asked_this_version" };
  }
  if (next.lastRequestedAt != null && now - next.lastRequestedAt < REVIEW_MIN_GAP_MS) {
    return { ask: false, ledger: next, reason: "too_soon" };
  }
  return { ask: true, ledger: next, reason: "ask" };
}

export function markReviewAsked(ledger: ReviewLedger, version: string, now: number): ReviewLedger {
  return { ...ledger, requestedForVersion: version, lastRequestedAt: now };
}

export type ReviewStorage = {
  load: () => Promise<ReviewLedger | null>;
  save: (ledger: ReviewLedger) => Promise<void>;
};

export type ReviewBridge = {
  isAvailable: () => Promise<boolean>;
  hasAction: () => Promise<boolean>;
  requestReview: () => Promise<void>;
};

export type ReviewRequestOptions = {
  /** False counts the result and does not open the sheet. */
  request?: boolean;
  now?: number;
  version?: string;
  enabled?: boolean;
  alreadyAskedForVersion?: string | null;
  storage?: ReviewStorage;
  review?: ReviewBridge;
};

function normalizeLedger(value: unknown): ReviewLedger {
  const empty = emptyReviewLedger();
  if (!value || typeof value !== "object") return empty;
  const row = value as Partial<ReviewLedger>;
  const count = Number(row.goodResultCount);
  const ids = Array.isArray(row.countedIds)
    ? row.countedIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0).slice(-40)
    : [];
  const askedAt = typeof row.lastRequestedAt === "number" && Number.isFinite(row.lastRequestedAt) ? row.lastRequestedAt : null;
  const version = typeof row.requestedForVersion === "string" && row.requestedForVersion.trim() ? row.requestedForVersion : null;
  return {
    goodResultCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    countedIds: ids,
    lastRequestedAt: askedAt,
    requestedForVersion: version,
  };
}

async function defaultStorage(): Promise<ReviewStorage> {
  const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage");
  return {
    async load() {
      const raw = await AsyncStorage.getItem(REVIEW_STORAGE_KEY);
      if (!raw) return null;
      return normalizeLedger(JSON.parse(raw) as unknown);
    },
    async save(ledger) {
      await AsyncStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(ledger));
    },
  };
}

async function defaultReview(): Promise<ReviewBridge> {
  const StoreReview = await import("expo-store-review");
  return {
    isAvailable: () => StoreReview.isAvailableAsync(),
    hasAction: () => StoreReview.hasAction(),
    requestReview: () => StoreReview.requestReview(),
  };
}

async function defaultVersion(): Promise<string> {
  const Constants = (await import("expo-constants")).default;
  const version = Constants.expoConfig?.version?.trim();
  return version || "1.0.9";
}

async function defaultEnabled(): Promise<boolean> {
  const { flagEnabled } = await import("../state/remoteConfig");
  return flagEnabled("ratingPrompt");
}

async function defaultAskedVersion(): Promise<string | null> {
  const { useHunterProfile } = await import("../state/hunterProfile");
  return useHunterProfile.getState().reviewAskedForVersion;
}

let tail: Promise<void> = Promise.resolve();

export function maybeRequestStoreReview(subject: ReviewSubject, options?: ReviewRequestOptions): Promise<boolean> {
  const run = tail.then(() => performReviewRequest(subject, options));
  tail = run.then(() => undefined, () => undefined);
  return run;
}

async function performReviewRequest(subject: ReviewSubject, options?: ReviewRequestOptions): Promise<boolean> {
  try {
    const storage = options?.storage ?? await defaultStorage();
    const now = options?.now ?? Date.now();
    const version = options?.version ?? await defaultVersion();
    const enabled = options?.enabled ?? await defaultEnabled();
    const prior = options && "alreadyAskedForVersion" in options
      ? options.alreadyAskedForVersion
      : await defaultAskedVersion();
    const loaded = normalizeLedger(await storage.load());
    const seeded = !loaded.requestedForVersion && prior && prior === version
      ? { ...loaded, requestedForVersion: prior, lastRequestedAt: loaded.lastRequestedAt ?? now }
      : loaded;
    const decision = decideReview(seeded, subject, version, now);
    const shouldAsk = decision.ask && enabled && options?.request !== false;
    if (!shouldAsk) {
      await storage.save(decision.ledger);
      return false;
    }
    const review = options?.review ?? await defaultReview();
    const available = await review.isAvailable();
    const action = await review.hasAction();
    if (!available || !action) {
      await storage.save(decision.ledger);
      return false;
    }
    await review.requestReview();
    await storage.save(markReviewAsked(decision.ledger, version, now));
    return true;
  } catch {
    return false;
  }
}
