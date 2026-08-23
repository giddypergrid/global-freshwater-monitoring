# frontend

A map tool for planning river water-quality monitoring. Pick a catchment, a nutrient (total
nitrogen or total phosphorus), how often you would sample and for how long, and a target
reduction. It returns the statistical power: the probability that a real decrease of that
size would be detected by that monitoring design.

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Leaflet. No backend, no
database. The browser downloads static JSON and does the maths itself.

```bash
npm install
npm run dev                  # http://localhost:3000  (/ landing, /tool full screen)
npm run build && npm start   # production
npm run lint
```

## How it works

A researcher supplied the source data in `../../Handover`: 15,313 monitored river sites, a
765,650-row table of fitted model results, and the catchment outlines. A build script turns
that folder into the files the browser fetches. The app never reads `Handover` directly.

```
../../Handover  ──[ build_handover_data.py ]──▶  public/data/  ──[ fetch ]──▶  browser
   78 MB, CSV            run once, offline          14 MB, JSON     5.46 MB per first visit
```

The statistics are already done upstream. Per site, frequency and duration, the source
table holds one number: `slope_se_per_year`, the standard error of the annual trend. From
that, power for any target reduction is two lines of arithmetic, run in the browser on
every slider move.

## Design decisions

| | Decision | Why |
|---|---|---|
| **1** | No backend | Power for all 11,224 phosphorus sites recomputes in **3.4 ms**. Download size and map drawing are the real costs, so there is no work worth moving to a server. |
| **2** | Split the big table into 10 files | Only nutrient and frequency change which file is needed, so the split is on those two: **60.7 MB of CSV becomes 7.97 MB of JSON**. Duration and target reduction are applied in the browser, so those controls never fetch. First visit: **4 files, 5.46 MB**. |
| **3** | Short field names in the JSON | A site is `{"i","y","x","r","t","c",…}` instead of full column names, expanded once by `decode()`. Worth knowing before copying the idea: it halves the file on disk, but servers gzip JSON anyway and gzip already removes that repetition, so the saving over the network is only **~7%**. |
| **4** | Cache the data for a year | `/data/` is served `max-age=31536000, immutable`. Safe only because every request carries `?v=<hash>`, a checksum of the data written into `lib/data-version.ts` at build time. Rebuild and every URL changes, so a stale file cannot be served. Second visit: **0 requests**. |
| **5** | Draw less, redraw rarely | Outlines are simplified at build time; markers are limited to the visible area and rebuilt only when the map stops moving, so dragging is a CSS transform. The median catchment is **2.8 px** wide at world zoom, so clicks snap to the nearest within 60 px instead of needing an exact hit. |

## Key files

| File | What it owns |
|---|---|
| `lib/data.ts` | all fetching, the `once()` cache, `decode()`, `slopeSe()` |
| `lib/power.ts` | the power calculation and the colour scale |
| `lib/summary.ts` | per-site results, catchment roll-up, CSV export |
| `components/tool/ToolShell.tsx` | all state; everything below is a pure function of it |
| `components/tool/layers/CatchmentOutlines.tsx` | outlines and all map click handling |
| `components/tool/layers/SiteLayer.tsx` | site markers, culling, which ones are clickable |
| `components/tool/layers/FitBounds.tsx` | the only camera control, driven by a bounding box |
| `scripts/build_handover_data.py` | `../../Handover` into `public/data/`, plus the version hash |
| `next.config.ts` | the `/data/` cache header |

## Data

Everything under `public/data/` is generated. Regenerate after the source changes:

```bash
python scripts/build_handover_data.py
```

| File | Contents |
|---|---|
| `index.json` | regions, 1,177 catchment summaries, bounding boxes, site counts |
| `catchments.geojson` | catchment outlines, simplified to 0.008° |
| `sites-{tn,tp}.json` | 4,089 nitrogen and 11,224 phosphorus sites |
| `power/{tn,tp}-{freq}.json` | `slope_se_per_year` per site, for 10 durations |

Two fields are absent from the source files and computed by the build script: each
catchment's bounding box, and the version hash.

## Checks

Playwright drives the copy of Edge already installed, so no browser download. Start the
server first.

```bash
node scripts/audit_map.mjs      # clicking, hover highlight, camera movement
node scripts/audit_app.mjs      # both routes at three widths, plus bad URL parameters
node scripts/audit_panel.mjs    # panel controls and site counts
node scripts/drilldown.mjs      # region into catchment into site
node scripts/shoot.mjs          # screenshots into screenshots/
```

Set `BASE_URL=https://<deployment>` to run any of them against a deployment.
`scripts/lib/mappx.mjs` converts latitude and longitude into screen pixels, so the checks
click real places rather than fixed coordinates that break when a layout changes.
