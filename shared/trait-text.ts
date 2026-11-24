/**
 * Turns a describe-once note into one short cue per body part.
 * Headings are matched on the heading itself. A bold label is not a snippet,
 * and one part never borrows another part's line.
 */

export interface TraitSection {
  heading: string;
  body: string;
}

export interface TraitSnippet {
  id: string;
  cue: string;
  detail: string;
}

const TRAITS: { id: string; pattern: RegExp }[] = [
  { id: "neck", pattern: /\bneck\b|\bjunction\b/i },
  { id: "back", pattern: /\bback\b|backline|back line|topline|\bsway(?:ed)?\b/i },
  { id: "belly", pattern: /\bbelly\b|\bwaist\b|\btuck(?:ed|ing|s)?\b|\bflank\b/i },
  { id: "legs", pattern: /\blegs?\b|\bleggy\b|\brangy\b/i },
  { id: "chest", pattern: /\bchest\b|\bbrisket\b|\bshoulders?\b|\bwithers\b/i },
  { id: "face", pattern: /\bface\b|\bsnout\b|\bmuzzle\b|\bhead\b|\bnose\b/i },
];

const CUE_WORDS = 8;
const DANGLING = /^(a|an|the|and|or|of|to|with|into|as|in|on|for|from)$/i;

/** Removes bold markers, including a marker the cue cut in half, and a leading list marker. */
export function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__([^_]*)__/g, "$1")
    .replace(/__/g, "")
    .replace(/(^|\n)[ \t]*[-*•]+[ \t]+/g, "$1");
}

function plain(value: string): string {
  return stripMarkdown(value).replace(/\s+/g, " ").trim();
}

/** Drops a cut-off "(" that never closed, and the fragment after it. */
export function withoutOpenParen(value: string): string {
  const open = (value.match(/\(/g) ?? []).length;
  const close = (value.match(/\)/g) ?? []).length;
  if (open <= close) return value;
  return value.replace(/\s*\([^)]*$/g, "").replace(/[.,;:]+$/g, "").trim();
}

/**
 * First sentence, at most 8 words. Commas inside parentheses are not a break,
 * and the result does not end on an open parenthesis.
 */
export function shortObservation(text: string): string {
  let normalized = plain(text);
  if (!normalized) return "";
  const labeled = normalized.match(/^([^:]{2,70}):\s+(\S[\s\S]*)$/);
  if (labeled && !/[.!?]/.test(labeled[1])) normalized = labeled[2].trim();
  const sentence = (normalized.split(/(?<=[.!?])\s+/)[0] ?? "").replace(/[.!?]+$/g, "").trim();
  if (!sentence) return "";
  const words = sentence.split(" ").filter(Boolean);
  if (words.length <= CUE_WORDS) return withoutOpenParen(sentence);
  const clause = firstClause(sentence);
  const clauseWords = clause.split(" ").filter(Boolean);
  if (clauseWords.length >= 2 && clauseWords.length <= CUE_WORDS && clause.length < sentence.length) {
    return withoutOpenParen(clause.replace(/[.!?]+$/g, ""));
  }
  const kept = words.slice(0, CUE_WORDS);
  while (kept.length > 1 && DANGLING.test(kept[kept.length - 1].replace(/[.,;:]+$/g, ""))) kept.pop();
  return withoutOpenParen(kept.join(" ").replace(/[.,;:]+$/g, ""));
}

function firstClause(sentence: string): string {
  let depth = 0;
  for (let i = 0; i < sentence.length; i += 1) {
    const ch = sentence[i];
    if (ch === "(") depth += 1;
    else if (ch === ")" && depth > 0) depth -= 1;
    else if (depth === 0 && (ch === ";" || ch === ":")) return sentence.slice(0, i).trim();
    else if (depth === 0 && ch === "," && sentence[i + 1] === " ") return sentence.slice(0, i).trim();
    else if (depth === 0 && ch === "—" && sentence[i - 1] === " " && sentence[i + 1] === " ") {
      return sentence.slice(0, i).trim();
    }
  }
  return sentence;
}

function headingLooksLikeLabel(inner: string, after: string): boolean {
  if (inner.length === 0 || inner.length > 90) return false;
  if (/[.!?]/.test(inner.replace(/:\s*$/g, ""))) return false;
  return inner.includes(":") || /^\s*:/.test(after);
}

function boldSections(text: string): TraitSection[] {
  const matches = [...text.matchAll(/\*\*([^*]+)\*\*/g)];
  const headings = matches.filter((match) => {
    const inner = match[1] ?? "";
    const at = (match.index ?? 0) + match[0].length;
    return headingLooksLikeLabel(inner, text.slice(at, at + 2));
  });
  const sections: TraitSection[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const match = headings[i];
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < headings.length ? (headings[i + 1].index ?? text.length) : text.length;
    const heading = (match[1] ?? "").replace(/:\s*$/g, "").trim();
    const body = text
      .slice(start, end)
      .replace(/^\s*:?\s*/, "")
      .replace(/\s+[-*•]\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!heading) continue;
    sections.push({ heading, body: plain(body) });
  }
  return sections;
}

function plainSections(text: string): TraitSection[] {
  const sections: TraitSection[] = [];
  for (const line of stripMarkdown(text).split(/\n+/)) {
    const cleaned = line.replace(/^[\s>*-•]+/, "").trim();
    const match = cleaned.match(/^([^:]{2,70}):\s+(\S.*)$/);
    if (!match) continue;
    const heading = match[1].trim();
    if (/[.!?]/.test(heading)) continue;
    sections.push({ heading, body: match[2].replace(/\s+/g, " ").trim() });
  }
  return sections;
}

/** Bold "label: observation" blocks, or several plain "label: observation" lines. */
export function parseDescribeSections(text: string): TraitSection[] {
  const bold = boldSections(text);
  if (bold.length >= 2) return bold;
  const plainLabels = plainSections(text);
  if (plainLabels.length >= 3) return plainLabels;
  return [];
}

function scoreHeading(heading: string, pattern: RegExp): number {
  if (!pattern.test(heading)) return 0;
  const index = heading.search(pattern);
  const others = TRAITS.filter((trait) => trait.pattern !== pattern && trait.pattern.test(heading));
  return 100 - Math.min(index, 80) + (others.length === 0 ? 30 : 0);
}

function cueFor(section: TraitSection): string {
  const fromBody = shortObservation(section.body);
  if (fromBody) return fromBody;
  const named = section.heading.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return withoutOpenParen(shortObservation(named));
}

/**
 * One snippet per trait the headings actually name.
 * A trait with no heading is absent. Callers show the part name and no borrowed line.
 */
export function snippetsForTraits(text: string): TraitSnippet[] {
  const sections = parseDescribeSections(text);
  if (sections.length === 0) return [];
  const pairs: { section: TraitSection; id: string; score: number }[] = [];
  for (const section of sections) {
    for (const trait of TRAITS) {
      const score = scoreHeading(section.heading, trait.pattern);
      if (score > 0) pairs.push({ section, id: trait.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedSections = new Set<TraitSection>();
  const usedTraits = new Set<string>();
  const out: TraitSnippet[] = [];
  for (const pair of pairs) {
    if (usedSections.has(pair.section) || usedTraits.has(pair.id)) continue;
    const cue = cueFor(pair.section);
    if (!cue) continue;
    usedSections.add(pair.section);
    usedTraits.add(pair.id);
    const detail = plain(pair.section.body) || cue;
    out.push({ id: pair.id, cue, detail });
  }
  return out;
}
