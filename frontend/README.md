# frontend

A map tool for planning river water-quality monitoring. Pick a catchment, a nutrient (total
nitrogen or total phosphorus), how often you would sample and for how long, and a target
reduction. It returns the statistical power: the probability that a real decrease of that
size would be detected by that monitoring design.

## Data processing

A researcher supplied the source data in `../../Handover`: 15,313 monitored river sites and
a 765,650-row table of fitted model results, 60.7 MB of CSV, full column names, full
precision. One site's location row, trimmed to the relevant columns:

```
site_id: WQ000004, latitude: 56.1261, longitude: -120.0564,
power_readiness_tier: A_robust, current_modelled_annual_median_mg_L: 0.1276002319716908,
n_positive_unique_dates: 159, HYBAS_ID: 8060331970  (26 columns in total)
```

`scripts/build_handover_data.py` runs once, offline, before deployment. It rounds every
number to the precision the map actually displays, renames each column to a one- or
two-letter key, and drops anything the browser never reads. The same site comes out as:

```json
{"i": "WQ000004", "y": 56.1261, "x": -120.0564, "r": 3, "t": 0,
 "c": 0.1276, "n": 159, "f": "2008-02-11", "l": "2024-10-08", "b": "8060331970"}
```

`decode()` in `lib/data.ts` expands these back to named fields the moment a site is drawn
or clicked, so every part of the code past that function works with named fields only. The
renaming roughly halves the file on disk, but the server gzips JSON before sending it and
gzip already removes most of that repetition, so the real saving over the network is
closer to 7%.

