/**
 * Home is where he lives. Hunt is where he is hunting today.
 * Texas polygons are simplified extents for an offline confirm step.
 * They are not official TPWD boundary surveys. The hunter confirms with one tap.
 *
 * Antler averages are the TPWD 19-year gross Boone & Crockett figures already
 * quoted in REGIONAL_PRIOR (prompts.ts): at 5.5+, Edwards Plateau about 118,
 * Pineywoods 126, South Texas Plains 132, Western Rolling Plains 133.
 * At 3.5, Edwards Plateau about 99 and Blackland Prairie about 117.
 * Those are antler scores. This file does not add body-size claims.
 */

export interface Place {
  stateCode: string;
  stateName: string;
  ecoregion: string;
  label: string;
}

interface RingPlace extends Place {
  ring: Array<[number, number]>;
}

interface StateBox {
  stateCode: string;
  stateName: string;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

const box = (minLon: number, minLat: number, maxLon: number, maxLat: number): Array<[number, number]> => [
  [minLon, minLat],
  [maxLon, minLat],
  [maxLon, maxLat],
  [minLon, maxLat],
];

/** Checked in order. Earlier rings win when a point sits on a shared edge. */
const TEXAS: RingPlace[] = [
  { stateCode: "TX", stateName: "Texas", ecoregion: "Trans-Pecos", label: "Trans-Pecos", ring: box(-106.7, 28.9, -102.2, 32.2) },
  { stateCode: "TX", stateName: "Texas", ecoregion: "High Plains", label: "High Plains", ring: box(-103.1, 32.4, -100.0, 36.5) },
  { stateCode: "TX", stateName: "Texas", ecoregion: "Western Rolling Plains", label: "Western Rolling Plains", ring: box(-101.6, 32.0, -98.7, 34.7) },
  { stateCode: "TX", stateName: "Texas", ecoregion: "Edwards Plateau", label: "Edwards Plateau", ring: box(-101.6, 29.6, -98.0, 32.0) },
  { stateCode: "TX", stateName: "Texas", ecoregion: "South Texas Plains", label: "South Texas Plains", ring: box(-100.9, 25.8, -97.0, 29.6) },
  { stateCode: "TX", stateName: "Texas", ecoregion: "Pineywoods", label: "Pineywoods", ring: box(-95.5, 30.4, -93.5, 33.7) },
  { stateCode: "TX", stateName: "Texas", ecoregion: "Gulf Prairies", label: "Gulf Prairies", ring: box(-97.5, 28.3, -93.6, 30.4) },
  { stateCode: "TX", stateName: "Texas", ecoregion: "Blackland Prairie", label: "Blackland Prairie", ring: box(-97.9, 30.2, -95.5, 33.6) },
];

const STATES: StateBox[] = [
  { stateCode: "AL", stateName: "Alabama", minLon: -88.5, minLat: 30.2, maxLon: -84.9, maxLat: 35.0 },
  { stateCode: "AR", stateName: "Arkansas", minLon: -94.6, minLat: 33.0, maxLon: -89.6, maxLat: 36.5 },
  { stateCode: "AZ", stateName: "Arizona", minLon: -114.8, minLat: 31.3, maxLon: -109.0, maxLat: 37.0 },
  { stateCode: "CO", stateName: "Colorado", minLon: -109.1, minLat: 37.0, maxLon: -102.0, maxLat: 41.0 },
  { stateCode: "FL", stateName: "Florida", minLon: -87.6, minLat: 25.1, maxLon: -80.0, maxLat: 31.0 },
  { stateCode: "GA", stateName: "Georgia", minLon: -85.6, minLat: 30.4, maxLon: -80.8, maxLat: 35.0 },
  { stateCode: "IA", stateName: "Iowa", minLon: -96.6, minLat: 40.4, maxLon: -90.1, maxLat: 43.5 },
  { stateCode: "ID", stateName: "Idaho", minLon: -117.2, minLat: 42.0, maxLon: -111.0, maxLat: 49.0 },
  { stateCode: "IL", stateName: "Illinois", minLon: -91.5, minLat: 37.0, maxLon: -87.5, maxLat: 42.5 },
  { stateCode: "IN", stateName: "Indiana", minLon: -88.1, minLat: 37.8, maxLon: -84.8, maxLat: 41.8 },
  { stateCode: "KS", stateName: "Kansas", minLon: -102.1, minLat: 37.0, maxLon: -94.6, maxLat: 40.0 },
  { stateCode: "KY", stateName: "Kentucky", minLon: -89.6, minLat: 36.5, maxLon: -81.9, maxLat: 39.1 },
  { stateCode: "LA", stateName: "Louisiana", minLon: -94.0, minLat: 29.0, maxLon: -89.0, maxLat: 33.0 },
  { stateCode: "MD", stateName: "Maryland", minLon: -79.5, minLat: 37.9, maxLon: -75.0, maxLat: 39.7 },
  { stateCode: "MI", stateName: "Michigan", minLon: -90.4, minLat: 41.7, maxLon: -82.4, maxLat: 48.2 },
  { stateCode: "MN", stateName: "Minnesota", minLon: -97.2, minLat: 43.5, maxLon: -89.5, maxLat: 49.4 },
  { stateCode: "MO", stateName: "Missouri", minLon: -95.8, minLat: 36.0, maxLon: -89.1, maxLat: 40.6 },
  { stateCode: "MS", stateName: "Mississippi", minLon: -91.7, minLat: 30.2, maxLon: -88.1, maxLat: 35.0 },
  { stateCode: "MT", stateName: "Montana", minLon: -116.1, minLat: 44.4, maxLon: -104.0, maxLat: 49.0 },
  { stateCode: "NC", stateName: "North Carolina", minLon: -84.3, minLat: 33.8, maxLon: -75.5, maxLat: 36.6 },
  { stateCode: "ND", stateName: "North Dakota", minLon: -104.1, minLat: 45.9, maxLon: -96.6, maxLat: 49.0 },
  { stateCode: "NE", stateName: "Nebraska", minLon: -104.1, minLat: 40.0, maxLon: -95.3, maxLat: 43.0 },
  { stateCode: "NM", stateName: "New Mexico", minLon: -109.1, minLat: 31.3, maxLon: -103.0, maxLat: 37.0 },
  { stateCode: "NY", stateName: "New York", minLon: -79.8, minLat: 40.5, maxLon: -71.9, maxLat: 45.0 },
  { stateCode: "OH", stateName: "Ohio", minLon: -84.8, minLat: 38.4, maxLon: -80.5, maxLat: 42.0 },
  { stateCode: "OK", stateName: "Oklahoma", minLon: -103.0, minLat: 33.6, maxLon: -94.4, maxLat: 37.0 },
  { stateCode: "OR", stateName: "Oregon", minLon: -124.6, minLat: 42.0, maxLon: -116.5, maxLat: 46.3 },
  { stateCode: "PA", stateName: "Pennsylvania", minLon: -80.5, minLat: 39.7, maxLon: -74.7, maxLat: 42.3 },
  { stateCode: "SC", stateName: "South Carolina", minLon: -83.4, minLat: 32.0, maxLon: -78.5, maxLat: 35.2 },
  { stateCode: "SD", stateName: "South Dakota", minLon: -104.1, minLat: 42.5, maxLon: -96.4, maxLat: 45.9 },
  { stateCode: "TN", stateName: "Tennessee", minLon: -90.3, minLat: 35.0, maxLon: -81.6, maxLat: 36.7 },
  { stateCode: "UT", stateName: "Utah", minLon: -114.1, minLat: 37.0, maxLon: -109.0, maxLat: 42.0 },
  { stateCode: "VA", stateName: "Virginia", minLon: -83.7, minLat: 36.5, maxLon: -75.2, maxLat: 39.5 },
  { stateCode: "WI", stateName: "Wisconsin", minLon: -92.9, minLat: 42.5, maxLon: -86.8, maxLat: 47.1 },
  { stateCode: "WV", stateName: "West Virginia", minLon: -82.6, minLat: 37.2, maxLon: -77.7, maxLat: 40.6 },
  { stateCode: "WY", stateName: "Wyoming", minLon: -111.1, minLat: 41.0, maxLon: -104.1, maxLat: 45.0 },
];

/** Onboarding names that mean the same TPWD region as the hunt lookup. */
const ALIASES: Record<string, string> = {
  "east texas pineywoods": "Pineywoods",
  pineywoods: "Pineywoods",
  "south texas brush country": "South Texas Plains",
  "south texas plains": "South Texas Plains",
  "hill country/edwards plateau": "Edwards Plateau",
  "edwards plateau": "Edwards Plateau",
  "north-central texas prairies": "Blackland Prairie",
  "blackland prairie": "Blackland Prairie",
  "west texas/trans-pecos": "Trans-Pecos",
  "trans-pecos": "Trans-Pecos",
  "western rolling plains": "Western Rolling Plains",
  "high plains": "High Plains",
  "gulf prairies": "Gulf Prairies",
};

/** Gross B&C at 5.5+, TPWD 19-year averages from REGIONAL_PRIOR. */
const ANTLER_55: Record<string, number> = {
  "Edwards Plateau": 118,
  Pineywoods: 126,
  "South Texas Plains": 132,
  "Western Rolling Plains": 133,
};

/** Gross B&C at 3.5, same TPWD source. */
const ANTLER_35: Record<string, number> = {
  "Edwards Plateau": 99,
  "Blackland Prairie": 117,
};

export const GENERIC_REGION_NOTE = "Deer in this region may look different from the ones at home, so lean on body shape.";

export function canonicalEcoregion(name: string): string {
  return ALIASES[name.trim().toLowerCase()] ?? name.trim();
}

export function insideRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > lat) !== (yj > lat);
    if (crosses && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function regionAt(lat: number, lon: number): Place | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const region of TEXAS) {
    if (insideRing(lon, lat, region.ring)) {
      return { stateCode: region.stateCode, stateName: region.stateName, ecoregion: region.ecoregion, label: region.label };
    }
  }
  const inTexas = lon >= -106.7 && lon <= -93.5 && lat >= 25.8 && lat <= 36.5;
  if (inTexas) return { stateCode: "TX", stateName: "Texas", ecoregion: "", label: "Texas" };
  const hits = STATES.filter((state) => lon >= state.minLon && lon <= state.maxLon && lat >= state.minLat && lat <= state.maxLat);
  hits.sort((a, b) => (a.maxLon - a.minLon) * (a.maxLat - a.minLat) - (b.maxLon - b.minLon) * (b.maxLat - b.minLat));
  const state = hits[0];
  if (!state) return null;
  return { stateCode: state.stateCode, stateName: state.stateName, ecoregion: "", label: state.stateName };
}

