# Global Freshwater Monitoring

Live: [global-freshwater-monitoring-screen.vercel.app](https://global-freshwater-monitoring-screen.vercel.app)

I designed and built `/tool`, the monitored site map, for Prof. Rich McDowell's group at the
Bioeconomy Science Institute (AgResearch), and handed it over in August 2026. Rich McDowell designed
and built `/modelled`, the global modelled catchment map, in September 2026, including the shard
format, the 5 degree tiling, the zoom threshold and the Cloudflare R2 hosting. My part there is a
script that shrinks his shards and two loader fixes.

Pick a river catchment, a nutrient, how often you would sample and for how long, and a target
reduction. The map colours every monitoring site in that catchment by detection power: the
probability that a real decrease of that size would show up in the data. Red is below 0.40, amber
from 0.40, green at 0.80 and above. 0.80 is the target the tool is built around, so green sites are
the ones where the monitoring design would work.

There are two maps. `/tool` covers the 1,177 catchments that hold real monitoring sites.
`/modelled` covers 618,553 HydroBASINS level 10 catchments whose figures come from a random forest
fitted to catchment properties, so most of them have never been sampled. Both use the same power
calculation.

## Setup

The processed data is not in this repository, because the source dataset is Rich McDowell's and is
not redistributable. A clone on its own runs and the map comes up empty. If you have the original
handover data, one script rebuilds everything the site serves.

**1. Put the handover folder next to the repository**, so the two sit side by side:

```
your-folder/
├── Handover/                          the handover data
│   ├── monitored_site_locations.csv
│   ├── monitored_catchments_summary.csv
│   ├── monitored_site_slope_se_lookup.csv
│   └── monitored_hydrobasins_level6.geojson
└── global-freshwater-monitoring/      this repository
```

If it lives somewhere else, set `HANDOVER_DIR` to that path instead. If a file is missing the script
names it and exits.

**2. Build the data.** Python 3.10 or newer with pandas:

```bash
pip install pandas
python frontend/scripts/build_handover_data.py
```

That writes `frontend/public/data/`: `sites-tn.json`, `sites-tp.json`, `catchments.geojson`,
`index.json`, and ten power files, one per nutrient and sampling frequency. It takes about 7 seconds
and prints the size of each file. The 765,650-row standard error lookup is split across those ten
files so the browser only ever fetches the one slice it needs.

**3. Run the site.** Node 22, from the `frontend/` folder:

```bash
cd frontend
npm ci
npm run build
npm start
```

It serves on `http://localhost:3000`. There is no backend, no database and no environment file. The
built output is a static site plus `public/data/`, so any static host will serve it.

River lines are separate, because the handover has no river geometry. Without them the map draws no
rivers and works otherwise:

```bash
python frontend/scripts/build_river_network.py --rivers <folder of unzipped HydroRIVERS regions>
```

HydroRIVERS v1.0 is a free download from
[hydrosheds.org](https://www.hydrosheds.org/products/hydrorivers) and needs attribution.

Checked on 7 September 2026 from a fresh clone: every file the app fetches returned 200, and the
rebuilt data matched the live deployment byte for byte apart from the build timestamp in
`index.json`.

## Data

15,313 monitored site-nutrient records across 1,177 HydroBASINS level 6 catchments, out of 16,397
catchment polygons worldwide. Each record is one site measured for one nutrient, fitted against that
site's real sampling history, which runs from 1967 to 2025. Total phosphorus has 11,224 records and
total nitrogen 4,089. The median site has 117 samples for nitrogen and 125 for phosphorus.

Coverage is uneven: Europe 8,607 records (56.2%), North America 3,694 (24.1%), Oceania 2,345
(15.3%), South America 397 (2.6%), Asia 186 (1.2%), Africa 84 (0.5%). Opening an African catchment
often finds one site or none, so there is an explicit empty state for that.

The modelled side covers 618,553 level 10 catchments, which Rich McDowell built from 941,012
HydroBASINS polygons with Greenland, Antarctica, desert biomes and catchments over 25% permafrost
removed. Each one carries a current concentration and slope standard errors for four
sampling frequencies across ten durations, so the reduction slider still calculates in the browser.
A predicted figure for a catchment that was actually measured is the weaker of the two, so `/tool`
stays the answer wherever real sites exist.

Those shards are not in this repository either. They live in a Cloudflare R2 bucket, 1,228 files and
1.27 GB, and the browser reads them straight from there, so a fresh clone runs `/modelled` as it is.

## Architecture

The browser downloads static JSON and does the arithmetic itself. A first visit costs 5.46 MB over
4 requests. Opening a catchment pulls one more file, median 54 kB. Moving the duration or reduction
slider is arithmetic on what is already loaded, so it responds instantly and the hosting stays free.

That works because the expensive part, fitting a model to each site's sampling history, was done
once by the researchers. What is left is a power calculation from stored coefficients, a few
multiplications per site. Putting a server in front of that would have added hosting the group has
to pay for and maintain after I leave.

## Rendering

Background sites are thinned on a screen grid: one site per grid cell, so two dots are never drawn
on top of each other. The cell shrinks as you zoom in and switches off at zoom 7, from which point
every site on screen is drawn. Sites in the open catchment are never thinned.

Measured over total phosphorus on one zoom in, starting on the whole world at zoom 2 and ending over
western Europe:

| Zoom | Grid cell | Dot radius | Sites in view | Sites drawn |
|---|---|---|---|---|
| 2 | 8 px | 1.6 px | 11,224 | 515 |
| 3 | 8 px | 1.6 px | 9,048 | 822 |
| 4 | 6.5 px | 2 px | 7,194 | 1,032 |
| 5 | 6.5 px | 2 px | 6,955 | 1,962 |
| 6 | 6 px | 2.6 px | 5,652 | 3,056 |
| 7 | off | 3 px | 4,121 | 4,121 |
| 8 | off | 3 px | 1,786 | 1,786 |
| 9 | off | 3 px | 494 | 494 |
| 10+ | off | 3.6 px | 151 | 151 |

This replaced a flat 4,000-marker cap on 4 September 2026. That cap walked the site list in file
order and stopped dead, so at Europe-wide zoom 7,205 sites were on screen, 4,000 were drawn and
3,205 were dropped. It cost France 46.6% of its sites against 98 to 100% for Germany, the United
Kingdom and Poland, because France has more sites than the rest of the view combined and its own
tail ran past the cutoff.

The grid costs less than it saves. At zoom 4 with 7,194 sites in view, thinning takes 2.1 ms and
drawing the 2,414 dots it keeps takes 4.7 ms, against 11.1 ms to draw all 7,194.

## Notes

- **Clicks snap to the nearest catchment within 5 km.** At world zoom the median catchment is 2.8
  pixels across, so requiring an exact hit made the map feel broken. Sites outside HydroBASINS
  coverage are labelled as such instead of being dropped.
- **River lines are context only.** HydroRIVERS v1.0 shards are drawn per catchment, but power has
  not been extended from sites to river reaches yet, so the lines carry no colour.

## Files

| File | Contains |
|---|---|
| [`frontend/lib/power.ts`](frontend/lib/power.ts) | The detection power calculation |
| [`frontend/lib/data.ts`](frontend/lib/data.ts) | What loads first, what waits for a click |
| [`frontend/components/tool/layers/SiteLayer.tsx`](frontend/components/tool/layers/SiteLayer.tsx) | Site markers and the screen-grid thinning |
| [`frontend/lib/modelled.ts`](frontend/lib/modelled.ts) | Shard index, viewport matching and the R2 fetches |
| [`frontend/components/tool/ModelledMap.tsx`](frontend/components/tool/ModelledMap.tsx) | The modelled catchment map |
| [`frontend/scripts/build_handover_data.py`](frontend/scripts/build_handover_data.py) | Handover CSVs to the JSON the browser reads |
| [`frontend/scripts/build_modelled_global_shards.py`](frontend/scripts/build_modelled_global_shards.py) | Level 10 catchments to the 1,228 shards |
| [`frontend/scripts/compact_modelled_shards.py`](frontend/scripts/compact_modelled_shards.py) | Rounds those shards down to 19% of their size |
| [`frontend/scripts/acceptance.py`](frontend/scripts/acceptance.py) | The seven acceptance tests from the handover |

Seven acceptance tests came with the handover and all seven pass; `acceptance_report.pdf` holds the
last full run. Test 1 needs the researchers' `site_option2_power.csv`, which lives outside the
repository, and reports itself unrunnable when that file is absent instead of failing.
`frontend/README.md` covers the data processing, the interaction flow and the rendering in detail.

---

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Leaflet. Build scripts are Python 3.10
with pandas, numpy, scipy, shapely and pyshp.

```
frontend/           the application
frontend/lib/       data loading and the power calculation
frontend/scripts/   build the data, run the tests, drive the browser
```

Statistics are from Prof. Rich McDowell's group, who fitted a model to each site's real sampling
history. River lines come from HydroRIVERS v1.0 (HydroSHEDS, WWF).