The power table gets the same treatment, then splits into 10 files, one per nutrient and
sampling frequency: 60.7 MB of CSV becomes 7.97 MB of JSON. Duration stays in each file as
10 precomputed values per site. Target reduction never touches a file at all, it's
arithmetic done in the browser, see [No server](#no-server).

Catchment outlines are simplified to 0.008° at build time. Each catchment's bounding box,
absent from the source, is computed once and cached alongside the rest.

The handover has no river geometry, so the rivers come from a second source:
[HydroRIVERS v1.0](https://www.hydrosheds.org/products/hydrorivers) (HydroSHEDS, WWF),
built on the same grid as the handover's catchment polygons.
`scripts/build_river_network.py` reads the seven regional shapefiles, keeps the 890,264
reaches that fall inside a monitored catchment, and writes one file per catchment: 1,177
files, 62.8 MB in total, median 54 kB, largest 115 kB. Each file is capped at 6,000
coordinate points, and the cap is met by dropping the smallest headwater streams first, so
876 catchments keep every reach and the six densest keep Strahler order 4 and above.

The reaches are drawn as context. Power is calculated at monitored sites and has not been
extrapolated to river reaches, so the lines carry no colour scale.

## Interaction flow

1. **Page loads.** Fetches `index.json` (0.36 MB: regions, 1,177 catchment summaries,
   bounding boxes) and `catchments.geojson` (4.16 MB: outlines). Every outline is drawn.
   No site markers yet: the opening world map is a catchment picker, and 15,313 markers
   sprayed across it invite the reader to zoom to a site before choosing where they are.
2. **Pick a nutrient** (defaults to nitrogen). Fetches `sites-tn.json` (0.51 MB, all 4,089
   nitrogen sites), held in memory until a region or catchment says which ones to draw.
3. **Pick a sampling frequency** (defaults to monthly). Fetches `power/tn-monthly.json`
   (0.43 MB, the standard error for all 4,089 sites at 10 durations each). Every marker can
   now show a power number.
4. **Click a catchment, or pick a region.** Markers appear: the region's sites as context,
   the open catchment's sites full size and clickable. Opening a catchment also fetches its
   river network, one file, median 54 kB.
5. **Move the duration or reduction slider.** No fetch happens. Duration picks one of the
   10 values already loaded; reduction is pure arithmetic on it.
6. **Switch nutrient or frequency.** Fetches one more file the first time it's used
   (roughly 1.1-1.4 MB for phosphorus, 0.43 MB for nitrogen), then never again: `/data/` is
   cached for a year (`max-age=31536000, immutable`), safe because every request carries
   `?v=<hash>` from `lib/data-version.ts`, so a rebuild changes the URL instead of serving a
   stale file.

A first-time visitor on the default nutrient and frequency: 4 requests, 5.46 MB, plus 54 kB
for the first catchment they open. A returning visitor: 0 requests.

Clicking a catchment works the same way as clicking anything small on a touchscreen: the
median catchment is 2.8 px wide at world zoom, so a click snaps to the nearest one within
60 px rather than needing an exact hit. A snapped click from that far out picks a region
rather than a catchment, because the polygon nearest the cursor means little at that size.
Once the reader has zoomed in far enough for the cursor to sit inside a polygon, that click
opens the catchment and holds the zoom they arrived at.

## Rendering

The map draws three things: outlines from `catchments.geojson`, markers from
`sites-{tn,tp}.json`, and, inside the open catchment only, reaches from
`rivers/<HYBAS_ID>.json`. Outlines and markers are culled to whatever is on screen and
redraw once, when the map stops moving. While the user is actively dragging or zooming, the
existing drawing is just moved with a CSS transform instead of being redrawn.

Markers are coloured on a traffic light: red below power 0.40, amber from 0.40, green at
0.80 and above. 0.80 is the target power the tool is built around, so the green edge is the
decision the reader is making. Reaches are one quiet blue, with the line width set by
Strahler order.

The basemap is Esri's World Light Gray Base, which needs no API key. CARTO's key-free
tiles were used until 27 August 2026, when CARTO began stamping "API KEY REQUIRED" across
every one of them.

## No server

Power for all 11,224 phosphorus sites, every frequency and duration, recomputes in 3.4 ms.
A server would only add a network round trip on top of that. The real costs are download
size and map drawing, both handled above. So there is no backend and no database: the
browser fetches static JSON and does the maths itself.

---

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Leaflet.

```bash
npm install
npm run dev                  # http://localhost:3000  (/ landing, /tool full screen)
npm run build && npm start   # production
npm run lint
```

Regenerate `public/data/` after the source in `../../Handover` changes:

```bash
python scripts/build_handover_data.py
```

Rebuild `public/data/rivers/` after downloading the HydroRIVERS regional shapefiles
(af, ar, as, au, eu, na, sa) from https://www.hydrosheds.org/products/hydrorivers and
unzipping them into one directory. It takes about 40 minutes and needs `pyshp` and
`shapely`:

```bash
python scripts/build_river_network.py --rivers PATH_TO_THAT_DIRECTORY
```

## Key files

| File | What it owns |
|---|---|
| `lib/data.ts` | all fetching, the `once()` cache, `decode()`, `slopeSe()` |
| `lib/power.ts` | the power calculation and the colour scale |
| `lib/summary.ts` | per-site results, catchment roll-up, CSV export |
| `components/tool/ToolShell.tsx` | all state; everything below is a pure function of it |
| `components/tool/layers/CatchmentOutlines.tsx` | outlines and all map click handling |
| `components/tool/layers/SiteLayer.tsx` | site markers, culling, which ones are clickable |
| `components/tool/layers/RiverLayer.tsx` | the open catchment's river reaches |
| `components/tool/layers/FitBounds.tsx` | the only camera control, driven by a bounding box |
| `scripts/build_handover_data.py` | `../../Handover` into `public/data/`, plus the version hash |
| `scripts/build_river_network.py` | HydroRIVERS into `public/data/rivers/`, one file per catchment |
| `scripts/acceptance.py` | the seven acceptance tests from the handover |
| `scripts/check_review_ui.mjs` | drives the three map states in a real browser |
| `next.config.ts` | the `/data/` cache header |
