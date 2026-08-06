# frontend

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 + Leaflet. No backend — the
browser fetches static JSON from `public/data/` and computes detection power client-side.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Structure

```
app/                       routes — / (landing, tool embedded) and /tool (full screen)
components/tool/
  ToolShell.tsx            owns all state; everything below is a pure function of it
  MapView.tsx              Leaflet map, composes the layers
  layers/                  React wrappers around imperative Leaflet calls (each renders null)
  panel/                   country + catchment pickers, query controls, summary, CSV export
components/ui/             shadcn (built on @base-ui/react, not Radix)
lib/power.ts               detection power maths + colour scale
lib/types.ts               data contracts
public/data/               the served data (see below)
scripts/build_data.py      regenerates public/data/ from source shapefiles
scripts/*.mjs              Playwright checks — audit, sweep, shoot, diagnose
```

Layer order in `MapView` is paint order: outlines, then reaches, then sites.

## Data

| | Source | Real? |
|---|---|---|
| Catchment outlines | HydroBASINS v1c lev06, dissolved by `MAIN_BAS` | yes |
| River reaches + attributes | HydroRIVERS v1.0, Strahler order >= 3 | yes |
| Country borders | Natural Earth 110m | yes |
| `cv` per reach per indicator | generated spatial noise | **no — synthetic** |
| Monitoring sites | spaced along the largest reaches | synthetic placement |

Only `cv` (coefficient of variation) is invented. Swapping in modelled values replaces that
one field; detection power is derived from it in the browser, never stored.

Regenerate (needs the source shapefiles, not committed):

```bash
python scripts/build_data.py --source <dir-with-extracted-shapefiles> \
                             --countries ne_110m_admin_0_countries.geojson
```

## Checks

```bash
npm start                                   # audit expects a running server
node scripts/audit.mjs screenshots          # dropdowns, combobox, responsive, stale layers, rapid clicks
node scripts/sweep.mjs                      # loads all 27 catchments, asserts each draws
BASE_URL=https://<deployment> node scripts/sweep.mjs   # same, against a deployment
```
