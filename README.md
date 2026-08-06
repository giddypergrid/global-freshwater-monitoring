# global-freshwater-monitoring

Global version of the river water-quality monitoring tool at
[monitoringfreshwater.co.nz](https://www.monitoringfreshwater.co.nz/rivers).

Pick a country and a catchment, set a monitoring design (indicator, duration, sampling
frequency, target reduction), and the map colours every river reach and monitoring site by
the probability that design would actually detect the change.

## Status

Prototype. Geometry is real; water-quality variability is synthetic pending the modelled
data from the Bioeconomy Science Institute. See [frontend/README.md](frontend/README.md).

## Layout

```
frontend/   Next.js + React + Leaflet app, no backend — fetches static JSON
```

A `backend/` will be added if the modelled data turns out to need serving rather than
shipping as static files.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```
