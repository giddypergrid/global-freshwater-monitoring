/** Fetching and decoding the static data. Every file is fetched at most once. */

import { DATA_VERSION } from "./data-version";
import type {
  CatchmentOutlines,
  DataIndex,
  NutrientKey,
  PowerSlice,
  RawSite,
  Site,
  SiteFile,
} from "./types";

const cache = new Map<string, Promise<unknown>>();

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const pending = load().catch((error) => {
    cache.delete(key); // a failed fetch must not poison the slot
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

async function getJson<T>(path: string): Promise<T> {
  // /data/ is served with a one-year immutable Cache-Control, so the URL has to change
  // when the data does. DATA_VERSION is a content hash written by the build script.
  const response = await fetch(`${path}?v=${DATA_VERSION}`);
  if (!response.ok) throw new Error(`${path} — ${response.status}`);
  return (await response.json()) as T;
}

export function loadIndex(): Promise<DataIndex> {
  return once("index", () => getJson<DataIndex>("/data/index.json"));
}

export function loadOutlines(): Promise<CatchmentOutlines> {
  return once("outlines", () => getJson<CatchmentOutlines>("/data/catchments.geojson"));
}

function decode(raw: RawSite, file: SiteFile): Site {
  return {
    id: `${file.parameter}::${raw.i}`,
    siteId: raw.i,
    parameter: file.parameter,
    lat: raw.y,
    lon: raw.x,
    region: file.regions[raw.r],
    tier: file.tiers[raw.t],
    tierLabel: raw.t === 0 ? "Tier A — robust" : "Tier B — moderate",
    current: raw.c,
    threshold: file.threshold,
    aboveThreshold: raw.c > file.threshold,
    sampledDates: raw.n,
    modelFirst: raw.f,
    modelLast: raw.l,
    metaFirst: raw.F ?? raw.f,
    metaLast: raw.L ?? raw.l,
    hybasId: raw.b ?? null,
    basinMethod: file.methods[raw.m ?? 0],
    basinDistanceKm: raw.d ?? 0,
  };
}

export function loadSites(nutrient: NutrientKey): Promise<Site[]> {
  return once(`sites-${nutrient}`, async () => {
    const file = await getJson<SiteFile>(`/data/sites-${nutrient}.json`);
    return file.sites.map((raw) => decode(raw, file));
  });
}

/** One (nutrient, frequency) slice — never the whole 765,650-row table. */
export function loadPower(nutrient: NutrientKey, frequency: string): Promise<PowerSlice> {
  return once(`power-${nutrient}-${frequency}`, () =>
    getJson<PowerSlice>(`/data/power/${nutrient}-${frequency}.json`),
  );
}

/** The standard error for one site under one duration, or null if the site is absent. */
export function slopeSe(slice: PowerSlice, siteId: string, years: number): number | null {
  const row = slice.se[siteId];
  if (!row) return null;
  const at = slice.durations.indexOf(years);
  return at === -1 ? null : row[at];
}
