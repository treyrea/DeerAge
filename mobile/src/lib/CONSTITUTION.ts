/**
 * DEERAGE PRODUCT CONSTITUTION
 * ============================
 *
 * This file is the SINGLE SOURCE OF TRUTH for all product rules, tier limits,
 * pricing, copy guidelines, and business logic constraints.
 *
 * PRIME DIRECTIVE:
 * Perceived generosity must always exceed actual marginal cost exposure.
 *
 * INVESTOR RULE:
 * Every tier must remain profitable under worst-case usage, not average behavior.
 *
 * USER RULE:
 * Users must experience meaningful value before encountering limits.
 * Limits are revealed after success, framed as progression, never interrupt a first win.
 *
 * NO FEATURE MAY VIOLATE THESE PRINCIPLES.
 */

// ============================================================================
// FEATURE CLASSIFICATION
// ============================================================================

/**
 * HABIT FEATURES (Cheap, Frequent)
 * - Must feel abundant
 * - Must minimize friction
 * - Must never create anxiety
 * - May be unlimited or very high-cap
 */
export type HabitFeature = "quick_check";

/**
 * OBSESSION FEATURES (Expensive, Premium)
 * - Must be scarce
 * - Must feel special
 * - Must be intentionally gated
 * - Must never be casually repeatable
 */
export type ObsessionFeature = "score_my_rack";

/**
 * STANDARD FEATURES (Moderate cost)
 * - Balanced limits
 * - Core value delivery
 */
export type StandardFeature = "age_my_deer";

export type FeatureType = HabitFeature | StandardFeature | ObsessionFeature;

export const FEATURE_CLASSIFICATION = {
  quick_check: "habit" as const,
  age_my_deer: "standard" as const,
  score_my_rack: "obsession" as const,
} as const;

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

export type TierId = "explorer" | "scout" | "hunter" | "trophy" | "outfitter";

export interface TierDefinition {
  id: TierId;
  name: string;
  displayName: string;
  priceMonthly: number;
  entitlementId: string;
  isFreeTier: boolean;
  limits: {
    quickCheck: number | "unlimited";
    ageMyDeer: number;
    scoreMyRack: number;
  };
  /** Whether limits are lifetime (free) or monthly (paid) */
  limitType: "lifetime" | "monthly";
  /** Identity-based description for upgrade framing */
  identityDescription: string;
  /** Who this tier is for */
  targetAudience: string;
}

export const TIERS: Record<TierId, TierDefinition> = {
  explorer: {
    id: "explorer",
    name: "Explorer",
    displayName: "Explorer",
    priceMonthly: 0,
    entitlementId: "", // No entitlement - free tier
    isFreeTier: true,
    limits: {
      quickCheck: 10,        // LIFETIME cap
      ageMyDeer: 2,          // LIFETIME cap
      scoreMyRack: 0,        // Not available
    },
    limitType: "lifetime",
    identityDescription: "Curious hunter exploring the app",
    targetAudience: "New users discovering DeerAge",
  },
  scout: {
    id: "scout",
    name: "Scout",
    displayName: "Scout",
    priceMonthly: 5,
    entitlementId: "scout",
    isFreeTier: false,
    limits: {
      quickCheck: "unlimited",
      ageMyDeer: 20,         // Per month
      scoreMyRack: 0,        // Not included
    },
    limitType: "monthly",
    identityDescription: "Dedicated hunter building skills",
    targetAudience: "Regular hunters who want unlimited Quick Checks",
  },
  hunter: {
    id: "hunter",
    name: "Hunter",
    displayName: "Hunter",
    priceMonthly: 9,
    entitlementId: "hunter",
    isFreeTier: false,
    limits: {
      quickCheck: "unlimited",
      ageMyDeer: 40,         // Per month
      scoreMyRack: 0,        // Not included
    },
    limitType: "monthly",
    identityDescription: "Serious hunter committed to quality harvests",
    targetAudience: "Active hunters who analyze multiple deer",
  },
  trophy: {
    id: "trophy",
    name: "Trophy",
    displayName: "Trophy",
    priceMonthly: 15,
    entitlementId: "trophy",
    isFreeTier: false,
    limits: {
      quickCheck: "unlimited",
      ageMyDeer: 50,         // Per month
      scoreMyRack: 12,       // Per month
    },
    limitType: "monthly",
    identityDescription: "Trophy hunter pursuing excellence",
    targetAudience: "Hunters who want full B&C scoring capabilities",
  },
  outfitter: {
    id: "outfitter",
    name: "Outfitter",
    displayName: "Outfitter",
    priceMonthly: 25,
    entitlementId: "outfitter",
    isFreeTier: false,
    limits: {
      quickCheck: "unlimited",
      ageMyDeer: 80,         // Per month
      scoreMyRack: 20,       // Per month
    },
    limitType: "monthly",
    identityDescription: "Professional guide or land manager",
    targetAudience: "Outfitters, guides, and serious land managers",
  },
} as const;

// Ordered list for UI display (lowest to highest)
export const TIER_ORDER: TierId[] = ["explorer", "scout", "hunter", "trophy", "outfitter"];

