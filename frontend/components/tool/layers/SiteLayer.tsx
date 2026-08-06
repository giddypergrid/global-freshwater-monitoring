"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { detectionPower, powerColour } from "@/lib/power";
import type { Query, SiteProps } from "@/lib/types";

type SiteCollection = GeoJSON.FeatureCollection<GeoJSON.Point, SiteProps>;

interface Props {
  sites: SiteCollection | null;
  query: Query;
  visible: boolean;
  onSelect: (site: SiteProps | null) => void;
}

function siteStyle(props: SiteProps, query: Query): L.CircleMarkerOptions {
  const power = detectionPower(
    props.cv[query.indicator],
    query.reduction,
    query.years,
    query.samplesPerYear,
  );
  return {
    fillColor: powerColour(power),
    fillOpacity: 1,
    color: "#0f172a",
    weight: 1,
    radius: 5,
  };
}

/** Existing monitoring sites, coloured by the same power scale as the reaches. */
export default function SiteLayer({ sites, query, visible, onSelect }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON<SiteProps> | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (!sites || !visible) return;

    const layer = L.geoJSON<SiteProps>(sites, {
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, siteStyle(feature.properties as SiteProps, queryRef.current)),
      onEachFeature: (feature, lyr) => {
        lyr.on("click", () => onSelect(feature.properties as SiteProps));
      },
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [sites, visible, map, onSelect]);

  useEffect(() => {
    layerRef.current?.eachLayer((lyr) => {
      const marker = lyr as L.CircleMarker;
      const props = (lyr as unknown as { feature: GeoJSON.Feature<GeoJSON.Point, SiteProps> })
        .feature.properties;
      marker.setStyle(siteStyle(props, query));
    });
  }, [query]);

  return null;
}
