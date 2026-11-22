/**
 * Body outlines for the age result photo.
 *
 * One small gateway call (the same box model the antler mask uses, about $0.002) finds where
 * the neck, chest, belly, back, legs and face are. The read's own reasons decide which parts
 * are outlined and what each label says. The call never changes the age, and a failed or
 * empty call just leaves the photo without outlines.
 */

import type { ModelCall } from "./gateway.js";

export const BODY_PARTS = [
  { id: "neck", name: "Neck", words: /\bneck|junction/i },
  { id: "chest", name: "Chest & brisket", words: /chest|brisket|shoulder|front[- ]?(end|half)|withers/i },
  { id: "belly", name: "Belly & waist", words: /belly|waist|tuck|flank|underline|stomach|taper|sag/i },
  { id: "back", name: "Back line", words: /\bback\b|backline|back line|topline|sway/i },
  { id: "legs", name: "Legs", words: /\blegs?\b|leggy|rangy/i },
  { id: "face", name: "Face", words: /face|snout|muzzle|head|nose/i },
] as const;

export type BodyPartId = (typeof BODY_PARTS)[number]["id"];
export type Box = [number, number, number, number];

export interface BodyOverlay {
  featureId: BodyPartId;
  name: string;
  /** Percent of the photo, 0 to 100, like the app's BodyFeatureOverlay. */
  boundingBox: { x: number; y: number; width: number; height: number };
  label: string;
  confidence: number;
}

export function bodyBoxPrompt(): string {
  return `Find the body parts of the main deer in this photo. Do not age the deer.
Return JSON only, exactly this shape:
{"neck":[x0,y0,x1,y1],"chest":[x0,y0,x1,y1],"belly":[x0,y0,x1,y1],"back":[x0,y0,x1,y1],"legs":[x0,y0,x1,y1],"face":[x0,y0,x1,y1]}
Each box is the left, top, right and bottom of that part as fractions from 0 to 1 of the image width and height.
neck: from behind the head to where it meets the shoulders. chest: the shoulders and chest down to the brisket. belly: the underline and waist from behind the front legs to the hind legs. back: the top line from the withers to the hips. legs: the legs from the bottom of the body to the hooves. face: the head without the antlers.
Use null for a part you cannot see. If there is no deer, return {}.`;
}

function boxOf(value: unknown): Box | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const nums = value.map((n) => (typeof n === "number" ? n : Number(n)));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  // Some models answer 0 to 1000; scale those back to fractions.
  const scaled = nums.some((n) => n > 1.0001) && nums.every((n) => n <= 1000) ? nums.map((n) => n / 1000) : nums;
  const [a, b, c, d] = scaled.map((n) => Math.min(1, Math.max(0, n)));
  const x0 = Math.min(a, c);
  const x1 = Math.max(a, c);
  const y0 = Math.min(b, d);
  const y1 = Math.max(b, d);
  if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return null;
  if ((x1 - x0) * (y1 - y0) > 0.9) return null;
  return [x0, y0, x1, y1];
}

export function parseBodyBoxes(text: string): Partial<Record<BodyPartId, Box>> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const row = parsed as Record<string, unknown>;
  const out: Partial<Record<BodyPartId, Box>> = {};
  for (const part of BODY_PARTS) {
    const box = boxOf(row[part.id]);
    if (box) out[part.id] = box;
  }
  return out;
}

function shortLabel(name: string, reason: string | undefined): string {
  if (!reason) return name;
  const clean = reason.replace(/\s+/g, " ").trim().replace(/[.;]+$/, "");
  const cut = clean.length > 70 ? `${clean.slice(0, 67).replace(/\s+\S*$/, "")}…` : clean;
  return `${name}: ${cut}`;
}

/**
 * Outlines only the parts the reasons talk about, each labelled with its reason.
 * When no reason names a part, it outlines every part found with its plain name.
 */
export function bodyOverlays(boxes: Partial<Record<BodyPartId, Box>>, reasons: string[]): BodyOverlay[] {
  const lines = reasons.filter((line) => typeof line === "string" && line.trim().length > 0);
  const named = BODY_PARTS.filter((part) => boxes[part.id] && lines.some((line) => part.words.test(line)));
  const parts = named.length > 0 ? named : BODY_PARTS.filter((part) => boxes[part.id]);
  return parts.map((part) => {
    const [x0, y0, x1, y1] = boxes[part.id]!;
    const pct = (n: number) => Math.round(n * 1000) / 10;
    return {
      featureId: part.id,
      name: part.name,
      boundingBox: { x: pct(x0), y: pct(y0), width: pct(x1 - x0), height: pct(y1 - y0) },
      label: named.length > 0 ? shortLabel(part.name, lines.find((line) => part.words.test(line))) : part.name,
      confidence: 0,
    };
  });
}

export type BoxCaller = (prompt: string, image: string) => Promise<ModelCall | null>;

/** Never throws. usd is what the call cost, even when it found nothing. */
export async function findBodyBoxes(image: string, call: BoxCaller): Promise<{ boxes: Partial<Record<BodyPartId, Box>>; usd: number }> {
  try {
    const reply = await call(bodyBoxPrompt(), image);
    if (!reply) return { boxes: {}, usd: 0 };
    return { boxes: parseBodyBoxes(reply.text), usd: reply.usd };
  } catch {
    return { boxes: {}, usd: 0 };
  }
}

/** Adds overlays to an age result when there is anything to outline. */
export function withOverlays(result: Record<string, unknown>, boxes: Partial<Record<BodyPartId, Box>>): Record<string, unknown> {
  const reasons = [
    ...(Array.isArray(result.reasons) ? result.reasons : []),
    ...(typeof result.ageReason === "string" ? [result.ageReason] : []),
    ...(typeof result.hunterCue === "string" ? [result.hunterCue] : []),
  ].filter((line): line is string => typeof line === "string");
  const overlays = bodyOverlays(boxes, reasons);
  return overlays.length > 0 ? { ...result, overlays } : result;
}

let boxCaller: BoxCaller | null = null;

/** Tests script the box reply. Production uses the gateway box model. */
export function setBodyBoxCallerForTests(next: BoxCaller | null): void {
  boxCaller = next;
}

export async function gatewayBoxCaller(prompt: string, image: string): Promise<ModelCall | null> {
  if (boxCaller) return boxCaller(prompt, image);
  const { callModel } = await import("./gateway.js");
  try {
    return await callModel({ role: "boxes", prompt, images: [image], timeoutMs: 15_000, maxTokens: 600, effort: "low", allowStatusRetry: true });
  } catch (error) {
    console.log(JSON.stringify({
      event: "model_call_failed",
      role: "body_boxes",
      message: error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
    }));
    return null;
  }
}
