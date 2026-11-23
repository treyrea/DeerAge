/**
 * Offline Age Guide scoring.
 *
 * Matches the live aging engine's body-cue rules as closely as a tap guide can:
 * one age class per step, a range when cues disagree, no age until enough body
 * traits are scored, and LET WALK / SHOOTER against the hunter's lease minimum.
 */

export const AGE_STEPS = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5] as const;
export type AgeStep = (typeof AGE_STEPS)[number];

export type TraitId = "neck" | "chest" | "backline" | "belly" | "legs" | "build";

export type ScoreValue = number | "skip";

export type TraitChoice = {
  value: ScoreValue;
  label: string;
  description: string;
  /** Shown on the right of the row. */
  ageIndication: string;
  /**
   * Point vote for an age class. omitted = no vote (skip, or a cap-only choice).
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
  /** A pinned picture. The back line stays text-only so 6.5+ still has a vote. */
  picture: boolean;
  scores: TraitChoice[];
};

export const TRAITS: TraitDef[] = [
  {
    id: "neck",
    name: "Neck",
    icon: "fitness",
    description: "Neck swelling peaks in the rut. It can't set the age alone, and out of the rut it can mislead.",
    body: false,
    neck: true,
    picture: true,
    scores: [
      {
        value: 1,
        label: "Thin, no swelling",
        description: "Thin neck with a clear line where it meets the shoulders",
        ageIndication: "1.5",
        age: 1.5,
      },
      {
        value: 2,
        label: "Slight swelling",
        description: "Some rut swelling, still clearly separate from the shoulders",
        ageIndication: "2.5",
        age: 2.5,
      },
      {
        value: 3,
        label: "Swollen, still distinct from shoulders",
        description: "Heavily muscled, but you can still see where the neck meets the shoulders",
        ageIndication: "3.5",
        age: 3.5,
      },
      {
        value: 4,
        label: "Blends into shoulders",
        description: "Fully muscled; no clear line where neck meets shoulders",
        ageIndication: "4.5",
        age: 4.5,
      },
      {
        value: 5,
        label: "Neck and brisket appear as one",
        description: "Neck runs into the brisket with no break",
        ageIndication: "5.5+",
        age: 5.5,
      },
    ],
  },
  {
    id: "chest",
    name: "Chest & brisket",
    icon: "body",
    description: "Judge the chest together with the waist.",
    body: true,
    neck: false,
    picture: true,
    scores: [
      { value: 1, label: "Slim", description: "Slim, doe-like chest; little muscle", ageIndication: "1.5", age: 1.5 },
      {
        value: 2,
        label: "Some shoulder muscle",
        description: "Shoulders filling out; chest still slim",
        ageIndication: "2.5",
        age: 2.5,
      },
      {
        value: 3,
        label: "Deep chest, lean waist",
        description: "Deep chest with a lean waist — the racehorse look",
        ageIndication: "3.5",
        age: 3.5,
      },
      {
        value: 4,
        label: "Waist as deep as chest",
        description: "Belly line has dropped level with the chest",
        ageIndication: "4.5",
        age: 4.5,
      },
      {
        value: 5,
        label: "Front half one large mass",
        description: "Chest, brisket, and shoulders read as one heavy front end",
        ageIndication: "5.5+",
        age: 5.5,
      },
    ],
  },
  {
    id: "backline",
    name: "Back line",
    icon: "trending-up",
    description: "The top line from the shoulders to the hips. A level back is normal through 4.5.",
    body: true,
    neck: false,
    picture: false,
    scores: [
      {
        value: 1,
        label: "Straight and taut",
        description: "Smooth and level. This is normal from a yearling through 4.5, so it does not pick a single age.",
        ageIndication: "Through 4.5",
        cap: 4.5,
      },
      {
        value: 2,
        label: "Sagging back",
        description: "Back starting to sag behind the shoulders",
        ageIndication: "5.5+",
        age: 5.5,
      },
      {
        value: 3,
        label: "Swayed back",
        description: "Clear sway; shoulders look taller than hips. An old buck.",
        ageIndication: "6.5+",
        age: 6.5,
      },
    ],
  },
  {
    id: "belly",
    name: "Belly & waist",
    icon: "ellipse",
    description:
      "Look at the belly line from chest to hind legs. A slight upward slope is normal, not a tucked-up belly.",
    body: true,
    neck: false,
    picture: true,
    scores: [
      { value: 1, label: "Belly tucked up", description: "Thin waist, high flank", ageIndication: "1.5", age: 1.5 },
      {
        value: 2,
        label: "Thin waist",
        description: "Waist still thin in front of the hind legs",
        ageIndication: "2.5",
        age: 2.5,
      },
      {
        value: 3,
        label: "Lean waist",
        description: "Chest deeper than the waist; belly taut",
        ageIndication: "3.5",
        age: 3.5,
      },
      {
        value: 4,
        label: "Full belly, not sagging",
        description: "Waistline as deep as the chest",
        ageIndication: "4.5",
        age: 4.5,
      },
      {
        value: 5,
        label: "Belly often sags",
        description: "Belly hangs below the chest line",
        ageIndication: "5.5+",
        age: 5.5,
      },
    ],
  },
  {
    id: "legs",
    name: "Legs",
    icon: "pause",
    description:
      "How long the legs look next to the body (they look shorter as the chest deepens). Skip if the lower legs are hidden.",
    body: true,
    neck: false,
    picture: true,
    scores: [
      {
        value: 1,
        label: "Long and thin",
        description: "Legs look too long for the body",
        ageIndication: "1.5",
        age: 1.5,
      },
      { value: 2, label: "Long and lanky", description: "Legs still look too long", ageIndication: "2.5", age: 2.5 },
      {
        value: 3,
        label: "Right length for body",
        description: "The right length for the body",
        ageIndication: "3.5",
        age: 3.5,
      },
      {
        value: 4,
        label: "Legs in proportion",
        description: "A deeper body makes the legs look a little short",
        ageIndication: "4.5",
        age: 4.5,
      },
      {
        value: 5,
        label: "Look short for body",
        description: "Deep body makes legs look short",
        ageIndication: "5.5+",
        age: 5.5,
      },
      { value: "skip", label: "Skip", description: "Lower legs are hidden. Don't guess.", ageIndication: "Skip" },
    ],
  },
  {
    id: "build",
    name: "Overall build",
    icon: "flash",
    description: "Your first impression of the whole body.",
    body: true,
    neck: false,
    picture: true,
    scores: [
      {
        value: 1,
        label: "Doe with antlers",
        description: "Slim and dainty, little muscle definition",
        ageIndication: "1.5",
        age: 1.5,
      },
      {
        value: 2,
        label: "Sleek, lanky",
        description: "Bigger than a yearling, still not filled out",
        ageIndication: "2.5",
        age: 2.5,
      },
      {
        value: 3,
        label: "Racehorse look",
        description: "Fit and tight, deep chest, lean waist",
        ageIndication: "3.5",
        age: 3.5,
      },
      {
        value: 4,
        label: "Full-bodied",
        description: "Lost the racehorse look; near full adult body mass",
        ageIndication: "4.5",
        age: 4.5,
      },
      {
        value: 5,
        label: "Rounded, “small cow”",
        description: "A rounded, heavy body",
        ageIndication: "5.5+",
        age: 5.5,
      },
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

export function scoreGuide(scores: Partial<Record<TraitId, ScoreValue>>, leaseMinimum = 4.5): GuideResult {
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
