# Grint Export

A Chrome extension that exports your own TheGrint data — every stats view,
every hole-by-hole scorecard, the handicap record, and course/tee metadata —
as one JSON bundle for the mackenzie pipeline.

It is the second Grint **source adapter** anticipated by `../SPEC.md § Adapter
contract` (the first is the paste parsed by `../scripts/parse-grint.mjs`). The
extension only *captures*; parsing stays in Node scripts under `../scripts/`
so a parser fix can be replayed over history.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. **Load unpacked** → select this folder (`grint-extension/`).

## Use

1. Log in at [thegrint.com](https://thegrint.com) (the classic client, not
   webapp.thegrint.com) and stay on any thegrint.com page.
2. Click the extension icon → **Scrape all**.
3. Wait. Fetches are sequential with a ~500–750 ms gap; a history of ~150
   rounds takes 2–4 minutes. Progress shows per phase. Closing the popup does
   **not** stop the run — the bundle downloads when it finishes.
4. Move the downloaded `grint-export-YYYY-MM-DD.json` to `../data/raw/`.
5. From the repo root: `pnpm data:inventory` to validate and summarize it.

## Incremental runs

A full scrape refetches every scorecard to capture the two that are new.
Instead, feed the popup the **previous bundle** (the file input under the
button): the button becomes **Scrape new rounds**, and the run

- stops round discovery at the first listing wave with nothing new (the
  listing is newest-first, so everything deeper is older than the baseline),
- skips every scorecard and course/tee fetch the previous bundle already
  holds,
- still refetches all trend views and the handicap record — aggregates change
  with every round.

A weekly update drops from minutes to well under one. The download is a small
*delta* bundle: same format plus a `baseline` field, filename suffixed with
the capture time (`grint-export-YYYY-MM-DD-HHMM.json`) so it never collides
with a same-day full bundle. Drop it in `../data/raw/` next to the full one —
`pnpm data:rounds` merges the newest full bundle with every delta captured
after it.

A delta can never record a round *deleted* on Grint. Run a plain **Scrape
all** occasionally (or after deleting a round); a new full bundle re-baselines
the merge.

## What it captures

| Phase | Source | Kept verbatim |
|---|---|---|
| trend views | `POST /trend/<view>` × 13, `range=ALL` | inline Highcharts `<script>` blocks + content column HTML |
| handicap | `GET /handicap` | record tables + inline scripts |
| round discovery | `GET /score`, then `POST /score/listMoreScores` (the page's own infinite-scroll endpoint) until it returns empty | listing HTML + link inventory |
| scorecards | `GET` each round's page | scorecard tables + inline scripts + content column |
| course metadata | `GET /ajax/get_course_data/<courseId>/<teeId>` | raw JSON body |

Captured fragments are character-for-character what the server sent — never
rewritten. If a page returns 200 but the expected fragments aren't found, the
**full page** is stored instead and a warning is recorded, so selector drift
shows up as a bigger file plus a warning, never a silent hole. Failures land
in the bundle's `errors[]`; one bad round never aborts the run. The bundle
schema is `grint-export/1` — see `scripts/inventory-grint-export.mjs` for the
reader's view of it.

## Privacy

- Talks only to `thegrint.com`, from your own logged-in tab, using the session
  the browser already has.
- Permissions are `activeTab` + `scripting` only — no host permissions, no
  storage, no downloads API, nothing runs until you click.
- The bundle contains **no cookies, headers, or credentials** (the scraper
  never reads them), only your golf data and your Grint user id.
- Nothing is transmitted anywhere; the only output is the local download.
