# MACKENZIE

A mapped, sourced, multi-vector history of every golf course I've played.

Named for Alister MacKenzie — whose first American course, Meadow Club, sits 3rd
on the list this map is built from.

**[SPEC.md](SPEC.md) is the living document.** This file is just how to run it.

## Run it

```bash
npm run dev          # http://localhost:3000
```

## Rebuild the data

```bash
npm run all          # parse → geocode → osm → build → validate
```

Or one stage at a time:

| Command | Reads | Writes |
|---|---|---|
| `npm run parse` | `data/raw/grint-*.txt` | `layouts.json`, `facilities.json` |
| `npm run geocode` | `facilities.json` | `geocache.json`, `geocode-unresolved.md` |
| `npm run osm` | `facilities.json`, `geocache.json` | `course-polygons.geojson`, `osm-cache.json`, repairs `geocache.json` |
| `npm run build` | all of the above + `facts.json`, `weights.json` | `courses.json` |
| `npm run validate` | `courses.json` | nothing — prints coverage, exits non-zero on error |

The network stages are cached in git (`geocache.json`, `osm-cache.json`), so a
clean checkout rebuilds with zero API calls. Delete a cache entry to refetch it.

## Layout

```
index.html          the map
css/map.css         chrome; tokens mirrored from ummerr.github.io
src/shared.js       tokens, ramp, formatters — globals, no modules
src/panel.js        the dossier
src/map.js          MapLibre + layers + interactions
scripts/*.mjs       the pipeline, ESM, zero runtime dependencies
data/raw/           the source paste, verbatim, never edited
```

No bundler, no build step. `npx serve .` and CDN libraries, same as
`archetypes-audit`.

## Hand-editable files

Everything else is generated. These are yours:

- **`data/facts.json`** — external claims. Every one carries a source. See the
  contract in the file's own `_README`.
- **`data/weights.json`** — the ranking lenses.
- **`data/geocode-overrides.json`** — hand-entered coordinates; wins over
  everything.

## Attribution

Imagery © Esri, Maxar, Earthstar Geographics. Course geometry ©
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Geocoding by [Nominatim](https://nominatim.openstreetmap.org/). Personal
scores and ratings from [The Grint](https://thegrint.com).
