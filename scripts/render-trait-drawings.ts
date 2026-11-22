/**
 * Render every offline-guide trait drawing to SVG and PNG for review.
 *
 *   npx --yes tsx scripts/render-trait-drawings.ts [outDir]
 *
 * PNGs need @resvg/resvg-js on NODE_PATH (not an app dependency).
 * SVGs are written either way. The deer itself comes from mobile/src/lib/trait-drawings.ts.
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { TRAITS } from "../mobile/src/lib/offline-age-guide";
import {
  GUIDE_PALETTE,
  VIEWBOX,
  drawingLevels,
  renderBuck,
} from "../mobile/src/lib/trait-drawings";
import type { ScoreValue, TraitId } from "../mobile/src/lib/offline-age-guide";

const outDir = process.argv[2] ?? join(process.cwd(), "docs/offline-age-guide");
mkdirSync(outDir, { recursive: true });

type Card = {
  traitId: TraitId;
  value: ScoreValue;
  file: string;
  caption: string;
  body: string;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const cards: Card[] = [];
for (const trait of TRAITS) {
  for (const value of drawingLevels(trait.id)) {
    const choice = trait.scores.find((row) => row.value === value);
    if (!choice) throw new Error(`Missing choice ${trait.id} ${String(value)}`);
    const caption = `${choice.ageIndication}  ${choice.label}`;
    const { body } = renderBuck(trait.id, value, "card");
    const file = `${trait.id}-${slug(String(value))}-${slug(choice.label)}`;
    cards.push({ traitId: trait.id, value, file, caption, body });
    const svg = cardSvg(body, caption);
    writeFileSync(join(outDir, `${file}.svg`), svg);
  }
  const strip = stripSvg(trait.id);
  writeFileSync(join(outDir, `${trait.id}-strip.svg`), strip);
}

function cardSvg(body: string, caption: string): string {
  const width = VIEWBOX.width;
  const height = VIEWBOX.height + 36;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${GUIDE_PALETTE.picture}"/>
  ${body}
  <text x="${width / 2}" y="${VIEWBOX.height + 24}" text-anchor="middle" font-family="DejaVu Sans" font-size="15" fill="${GUIDE_PALETTE.cream}">${escapeXml(caption)}</text>
</svg>`;
}

function stripSvg(traitId: TraitId): string {
  const traitCards = cards.filter((card) => card.traitId === traitId);
  const width = traitCards.length * VIEWBOX.width;
  const height = VIEWBOX.height + 36;
  const cells = traitCards
    .map((card, index) => {
      const x = index * VIEWBOX.width;
      return `<g transform="translate(${x} 0)">${card.body}<text x="${VIEWBOX.width / 2}" y="${VIEWBOX.height + 24}" text-anchor="middle" font-family="DejaVu Sans" font-size="15" fill="${GUIDE_PALETTE.cream}">${escapeXml(card.caption)}</text></g>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${GUIDE_PALETTE.picture}"/>
  ${cells}
</svg>`;
}

async function writePngs(): Promise<void> {
  const imported = await loadResvg();
  if (!imported) {
    console.log(
      "SVG files written. @resvg/resvg-js is not installed, so PNGs were skipped.",
    );
    return;
  }
  const { Resvg } = imported;
  const font = {
    fontFiles: ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    loadSystemFonts: false,
  };
  const jobs = [
    ...cards.map((card) => card.file),
    ...TRAITS.map((trait) => `${trait.id}-strip`),
  ];
  for (const file of jobs) {
    const svg = readFileSync(join(outDir, `${file}.svg`));
    const renderer = new Resvg(svg, {
      fitTo: { mode: "width", value: file.endsWith("strip") ? 2800 : 900 },
      font,
    });
    writeFileSync(join(outDir, `${file}.png`), renderer.render().asPng());
  }
  console.log(`Wrote ${jobs.length} PNGs to ${outDir}`);
}

async function loadResvg(): Promise<typeof import("@resvg/resvg-js") | null> {
  const candidates = [process.env.RESVG_MODULE, "@resvg/resvg-js"].filter(
    (item): item is string => Boolean(item),
  );
  for (const candidate of candidates) {
    try {
      return await import(candidate);
    } catch {
      // try the next location
    }
  }
  return null;
}

void writePngs();
