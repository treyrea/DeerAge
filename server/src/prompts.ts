/**
 * Prompts for the scan rewrite.
 * The model is not told the month or that it is the rut.
 * Antlers are weak evidence. A partial deer still gets an answer.
 * A person, a room, or a car does not.
 */

const DEER_PRESENT_RULES = `First, is a deer in this photo? Put the answer in deer_present before any age.
NO only when no whitetail and no mule deer is visible at all. A person, a child, someone watching television, a living room, a car, a dog, an empty field, or a building is NO. A person's neck, chest, or legs are not a deer's. Do not give that photo an age.
YES when any whitetail or mule deer is visible, including a doe, a fawn, or a buck, even if it is partly hidden, cropped, distant, dark, blurry, bedded, or on a night trail camera. If you are unsure, answer YES. Use CANT_TELL only when the frame is blank.
When deer_present is NO, set stop to not_deer, set age to null, and do not invent cues. Do not copy the example.`;

export function bodyFirstAgePrompt(minimum: number): string {
  return `${DEER_PRESENT_RULES}

You are aging a buck from a photo for a hunter whose lease minimum is ${minimum}. Age him only when deer_present is YES or CANT_TELL.

First describe only the body you can actually see: throat and neck, where the neck meets the chest, chest against the hindquarter, belly and back line, how long the legs look next to the body depth, and the face and muzzle. Do not assume the neck is swollen because of the rut. If the season matters, say what the photo shows (velvet, coat, or swelling), not a month number.

Then treat the antlers as weak evidence. A well-fed 1.5 or 2.5 can carry a 130-class rack. If the rack looks older than the body, trust the body.

Do not refuse a partial photo of a deer. Answer whenever any of the deer is visible. Set stop to not_deer only when deer_present is NO. Set stop to no_antlers when a deer is visible but no antlered buck is. Set stop to unreadable when the frame is so dark or blurry that nothing can be seen.

Otherwise set stop to null, set deer_present to YES or CANT_TELL, give an age class midpoint (1.5, 2.5, 3.5, 4.5, 5.5, or 6.5), name the parts you could see, and if the angle is poor add a short betterAngle tip.

Each cue must be something you can see in the photo. Label area as neck, brisket, belly, back, legs, face, or antler. Include antler only if you used the rack.

The example below is for a deer. A person, a room, or a car must not use it.
End with one line and nothing after it:
FINAL {"deer_present":"YES","age":4.5,"confidence":50,"visibleParts":["neck","chest","legs"],"betterAngle":"","cues":[{"area":"neck","text":"Neck still meets the chest in a seam"}],"stop":null}`;
}

export function maskedAgePrompt(): string {
  return `${DEER_PRESENT_RULES}

How old is this buck? Gray boxes may cover parts of the photo. Age him from the body you can see only when deer_present is YES or CANT_TELL: neck, chest, belly, legs, and face. Do not invent antlers under the boxes. A person under the boxes is still NO.

When deer_present is NO, set stop to not_deer and age to null. Otherwise give an age class midpoint (1.5, 2.5, 3.5, 4.5, 5.5, or 6.5) and set stop to null.

The example below is for a deer. Do not copy it for a person, a room, or a car.
End with one line and nothing after it:
FINAL {"deer_present":"YES","age":2.5,"confidence":40,"visibleParts":["neck","legs"],"betterAngle":"","cues":[{"area":"neck","text":"Thin neck with a clear throat line"}],"stop":null}`;
}

export function antlerBoxPrompt(): string {
  return `Find the antlers in this photo. Reply with JSON only.
{"boxes":[[x0,y0,x1,y1]]}
Each box is the left, top, right, and bottom of an antler beam or the rack, as fractions from 0 to 1 of the image width and height. If you see no antlers, return {"boxes":[]}.`;
}

export function scorePromptPlain(): string {
  return `First, is a deer in this photo? Put the answer in deer_present before any measurement.
NO only when no whitetail and no mule deer is visible at all. A person, a child, someone watching television, a living room, a car, a dog, an empty field, or a building is NO. Do not score a person, a room, or a car.
YES when any whitetail or mule deer is visible, including a doe, a fawn, or a buck, even if it is partly hidden, cropped, distant, dark, blurry, bedded, or on a night trail camera. If you are unsure, answer YES. Use CANT_TELL only when the frame is blank.
When deer_present is NO, do not estimate inches. End with this line and nothing after it:
FINAL {"deer_present":"NO"}
When deer_present is YES or CANT_TELL, what would this buck score, gross Boone and Crockett inches? Give the inside spread, both main beam lengths, the tine lengths you can see, and four circumferences on each side. Say what you are unsure about in a few sentences. The example is for a deer. Do not copy it for a person, a room, or a car.

End with one line and nothing after it:
FINAL {"deer_present":"YES","gross":150,"spread":16,"beams":{"left":22,"right":21},"tines":{"left":{"g1":4,"g2":8},"right":{"g1":4,"g2":8}},"mass":{"left":{"h1":4},"right":{"h1":4}}}`;
}

export function fastAgePrompt(minimum: number): string {
  return `${DEER_PRESENT_RULES}

Give a fast age class for this buck only when deer_present is YES or CANT_TELL. The hunter's lease minimum is ${minimum}. Use only 1.5, 2.5, 3.5, 4.5, 5.5, or 6.5. This is a first look, not the final call.

The example below is for a deer. A person, a room, or a car must not use it.
End with one line and nothing after it:
FINAL {"deer_present":"YES","age":2.5,"confidence":40,"visibleParts":["body"],"betterAngle":"","cues":["Legs look long"],"stop":null}`;
}
