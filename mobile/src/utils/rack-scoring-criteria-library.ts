/**
 * Rack Scoring Criteria Library
 *
 * This library provides explanations for different B&C scoring components,
 * similar to the age-cue-library for age analysis.
 *
 * Each criterion explains why a measurement matters for the overall score.
 */

export interface RackScoringCriterion {
  name: string;
  displayName: string;
  category: "main_beam" | "tines" | "mass" | "spread" | "abnormal" | "symmetry";
  explanationTemplate: string;
  scoringWeight: "high" | "medium" | "low";
  whyItMatters: string;
}

export const RACK_SCORING_CRITERIA: RackScoringCriterion[] = [
  // Main Beam Criteria
  {
    name: "main_beam_length",
    displayName: "Main Beam Length",
    category: "main_beam",
    explanationTemplate: "The main beams are the primary antler structure extending from the base. Longer main beams indicate exceptional genetics and maturity, typically found in 4.5+ year old bucks.",
    scoringWeight: "high",
    whyItMatters: "Main beam length is one of the four major components of the B&C score and contributes significantly to both gross and net scores. Trophy class bucks typically have main beams exceeding 20 inches."
  },
  {
    name: "main_beam_symmetry",
    displayName: "Main Beam Symmetry",
    category: "symmetry",
    explanationTemplate: "Symmetry between left and right main beams affects your net score. The difference between sides is deducted from your gross score.",
    scoringWeight: "high",
    whyItMatters: "Large asymmetries (>2 inches) indicate irregular growth and result in significant deductions. Balanced genetics produce more symmetrical antlers."
  },

  // Tine Criteria
  {
    name: "g1_brow_tines",
    displayName: "G1 (Brow Tines)",
    category: "tines",
    explanationTemplate: "G1 brow tines are the first points closest to the skull. Well-developed brow tines (4-8 inches) are common in mature bucks and add substantial inches to the total score.",
    scoringWeight: "medium",
    whyItMatters: "Brow tines contribute to the overall mass appearance and score. Missing or small brow tines create symmetry deductions if unmatched."
  },
  {
    name: "g2_tines",
    displayName: "G2 Tines",
    category: "tines",
    explanationTemplate: "G2 tines are typically the longest points on a whitetail rack. Trophy bucks often have G2s exceeding 10 inches, making them the highest-scoring individual tine measurement.",
    scoringWeight: "high",
    whyItMatters: "G2 length is a hallmark of a mature, high-scoring buck. Hunters often judge rack quality by the G2 length first."
  },
  {
    name: "g3_tines",
    displayName: "G3 Tines",
    category: "tines",
    explanationTemplate: "G3 tines are the third set of points. Strong G3s (8-11 inches) indicate excellent genetics and contribute significantly to gross score.",
    scoringWeight: "medium",
    whyItMatters: "G3 development separates good racks from great ones. Well-formed G3s add visual appeal and scoring inches."
  },
  {
    name: "g4_plus_tines",
    displayName: "G4+ Tines",
    category: "tines",
    explanationTemplate: "G4, G5, and G6 tines represent exceptional antler development. These additional points are less common and indicate superior genetics and age (typically 5.5+ years).",
    scoringWeight: "medium",
    whyItMatters: "Higher point counts with long G4+ tines push bucks into trophy class. These measurements can add 10-20+ inches to the gross score."
  },
  {
    name: "tine_symmetry",
    displayName: "Tine Symmetry",
    category: "symmetry",
    explanationTemplate: "Matching tine lengths between left and right sides is critical for net score. Each inch of difference per tine is deducted from your gross score.",
    scoringWeight: "high",
    whyItMatters: "Multiple asymmetrical tines can result in 5-15+ inches of deductions. Symmetrical racks are rarer and more valuable."
  },

  // Mass Criteria
  {
    name: "h1_base_circumference",
    displayName: "H1 (Base Circumference)",
    category: "mass",
    explanationTemplate: "H1 is measured at the smallest point between the burr and the first point. Heavy bases (4.5-6 inches) indicate maturity and good nutrition.",
    scoringWeight: "medium",
    whyItMatters: "Base circumference is the largest mass measurement and contributes significantly to the mass total. Thick bases are a sign of a mature buck."
  },
  {
    name: "h2_h4_circumferences",
    displayName: "H2-H4 Circumferences",
    category: "mass",
    explanationTemplate: "H2, H3, and H4 are measured at the smallest points between successive tines. Maintaining mass throughout the beam indicates superior genetics.",
    scoringWeight: "medium",
    whyItMatters: "Consistent mass measurements (4+ inches) throughout the rack add up quickly. Four circumferences per side can contribute 30-40+ inches to the total score."
  },
  {
    name: "mass_symmetry",
    displayName: "Mass Symmetry",
    category: "symmetry",
    explanationTemplate: "Circumference differences between left and right sides are deducted. Balanced mass indicates even antler development.",
    scoringWeight: "medium",
    whyItMatters: "Mass symmetry is often overlooked but can result in 2-5 inches of deductions if uneven."
  },

  // Spread Criteria
  {
    name: "inside_spread",
    displayName: "Inside Spread",
    category: "spread",
    explanationTemplate: "Inside spread is measured at the widest point between the main beams. Credit is given up to the length of the longest main beam.",
    scoringWeight: "medium",
    whyItMatters: "Wide spreads (18-24 inches) add visual appeal and scoring inches, but spreads exceeding the main beam length provide no additional credit."
  },
  {
    name: "spread_credit",
    displayName: "Spread Credit",
    category: "spread",
    explanationTemplate: "Spread credit is the lesser of inside spread or longest main beam. This prevents excessively wide racks from dominating the score.",
    scoringWeight: "medium",
    whyItMatters: "Optimal racks balance spread with main beam length. A 20-inch spread with 24-inch beams only credits 20 inches."
  },

  // Abnormal Points
  {
    name: "abnormal_points",
    displayName: "Abnormal Points",
    category: "abnormal",
    explanationTemplate: "Abnormal points are non-typical projections that do not follow the normal antler pattern. They are measured and added to non-typical scores.",
    scoringWeight: "high",
    whyItMatters: "Abnormal points exceeding 10 inches total shift the buck from Typical to Non-Typical scoring. Drop tines, stickers, and extra points can add significant inches but change the category."
  },

  // Overall Symmetry
  {
    name: "overall_symmetry",
    displayName: "Overall Symmetry",
    category: "symmetry",
    explanationTemplate: "Total symmetry deductions are the sum of all differences between left and right measurements. Lower deductions result in higher net scores.",
    scoringWeight: "high",
    whyItMatters: "Symmetry is the difference between a good gross score and an excellent net score. Minimizing deductions is crucial for B&C entry consideration."
  }
];

