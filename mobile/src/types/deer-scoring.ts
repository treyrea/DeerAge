/**
 * Boone & Crockett Deer Scoring Types
 */

export type ConfidenceLevel = "Low" | "Med" | "High";

export type ScoreCategory = "Typical" | "Non-Typical";

export type AgeBand = "1.5-2.5 years" | "2.5-3.5 years" | "3.5-4.5 years" | "4.5-5.5 years" | "5.5+ years";

export interface MeasurementRange {
  min: number;
  max: number;
  average: number;
  confidence: ConfidenceLevel;
}

export interface TinePoint {
  length: number | MeasurementRange;
  side: "left" | "right";
  isAbnormal?: boolean;
}

export interface MainBeam {
  length: number | MeasurementRange;
  side: "left" | "right";
}

export interface CircumferenceMeasurement {
  h1?: number | MeasurementRange; // Between burr and G1
  h2?: number | MeasurementRange; // Between G1 and G2
  h3?: number | MeasurementRange; // Between G2 and G3
  h4?: number | MeasurementRange; // Between G3 and G4
}

export interface AntlerMeasurements {
  // Main beams
  rightMainBeam: MainBeam;
  leftMainBeam: MainBeam;

  // Tines (G1 = brow tine, G2 = bez/bay tine, G3 = trez tine, G4+ = royal points)
  rightG1?: TinePoint; // Brow tine
  rightG2?: TinePoint;
  rightG3?: TinePoint;
  rightG4?: TinePoint;
  rightG5?: TinePoint;
  rightG6?: TinePoint;

  leftG1?: TinePoint; // Brow tine
  leftG2?: TinePoint;
  leftG3?: TinePoint;
  leftG4?: TinePoint;
  leftG5?: TinePoint;
  leftG6?: TinePoint;

  // Abnormal points
  abnormalPoints: TinePoint[];

  // Circumference measurements (mass)
  rightCircumferences: CircumferenceMeasurement;
  leftCircumferences: CircumferenceMeasurement;

  // Spread measurements
  insideSpread: number | MeasurementRange;
  greatestSpread?: number | MeasurementRange;

  // Metadata
  totalPoints: number; // Total countable points
  leftSidePoints: number; // Points on left antler
  rightSidePoints: number; // Points on right antler
  totalAbnormalPoints: number;

  // AI Point Enumeration (for debugging/verification)
  pointEnumeration?: string; // The AI's step-by-step point counting explanation

  // Point locations for visualization (pixel coordinates)
  pointLocations?: Array<{
    x: number;
    y: number;
    label: string;
    type: "normal" | "abnormal";
  }>;
}

export interface BooneAndCrockettScore {
  // Category
  category: ScoreCategory;

  // Gross scores (before deductions)
  grossTypical: number | MeasurementRange;
  grossNonTypical: number | MeasurementRange;

  // Net scores (after deductions)
  netTypical: number | MeasurementRange;
  netNonTypical: number | MeasurementRange;

  // Deductions
  symmetryDeductions: number | MeasurementRange;
  abnormalPointsTotal: number | MeasurementRange;

  // Spread credit
  spreadCredit: number | MeasurementRange;

  // Component totals
  totalMainBeamLength: number | MeasurementRange;
  totalTineLength: number | MeasurementRange;
  totalMass: number | MeasurementRange;

  // Confidence
  overallConfidence: ConfidenceLevel;

  // Recommended category based on score
  recommendedCategory: ScoreCategory;

  // Detailed breakdown
  measurements: AntlerMeasurements;
}

export interface ScaleEstimation {
  method: "depth" | "multi-view" | "skull-prior" | "hybrid";
  pixelsPerInch: number;
  confidence: ConfidenceLevel;
  calibrationDistance?: number; // yards when provided via distance capture
}

export interface AgeEstimation {
  estimatedAge: AgeBand;
  confidence: ConfidenceLevel;
  factors: {
    bodySize: ConfidenceLevel;
    antlerMass: ConfidenceLevel;
    beamDiameter: ConfidenceLevel;
    neckSize: ConfidenceLevel;
  };
  regionalPrior?: string; // e.g., "Midwest mature", "Southern young"
}

