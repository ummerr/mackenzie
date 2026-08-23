# Garmin Golf Export

A Chrome extension that exports your own Garmin Connect golf data — every
scorecard, the AutoShot shot-by-shot detail per hole, your club list, and the
aggregate stats views — as one JSON bundle for the mackenzie pipeline.

It is the Garmin **source adapter**'s capture half, the sibling of
`../grint-extension/`. The extension only *captures*; parsing stays in Node
scripts under `../scripts/` so a parser fix can be replayed over history.
Unlike TheGrint there is no HTML to scrape: the connect.garmin.com SPA is fed
by JSON endpoints under `gcs-golfcommunity/api/v2`, and the bundle stores each
response body character-for-character as the server sent it.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select this folder (`garmin-extension/`).

## Use

1. Log in at [connect.garmin.com](https://connect.garmin.com) and stay on any
   connect.garmin.com page.
2. Click the extension icon → **Capture all**.
3. Wait. Fetches are sequential with a ~500–750 ms gap. Progress shows per
   phase. Closing the popup does **not** stop the run — the bundle downloads
   when it finishes.
4. Move the downloaded `garmin-export-YYYY-MM-DD.json` to `../data/raw/`.
5. From the repo root: `pnpm data:garmin:inventory` to validate and
   summarize it.

## Incremental runs

Feed the popup the **previous bundle** (the file input under the button): the
button becomes **Capture new rounds**, and the run skips every scorecard whose
detail *and* hole shots the previous bundle already holds. The summary, club
list, and stats views are always refetched — aggregates change with every
round. The download is a small *delta* bundle: same format plus a `baseline`
field, filename suffixed with the capture time
(`garmin-export-YYYY-MM-DD-HHMM.json`) so it never collides with a same-day
full bundle. Drop it in `../data/raw/` next to the full one —
`pnpm data:garmin` merges the newest full bundle with every delta captured
after it.

A delta can never record a round *deleted* on Garmin. Run a plain **Capture
all** occasionally (or after deleting a round); a new full bundle re-baselines
the merge.

## What it captures

| Phase | Endpoint | Kept verbatim |
|---|---|---|
| summary | `GET …/scorecard/summary?per-page=10000` | the full scorecard list (also the login check and discovery — one call) |
| details | `GET …/scorecard/detail?scorecard-ids=<id>` per scorecard | per-hole strokes, putts, course, start time |
| hole shots | `GET …/shot/scorecard/<id>/hole?hole-numbers=…` | the AutoShot list per hole — club, distance, coordinates, lie |
| aggregates | `GET …/club/player`, `…/club/types`, `…/player/stats`, `…/shot/stats/{drive,approach,chip,putt}` | club list + clubId→type map and Garmin's own rollups |

Whether one batched `hole-numbers=1,2,…` call per scorecard works is probed on
the first scorecard and the adopted pattern recorded in
`discovery.holeShotPattern`; the fallback is one call per hole. JSON only —
hole imagery is never fetched. Failures land in the bundle's `errors[]`; one
bad round never aborts the run. The bundle schema is `garmin-export/1` — see
`scripts/inventory-garmin-export.mjs` for the reader's view of it.

## Privacy

- Talks only to `connect.garmin.com`, from your own logged-in tab, using the
  auth the browser already has: the same-origin `/golf-api` calls the web app
  itself makes, carried by your session cookie plus the page's CSRF token
  (legacy proxy/bearer paths are kept only as fallbacks).
- Permissions are `activeTab` + `scripting` only — no host permissions, no
  storage, no downloads API, nothing runs until you click.
- The bundle contains **no cookies, headers, or credentials** — the CSRF
  token (and any fallback bearer token) is held in memory for the run and
  never written anywhere; no request or response headers are recorded. The
  inventory gate (`pnpm data:garmin:inventory`) refuses any bundle containing
  token-shaped text. Only your golf data and your Garmin player id.
- Nothing is transmitted anywhere; the only output is the local download.
