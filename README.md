# Global Freshwater Monitoring

**Live at [global-freshwater-monitoring.vercel.app](https://global-freshwater-monitoring.vercel.app)**

Built for Prof. Rich McDowell's group at the Bioeconomy Science Institute (AgResearch), and handed
over in August 2026.

Pick a river catchment, a nutrient, how often you would sample and for how long, and a target
reduction. The map colours every monitoring site in that catchment by detection power: the
probability that a real decrease of that size would show up in the data.

Red is below 0.40, amber from 0.40, green at 0.80 and above. 0.80 is the target the tool is built
around, so the green sites are the ones where the monitoring design would work.

## What is in the data

**15,313 monitored site-nutrient records across 1,177 HydroBASINS level 6 catchments**, out of
16,397 catchment polygons worldwide. Each record is one site measured for one nutrient, fitted
against that site's real sampling history, which runs from 1967 to 2025.

```
Total phosphorus   11,224    Total nitrogen    4,089
```

Coverage is heavily uneven, and that is the dataset, not the tool:

```
Europe          ████████████████████████████████████████████  8,607   56.2%
North America   ███████████████████                           3,694   24.1%
Oceania         ████████████                                  2,345   15.3%
South America   ██                                              397    2.6%
Asia            █                                               186    1.2%
Africa          ▏                                                84    0.5%
```

Africa and Asia together hold 1.8% of the world's monitored records here. A user opening an African
catchment often finds one site or none, so the empty state had to be a real designed screen rather
than a blank map.

Confidence is split into two tiers by how much sampling history a site has:

```
A_robust      6,768        B_moderate      8,545        unassigned   35
```

Median site has 117 samples for nitrogen and 125 for phosphorus. The longest-running has 3,844.

## The design decision that shaped everything

**There is no backend.** The browser downloads static JSON and does the arithmetic itself.

A first visit costs 5.46 MB over 4 requests. Opening a catchment pulls one more file, median 54 kB.
Moving the duration or reduction slider is pure arithmetic on what is already loaded, so it responds
instantly and the hosting stays free.

That works because the expensive part, fitting a model to each site's sampling history, was done
once by the researchers. What is left is a power calculation from stored coefficients, which is a
few multiplications per site. Putting a server in front of that would have added hosting the group
has to pay for and maintain after I leave.

```
  Handover CSVs           build scripts              browser
  (researchers')    ──►   (Python, 25s)      ──►   static JSON  ──►  power maths in JS
  site coefficients       one file per               5.46 MB           per slider move
                          catchment                  first load
```

## Other decisions

- **Sites are capped at 4,000 markers.** Above that Leaflet's canvas renderer stalls on pan. It is a
  hard cap and not a resample, so a very dense catchment is currently truncated. Mike Kittridge
  raised this on 3 September 2026 and it is the top open item.
- **Clicks snap to the nearest catchment within 5 km.** At world zoom the median catchment is 2.8
  pixels across, so requiring an exact hit made the map feel broken. Sites that fall outside
  HydroBASINS coverage are labelled as such instead of being dropped.
- **River lines are context only.** HydroRIVERS v1.0 shards are drawn per catchment, but power has
  not been extended from sites to river reaches yet, so the lines carry no colour.
- **The data is not in this repository.** `frontend/public/data/` is gitignored because the source
  dataset is Rich McDowell's and is not redistributable. A fresh clone runs and the map is empty.
  Deploys go by `npx vercel --prod` from a machine that has the data, and `.vercelignore` is what
  keeps the data in the upload after `.gitignore` has taken it out of git.

## Where to look

| File | Why |
|---|---|
| [`frontend/lib/power.ts`](frontend/lib/power.ts) | The detection power calculation, which is what the tool exists to do |
| [`frontend/lib/data.ts`](frontend/lib/data.ts) | The load strategy: what comes down first, what waits for a click |
| [`frontend/scripts/build_handover_data.py`](frontend/scripts/build_handover_data.py) | Researcher CSVs to the JSON the browser reads, 25 seconds |
| [`frontend/scripts/acceptance.py`](frontend/scripts/acceptance.py) | The seven acceptance tests from the handover |

`frontend/README.md` goes through the data processing, the interaction flow and the rendering in
detail, and lists every file worth knowing about.

## Checking it

Seven acceptance tests came with the handover and all seven pass. `acceptance_report.pdf` holds the
last full run. Test 1 needs the researchers' `site_option2_power.csv`, which lives outside the
repository; it reports itself unrunnable when that file is absent instead of failing.

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