// Explainable Age Estimation Types
export type AgeCueName =
  | "neck_thickness"
  | "chest_depth"
  | "brisket"
  | "backline"
  | "belly"
  | "leg_proportion"
  | "face_shape"
  | "rump_ham"
  | "waist_tuck"
  | "muscle_definition";

export interface AgeCue {
  name: AgeCueName;
  displayName: string;
  detectedPattern: string;
  confidence: number; // 0-100
  ageWeight: number; // -3 to +3, how much this pushes younger (-) or older (+)
  explanation: string;
}

// Explainable Rack Scoring Types
export type RackScoringCueName =
  | "main_beam_length"
  | "main_beam_symmetry"
  | "g1_brow_tines"
  | "g2_tines"
  | "g3_tines"
  | "g4_plus_tines"
  | "tine_symmetry"
  | "h1_base_circumference"
  | "h2_h4_circumferences"
  | "mass_symmetry"
  | "inside_spread"
  | "spread_credit"
  | "abnormal_points"
  | "overall_symmetry";

export interface RackScoringCue {
  name: RackScoringCueName;
  displayName: string;
  category: "main_beam" | "tines" | "mass" | "spread" | "abnormal" | "symmetry";
  detectedMeasurement: string; // e.g., "Right: 24.5\", Left: 23.8\""
  contribution: number; // How many inches this adds to score
  confidence: number; // 0-100
  explanation: string;
  scoringWeight: "high" | "medium" | "low";
}

export interface RackMeasurementOverlay {
  measurementId: string;
  name: string;
  boundingBox: {
    x: number; // percentage 0-100
    y: number; // percentage 0-100
    width: number; // percentage 0-100
    height: number; // percentage 0-100
  };
  label: string; // e.g., "G2: 11.2\" (95%)"
  confidence: number; // 0-100
  cue?: RackScoringCue;
}

export interface ExplainableRackScoring {
  // Primary B&C score
  grossScore: number;
  netScore: number;
  category: ScoreCategory;

  // B&C qualification
  qualifies: boolean;
  minimumThreshold: number; // 160 for Typical, 185 for Non-Typical

  // Explainability
  detectedCues: RackScoringCue[];
  rackMeasurementOverlays: RackMeasurementOverlay[];
  totalContribution: number; // Sum of all contributions

  // Component breakdowns with explanations
  componentBreakdown: {
    mainBeams: { value: number; cues: RackScoringCue[] };
    tines: { value: number; cues: RackScoringCue[] };
    mass: { value: number; cues: RackScoringCue[] };
    spread: { value: number; cues: RackScoringCue[] };
    abnormal: { value: number; cues: RackScoringCue[] };
  };

  // Deductions with explanations
  deductionBreakdown: {
    mainBeamAsymmetry: { value: number; cue?: RackScoringCue };
    tineAsymmetry: { value: number; cues: RackScoringCue[] };
    massAsymmetry: { value: number; cues: RackScoringCue[] };
    total: number;
  };

  // Point enumeration (AI reasoning)
  pointEnumeration?: string;

  // Additional metadata
  measurementQuality: "excellent" | "good" | "fair" | "poor";
  angleQuality: "straight_on" | "angled" | "poor";
  measurementTips?: string[]; // If quality is low, suggest improvements
}

export interface BodyFeatureOverlay {
  featureId: string;
  name: string;
  boundingBox: {
    x: number; // percentage 0-100
    y: number; // percentage 0-100
    width: number; // percentage 0-100
    height: number; // percentage 0-100
  };
  label: string; // e.g., "Neck: thick 82%"
  confidence: number; // 0-100
  cue?: AgeCue;
}

export interface ExplainableAgeEstimation {
  // Primary result
  estimatedAge: AgeBand;
  estimatedAgeYears: number; // e.g., 3.5
  overallConfidence: number; // 0-100

  // Shooter/Let Walk determination
  meetsMinimumAge: boolean;
  minimumAgeThreshold: number; // from settings, default 3.5
  shooterPassLabel: "SHOOTER" | "LET WALK" | "NICE HARVEST" | "NICE MOUNT";
  shooterPassReason: string;

