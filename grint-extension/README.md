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
2. Click the extension icon → **Scrape last 10 rounds** (change the number
   if you have played more since the last capture; 40 max).
3. Wait — well under a minute. Fetches are sequential with a ~500–750 ms
   gap. Closing the popup does **not** stop the run — the bundle downloads
   when it finishes.
4. Move the downloaded `grint-export-YYYY-MM-DD-HHMM.json` to `../data/raw/`
   and run `pnpm refresh` from the repo root.

That is the weekly path. The run fetches the 13 trend views and the handicap
record (aggregates change with every round), the first page of the `/score`
listing, and the newest N scorecards with their course/tee metadata. It never
pages deeper than it needs: N ≤ 20 is one listing page and no scroll waves.
The bundle is the same format plus a `scope: {mode:"recent", rounds:N}`
field; `pnpm data:rounds` layers it over the newest full bundle, newest
scorecard winning per round, and never treats it as the base of the record.

## The other two modes

**Full history** (the checkbox): every round, 2–4 minutes for ~170. The only
run that can record a round *deleted* on Grint — a new full bundle
re-baselines the merge. Run one after deleting a round, or occasionally.

**Exact delta** (the file input): feed the popup the previous **full** bundle
and the button becomes **Scrape new rounds**: discovery stops at the first
listing wave with nothing new, and every scorecard and course/tee fetch the
full bundle already holds is skipped. The popup refuses a delta bundle here —
a delta knows only the handful of rounds it fetched, and used as a baseline it
makes the "incremental" run refetch everything else (the 2026-09-09 and
2026-09-29 captures both did exactly that, 27 MB each). Since 0.3.0 the
recent mode covers the weekly case without a file, so this path is for
"I know exactly which bundle I last folded".

Every bundle since 0.3.0 carries the capture time in its name
(`grint-export-YYYY-MM-DD-HHMM.json`, UTC), so same-day captures never
collide and the names sort in capture order.

## What it captures

| Phase | Source | Kept verbatim |
|---|---|---|
| trend views | `POST /trend/<view>` × 13, `range=ALL` | inline Highcharts `<script>` blocks + content column HTML |
| handicap | `GET /handicap` | record tables + inline scripts |
| round discovery | `GET /score`, then `POST /score/listMoreScores` (the page's own infinite-scroll endpoint) — until it returns empty (full), until a wave is all known (delta), or until N rounds are seen (recent) | listing HTML + link inventory |
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
