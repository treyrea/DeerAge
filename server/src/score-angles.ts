/**
 * The one-photo score question stays byte-for-byte the same.
 * Named extra angles tell the model those photos are one rack.
 */

import { angleNamesFor } from "./score-angles-shared.js";
import { scorePromptPlain } from "./prompts.js";

export function scorePromptForAngles(angleNames: readonly string[]): string {
  if (angleNames.length <= 1) return scorePromptPlain();
  const lead = scorePromptPlain().replace(
    "First, is a deer in this photo?",
    "These photos are different angles of the same rack. First, is a deer in these photos?",
  );
  const labels = angleNames.map((name, index) => `Image ${index + 1}: ${name}`).join("\n");
  return `${lead}\n\nThe images follow in this order:\n${labels}`;
}

export function scorePromptForRequest(imageCount: number, provided: unknown): string {
  const names = angleNamesFor(imageCount, provided);
  if (!names) return scorePromptPlain();
  return scorePromptForAngles(names);
}