  // Explainability
  detectedCues: AgeCue[];
  bodyFeatureOverlays: BodyFeatureOverlay[];
  netAgePush: number; // Sum of ageWeights, negative = younger, positive = older

  // Additional metadata
  imageQuality: "good" | "fair" | "poor";
  occlusionLevel: "none" | "minimal" | "moderate" | "high";
  photoTips?: string[]; // If quality is low, suggest improvements
}

export interface PropertyRules {
  minimumShooterAge: number; // years, default 3.5 (MLD age floor)
  species: "whitetail" | "mule_deer" | "elk"; // extensible
  managementGoals?: string;
  isRutSeason?: boolean; // Adjust for rut-related body changes
  region?: "midwest" | "south" | "northeast" | "west"; // Regional adjustments
}

/**
 * TPWD-Compliant Age Class System
 * Age classes for internal probability estimation
 */
export type AgeClass = "1.5-2.5" | "2.5-3.5" | "3.5-4.5" | "4.5-5.5" | "5.5+";

/**
 * Age Class Probability Distribution
 * Internal layer 1 output - never shown directly to users
 */
export interface AgeClassProbabilities {
  "1.5-2.5": number; // Probability 0-100
  "2.5-3.5": number;
  "3.5-4.5": number;
  "4.5-5.5": number;
  "5.5+": number;
}

/**
 * TPWD-Compliant Primary Body Features (4)
 * These drive the age-floor decision with high weight
 */
export type PrimaryBodyFeature =
  | "neck_brisket_integration" // Neck flows into chest - no pinch point = mature
  | "chest_hindquarter_ratio" // Front chest deeper/heavier than rear = mature
  | "body_depth" // Rib cage height (not fat sag) = older
  | "leg_body_proportion"; // Legs appear short due to deep torso = older

/**
 * TPWD-Compliant Secondary Body Features (3)
 * Supporting evidence, may vary by rut or region
 */
export type SecondaryBodyFeature =
  | "backline_posture" // Swayed back vs level
  | "belly_waistline" // Rut-adjusted belly assessment
  | "head_body_ratio"; // Blocky head vs doe-like

/**
 * All TPWD-compliant body features
 */
export type TPWDBodyFeature = PrimaryBodyFeature | SecondaryBodyFeature;

/**
 * Feature Assessment Result
 * How a single body feature was evaluated
 */
export interface FeatureAssessment {
  feature: TPWDBodyFeature;
  displayName: string;
  isPrimary: boolean;
  detectedPattern: string;
  confidence: number; // 0-100
  ageIndicator: "immature" | "transitional" | "mature" | "post-mature";
  contributesToMinimumAge: boolean; // Does this support >= minimum age?
  rutAdjusted?: boolean; // Was this feature adjusted for rut conditions?
  explanation: string; // TPWD-compliant explanation text
}

/**
 * Layer 1: Internal Age Estimation
 * Probabilistic, age-specific - NEVER shown to user as exact age
 */
export interface InternalAgeEstimation {
  probabilities: AgeClassProbabilities;
  mostLikelyAgeClass: AgeClass;
  cumulativeProbabilityAboveMinimum: number; // P(age >= minimum_shoot_age)
  confidenceThreshold: number; // Required probability to recommend SHOOT
  primaryFeatureAssessments: FeatureAssessment[];
  secondaryFeatureAssessments: FeatureAssessment[];
  rutConditionsConsidered: boolean;
  regionalNormalization: boolean;
}

/**
 * Layer 2: External Decision & Explanation
 * User/warden facing - ALWAYS framed in proportional body characteristics
 */
export interface TPWDCompliantDecision {
  decision: "SHOOT" | "LET WALK";
  minimumAge: number; // The configured MLD minimum shoot age
  meetsMinimumAge: boolean;

  // Warden-safe explanation (MUST use this template)
  explanation: string;

  // Feature-based justification (NOT age certainty)
  primaryFeatureSummary: string; // Summary of 4 primary features
  secondaryFeatureSummary: string; // Summary of 3 secondary features

  // Disclaimers
  disclaimer: string; // Required TPWD disclaimer