// ============================================================================
// REVENUECAT PRODUCT IDENTIFIERS
// ============================================================================

export const REVENUECAT_PRODUCTS = {
  scout_monthly: {
    testStore: "scout_monthly",
    appStore: "com.deerage.scout.monthly",
    playStore: "scout_monthly",
    tier: "scout" as TierId,
    duration: "P1M" as const,
    price: 5,
  },
  hunter_monthly: {
    testStore: "hunter_monthly",
    appStore: "com.deerage.hunter.monthly",
    playStore: "hunter_monthly",
    tier: "hunter" as TierId,
    duration: "P1M" as const,
    price: 9,
  },
  trophy_monthly: {
    testStore: "trophy_monthly",
    appStore: "com.deerage.trophy.monthly",
    playStore: "trophy_monthly",
    tier: "trophy" as TierId,
    duration: "P1M" as const,
    price: 15,
  },
  outfitter_monthly: {
    testStore: "outfitter_monthly",
    appStore: "com.deerage.outfitter.monthly",
    playStore: "outfitter_monthly",
    tier: "outfitter" as TierId,
    duration: "P1M" as const,
    price: 25,
  },
} as const;

// ============================================================================
// COPY GUIDELINES - ABSOLUTE PROHIBITIONS
// ============================================================================

/**
 * NEVER use these words/phrases in user-facing copy:
 */
export const PROHIBITED_COPY = [
  "denied",
  "blocked",
  "limit reached",
  "you have run out",
  "no more",
  "token",
  "tokens",
  "AI cost",
  "inference",
  "API call",
  "credits",
  "quota exceeded",
  "maximum reached",
  "try again later",
  "upgrade required",
  "pay to unlock",
  "buy more",
] as const;

/**
 * ALWAYS use these framings instead:
 */
export const APPROVED_COPY = {
  limitReached: {
    // Soft scarcity framing
    monthly: "Resets next month",
    upgrade: "Unlock deeper analysis",
    momentum: "Upgrade to keep momentum",
    progression: "Level up your hunting",
  },
  upgradeFraming: {
    // Identity-based (NOT transactional)
    scout: "Join the serious hunters",
    hunter: "Commit to quality harvests",
    trophy: "Pursue trophy-class excellence",
    outfitter: "Go professional",
  },
  valueProposition: {
    // What they GET, not what they PAY
    scout: "Unlimited field decisions",
    hunter: "Deep analysis for every hunt",
    trophy: "Full B&C scoring power",
    outfitter: "Professional-grade toolkit",
  },
} as const;

// ============================================================================
// PAYWALL UX RULES
// ============================================================================

export const PAYWALL_RULES = {
  /**
   * NEVER interrupt value delivery
   * First successful action must ALWAYS complete
   * Paywalls appear ONLY after results are shown
   */
  interruptionPolicy: "after_value_delivery" as const,

  /**
   * NO time-based full access trials by default
   * Allowed only as: invite-only, founder access, event-based
   */
  trialPolicy: "no_time_trials" as const,

  /**
   * NO countdown timers or panic-driven urgency
   */
  urgencyTactics: "prohibited" as const,

  /**
   * Pricing must be visible upfront
   * Never hide pricing until after heavy usage
   */
  pricingVisibility: "always_visible" as const,
} as const;

// ============================================================================
// ANALYTICS REQUIREMENTS
// ============================================================================

export const ANALYTICS_EVENTS = {
  // Usage tracking
  FEATURE_USED: "feature_used",
  LIMIT_ENCOUNTERED: "limit_encountered",
  PAYWALL_SHOWN: "paywall_shown",
  UPGRADE_TAPPED: "upgrade_tapped",
  PURCHASE_COMPLETED: "purchase_completed",
  PURCHASE_CANCELLED: "purchase_cancelled",

  // Margin safety
  HIGH_USAGE_WARNING: "high_usage_warning",
  TIER_MARGIN_BREACH: "tier_margin_breach",

  // Virality
  RESULT_SHARED: "result_shared",
  SCREENSHOT_DETECTED: "screenshot_detected",
} as const;

// ============================================================================
// VIRALITY RULES
// ============================================================================