export function sameHunt(home: Place, hunt: Place): boolean {
  if (!home.stateCode || !hunt.stateCode) return true;
  if (home.stateCode !== hunt.stateCode) return false;
  const homeRegion = canonicalEcoregion(home.ecoregion || home.label);
  const huntRegion = canonicalEcoregion(hunt.ecoregion || hunt.label);
  if (!homeRegion || !huntRegion) return true;
  if (homeRegion === home.stateName || huntRegion === hunt.stateName) return true;
  return homeRegion === huntRegion;
}

function sourcedAntlerLine(home: Place, hunt: Place): string {
  const homeName = canonicalEcoregion(home.ecoregion || home.label);
  const huntName = canonicalEcoregion(hunt.ecoregion || hunt.label);
  const olderHome = ANTLER_55[homeName];
  const olderHunt = ANTLER_55[huntName];
  if (olderHome && olderHunt) {
    return `${hunt.label} bucks average about ${olderHunt} gross B&C at 5.5+, against about ${olderHome} where you live (${home.label}).`;
  }
  const youngerHome = ANTLER_35[homeName];
  const youngerHunt = ANTLER_35[huntName];
  if (youngerHome && youngerHunt) {
    return `At 3.5 years, ${hunt.label} averages about ${youngerHunt} gross B&C, against about ${youngerHome} where you live (${home.label}).`;
  }
  return "";
}

/** Remote copy may include {hunt}, {home}, and {sourced}. Empty remote copy uses the sourced line or the generic one. */
export function regionHeadsUp(home: Place, hunt: Place, remote = ""): string | null {
  if (sameHunt(home, hunt)) return null;
  const sourced = sourcedAntlerLine(home, hunt);
  const template = remote.trim();
  if (template) {
    return template
      .replaceAll("{hunt}", hunt.label)
      .replaceAll("{home}", home.label)
      .replaceAll("{sourced}", sourced);
  }
  if (sourced) return `${sourced} Judge age on body shape, not antler size.`;
  return GENERIC_REGION_NOTE;
}

export const TEXAS_HUNT_CHOICES: Place[] = TEXAS.map((region) => ({
  stateCode: region.stateCode,
  stateName: region.stateName,
  ecoregion: region.ecoregion,
  label: region.label,
}));

export const STATE_HUNT_CHOICES: Place[] = STATES.map((state) => ({
  stateCode: state.stateCode,
  stateName: state.stateName,
  ecoregion: "",
  label: state.stateName,
}));
