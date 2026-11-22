/**
 * Offline Age Guide scoring.
 *
 * Matches the live aging engine's body-cue rules as closely as a tap guide can:
 * one age class per step, a range when cues disagree, no age until enough body
 * traits are scored, and LET WALK / SHOOTER against the hunter's lease minimum.
 */

export const AGE_STEPS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5] as const;
export type AgeStep = (typeof AGE_STEPS)[number];

export type TraitId = "neck" | "chest" | "backline" | "belly" | "legs" | "face" | "build";

export type ScoreValue = number | "skip";

export type TraitChoice = {
  value: ScoreValue;
  label: string;
  description: string;
  /** Shown on the right of the row. */
  ageIndication: string;
  /**
   * Point vote for an age class. omitted = no vote (skip, non-baby face, or a cap-only choice).
   */
  age?: AgeStep;
  /** Upper bound this choice allows, e.g. a level back is consistent with 1.5–4.5. */
  cap?: AgeStep;
};

export type TraitDef = {
  id: TraitId;
  name: string;
  icon: string;
  description: string;
  /** Counts toward the "3 body traits (or neck + 2)" rule. */
  body: boolean;
  /** Neck is a strong rut cue but cannot set the age alone. */
  neck: boolean;
  scores: TraitChoice[];
};

export const TRAITS: TraitDef[] = [
  {
    id: "neck",
    name: "Neck",
    icon: "fitness",
    description: "A strong rut cue, but it can't set the age alone. Out of the rut it can mislead.",
    body: false,
    neck: true,
    scores: [
      { value: 1, label: "Thin", description: "Barely wider than the head", ageIndication: "1.5", age: 1.5 },
      { value: 2, label: "Slight swelling", description: "Some neck, still distinct from the shoulders", ageIndication: "2.5", age: 2.5 },
      { value: 3, label: "Thick, junction visible", description: "Thick, but you can still see where it meets the shoulders", ageIndication: "3.5", age: 3.5 },
      { value: 4, label: "Blends into shoulders", description: "The neck and shoulders start to read as one", ageIndication: "4.5", age: 4.5 },
      { value: 5, label: "Neck and brisket one mass", description: "No break between the neck, shoulders, and brisket", ageIndication: "5.5+", age: 5.5 },
    ],
  },
  {
    id: "chest",
    name: "Chest & brisket",
    icon: "body",
    description: "Judge the chest together with the waist.",
    body: true,
    neck: false,
    scores: [
      { value: 1, label: "Shallow", description: "Narrow, athletic chest", ageIndication: "1.5", age: 1.5 },
      { value: 2, label: "Developing", description: "Some depth starting to show", ageIndication: "2.5", age: 2.5 },
      { value: 3, label: "Deep, lean waist", description: "Deep chest with a lean waist — the racehorse look", ageIndication: "3.5", age: 3.5 },
      { value: 4, label: "Deep, belly level with it", description: "Full, heavy chest and the belly sits at the same line", ageIndication: "4.5", age: 4.5 },
      { value: 5, label: "Front half one large mass", description: "Chest, brisket, and shoulders read as one heavy front end", ageIndication: "5.5+", age: 5.5 },
    ],
  },
  {
    id: "backline",
    name: "Back line",
    icon: "trending-up",
    description: "The top line from the shoulders to the hips. A level back is normal through 4.5.",
    body: true,
    neck: false,
    scores: [
      {
        value: 1,
        label: "Level / taut",
        description: "Smooth and level. This is normal from a yearling through 4.5, so it does not pick a single age.",
        ageIndication: "Through 4.5",
        cap: 4.5,
      },
      { value: 2, label: "Slight dip", description: "A sag starting to show behind the shoulders", ageIndication: "5.5+", age: 5.5 },
      { value: 3, label: "Deeply swayed", description: "A clear sway. This is an old, past-prime buck.", ageIndication: "6.5+", age: 6.5 },
    ],
  },
  {
    id: "belly",
    name: "Belly & waist",
    icon: "ellipse",
    description: "A gentle taper toward the hind legs is not a tuck.",
    body: true,
    neck: false,
    scores: [
      { value: 1, label: "Clear tuck", description: "A tight, athletic waist", ageIndication: "1.5", age: 1.5 },
      { value: 2, label: "Small tuck", description: "Still tight, with a smaller tuck", ageIndication: "2.5", age: 2.5 },
      { value: 3, label: "Lean waist", description: "Chest is deeper than the waist, no sag", ageIndication: "3.5", age: 3.5 },
      { value: 4, label: "Belly level, no tuck, no sag", description: "The belly sits level with the chest", ageIndication: "4.5", age: 4.5 },
      { value: 5, label: "Sagging / pot belly", description: "The belly hangs. This is a 5.5+ sign.", ageIndication: "5.5+", age: 5.5 },
    ],
  },
  {
    id: "legs",
    name: "Legs",
    icon: "pause",
    description: "Leg length relative to the body. Skip if the lower legs are hidden.",
    body: true,
    neck: false,
    scores: [
      { value: 1, label: "Rangy", description: "Very long legs for the body", ageIndication: "1.5", age: 1.5 },
      { value: 2, label: "Long", description: "Legs still look long", ageIndication: "2.5", age: 2.5 },
      { value: 3, label: "Proportionate", description: "The right length for the body", ageIndication: "3.5", age: 3.5 },
      { value: 4, label: "Slightly short", description: "A deeper body makes the legs look a little short", ageIndication: "4.5", age: 4.5 },
      { value: 5, label: "Short", description: "A heavy body, short-looking legs", ageIndication: "5.5+", age: 5.5 },
      { value: "skip", label: "Skip", description: "Lower legs are hidden. Don't guess.", ageIndication: "Skip" },
    ],
  },
  {
    id: "face",
    name: "Face",
    icon: "happy",
    description: "Only a baby face is used for age, and only as a yearling check. It can't set the age alone.",
    body: false,
    neck: false,
    scores: [
      { value: 1, label: "Baby face", description: "Short, narrow, doe-like snout. Likely a yearling.", ageIndication: "Likely 1.5", age: 1.5 },
      { value: 2, label: "Not a yearling face", description: "Anything else. Face shape past 1.5 is not a reliable age marker, so this is not used for the age.", ageIndication: "Not used" },
    ],
  },
  {
    id: "build",
    name: "Overall build",
    icon: "flash",
    description: "The whole body, not muscle cuts.",
    body: true,
    neck: false,
    scores: [
      { value: 1, label: "Doe-like, sleek", description: "Sleek, no muscle definition. Looks like a doe with antlers.", ageIndication: "1.5", age: 1.5 },
      { value: 2, label: "Lean", description: "Still light, starting to fill out", ageIndication: "2.5", age: 2.5 },
      { value: 3, label: "Athletic racehorse", description: "Fit and tight, deep chest, lean waist", ageIndication: "3.5", age: 3.5 },
      { value: 4, label: "Full-bodied", description: "Lost the racehorse look. Heavier through the body.", ageIndication: "4.5", age: 4.5 },
      { value: 5, label: "Rounded, “small cow”", description: "A rounded, heavy body", ageIndication: "5.5+", age: 5.5 },
    ],
  },
];

