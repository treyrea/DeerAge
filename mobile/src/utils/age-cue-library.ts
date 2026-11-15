/**
 * Age Cue Library
 * Expert visual criteria for aging whitetail deer by body characteristics
 */

import { AgeCueName, AgeBand } from "../types/deer-scoring";

export interface CueDefinition {
  name: AgeCueName;
  displayName: string;
  ageClass: AgeBand;
  patterns: string[];
  explanationTemplate: string;
}

/**
 * Age cue definitions organized by age class
 * Based on expert hunter and biologist visual criteria
 */
export const AGE_CUE_LIBRARY: Record<AgeBand, CueDefinition[]> = {
  "1.5-2.5 years": [
    {
      name: "leg_proportion",
      displayName: "Leg Proportions",
      ageClass: "1.5-2.5 years",
      patterns: ["Long legs look too tall for body", "Legs appear disproportionately long"],
      explanationTemplate:
        "Young bucks often have legs that look too long for their body, giving them a gangly appearance. This is a strong indicator of a yearling (1.5 years).",
    },
    {
      name: "chest_depth",
      displayName: "Chest Depth",
      ageClass: "1.5-2.5 years",
      patterns: ["Narrow chest", "Shallow chest depth"],
      explanationTemplate:
        "A narrow, shallow chest indicates a young deer that has not yet developed the deep chest mass characteristic of mature bucks.",
    },
    {
      name: "neck_thickness",
      displayName: "Neck Thickness",
      ageClass: "1.5-2.5 years",
      patterns: ["Slim neck even in rut", "Thin neck year-round"],
      explanationTemplate:
        "Young bucks have thin necks that remain slim even during the rut. Mature bucks develop thick, muscular necks that merge into the shoulders.",
    },
    {
      name: "rump_ham",
      displayName: "Hindquarters",
      ageClass: "1.5-2.5 years",
      patterns: ["Thin hindquarters", "Underdeveloped rump"],
      explanationTemplate:
        "Young deer have thin, underdeveloped hindquarters that lack the muscular fullness seen in mature animals.",
    },
    {
      name: "brisket",
      displayName: "Brisket",
      ageClass: "1.5-2.5 years",
      patterns: ["No brisket", "Flat chest line"],
      explanationTemplate:
        "Young bucks lack the prominent brisket (chest droop) that develops as deer mature. The chest line remains relatively flat.",
    },
    {
      name: "backline",
      displayName: "Backline",
      ageClass: "1.5-2.5 years",
      patterns: ["Backline arched up", "No sag in back"],
      explanationTemplate:
        "Young deer typically have an arched or level backline with no sag. Older bucks often develop a swayed back.",
    },
    {
      name: "face_shape",
      displayName: "Face Shape",
      ageClass: "1.5-2.5 years",
      patterns: ["Face narrow", "Doe-like face"],
      explanationTemplate:
        'Young bucks have narrow, "doe-like" facial features. Mature bucks develop broader, more angular faces.',
    },
  ],

  "2.5-3.5 years": [
    {
      name: "leg_proportion",
      displayName: "Leg Proportions",
      ageClass: "2.5-3.5 years",
      patterns: ["Racehorse look", "Legs still appear long"],
      explanationTemplate:
        "At 2.5 years, bucks have a lean, athletic \"racehorse\" appearance. Legs still look relatively long compared to body depth.",
    },
    {
      name: "waist_tuck",
      displayName: "Waist Definition",
      ageClass: "2.5-3.5 years",
      patterns: ["Waist narrower than chest", "Visible waist tuck"],
      explanationTemplate:
        "The waist is noticeably narrower than the chest, creating a tucked appearance. This athletic build is characteristic of 2.5-3.5 year old bucks.",
    },
    {
      name: "neck_thickness",
      displayName: "Neck Thickness",
      ageClass: "2.5-3.5 years",
      patterns: ["Slight neck swelling in rut", "Moderate neck development"],
      explanationTemplate:
        "During the rut, 2.5-3.5 year old bucks show some neck swelling, but it remains distinct from the shoulders. Not yet fully merged.",
    },
    {
      name: "brisket",
      displayName: "Brisket",
      ageClass: "2.5-3.5 years",
      patterns: ["Minimal brisket", "Slight chest droop starting"],
      explanationTemplate:
        "A small brisket may be starting to form, but it remains minimal. The chest is deepening but not yet fully developed.",
    },
    {
      name: "backline",
      displayName: "Backline",
      ageClass: "2.5-3.5 years",
      patterns: ["Backline mostly flat", "Level back"],
      explanationTemplate:
        "The backline remains mostly flat and level. Any sag is very slight. Mature bucks will develop more pronounced swaying.",
    },
  ],

  "3.5-4.5 years": [
    {
      name: "neck_thickness",
      displayName: "Neck Thickness",
      ageClass: "3.5-4.5 years",
      patterns: ["Neck merges into chest during rut", "Thick neck development"],
      explanationTemplate:
        "At 3.5-4.5 years, the neck becomes thick and merges smoothly into the chest during rut. This is a key indicator of a mature, shooter-class buck.",
    },
    {
      name: "chest_depth",
      displayName: "Chest Depth",
      ageClass: "3.5-4.5 years",
      patterns: ["Chest deepens", "Full chest development"],
      explanationTemplate:
        "The chest has deepened significantly, giving the buck a more powerful, muscular appearance from the side.",
    },
    {
      name: "waist_tuck",
      displayName: "Waist Definition",
      ageClass: "3.5-4.5 years",
      patterns: ["Waist still slightly tucked", "Moderate waist definition"],
      explanationTemplate:
        "Some waist definition remains but is less pronounced than in younger bucks. The body is filling out but not yet pot-bellied.",
    },
    {
      name: "brisket",
      displayName: "Brisket",
      ageClass: "3.5-4.5 years",
      patterns: ["Small brisket starts", "Visible brisket formation"],
      explanationTemplate:
        "A visible brisket is forming, creating a noticeable droop in the chest line. This indicates the buck is entering maturity.",
    },
    {
      name: "backline",
      displayName: "Backline",
      ageClass: "3.5-4.5 years",
      patterns: ["Backline mostly level", "Slight back sag may begin"],
      explanationTemplate:
        "The backline remains mostly level, though some bucks may start showing slight swaying. Still relatively straight compared to older deer.",
    },
    {
      name: "muscle_definition",
      displayName: "Muscle Definition",
      ageClass: "3.5-4.5 years",
      patterns: ["Muscle definition increases", "Well-muscled appearance"],
      explanationTemplate:
        "Muscle definition in the shoulders, chest, and hindquarters is clearly visible. The buck has a powerful, athletic build.",
    },
  ],

  "4.5-5.5 years": [
    {
      name: "chest_depth",
      displayName: "Chest Depth",
      ageClass: "4.5-5.5 years",
      patterns: ["Full chest", "Very deep chest"],
      explanationTemplate:
        "The chest is fully developed and very deep. This mature buck has maximum chest mass, giving him a powerful front-heavy appearance.",
    },
    {
      name: "brisket",
      displayName: "Brisket",
      ageClass: "4.5-5.5 years",
      patterns: ["Brisket evident", "Pronounced chest droop"],
      explanationTemplate:
        "A prominent brisket is clearly visible, creating a significant droop in the chest line. This is characteristic of mature bucks 4.5+ years.",
    },
    {
      name: "neck_thickness",
      displayName: "Neck Thickness",
      ageClass: "4.5-5.5 years",
      patterns: ["Neck is thick", "Neck merges fully into shoulder"],
      explanationTemplate:
        "The neck is very thick and merges completely into the shoulders, creating a seamless, muscular profile. A hallmark of mature bucks.",
    },
    {
      name: "backline",
      displayName: "Backline",
      ageClass: "4.5-5.5 years",
      patterns: ["Backline and belly line nearly level", "Minimal back sag"],
      explanationTemplate:
        "The backline and belly line are approaching the same level. The body is full and rounded, though not yet extremely swayed.",
    },
    {
      name: "leg_proportion",
      displayName: "Leg Proportions",
      ageClass: "4.5-5.5 years",
      patterns: ["Legs start to look short relative to body", "Body depth exceeds leg length"],
      explanationTemplate:
        "The body has become so deep and massive that the legs appear short in proportion. This is opposite of young bucks with their long-legged look.",
    },
    {
      name: "face_shape",
      displayName: "Face Shape",
      ageClass: "4.5-5.5 years",
      patterns: ["Head/face blockier", "Angular mature face"],
      explanationTemplate:
        "The face has become broader and more angular with age. Mature bucks have distinctly blocky, masculine facial features.",
    },
  ],

  "5.5+ years": [
    {
      name: "backline",
      displayName: "Backline",
      ageClass: "5.5+ years",
      patterns: ["Swayed backline", "Pronounced back sag"],
      explanationTemplate:
        "Older bucks often develop a noticeably swayed back. The spine dips in the middle, pushing age estimation higher.",
    },
    {
      name: "belly",
      displayName: "Belly",
      ageClass: "5.5+ years",
      patterns: ["Pot belly", "Rounded belly line"],
      explanationTemplate:
        "A pot belly is common in bucks 5.5+ years. The belly line sags and rounds, sometimes nearly level with or below the backline.",
    },
    {
      name: "brisket",
      displayName: "Brisket",
      ageClass: "5.5+ years",
      patterns: ["Pronounced brisket", "Heavy chest droop"],
      explanationTemplate:
        "The brisket is very pronounced, creating a significant droop. This heavy chest mass is a clear sign of an old, mature buck.",
    },
    {
      name: "chest_depth",
      displayName: "Chest Depth",
      ageClass: "5.5+ years",
      patterns: ["Front-heavy mass", "Barrel-chested appearance"],
      explanationTemplate:
        "The buck appears front-heavy with massive chest development. Combined with a pot belly, this creates a barrel-like body shape.",
    },
    {
      name: "face_shape",
      displayName: "Face Shape",
      ageClass: "5.5+ years",
      patterns: ["Thicker, darker face", "Weathered appearance"],
      explanationTemplate:
        "The face is thick, often darker in color, and may have a weathered appearance. Old bucks have distinctive, battle-hardened faces.",
    },
    {
      name: "leg_proportion",
      displayName: "Leg Proportions",
      ageClass: "5.5+ years",
      patterns: ["Legs look short", "Stocky, short-legged profile"],
      explanationTemplate:
        "The body mass is so great that the legs appear very short and stocky. The buck has a low-slung, heavy appearance.",
    },
  ],
};

