export type IndicatorKey = string;

export interface Indicator {
  key: IndicatorKey;
  label: string;
}

export interface CountrySummary {
  name: string;
  bbox: [number, number, number, number];
  catchmentCount: number;
}

export interface CatchmentSummary {
  id: string;
  name: string;
  country: string;
  areaKm2: number;
  areaPublishedKm2: number;
  subBasins: number;
  bbox: [number, number, number, number];
  reachCount: number;
  siteCount: number;
  minOrder: number;
}

export interface DataIndex {
  defaultCountry: string;
  indicators: Indicator[];
  countries: CountrySummary[];
  catchments: CatchmentSummary[];
}

export interface ReachProps {
  id: number;
  ord: number;
  len: number;
  dis: number;
  up: number;
  cv: Record<IndicatorKey, number>;
}

export interface SiteProps {
  id: number;
  name: string;
  ord: number;
  cv: Record<IndicatorKey, number>;
}

/** Per-catchment payload. Counts live in the index, not in the detail file. */
export interface CatchmentDetail {
  id: string;
  name: string;
  country: string;
  areaKm2: number;
  areaPublishedKm2: number;
  subBasins: number;
  bbox: [number, number, number, number];
  minOrder: number;
  reaches: GeoJSON.FeatureCollection<GeoJSON.LineString, ReachProps>;
  sites: GeoJSON.FeatureCollection<GeoJSON.Point, SiteProps>;
}

export interface CatchmentOutlineProps {
  id: string;
  name: string;
  country: string;
}

export type CatchmentOutlines = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  CatchmentOutlineProps
>;

export interface Query {
  indicator: IndicatorKey;
  years: number;
  samplesPerYear: number;
  reduction: number; // percent
}

/** What the user last clicked on the map. Power is derived, so only props are held. */
export type Selection =
  | { kind: "reach"; props: ReachProps }
  | { kind: "site"; props: SiteProps };
