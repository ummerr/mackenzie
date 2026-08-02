# YARDAGES

A longitudinal shot ledger for Garmin Approach R50 range exports. The R50 screen
and the Garmin Golf app both answer questions about one shot or one session.
Nothing answers questions that span sessions. That gap is the whole product.

Lives inside the `mackenzie` repo but deploys as its own Vercel project —
Mackenzie is a deliberately zero-build static site (`DECISIONS.md`,
"Static-first, no bundler"), and a Next.js app cannot be a route on it.

**Status: Phase 1 (ingest) complete. Phase 2 (the bag chart) is next.**

## Run it

```bash
pnpm install
pnpm ingest                         # data/raw/*.csv -> data/shots.json
pnpm dev                            # http://localhost:3000
pnpm test                           # 51 tests over the two real exports
pnpm typecheck
```

## Adding a session

1. Export the range session from the Garmin Golf app.
2. Drop the CSV in `data/raw/`, filename untouched.
3. `pnpm ingest` — or `pnpm ingest --dry-run` to see what would change first.
4. Commit the CSV and the regenerated JSON together.

`data/raw/` is verbatim and never edited, the same contract as
`../data/raw/grint-*.txt` in the parent repo. A correction goes in
`data/exclusions.json`, never in the source file.

There is no database. Shots are ~800 bytes of JSON each, so two years of weekly
sessions is under 2 MB — smaller than the GeoJSON the parent repo already
commits. Git gives better provenance than a `raw_imports` table would: every
import is a diff, and a parser fix can be replayed over the whole history by
re-running `pnpm ingest`. See `DECISIONS.md`.

Re-running is idempotent twice over. The same file twice is deduplicated by
`(session, shot timestamp)`; so is a re-export of the same session under a
different filename, which a content hash would miss.

### Exclusions

`data/exclusions.json` maps a shot timestamp to `{excluded, reason}` and is
applied after the automatic phantom flag, so a hand edit always wins.
Exclusions are reversible and reasoned, never deletions — set `excluded` to
`false` to bring a shot back. An override matching no shot is reported as
orphaned on every run rather than silently doing nothing.

## What the R50 export actually looks like

Recon against `fixtures/`. Read this before touching `lib/parse.ts`.

- **Two header rows.** Row 1 is names, row 2 is units (`[mph]`, `[Yards]`,
  `[deg]`, `[ft]`, `[rpm]`). Row 3 is the first shot.
- **The club is in `Club Type`.** `Club Name` and `Brand/Model` are 100% empty.
  The R10 alias table that this project's mapping was lifted from maps the club
  off `Club Name`, which here would produce a bag chart with no clubs in it.
- **`Backspin` and `Sidespin` are separate columns.** The R10 table collapses
  both into one `spin_rate`. Don't.
- **14 of 42 columns are always empty**: the two target-distance columns, the
  eight tempo/stroke-length fields, `Note`, `Tag`, and the two club-name fields.
- **Five columns are exactly derived**, verified to floating point across both
  fixtures: `Face to Path = Club Face − Club Path`;
  `Spin Rate = hypot(Backspin, Sidespin)`;
  `Spin Axis = −atan2(Sidespin, Backspin)`;
  both deviation distances `= distance × sin(deviation angle)`.
- **No shot-index column and no session ID.** `shot_index` is row order.
  Identity comes from the per-shot timestamp, which is unique within a session
  in both fixtures.
- **The filename is the export time, not the session time.** Both fixtures were
  exported on 2026-08-02; the shots are from 2026-07-03 and 2026-07-05.
- **`Total Distance` is unreliable.** In one fixture it equals `Carry Distance`
  to the last decimal on 17 of 34 rows — the R50 declined to model rollout and
  copied carry. In the other it happens on 0 of 23. Session-dependent, so
  `total_is_carry_copy` flags it and any statistic over `total_yd` must exclude
  those rows or it blends two different quantities. The bag chart uses carry.
- **Environmentals are session-level.** Constant within a session, different
  between sessions.
- **`descent_angle_deg` has no source column** in any observed export. The
  field exists so a firmware change doesn't need a migration; until then it is
  permanently null and the UI must never imply otherwise.

Only range/practice sessions export at all. Home Tee Hero and on-course
practice do not, and no UI here should suggest they might.

## Sign conventions

Resolved 2026-08-02. **Positive is RIGHT of target** for a right-handed player
on every lateral column: `face_angle_deg`, `club_path_deg` (positive =
in-to-out), `launch_direction_deg`, `spin_axis_deg`, and both deviation
columns.

**`sidespin_rpm` is the exception — the device signs it backwards.** Because
`spin_axis = −atan2(sidespin, backspin)` holds to 2×10⁻⁶ degrees across both
fixtures, negative sidespin pairs with positive spin axis and means a ball
curving *right*. It is stored verbatim so the value matches what the Garmin app
displays, and nothing analytical reads it — `spin_axis_deg` carries the same
information the right way round.

Garmin publishes no signed-metric glossary; the R50 screen shows `3.2R`/`3.2L`
and the signs exist only in the CSV. The convention above rests on two
independent lines of evidence, recorded in `DECISIONS.md`.

## Layout

```
app/
  page.tsx            placeholder until Phase 2; the bag chart replaces it
lib/
  aliases.ts          header -> canonical field. Add a locale here, never in the parser
  units.ts            conversion driven by the file's own units row
  parse.ts            one CSV -> one session. Pure
  ledger.ts           many sessions -> one deduplicated ledger. Pure
scripts/
  ingest.ts           the only file that touches the filesystem
data/
  raw/                real exports, verbatim, never edited
  exclusions.json     hand-editable overrides
  sessions.json       generated
  shots.json          generated
tests/                vitest
```

`lib/parse.ts` and `lib/ledger.ts` are pure — no filesystem, no Next, no React.
That is deliberate, and it is why swapping storage cost an hour rather than a
rewrite. Phase 2's stats attach to `ledger.ts`'s output, and nothing analytical
should ever live in a component.

## Provenance

Two patterns were lifted from
[jgamblin/golf](https://github.com/jgamblin/golf), a Garmin **R10** pipeline:

- **`field_aliases.yaml`'s column mapping** — raw header → canonical field,
  many-to-one, so a rename is a data change. Departed from in two ways: units
  are read from the file's own units row rather than encoded in alias keys, and
  backspin/sidespin are kept separate.
- **`validate_shot()`'s phantom handling** — a zero in ball speed, club speed
  or carry means the monitor saw a swing but never tracked a ball. Those fields
  are nulled with a recorded reason rather than dropped, because zeros drag
  every median down. The ≥10%-per-session data-quality flag comes across too.

Both fixtures have zero phantoms, so that path is covered by synthetic tests
only until a real one shows up.
