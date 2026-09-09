export type ModelledFrequency = "m" | "f" | "w" | "t";

export interface ModelledSe {
  m: number[];
  f: number[];
  w: number[];
  t: number[];
}

export interface ModelledCatchmentProperties {
  id: number;
  tn: number;
  tp: number;
  np: number;
  c: number;
  cc: string;
  ct: string;
  tnse: ModelledSe;
  tpse: ModelledSe;
}

export type ModelledFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  ModelledCatchmentProperties
>;

export interface ModelledShard {
  type: "FeatureCollection";
  metadata: {
    mode: "modelled";
    years: number[];
    frequencies: Record<ModelledFrequency, string>;
    tnThreshold: number;
    tpThreshold: number;
    alpha: number;
    targetPower: number;
  };
  features: ModelledFeature[];
}

export interface ModelledShardIndexEntry {
  file: string;
  count: number;
  bbox: [number, number, number, number];
  tile: [number, number];
  rawBytes: number;
  gzipBytes: number;
}

export interface ModelledIndex {
  version: string;
  mode: "modelled";
  label: string;
  description: string;
  simplificationDegrees: number;
  years: number[];
  thresholdsMgL: {
    TN: number;
    TP: number;
  };
  shards: ModelledShardIndexEntry[];
}

const indexCache: { value?: Promise<ModelledIndex> } = {};
const shardCache = new Map<string, Promise<ModelledShard>>();

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${path}?v=modelled-global-v1`);
  if (!response.ok) {
    throw new Error(`${path} - ${response.status}`);
  }
  return (await response.json()) as T;
}

export function loadModelledIndex(): Promise<ModelledIndex> {
  if (!indexCache.value) {
    indexCache.value = getJson<ModelledIndex>(
      "https://pub-19a8d3292c434db9ba82f5e1b90c9cdb.r2.dev/modelled/index.json",
    ).catch((error) => {
      delete indexCache.value;
      throw error;
    });
  }

  return indexCache.value;
}

export function loadModelledShard(file: string): Promise<ModelledShard> {
  const existing = shardCache.get(file);
  if (existing) return existing;

  const pending = getJson<ModelledShard>(
    `https://pub-19a8d3292c434db9ba82f5e1b90c9cdb.r2.dev/modelled/${file}`,
  ).catch((error) => {
    shardCache.delete(file);
    throw error;
  });

  shardCache.set(file, pending);
  return pending;
}

export function bboxIntersects(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  const [aWest, aSouth, aEast, aNorth] = a;
  const [bWest, bSouth, bEast, bNorth] = b;

  return !(
    aEast < bWest ||
    aWest > bEast ||
    aNorth < bSouth ||
    aSouth > bNorth
  );
}

export function frequencyLabel(key: ModelledFrequency): string {
  switch (key) {
    case "m":
      return "Monthly";
    case "f":
      return "Fortnightly";
    case "w":
      return "Weekly";
    case "t":
      return "Twice-weekly";
  }
}


