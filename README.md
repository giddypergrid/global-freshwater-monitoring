# Global Freshwater Monitoring

**Live at [global-freshwater-monitoring.vercel.app](https://global-freshwater-monitoring.vercel.app)**

Built for Prof. Rich McDowell's group at the Bioeconomy Science Institute (AgResearch), and handed
over in August 2026.

Pick a river catchment, a nutrient, how often you would sample and for how long, and a target
reduction. The map colours every monitoring site in that catchment by detection power: the
probability that a real decrease of that size would show up in the data. Red is below 0.40, amber
from 0.40, green at 0.80 and above. 0.80 is the target the tool is built around, so the green sites
are the ones where the monitoring design would work.

## Running it yourself

The processed data is not in this repository, because the source dataset is Rich McDowell's and is
not redistributable. A clone on its own runs and the map comes up empty. If you have the original
handover data, one script rebuilds everything the site serves.

**1. Put the handover folder next to the repository**, so the two sit side by side:

```
your-folder/
├── Handover/                          the researchers' drop
│   ├── monitored_site_locations.csv
│   ├── monitored_catchments_summary.csv
│   ├── monitored_site_slope_se_lookup.csv
│   └── monitored_hydrobasins_level6.geojson
└── global-freshwater-monitoring/      this repository
```

If it lives somewhere else, set `HANDOVER_DIR` to that path instead. Either way the script tells you
which files it could not find rather than failing on a stack trace.

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

It serves on `http://localhost:3000`. There is no backend, no database and no environment file, so
the built output is a static site plus `public/data/`, and any static host will serve it.

River lines are optional and are built separately, because the handover has no river geometry. Until
you build them the map works normally and simply draws no rivers:

```bash
python frontend/scripts/build_river_network.py --rivers <folder of unzipped HydroRIVERS regions>
```

HydroRIVERS v1.0 is a free download from
[hydrosheds.org](https://www.hydrosheds.org/products/hydrorivers) and needs attribution.

Verified on 7 September 2026 by cloning this repository fresh, rebuilding the data with no
configuration, and running `npm ci && npm run build && npm start`. Every file the app fetches
returned 200, and the rebuilt data matched the live deployment byte for byte apart from the build
timestamp in `index.json`.

## What is in the data

15,313 monitored site-nutrient records across 1,177 HydroBASINS level 6 catchments, out of 16,397
catchment polygons worldwide. Each record is one site measured for one nutrient, fitted against that
site's real sampling history, which runs from 1967 to 2025. Total phosphorus has 11,224 records and
total nitrogen 4,089. The median site has 117 samples for nitrogen and 125 for phosphorus.

Coverage is heavily uneven, and that is the dataset, not the tool: Europe 8,607 records (56.2%),
North America 3,694 (24.1%), Oceania 2,345 (15.3%), South America 397 (2.6%), Asia 186 (1.2%),
Africa 84 (0.5%). A user opening an African catchment often finds one site or none, so the empty
state is a designed screen rather than a blank map.

## No backend

The browser downloads static JSON and does the arithmetic itself. A first visit costs 5.46 MB over
4 requests. Opening a catchment pulls one more file, median 54 kB. Moving the duration or reduction
slider is arithmetic on what is already loaded, so it responds instantly and the hosting stays free.

That works because the expensive part, fitting a model to each site's sampling history, was done
once by the researchers. What is left is a power calculation from stored coefficients, a few
multiplications per site. Putting a server in front of that would have added hosting the group has
to pay for and maintain after I leave.

## Other decisions

- **Background sites are thinned on a screen grid, not capped.** At zoom 6 and wider the map keeps
  one site per 6 to 8 screen pixels, so the dots stay separate and the country names underneath stay
  readable. From zoom 7 in, thinning is off and every site on screen is drawn, and the open
  catchment's own sites are never thinned. This replaced a flat 4,000-marker cap on 4 September
  2026, which walked the site list in file order and stopped dead: at Europe-wide zoom 7,205 sites
  were on screen, 4,000 were drawn and 3,205 were dropped, which cost France 46.6% of its sites
  against 98 to 100% for Germany, the United Kingdom and Poland.
- **Clicks snap to the nearest catchment within 5 km.** At world zoom the median catchment is 2.8
  pixels across, so requiring an exact hit made the map feel broken. Sites outside HydroBASINS
  coverage are labelled as such instead of being dropped.
- **River lines are context only.** HydroRIVERS v1.0 shards are drawn per catchment, but power has
  not been extended from sites to river reaches yet, so the lines carry no colour.

## Where to look

| File | Why |
|---|---|
| [`frontend/lib/power.ts`](frontend/lib/power.ts) | The detection power calculation, which is what the tool exists to do |
| [`frontend/lib/data.ts`](frontend/lib/data.ts) | The load strategy: what comes down first, what waits for a click |
| [`frontend/scripts/build_handover_data.py`](frontend/scripts/build_handover_data.py) | Handover CSVs to the JSON the browser reads |
| [`frontend/scripts/acceptance.py`](frontend/scripts/acceptance.py) | The seven acceptance tests from the handover |

Seven acceptance tests came with the handover and all seven pass; `acceptance_report.pdf` holds the
last full run. Test 1 needs the researchers' `site_option2_power.csv`, which lives outside the
repository, and reports itself unrunnable when that file is absent instead of failing.
`frontend/README.md` goes through the data processing, the interaction flow and the rendering in
detail.

---

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Leaflet. Build scripts are Python 3.10
with pandas, numpy, scipy, shapely and pyshp.

```
frontend/           the whole application
frontend/lib/       data loading and the power calculation
frontend/scripts/   build the data, run the tests, drive the browser
```

Statistics are from Prof. Rich McDowell's group, who fitted a model to each site's real sampling
history. River lines come from HydroRIVERS v1.0 (HydroSHEDS, WWF).