export const VIRALITY_RULES = {
  /**
   * Shareable artifacts must:
   * - NOT trigger additional AI calls
   * - Include subtle branding watermark
   * - Function without login friction
   */
  shareableArtifacts: {
    requiresAI: false,
    includeBranding: true,
    requiresLogin: false,
  },

  /**
   * ALLOWED viral mechanics
   */
  allowed: [
    "screenshot_sharing",
    "image_export",
    "social_proof_badges",
    "result_card_sharing",
  ],

  /**
   * PROHIBITED viral mechanics
   */
  prohibited: [
    "referral_rewards_for_obsession_features",
    "viral_mechanics_that_increase_inference",
    "unlimited_access_referral_codes",
  ],
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the tier that includes a specific feature at a minimum level
 */
export function getMinimumTierForFeature(
  feature: FeatureType,
  minimumUses: number = 1
): TierId {
  for (const tierId of TIER_ORDER) {
    const tier = TIERS[tierId];
    let limit: number | "unlimited";

    switch (feature) {
      case "quick_check":
        limit = tier.limits.quickCheck;
        break;
      case "age_my_deer":
        limit = tier.limits.ageMyDeer;
        break;
      case "score_my_rack":
        limit = tier.limits.scoreMyRack;
        break;
    }

    if (limit === "unlimited" || limit >= minimumUses) {
      return tierId;
    }
  }

  return "outfitter"; // Highest tier always has access
}

/**
 * Check if a tier has access to a feature
 */
export function tierHasFeatureAccess(
  tierId: TierId,
  feature: FeatureType
): boolean {
  const tier = TIERS[tierId];
  let limit: number | "unlimited";

  switch (feature) {
    case "quick_check":
      limit = tier.limits.quickCheck;
      break;
    case "age_my_deer":
      limit = tier.limits.ageMyDeer;
      break;
    case "score_my_rack":
      limit = tier.limits.scoreMyRack;
      break;
  }

  return limit === "unlimited" || limit > 0;
}

/**
 * Get upgrade recommendation based on feature usage
 */
export function getUpgradeRecommendation(
  currentTier: TierId,
  featureUsage: { quickCheck: number; ageMyDeer: number; scoreMyRack: number }
): TierId | null {
  const tierIndex = TIER_ORDER.indexOf(currentTier);

  // Already at highest tier
  if (tierIndex >= TIER_ORDER.length - 1) {
    return null;
  }

  const current = TIERS[currentTier];

  // Check if user is hitting limits
  const hittingQuickCheck =
    current.limits.quickCheck !== "unlimited" &&
    featureUsage.quickCheck >= current.limits.quickCheck * 0.8;

  const hittingAge =
    featureUsage.ageMyDeer >= current.limits.ageMyDeer * 0.8;

  const needsScoring =
    featureUsage.scoreMyRack > 0 && current.limits.scoreMyRack === 0;

  if (hittingQuickCheck || hittingAge || needsScoring) {
    // Find the next tier that satisfies their usage
    for (let i = tierIndex + 1; i < TIER_ORDER.length; i++) {
      const nextTier = TIERS[TIER_ORDER[i]];

      const satisfiesQuickCheck =
        nextTier.limits.quickCheck === "unlimited" ||
        nextTier.limits.quickCheck > featureUsage.quickCheck;

      const satisfiesAge = nextTier.limits.ageMyDeer > featureUsage.ageMyDeer;

      const satisfiesScoring =
        !needsScoring || nextTier.limits.scoreMyRack > 0;

      if (satisfiesQuickCheck && satisfiesAge && satisfiesScoring) {
        return TIER_ORDER[i];
      }
    }

    return TIER_ORDER[TIER_ORDER.length - 1]; // Recommend highest
  }

  return null;
}

/**
 * Format limit display (never show technical terms)
 */
export function formatLimitDisplay(
  limit: number | "unlimited",
  isLifetime: boolean
): string {
  if (limit === "unlimited") {
    return "Unlimited";
  }

  if (isLifetime) {
    return `${limit} total`;
  }

  return `${limit}/month`;
}

/**
 * Get soft-scarcity copy when limit is reached
 */
export function getLimitReachedCopy(
  feature: FeatureType,
  currentTier: TierId
): { title: string; subtitle: string; cta: string } {
  const tier = TIERS[currentTier];
  const nextTier = getMinimumTierForFeature(feature, 1);
  const nextTierDef = TIERS[nextTier];

  // Feature-specific titles with soft framing
  const featureTitles: Record<FeatureType, string> = {
    quick_check: "Ready for more Quick Checks?",
    age_my_deer: "Ready to analyze more deer?",
    score_my_rack: "Ready for more B&C scoring?",
  };

  if (tier.limitType === "monthly") {
    return {
      title: featureTitles[feature],
      subtitle: APPROVED_COPY.limitReached.monthly,
      cta: APPROVED_COPY.upgradeFraming[nextTier as keyof typeof APPROVED_COPY.upgradeFraming] ||
        `Join ${nextTierDef.displayName}`,
    };
  }

  // Lifetime (free tier)
  return {
    title: `You have explored ${feature.replace(/_/g, " ")}`,
    subtitle: APPROVED_COPY.limitReached.progression,
    cta: APPROVED_COPY.upgradeFraming[nextTier as keyof typeof APPROVED_COPY.upgradeFraming] ||
      `Join ${nextTierDef.displayName}`,
  };
}

/**
 * Validate copy against prohibited terms
 * Returns true if copy is compliant
 */
export function validateCopy(text: string): boolean {
  const lowerText = text.toLowerCase();
  return !PROHIBITED_COPY.some((term) => lowerText.includes(term.toLowerCase()));
}

// ============================================================================
// SUCCESS DEFINITION
// ============================================================================

/**
 * This app is successful only if:
 * - Users describe it as "surprisingly generous"
 * - Paid users feel relief, not pressure
 * - Investors say: "This company understands unit economics better than most AI startups"
 */
export const SUCCESS_METRICS = {
  userPerception: "surprisingly_generous",
  paidUserFeeling: "relief_not_pressure",
  investorConfidence: "superior_unit_economics",
} as const;
