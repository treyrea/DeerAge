/**
 * Prompts for the scan rewrite.
 * The model is not told the month or that it is the rut.
 * Antlers are weak evidence. A partial body still gets an answer.
 */

export function bodyFirstAgePrompt(minimum: number): string {
  return `You are aging a buck from a photo for a hunter whose lease minimum is ${minimum}.

First describe only the body you can actually see: throat and neck, where the neck meets the chest, chest against the hindquarter, belly and back line, how long the legs look next to the body depth, and the face and muzzle. Do not assume the neck is swollen because of the rut. If the season matters, say what the photo shows (velvet, coat, or swelling), not a month number.

Then treat the antlers as weak evidence. A well-fed 1.5 or 2.5 can carry a 130-class rack. If the rack looks older than the body, trust the body.

Do not refuse a partial photo. Answer whenever any of the deer is visible. Stop only when there is no deer, no antlered buck, or the frame is so dark or blurry that nothing can be seen. In those cases set "stop" to not_deer, no_antlers, or unreadable.

Otherwise set "stop" to null, give an age class midpoint (1.5, 2.5, 3.5, 4.5, 5.5, or 6.5), name the parts you could see, and if the angle is poor add a short betterAngle tip.

Each cue must be something you can see in the photo. Label area as neck, brisket, belly, back, legs, face, or antler. Include antler only if you used the rack.

End with one line and nothing after it:
FINAL {"age":4.5,"confidence":50,"visibleParts":["neck","chest","legs"],"betterAngle":"","cues":[{"area":"neck","text":"Neck still meets the chest in a seam"}],"stop":null}`;
}

export function maskedAgePrompt(): string {
  return `How old is this buck? Gray boxes may cover parts of the photo. Age him from the body you can see: neck, chest, belly, legs, and face. Do not invent antlers under the boxes.

Stop only if no deer is visible or nothing in the frame can be seen. Otherwise give an age class midpoint (1.5, 2.5, 3.5, 4.5, 5.5, or 6.5).

End with one line and nothing after it:
FINAL {"age":2.5,"confidence":40,"visibleParts":["neck","legs"],"betterAngle":"","cues":[{"area":"neck","text":"Thin neck with a clear throat line"}],"stop":null}`;
}

export function antlerBoxPrompt(): string {
  return `Find the antlers in this photo. Reply with JSON only.
{"boxes":[[x0,y0,x1,y1]]}
Each box is the left, top, right, and bottom of an antler beam or the rack, as fractions from 0 to 1 of the image width and height. If you see no antlers, return {"boxes":[]}.`;
}

export function scorePromptPlain(): string {
  return `What would this buck score, gross Boone and Crockett inches? Give the inside spread, both main beam lengths, the tine lengths you can see, and four circumferences on each side. Say what you are unsure about in a few sentences.

End with one line and nothing after it:
FINAL {"gross":150,"spread":16,"beams":{"left":22,"right":21},"tines":{"left":{"g1":4,"g2":8},"right":{"g1":4,"g2":8}},"mass":{"left":{"h1":4},"right":{"h1":4}}}`;
}

export function fastAgePrompt(minimum: number): string {
  return `Give a fast age class for this buck. The hunter's lease minimum is ${minimum}. Use only 1.5, 2.5, 3.5, 4.5, 5.5, or 6.5. This is a first look, not the final call.

End with one line and nothing after it:
FINAL {"age":2.5,"confidence":40,"visibleParts":["body"],"betterAngle":"","cues":["Legs look long"],"stop":null}`;
}