export const TOTAL_TRAITS = TRAITS.length;

export type FieldCall = "SHOOTER" | "LET WALK" | "BORDERLINE";

export type GuideResult = {
  scoredCount: number;
  totalCriteria: number;
  bodyCount: number;
  neckScored: boolean;
  ready: boolean;
  /** Age classes that actually voted (caps are applied separately). */
  votes: AgeStep[];
  cap: AgeStep | null;
  low: AgeStep | null;
  high: AgeStep | null;
  ageLabel: string | null;
  cuesAgree: boolean | null;
  statusLine: string;
  fieldCall: FieldCall | null;
  fieldCallNote: string | null;
  leaseMinimum: number;
};

const EN_DASH = "–";

export function formatAgeStep(step: AgeStep): string {
  if (step >= 6.5) return "6.5+";
  if (step >= 5.5) return "5.5+";
  return step.toFixed(1);
}

export function formatAgeRange(low: AgeStep, high: AgeStep): string {
  if (low === high) return formatAgeStep(low);
  return `${formatAgeStep(low).replace(/\+$/, "")}${EN_DASH}${formatAgeStep(high)}`;
}

export function nearestStep(years: number): AgeStep {
  let picked: AgeStep = AGE_STEPS[0];
  for (const step of AGE_STEPS) {
    if (years + 0.001 >= step) picked = step;
  }
  return picked;
}

function choiceOf(trait: TraitDef, value: ScoreValue | undefined): TraitChoice | undefined {
  if (value == null) return undefined;
  return trait.scores.find((row) => row.value === value);
}

