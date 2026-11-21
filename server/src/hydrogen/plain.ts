/**
 * First-stated age class in a plain Gemini answer.
 * Port of parse_age: half-years, "1/2", word ages, "yearling", and a range
 * written with "-" / "to" / "or" within 2 years. Anything else is no age.
 */

const WORDS: Array<[string, string]> = [
  ["one and a half", "1.5"],
  ["two and a half", "2.5"],
  ["three and a half", "3.5"],
  ["four and a half", "4.5"],
  ["five and a half", "5.5"],
  ["six and a half", "6.5"],
];

const RANGE = new RegExp(
  String.raw`(\d{1,2}(?:\.5)?)\s*(?:\+|-plus)?\s*(?:years?)?\s*(?:-|to|or)\s*(\d{1,2}(?:\.5)?)(?=\s*(?:\+|-?\s*years?|-?\s*yrs?|\b))`,
  "gi",
);

const SINGLE = new RegExp(
  String.raw`(\d{1,2}(?:\.5)?)(\+|-plus)?(?=\s*(?:-|\s)?\s*(?:years?|yrs?|year-old|y/o|yo\b|age class|\)|\*))`,
  "gi",
);

export function normPlainAge(text: string): string {
  let t = text.replaceAll("½", ".5").replaceAll("\u2011", "-").replaceAll("\u2013", "-").replaceAll("\u2014", "-");
  t = t.replace(/(\d)\s+1\/2/g, "$1.5").replace(/(\d)\s*\.5/g, "$1.5");
  for (const [word, value] of WORDS) {
    t = t.replace(new RegExp(word, "gi"), value);
  }
  t = t.replace(/\byearling\b/gi, "1.5-year-old");
  return t;
}

function half(value: number): boolean {
  return value % 1 === 0.5;
}

interface Candidate {
  start: number;
  lo: number;
  hi: number;
}

function collect(re: RegExp, text: string): RegExpExecArray[] {
  const copy = new RegExp(re.source, re.flags);
  const found: RegExpExecArray[] = [];
  let match = copy.exec(text);
  while (match) {
    found.push(match);
    if (match[0].length === 0) copy.lastIndex += 1;
    match = copy.exec(text);
  }
  return found;
}

/** First stated age class as [lo, hi], or null when the text has none. */
export function parseAge(text: string | null | undefined): [number, number] | null {
  if (!text) return null;
  const t = normPlainAge(text);
  const cands: Candidate[] = [];
  for (const match of collect(RANGE, t)) {
    const lo = Number(match[1]);
    const hi = Number(match[2]);
    if (half(lo) && half(hi) && lo >= 0.5 && lo < hi && hi <= 9.5 && hi - lo <= 2) {
      cands.push({ start: match.index, lo, hi });
    }
  }
  for (const match of collect(SINGLE, t)) {
    const age = Number(match[1]);
    if (half(age) && age >= 0.5 && age <= 12.5) {
      cands.push({ start: match.index, lo: age, hi: age });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((left, right) => left.start - right.start || left.lo - right.lo || left.hi - right.hi);
  return [cands[0].lo, cands[0].hi];
}
