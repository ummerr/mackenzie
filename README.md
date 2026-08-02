# MACKENZIE

A mapped, sourced, multi-vector history of every golf course I've played.

Named for Alister MacKenzie — whose first American course, Meadow Club, sits 3rd
on the list this map is built from.

**Live:** [mackenzie-phi.vercel.app](https://mackenzie-phi.vercel.app) →
[courses.ummerr.com](https://courses.ummerr.com) *(pending one DNS record — see Deploy)*

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

## Yardages

`yardages/` is a second, separate section: a longitudinal shot ledger for Garmin
Approach R50 range exports. It is a Next.js app with its own dependencies, its
own Supabase database and **its own Vercel project** — this site stays
zero-build. See [`yardages/README.md`](yardages/README.md) to run it, and
`DECISIONS.md` for why it is not a route on this one.

```bash
cd yardages && pnpm install && pnpm dev
```

## Hand-editable files

Everything else is generated. These are yours:

- **`data/facts.json`** — external claims. Every one carries a source. See the
  contract in the file's own `_README`.
- **`data/weights.json`** — the ranking lenses.
- **`data/geocode-overrides.json`** — hand-entered coordinates; wins over
  everything.

## Deploy

Vercel project `mackenzie`, static, no build step. `vercel deploy --prod` from
the repo root; the stable alias is `mackenzie-phi.vercel.app`.

Two things that are easy to trip over again:

- **`vercel.json` pins `framework`, `buildCommand` and `installCommand` to
  `null`.** Without that, Vercel sees a `build` script in `package.json`, runs
  it (it's the *data* pipeline, not a web build), then fails looking for a
  `public/` output directory.
- **Deployment Protection was on by default** and 302'd every request to Vercel
  SSO. Disabled via `PATCH /v9/projects/{id}` with `{"ssoProtection": null}`.

### Remaining DNS step

`courses.ummerr.com` is registered on the project and ownership is verified,
but the record doesn't exist yet. At Namecheap (nameservers
`dns1/dns2.registrar-servers.com`), add:

```
Type    Host      Value
CNAME   courses   76eecdbd0728d887.vercel-dns-017.com.
```

That's the project-specific target Vercel recommends — the same pattern
`golf.ummerr.com` already uses. `A courses 76.76.21.21` also works if the
registrar won't take a CNAME on that host.

Then add the row to `ummerr.github.io/index.html` beside the P-07 Golf card.

## Attribution

Imagery © Esri, Maxar, Earthstar Geographics. Course geometry ©
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Geocoding by [Nominatim](https://nominatim.openstreetmap.org/). Personal
scores and ratings from [The Grint](https://thegrint.com).