/**
 * Get all cues for a specific age class
 */
export const getCuesForAgeClass = (ageClass: AgeBand): CueDefinition[] => {
  return AGE_CUE_LIBRARY[ageClass] || [];
};

/**
 * Get a specific cue definition by name and age class
 */
export const getCueDefinition = (
  cueName: AgeCueName,
  ageClass: AgeBand
): CueDefinition | undefined => {
  const cues = AGE_CUE_LIBRARY[ageClass] || [];
  return cues.find((cue) => cue.name === cueName);
};

/**
 * Get explanation text for a detected cue
 */
export const getCueExplanation = (
  cueName: AgeCueName,
  detectedPattern: string,
  confidence: number,
  estimatedAge: AgeBand
): string => {
  // Try to find the cue definition for the estimated age band
  let cue = getCueDefinition(cueName, estimatedAge);

  // If not found, search through all age bands as a fallback
  if (!cue) {
    const allAgeBands: AgeBand[] = [
      "1.5-2.5 years",
      "2.5-3.5 years",
      "3.5-4.5 years",
      "4.5-5.5 years",
      "5.5+ years",
    ];

    for (const ageBand of allAgeBands) {
      cue = getCueDefinition(cueName, ageBand);
      if (cue) break;
    }
  }

  // If still not found, return a generic explanation
  if (!cue) {
    return `This body feature (${cueName.replace(/_/g, " ")}) was analyzed but no specific explanation is available for the detected pattern.`;
  }

  return cue.explanationTemplate;
};