/**
 * Get explanation for a specific scoring component
 */
export function getCriterionExplanation(criterionName: string): RackScoringCriterion | undefined {
  return RACK_SCORING_CRITERIA.find(c => c.name === criterionName);
}

/**
 * Get all criteria for a specific category
 */
export function getCriteriaByCategory(category: RackScoringCriterion["category"]): RackScoringCriterion[] {
  return RACK_SCORING_CRITERIA.filter(c => c.category === category);
}

/**
 * Generate a contextual explanation based on actual measurements
 */
export function generateContextualExplanation(
  criterionName: string,
  measurement: number,
  confidence?: string
): string {
  const criterion = getCriterionExplanation(criterionName);
  if (!criterion) return "";

  let context = "";

  // Add measurement context
  if (criterionName === "main_beam_length") {
    if (measurement >= 24) context = "Exceptional length placing this in trophy class. ";
    else if (measurement >= 20) context = "Above average length indicating maturity. ";
    else if (measurement >= 17) context = "Solid length for a mature buck. ";
    else context = "Developing length, may indicate a younger deer. ";
  } else if (criterionName.includes("g2")) {
    if (measurement >= 11) context = "Outstanding G2 length - a hallmark of trophy genetics. ";
    else if (measurement >= 9) context = "Strong G2 development. ";
    else if (measurement >= 6) context = "Average G2 length. ";
    else context = "Short G2s, may indicate youth or genetics. ";
  } else if (criterionName.includes("circumference") || criterionName.includes("h1")) {
    if (measurement >= 5) context = "Heavy mass contributing significant inches. ";
    else if (measurement >= 4) context = "Good mass typical of mature bucks. ";
    else context = "Light mass. ";
  } else if (criterionName === "inside_spread") {
    if (measurement >= 22) context = "Wide spread adding visual appeal. ";
    else if (measurement >= 18) context = "Good spread width. ";
    else context = "Narrow spread. ";
  }

  // Add confidence context
  let confidenceNote = "";
  if (confidence === "LOW") {
    confidenceNote = " Note: This measurement has lower confidence - the angle or lighting may have affected accuracy.";
  }

  return context + criterion.explanationTemplate + confidenceNote;
}