/** How many body traits (and whether the neck) are actually usable for an age. */
export function traitCounts(scores: Partial<Record<TraitId, ScoreValue>>): {
  scoredCount: number;
  bodyCount: number;
  neckScored: boolean;
} {
  let scoredCount = 0;
  let bodyCount = 0;
  let neckScored = false;
  for (const trait of TRAITS) {
    const choice = choiceOf(trait, scores[trait.id]);
    if (!choice) continue;
    scoredCount += 1;
    if (choice.value === "skip") continue;
    if (trait.body) bodyCount += 1;
    if (trait.neck) neckScored = true;
  }
  return { scoredCount, bodyCount, neckScored };
}

/** Enough to show an age: 3 body traits, or the neck plus 2 body traits. */
export function hasEnoughTraits(scores: Partial<Record<TraitId, ScoreValue>>): boolean {
  const { bodyCount, neckScored } = traitCounts(scores);
  return bodyCount >= 3 || (neckScored && bodyCount >= 2);
}

export function collectVotes(scores: Partial<Record<TraitId, ScoreValue>>): {
  votes: AgeStep[];
  cap: AgeStep | null;
} {
  const votes: AgeStep[] = [];
  let cap: AgeStep | null = null;
  for (const trait of TRAITS) {
    const choice = choiceOf(trait, scores[trait.id]);
    if (!choice || choice.value === "skip") continue;
    if (choice.age != null) votes.push(choice.age);
    if (choice.cap != null) cap = cap == null ? choice.cap : (Math.min(cap, choice.cap) as AgeStep);
  }
  return { votes, cap };
}

/**
 * Combine point votes with an optional cap (a level back does not raise a young
 * deer, but conflicts with a 5.5+ cue and widens the range).
 */
export function combineAges(votes: AgeStep[], cap: AgeStep | null): { low: AgeStep; high: AgeStep } | null {
  if (votes.length === 0) {
    return null;
  }
  let low = Math.min(...votes) as AgeStep;
  let high = Math.max(...votes) as AgeStep;
  if (cap != null && high > cap) {
    // Conflict: some cues stay at or under the cap, others are older.
    low = Math.min(low, cap) as AgeStep;
  } else if (cap != null && high <= cap) {
    // Cap does not raise the age.
  }
  return { low, high };
}

export function fieldCallFor(
  low: AgeStep,
  high: AgeStep,
  minimum: number,
): { fieldCall: FieldCall; fieldCallNote: string } {
  const lease = nearestStep(minimum);
  const leaseLabel = formatAgeStep(lease);
  const ageClass = formatAgeRange(low, high);
  if (low >= lease) {
    return {
      fieldCall: "SHOOTER",
      fieldCallNote: `Reads ${ageClass}, at or above your lease minimum of ${leaseLabel}. This is a field read, not a jawbone age.`,
    };
  }
  if (high < lease) {
    return {
      fieldCall: "LET WALK",
      fieldCallNote: `Reads ${ageClass}, under your lease minimum of ${leaseLabel}. Let him walk. This is a field read, not a jawbone age.`,
    };
  }
  return {
    fieldCall: "BORDERLINE",
    fieldCallNote: `Could be ${ageClass}, and your minimum is ${leaseLabel}. Don't risk a young buck.`,
  };
}

export function scoreGuide(
  scores: Partial<Record<TraitId, ScoreValue>>,
  leaseMinimum = 4.5,
): GuideResult {
  const { scoredCount, bodyCount, neckScored } = traitCounts(scores);
  const { votes, cap } = collectVotes(scores);
  const ready = hasEnoughTraits(scores) && votes.length > 0;
  const combined = ready ? combineAges(votes, cap) : null;
  const lease = nearestStep(leaseMinimum);

  const base = {
    scoredCount,
    totalCriteria: TOTAL_TRAITS,
    bodyCount,
    neckScored,
    votes,
    cap,
    leaseMinimum: lease,
  };

  if (!combined) {
    const need = "Score 3 body traits, or the neck plus 2, to see an age.";
    return {
      ...base,
      ready: false,
      low: null,
      high: null,
      ageLabel: null,
      cuesAgree: null,
      statusLine: `${scoredCount} of ${TOTAL_TRAITS} scored`,
      fieldCall: null,
      fieldCallNote: scoredCount > 0 ? need : null,
    };
  }

  const { low, high } = combined;
  const cuesAgree = low === high;
  const ageLabel = formatAgeRange(low, high);
  const call = fieldCallFor(low, high, lease);
  return {
    ...base,
    ready: true,
    low,
    high,
    ageLabel,
    cuesAgree,
    statusLine: `${scoredCount} of ${TOTAL_TRAITS} scored, cues ${cuesAgree ? "agree" : "disagree"}`,
    fieldCall: call.fieldCall,
    fieldCallNote: call.fieldCallNote,
  };
}
