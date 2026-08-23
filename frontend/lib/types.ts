/** Shapes of the static files in public/data, built by scripts/build_handover_data.py. */

export type NutrientKey = "tn" | "tp";

export interface Nutrient {
  key: NutrientKey;
  parameter: "TN" | "TP";
  label: string;
  threshold: number;
  sites: number;
}

export interface RegionSummary {
  name: string;
  sites: number;
  catchments: number;
  bbox: [number, number, number, number];
}

/** HydroBASINS level-6 catchment. It has no name, so the id is the label. */
export interface CatchmentSummary {
  id: string;
  region: string;
  hydroRegion: string;
  bbox: [number, number, number, number] | null;
  records: number;
  tn: number;
  tp: number;
  tierA: number;
  tierB: number;
  subArea: number;
  upArea: number;
  nextDown: string;
  mainBas: string;
  pfaf: string;
  endo: number;
  coast: number;
  order: number;
  medianTn: number | null;
  medianTp: number | null;
}

export interface DataIndex {
  generated: string;
  nutrients: Nutrient[];
  frequencies: string[];
  durations: number[];
  alpha: number;
  targetPower: number;
  /** Mandated wording for the concentration figure; shipped in the data on purpose. */
  concentrationLabel: string;
  totals: {
    records: number;
    catchments: number;
    tierA: number;
    tierB: number;
    unassignedSites: number;
    polygonsWorldwide: number;
  };
  defaultRegion: string;
  regions: RegionSummary[];
  catchments: CatchmentSummary[];
}

/** Keys are short because this array carries every site of one nutrient. */
export interface RawSite {
  i: string;
  y: number;
  x: number;
  r: number;
  t: 0 | 1;
  c: number;
  n: number;
  f: string;
  l: string;
  b?: string;
  m?: number;
  d?: number;
  F?: string;
  L?: string;
}

export interface SiteFile {
  parameter: "TN" | "TP";
  threshold: number;
  regions: string[];
  tiers: string[];
  methods: string[];
  sites: RawSite[];
}

/** A site after the lookup arrays are resolved into readable values. */
export interface Site {
  /** site_parameter_id, e.g. "TN::WQ000004" — the key into the power lookup. */
  id: string;
  siteId: string;
  parameter: "TN" | "TP";
  lat: number;
  lon: number;
  region: string;
  tier: string;
  tierLabel: string;
  current: number;
  threshold: number;
  aboveThreshold: boolean;
  sampledDates: number;
  modelFirst: string;
  modelLast: string;
  metaFirst: string;
  metaLast: string;
  hybasId: string | null;
  basinMethod: string;
  basinDistanceKm: number;
}

/** One (nutrient, frequency) slice of the lookup: site id -> SE at each duration. */
export interface PowerSlice {
  durations: number[];
  samplesPerYear: number;
  se: Record<string, number[]>;
}

export interface CatchmentOutlineProps {
  id: string;
  n: number;
}

export type CatchmentOutlines = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  CatchmentOutlineProps
>;

/** Everything the user has chosen. Power is always derived, never stored. */
export interface Query {
  nutrient: NutrientKey;
  frequency: string;
  years: number;
  reduction: number;
}