  // Confidence in body-based assessment (not age)
  assessmentConfidence: number; // 0-100

  // Image quality impact
  imageQuality: "excellent" | "good" | "fair" | "poor";
  qualityImpact: string;
}

/**
 * Complete TPWD-Compliant Age Analysis Result
 * Combines internal estimation with external decision
 */
export interface TPWDCompliantAgeAnalysis {
  // Layer 1: Internal (for processing only)
  internalEstimation: InternalAgeEstimation;

  // Layer 2: External (user-facing)
  decision: TPWDCompliantDecision;

  // Visual overlays for body features
  bodyFeatureOverlays: BodyFeatureOverlay[];

  // Metadata
  analysisTimestamp: Date;
  processingTimeMs: number;
  analysisMode: "quick" | "comprehensive";
}

export interface DeerAnalysisFrame {
  frameIndex: number;
  imageUri: string;
  depthData?: number[][]; // 2D array of depth values
  detectedAntlers: boolean;
  confidence: ConfidenceLevel;
  partialOcclusion: boolean;
}

export interface DeerScoringResult {
  // Identification
  analysisId: string;
  timestamp: Date;
  analysisMode: "age" | "score"; // Track which mode was used

  // Deer Identification (for future linking of age + rack analyses)
  deerIdentifier?: string; // Optional unique ID for linking multiple analyses of same deer
  linkedAnalysisIds?: string[]; // IDs of other analyses of the same deer

  // Multi-frame data
  capturedFrames: DeerAnalysisFrame[];
  fusedFrameCount: number;

  // Scoring
  score: BooneAndCrockettScore;

  // Scale estimation
  scale: ScaleEstimation;

  // Age estimation (legacy - kept for compatibility)
  age: AgeEstimation;

  // Explainable age estimation (new for Age My Deer mode)
  explainableAge?: ExplainableAgeEstimation;

  // TPWD-Compliant age analysis (warden-defensible)
  tpwdCompliantAge?: TPWDCompliantAgeAnalysis;

  // Explainable rack scoring (new for Score My Rack mode)
  explainableRackScore?: ExplainableRackScoring;

  // Processing metadata
  processingTime: number; // milliseconds
  onDeviceProcessing: boolean;
  cloudRefinementUsed: boolean;

  // Manual override data
  manualPointCount?: number; // User's manual count if overridden
  manualLeftCount?: number; // User's manual left antler count
  manualRightCount?: number; // User's manual right antler count
  manualOverride?: boolean; // Whether manual count is active

  // Adjusted score data (when manual count > AI count)
  adjustedScore?: number; // User-adjusted B&C score
  adjustedScoreExplanation?: string; // Explanation of adjustment calculation
  avgMissedTineLength?: number; // User's estimated avg length of missed tines

  // Manual notes and metadata
  manualNotes?: string;
  gpsLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  weather?: string;
  distance?: number; // yards (legacy - kept for compatibility)

  // NEW: Distance measurement with full metadata
  distanceMeasurement?: {
    distanceYards: number;
    source: "manual" | "preset" | "rangefinder_bluetooth" | "rangefinder_manual" | "estimated_ai";
    confidence: "high" | "medium" | "low";
    timestamp: string;
    notes?: string;
  };

  // NEW: Zoom metadata from camera capture
  zoomMeta?: {
    cameraFocalLength?: number;
    zoomFactor?: number;
    isDigitalZoom?: boolean;
  };

  // NEW: Analysis confidence (0-1) after distance adjustment
  analysisConfidence?: number;

  // NEW: Whether distance adjustment was applied
  distanceAdjusted?: boolean;

  // NEW: Distance history for audit trail (last 5 edits)
  distanceHistory?: Array<{
    distanceYards: number;
    source: "manual" | "preset" | "rangefinder_bluetooth" | "rangefinder_manual" | "estimated_ai";
    confidence: "high" | "medium" | "low";
    timestamp: string;
  }>;

  // Export
  pdfUri?: string;
}

export interface DeerScoringState {
  isCapturing: boolean;
  isProcessing: boolean;
  capturedFrames: DeerAnalysisFrame[];
  currentResult?: DeerScoringResult;
  error?: string;
}
