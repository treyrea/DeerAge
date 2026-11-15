export interface HuntContext {
  state?: string;
  ecoregion?: string;
  landType?: string;
  goal?: string;
  minimumShooterAge?: number;
  species?: string;
  month?: number;
  distanceYards?: number;
  fenceType?: string;
}

const REGIONAL_PRIOR = `
Regional antler size is a weak prior. Body shape is the age signal and holds up across regions.
TPWD 19-year average gross B&C at 5.5+: Edwards Plateau about 118, statewide 124, Pineywoods 126, South Texas Plains 132, Western Rolling Plains 133.
At 3.5 years Edwards Plateau averages about 99 against about 117 in the Blackland Prairie.
Hill Country mature bucks often have a 16 inch main beam on typical range, against 19 inches on healthy Kerr WMA range.
A big rack in the Midwest or South Texas can be a 3.5. A modest rack on the Edwards Plateau can be 5.5.
Do not age from antlers alone. MSU: typical ear spread is about 15 inches on a whitetail and ear position changes how wide the rack looks. Mule deer ears are larger, often 20 inches or more.
Rut can take up to about 25% of an older buck's weight. A post-rut buck (late December through February) reads younger in the belly and hams. Say so when the month suggests it.
`.trim();

export function contextBlock(context: HuntContext | undefined): string {
  if (!context) return "No region was provided. Lean on body shape and say the antler prior is uncertain.";
  const month = context.month ?? new Date().getMonth() + 1;
  return [
    `State: ${context.state || "unknown"}`,
    `Ecoregion: ${context.ecoregion || "unknown"}`,
    `Land: ${context.landType || "unknown"}`,
    `Fence: ${context.fenceType || "unknown"}`,
    `Species: ${context.species || "whitetail"}`,
    `Month: ${month}`,
    `Hunter's shooter goal: ${context.minimumShooterAge ?? 4.5}+ years`,
    context.distanceYards ? `Hunter-reported distance: ${context.distanceYards} yards` : "",
    REGIONAL_PRIOR,
  ]
    .filter(Boolean)
    .join("\n");
}

const SCALE_RULES = `
Scale the photo from skull landmarks, not from a fixed pixels-per-inch guess.
Adult whitetail nose-tip to the front of the eye socket is about 7 inches. Mule deer is about 8 inches.
A relaxed whitetail ear tip to ear tip is about 15 inches. Use that only when both ears are in a normal alert or relaxed pose, not pinned or flared.
Estimate pixelsPerInch from whichever landmark is clearer. If both are visible, average them and set method to "hybrid".
If neither landmark is usable, set pixelsPerInch to 0, method to "unknown", and lower confidence. Do not invent a scale.
Tine lengths must be estimated against that scale, tine by tine (G1 brow, G2, G3, G4, then G5/G6 only if a distinct point is there).
`.trim();

export function agePrompt(context: HuntContext | undefined): string {
  return `You are aging a buck from one photo for a hunter. Reply with JSON only.

${contextBlock(context)}

${SCALE_RULES}

Age from the body, broadside if possible: back line, belly sag, where the neck meets the chest, brisket, hams, and how long the legs look relative to the chest. Antlers adjust the prior for this ecoregion. They do not decide the age.

Reject the photo when it is not a deer, only a head or mount, or too poor to see the body. Set isValidDeer false and invalidReason to one of: not_deer, head_only, poor_quality, no_body.

ageYears is only the midpoint of a class, used to combine frames. The hunter is shown the class (1.5–2.5, 2.5–3.5, 3.5–4.5, 4.5–5.5, or 5.5+), never a single year. ageCall is "young" under 3.5, "middle-aged" at 3.5, and "mature" at 4.5 or older.
meetsMinimum is true when ageYears is at least the hunter's shooter goal.
The hunter's shooter goal above is their lease minimum. fieldCall is "SHOOTER" when the body is confidently at or above that minimum, "LET WALK" when it is confidently under it, and "BORDERLINE" when the class or the uncertainty crosses that minimum. fieldCallNote names the age classes and the minimum. Do not say young or mature. Do not claim an exact age.
cueBullets is 3 to 5 short checks that explain the age class. area is one of Body, Neck, Belly, Legs, Face, Chest, Rack. text is one short clause.
topCues is up to 3 short body observations a hunter can check.
cues is the same observations with name chosen from: neck_thickness, chest_depth, brisket, backline, belly, leg_proportion, face_shape, rump_ham, waist_tuck, muscle_definition.
indicator is immature, transitional, mature, or post-mature.

JSON shape:
{
  "isValidDeer": true,
  "invalidReason": null,
  "ageYears": 4.5,
  "ageCall": "mature",
  "confidence": 70,
  "meetsMinimum": true,
  "explanation": "One sentence a hunter can read.",
  "imageQuality": "good",
  "topCues": ["Neck blends into the chest"],
  "fieldCall": "SHOOTER",
  "fieldCallNote": "Reads 4.5, at or above your lease minimum of 4.5. This is a field read from the photo, not a jawbone age.",
  "cueBullets": [{"area":"Neck","text":"Blends into the chest"},{"area":"Belly","text":"A little sag, not a paunch"}],
  "cues": [{"name":"neck_thickness","displayName":"Neck","pattern":"blends into the chest","confidence":70,"indicator":"mature"}],
  "scale": {"pixelsPerInch": 12, "noseToEyeInches": 7, "earSpreadInches": 15, "method": "hybrid", "confidence": "Med", "note": "how you scaled it"}
}`;
}

