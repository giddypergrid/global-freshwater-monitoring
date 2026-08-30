# global-freshwater-monitoring

Live: **https://global-freshwater-monitoring.vercel.app**

Pick a river catchment, a nutrient, how often you would sample and for how long, and a
target reduction. The map colours every monitoring site in that catchment by detection
power: the probability that a real decrease of that size would show up in the data.

Red is below 0.40, amber from 0.40, green at 0.80 and above. 0.80 is the target the tool
is built around, so the green sites are the ones where the monitoring design would work.

It covers 15,313 monitored site-nutrient records across 1,177 HydroBASINS level 6
catchments: 4,089 total nitrogen and 11,224 total phosphorus. The statistics come from
Prof. Rich McDowell's group at the Bioeconomy Science Institute, who fitted a model to each
site's real sampling history. River lines come from HydroRIVERS v1.0 (HydroSHEDS, WWF) and
are drawn for context, because power has not been extended from sites to river reaches yet.

There is no backend. The browser downloads static JSON and does the arithmetic itself. A
first visit costs 5.46 MB over 4 requests, opening a catchment adds one more file at a
median 54 kB, and moving the duration or reduction slider costs no request at all.

## The data is not in this repository

`frontend/public/data/` is gitignored. The source dataset is Rich McDowell's and is not
redistributable, so the repository holds the code and the build scripts, and the built JSON
is uploaded to the host separately.

That means a fresh clone runs, but the map is empty. To get real data you need the handover
folder from the researchers, sitting one level above the repository as `../Handover`:

```bash
cd frontend
npm install
python scripts/build_handover_data.py     # writes public/data/, 25 seconds
npm run dev                               # http://localhost:3000
```

River lines are a separate build and take about half an hour. Download the seven regional
shapefiles (af, ar, as, au, eu, na, sa) from https://www.hydrosheds.org/products/hydrorivers,
unzip them into one directory, then:

```bash
python scripts/build_river_network.py --rivers PATH_TO_THAT_DIRECTORY
```

Deploys go from a machine that has the data, `npx vercel --prod`, since a build from this
repository alone would produce a site with an empty map. `.vercelignore` is what keeps
`public/data/` in the upload after `.gitignore` has taken it out of git.

## Checking it

```bash
cd frontend
python scripts/acceptance.py     # the seven tests from the handover, all pass
```

Test 1 needs the researchers' `site_option2_power.csv`, which is base data and lives outside
the repository. It reports itself unrunnable when that file is absent, rather than failing.
`acceptance_report.pdf` holds the last full run.

---

Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Leaflet. Build scripts are
Python 3.10 with pandas, numpy, scipy, shapely and pyshp.

```
frontend/           the whole application
frontend/lib/       data loading and the power calculation
frontend/scripts/   build the data, run the tests, drive the browser
```

`frontend/README.md` goes through the data processing, the interaction flow and the
rendering in detail, and lists every file worth knowing about.