export function quickPrompt(context: HuntContext | undefined): string {
  return `You are making a fast field call on one deer photo. Reply with JSON only.

${contextBlock(context)}

Judge exactly three body features: neck-to-brisket, chest depth versus the hindquarter, and leg-to-body proportion. Antlers are not the decision.
decision is "SHOOT" when the body reads at or above the hunter's shooter goal, otherwise "LET WALK". Keep that field for older app versions.
fieldCall uses the same shooter goal: "SHOOTER", "LET WALK", or "BORDERLINE" when the class could fall on either side of that minimum. fieldCallNote names both classes and the minimum, for example "Could be 3.5 or 4.5, and your minimum is 4.5. Don't risk the fine." Do not say young or mature.
cueBullets is 3 short checks. area is Body, Neck, Belly, Legs, Face, or Chest.
If the photo is not a deer or the body is not visible, set isValidImage false and invalidImageReason to not_deer, head_mount, no_body_visible, or poor_quality.

JSON shape:
{
  "isValidImage": true,
  "invalidImageReason": null,
  "invalidImageMessage": null,
  "decision": "LET WALK",
  "estimatedAgeClass": "3.5-4.5",
  "ageYears": 3.5,
  "confidence": 65,
  "explanation": "Body characteristics suggest below the goal: neck still meets the chest in a seam.",
  "keyFeature": "neck_brisket",
  "imageQuality": "fair",
  "canAnalyzeFurther": true,
  "features": {
    "neckBrisketIntegration": {"pattern":"seam still visible","indicator":"transitional","confidence":60},
    "chestHindquarterRatio": {"pattern":"chest about even with the ham","indicator":"transitional","confidence":60},
    "legBodyProportion": {"pattern":"legs still look long","indicator":"immature","confidence":55}
  },
  "topCues": ["Neck still has a seam"],
  "fieldCall": "LET WALK",
  "fieldCallNote": "Reads 3.5, under your lease minimum of 4.5. Let him walk. This is a field read from the photo, not a jawbone age.",
  "cueBullets": [{"area":"Neck","text":"Still meets the chest in a seam"},{"area":"Legs","text":"Look long for the chest"}]
}`;
}

export function scorePrompt(context: HuntContext | undefined): string {
  return `You are scoring a buck's rack from one photo using Boone and Crockett style measurements in inches. Reply with JSON only.

${contextBlock(context)}

${SCALE_RULES}

Count every normal point that is at least about an inch and longer than it is wide. Walk the points out loud in pointEnumeration, tine by tine, left then right, from the brow (G1) outward. Do not guess a point you cannot see.
Report the inches you measure from the landmarks. Do not add or subtract a global fudge. If the beams, tines, and spread are all invisible, set isValidDeer false and invalidReason to poor_quality instead of returning zeros.
Circumferences H1-H4 only when the beam is visible enough. Leave a mass at 0 when you cannot see it.
insideSpread is the inside distance between the main beams.
If this is not a deer or no antlers are visible, set isValidDeer false and invalidReason to not_deer or no_antlers.

JSON shape:
{
  "isValidDeer": true,
  "invalidReason": null,
  "confidence": "Med",
  "pointEnumeration": "Left: G1, G2, G3. Right: G1, G2, G3.",
  "beams": {"left": 20, "right": 19.5},
  "tines": {"left": {"g1": 4, "g2": 8, "g3": 7}, "right": {"g1": 3.5, "g2": 8, "g3": 6.5}},
  "mass": {"left": {"h1": 4, "h2": 3.8, "h3": 3.5, "h4": 3.2}, "right": {"h1": 4, "h2": 3.8, "h3": 3.5, "h4": 3.2}},
  "abnormal": [],
  "insideSpread": 15,
  "ageYears": 4.5,
  "topCues": ["Deep chest", "Short-looking legs"],
  "scale": {"pixelsPerInch": 14, "noseToEyeInches": 7, "earSpreadInches": 15, "method": "ear-spread", "confidence": "Med", "note": "ears relaxed"}
}`;
}

export function baselinePrompt(): string {
  return `Look at this deer photo. Estimate the buck's age in half-years and the gross Boone and Crockett score in inches.
Reply with JSON only: {"ageYears": 4.5, "grossScore": 140, "mature": true, "isValidDeer": true}`;
}
