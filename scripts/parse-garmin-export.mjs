#!/usr/bin/env node
/**
 * Parse the Garmin export bundle into per-round shot records:
 *
 *   data/garmin-rounds.json   one record per scorecard — date, course, tee
 *                             (with rating/slope and par per hole), per-hole
 *                             strokes and the AutoShot shot list (club,
 *                             meters/yards, shot type, start/end lie)
 *
 * Run: pnpm data:garmin
 *
 * This is the Garmin source adapter (SPEC.md § Adapter contract), the sibling
 * of parse-grint-export.mjs: it turns the extension's capture
 * (data/raw/garmin-export-*.json, validated by inventory-garmin-export.mjs)
 * into its own per-round file. It emits garmin-rounds.json ONLY — the Grint
 * adapters' outputs are untouched, and nothing here joins across sources
 * (that is data/round-links.json's job, and it is curated, not fuzzy).
 *
 * ---------------------------------------------------------------------------
 * POLICY
 * ---------------------------------------------------------------------------
 * VERBATIM. Course names are the strings Garmin's course snapshots carry
 * ("Harding Park Golf Course ~ Harding" keeps its tilde). roundType is
 * Garmin's own — "SIMULATION" marks the R50 sim rounds, and they are carried,
 * not filtered; a downstream reader decides what a virtual Pebble Beach round
 * is evidence of. Lies are Garmin's own strings (TeeBox/Fairway/Rough/Bunker/
 * Green/Unknown), never reclassified. Every shot keeps its untouched raw
 * object, so nothing this file chooses to surface can lose data.
 *
 * Dates come from `formattedStartTime`, Garmin's local-offset rendering of
 * the round's start ("2026-08-22T13:11:01-07:00" → 2026-08-22), by string
 * slice — no Date construction, no timezone math. When the field carries no
 * offset (the sim rounds format as UTC "…Z"), the date is still the slice but
 * the round is flagged date_from_utc: it may be off by one for an evening
 * round, and the round-linker widens its date window accordingly.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const RAW = resolve(DATA, "raw");
const OUT = resolve(DATA, "garmin-rounds.json");

// ---------------------------------------------------------------------------
// units and club vocabulary
// ---------------------------------------------------------------------------

/** Metres → yards. Must agree with lib/units.ts TO_YARDS.meters. */
const M_TO_YD = 1.0936132983377078;
const toYards = (m) => (typeof m === "number" ? Math.round(m * M_TO_YD * 10) / 10 : null);

/** A location's pixel position on Garmin's per-hole map frame, or null when
 *  the capture carried none. Verbatim integers — no scaling here. */
const mapPoint = (loc) =>
  loc && typeof loc.x === "number" && typeof loc.y === "number"
    ? { x: loc.x, y: loc.y }
    : null;

/** Garmin semicircles → degrees, rounded to 1e-6° (~0.11 m) so the JSON stays
 *  small. The record's own geometry, never Garmin's imagery. */
const SEMI = 180 / 2 ** 31;
const geoPoint = (loc) =>
  loc && typeof loc.lat === "number" && typeof loc.lon === "number"
    ? {
        lat: Math.round(loc.lat * SEMI * 1e6) / 1e6,
        lon: Math.round(loc.lon * SEMI * 1e6) / 1e6,
      }
    : null;

/**
 * Garmin clubType name → BAG_ORDER string (lib/clubs.ts). Garmin's own type
 * table already uses the bag's exact vocabulary ("Driver", "3 Wood",
 * "3 Hybrid", "7 Iron", "Pitching Wedge", "Putter"), so resolution is
 * identity for every type attested so far and this table holds only true
 * renames. Entries are added ONLY from attested data — the lib/aliases.ts
 * discipline — never guessed.
 */
export const GARMIN_CLUB_ALIASES = {};

const BAG_ORDER = new Set([
  "Driver",
  "3 Wood", "4 Wood", "5 Wood", "7 Wood",
  "2 Hybrid", "3 Hybrid", "4 Hybrid", "5 Hybrid", "6 Hybrid",
  "1 Iron", "2 Iron", "3 Iron", "4 Iron", "5 Iron", "6 Iron",
  "7 Iron", "8 Iron", "9 Iron",
  "Pitching Wedge", "Gap Wedge", "Sand Wedge", "Lob Wedge",
  "Putter",
]);

/**
 * clubId → { garminType, club } from the clubs + clubTypes payloads.
 * `club` is the BAG_ORDER string, or null when the Garmin type has no
 * attested mapping (the report prints every distinct unmapped type).
 */
export function buildClubIndex(clubsJson, clubTypesJson) {
  const typeName = new Map((clubTypesJson ?? []).map((t) => [t.value, t.name]));
  const index = new Map();
  for (const c of clubsJson ?? []) {
    const garminType = typeName.get(c.clubTypeId) ?? null;
    const club =
      garminType === null
        ? null
        : BAG_ORDER.has(garminType)
          ? garminType
          : (GARMIN_CLUB_ALIASES[garminType] ?? null);
    index.set(c.id, {
      clubId: c.id,
      garminType,
      club,
      model: c.model || null,
      retired: c.retired === true,
      deleted: c.deleted === true,
    });
  }
  return index;
}

// ---------------------------------------------------------------------------
// pure parsing helpers (JSON in, data out — no I/O)
// ---------------------------------------------------------------------------

/** "2026-08-22T13:11:01-07:00" carries a local offset; "…Z" does not. */
const hasOffset = (s) => /[+-]\d{2}:?\d{2}$/.test(s ?? "");

/** Par digits ("454344345544343445") → number[], null when absent. */
export function parseHolePars(s) {
  if (typeof s !== "string" || !/^\d+$/.test(s)) return null;
  return [...s].map(Number);
}

/**
 * The per-shot detail rows out of a shot-stats view's payload — measurements
 * only. Garmin's view-level aggregates (percentGreenInRegulation,
 * percentUpDown, strokesGainedRatings and their peers) are model outputs
 * against an unstated baseline and are deliberately not ingested; the
 * per-shot strokesGained field is dropped for the same reason. What survives
 * is what a device measured: distances, lies, outcomes, one observed putt.
 * Distances arrive in meters and are carried both ways, like every other
 * Garmin distance. offsetAngle is carried verbatim (degrees, no legend on
 * file) — downstream readers must not interpret it until one exists.
 */
export function parseShotStats(view, json) {
  if (!json) return [];
  const id = (v) => (v != null ? String(v) : null);
  const num = (v) => (typeof v === "number" ? v : null);
  if (view === "approach" || view === "chip") {
    return (json.shotOrientationDetail ?? []).map((d) => ({
      shotId: id(d.shotId),
      scorecardId: id(d.scorecardId),
      holeNumber: d.holeNumber ?? null,
      clubId: d.clubId ?? null,
      startingDistanceToHoleM: num(d.startingDistanceToHole),
      startingDistanceToHoleYd: toYards(d.startingDistanceToHole),
      remainingDistanceM: num(d.remainingDistance),
      remainingDistanceYd: toYards(d.remainingDistance),
      offsetAngleDeg: num(d.offsetAngle),
      startingLie: d.startingLieType ?? null,
      endingLie: d.endingLieType ?? null,
      ...(view === "chip" ? { onePuttAfter: d.onePuttAfter ?? null } : {}),
    }));
  }
  if (view === "drive") {
    return (json.shotDispersionDetails ?? []).map((d) => ({
      shotId: id(d.shotId),
      scorecardId: id(d.scorecardId),
      holeNumber: d.holeNumber ?? null,
      clubId: d.clubId ?? null,
      shotTime: d.shotTime ?? null,
      shotDistanceM: num(d.shotDistance),
      shotDistanceYd: toYards(d.shotDistance),
      dispersionDistanceM: num(d.dispersionDistance),
      dispersionDistanceYd: toYards(d.dispersionDistance),
      fairwayShotOutcome: d.fairwayShotOutcome ?? null,
    }));
  }
  return [];
}

/**
 * One scorecardDetail payload + its merged shot list → a round record.
 * `shots` is every shot for this scorecard (any hole), verbatim from the
 * holeShots payloads; `clubIndex` from buildClubIndex; `pinByHole` maps
 * holeNumber → pin {lat, lon} in degrees, from the holeShots payloads'
 * pinPosition fields.
 */
export function parseGarminRound(detailJson, shots, clubIndex, pinByHole = new Map()) {
  const flags = [];
  const detail = detailJson?.scorecardDetails?.[0];
  const sc = detail?.scorecard;
  if (!sc) return null;

  const snapshot =
    (detailJson.courseSnapshots ?? []).find(
      (s) => s.courseSnapshotId === sc.courseSnapshotId,
    ) ?? detailJson.courseSnapshots?.[0] ?? null;
  const courseName = snapshot?.name ?? null;
  if (!courseName) flags.push("no_course_name");

  const startRaw = sc.formattedStartTime ?? sc.startTime ?? null;
  const date = startRaw ? startRaw.slice(0, 10) : null;
  if (!date) flags.push("no_date_parsed");
  else if (!hasOffset(startRaw)) flags.push("date_from_utc");

  if (sc.roundType === "SIMULATION") flags.push("simulation");

  const holesRecorded = sc.holesCompleted ?? (sc.holes ?? []).length;
  if (holesRecorded === 9) flags.push("nine_hole_round");
  else if (holesRecorded !== 18) flags.push("odd_hole_count");

  const pars = parseHolePars(snapshot?.holePars ?? null);

  const shotsByHole = new Map();
  for (const s of shots) {
    const n = s.holeNumber;
    if (!shotsByHole.has(n)) shotsByHole.set(n, []);
    shotsByHole.get(n).push(s);
  }

  let unknownClub = false;
  const mapShot = (s) => {
    // clubId 0 is Garmin's "no club recorded", not an unknown club.
    const entry = s.clubId ? clubIndex.get(s.clubId) : null;
    if (s.clubId && !entry) unknownClub = true;
    return {
      order: s.shotOrder ?? null,
      club: entry?.club ?? null,
      clubId: s.clubId ?? null,
      shotType: s.shotType ?? null,
      meters: s.meters ?? null,
      yards: toYards(s.meters),
      startLie: s.startLoc?.lie ?? null,
      endLie: s.endLoc?.lie ?? null,
      // Where the shot started and ended on Garmin's per-hole map frame —
      // pixel positions on the IMG_730X730 raster, tee low, green high. The
      // raster itself is Garmin's and is never fetched; the coordinates are
      // the shot's own geometry, and they are what the diary traces are
      // drawn from.
      startMap: mapPoint(s.startLoc),
      endMap: mapPoint(s.endLoc),
      // The same locations in WGS84 degrees (converted from Garmin's
      // semicircles) — the frame the hole drawings are projected from.
      startGeo: geoPoint(s.startLoc),
      endGeo: geoPoint(s.endLoc),
      raw: s,
    };
  };

  const holes = (sc.holes ?? []).map((h) => ({
    number: h.number,
    strokes: h.strokes ?? null,
    // Present on sim rounds; the on-course AutoShot cards do not carry it.
    putts: h.putts ?? null,
    fairwayShotOutcome: h.fairwayShotOutcome ?? null,
    par: pars?.[h.number - 1] ?? null,
    // The day's flag position in degrees, from the holeShots payload.
    pin: pinByHole.get(h.number) ?? null,
    shots: (shotsByHole.get(h.number) ?? [])
      .slice()
      .sort((a, b) => (a.shotOrder ?? 0) - (b.shotOrder ?? 0))
      .map(mapShot),
  }));
  if (unknownClub) flags.push("unknown_club");

  const shotCount = holes.reduce((a, h) => a + h.shots.length, 0);
  if (shotCount === 0) flags.push("no_shots");

  const holePutts = holes.map((h) => h.putts).filter((p) => p !== null);
  return {
    scorecardId: String(sc.id),
    date,
    startTimeRaw: startRaw,
    roundType: sc.roundType ?? null,
    courseName,
    teeBox: sc.teeBox ?? null,
    teeBoxRating: sc.teeBoxRating ?? null,
    teeBoxSlope: sc.teeBoxSlope ?? null,
    holePars: snapshot?.holePars ?? null,
    holesRecorded,
    totals: {
      strokes: sc.strokes ?? null,
      putts: holePutts.length > 0 ? holePutts.reduce((a, b) => a + b, 0) : null,
      shots: shotCount,
    },
    holes,
    flags,
  };
}

// ---------------------------------------------------------------------------
// bundle merging
// ---------------------------------------------------------------------------

/**
 * Merge a full bundle with the incremental bundles captured after it — the
 * same contract as parse-grint-export.mjs mergeBundles: the newest FULL
 * bundle (bundle.baseline unset) is the base, because only a full capture
 * can reflect a scorecard deleted on Garmin; incrementals captured after it
 * layer on top, the newest detail winning per scorecardId. A newer bundle's
 * holeShots set replaces the older set WHOLESALE per scorecard — the capture
 * may be one all-in-one resource or eighteen per-hole ones, and interleaving
 * resources from two captures could double holes.
 *
 * Takes [{file, bundle}] in any order; returns null when no full bundle
 * exists. Chain order follows capturedAt, not filenames.
 */
export function mergeGarminBundles(bundles) {
  const sorted = [...bundles].sort((a, b) =>
    (a.bundle.capturedAt ?? "").localeCompare(b.bundle.capturedAt ?? ""),
  );
  const lastFull = sorted.findLastIndex((b) => !b.bundle.baseline);
  if (lastFull === -1) return null;
  const chain = sorted.slice(lastFull);

  const detailById = new Map();
  const shotsById = new Map();
  for (const { bundle } of chain) {
    const bundleShots = new Map();
    for (const r of bundle.resources) {
      const id = r.meta?.scorecardId != null ? String(r.meta.scorecardId) : null;
      if (r.kind === "scorecardDetail" && id) detailById.set(id, r);
      if (r.kind === "holeShots" && id) {
        if (!bundleShots.has(id)) bundleShots.set(id, []);
        bundleShots.get(id).push(r);
      }
    }
    for (const [id, rs] of bundleShots) shotsById.set(id, rs);
  }
  // Aggregates (clubs, clubTypes) come from the newest bundle that has them.
  const newestResource = (pred) => {
    for (let i = chain.length - 1; i >= 0; i--) {
      const r = chain[i].bundle.resources.find(pred);
      if (r) return r;
    }
    return null;
  };
  const newest = chain[chain.length - 1].bundle;
  return {
    files: chain.map((c) => c.file),
    capturedAt: newest.capturedAt,
    userId: newest.userId,
    detailById,
    shotsById,
    newestResource,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const candidates = readdirSync(RAW)
    .filter((f) => /^garmin-export-\d{4}-\d{2}-\d{2}(-\d{4})?\.json$/.test(f))
    .sort();
  if (candidates.length === 0) {
    console.error(`No garmin-export-*.json in ${RAW}. Run the extension first.`);
    return 1;
  }
  const bundles = [];
  for (const file of candidates) {
    const bundle = JSON.parse(readFileSync(resolve(RAW, file), "utf8"));
    if (bundle.format !== "garmin-export/1") {
      console.error(`Unexpected bundle format ${bundle.format} in ${file}`);
      return 1;
    }
    bundles.push({ file, bundle });
  }
  const merged = mergeGarminBundles(bundles);
  if (!merged) {
    console.error(
      "Only incremental bundles found — the merge needs a full capture as its base.",
    );
    return 1;
  }

  const payload = (r) => (r ? JSON.parse(r.payload.json) : null);
  const clubIndex = buildClubIndex(
    payload(merged.newestResource((r) => r.kind === "clubs")),
    payload(merged.newestResource((r) => r.kind === "clubTypes")),
  );

  const rounds = [];
  for (const [id, detailRes] of merged.detailById) {
    const holeEntries = (merged.shotsById.get(id) ?? []).flatMap(
      (r) => payload(r)?.holeShots ?? [],
    );
    const shots = holeEntries.flatMap((h) => h.shots ?? []);
    const pinByHole = new Map();
    for (const h of holeEntries) {
      const pin = geoPoint(h.pinPosition);
      if (pin && h.holeNumber != null) pinByHole.set(h.holeNumber, pin);
    }
    const round = parseGarminRound(payload(detailRes), shots, clubIndex, pinByHole);
    if (round) rounds.push(round);
  }
  rounds.sort(
    (a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "") ||
      a.scorecardId.localeCompare(b.scorecardId),
  );

  // Per-shot stats detail, newest capture wins (the endpoints return the
  // whole career each time, same as clubs). Same artifact, sibling block to
  // `rounds` — the precedent is rounds.json carrying `differentials` and
  // `series` beside its rounds.
  const statsView = (view) =>
    parseShotStats(
      view,
      payload(merged.newestResource((r) => r.kind === "shotStats" && r.meta?.view === view)),
    );
  const stats = {
    approach: statsView("approach"),
    chip: statsView("chip"),
    drive: statsView("drive"),
  };

  const out = {
    source: "garmin-connect",
    adapter: "parse-garmin-export.mjs",
    capturedAt: merged.capturedAt,
    rawFile: merged.files.map((f) => `raw/${f}`).join(" + "),
    userId: merged.userId,
    clubs: [...clubIndex.values()],
    rounds,
    stats,
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  // ---- report -------------------------------------------------------------
  const dated = rounds.filter((r) => r.date).length;
  const withShots = rounds.filter((r) => r.totals.shots > 0);
  const sim = rounds.filter((r) => r.flags.includes("simulation")).length;
  const totalShots = rounds.reduce((a, r) => a + r.totals.shots, 0);
  const unmapped = new Set();
  for (const c of clubIndex.values()) {
    if (c.club === null && c.garminType !== null) unmapped.add(c.garminType);
  }
  console.log(`parsed ${merged.files.join(" + ")} (captured ${merged.capturedAt})`);
  console.log(`rounds        ${rounds.length}  (${sim} simulation, ${rounds.length - sim} on course)`);
  console.log(`with a date   ${dated}`);
  console.log(`with shots    ${withShots.length}  (${totalShots} shots total)`);
  console.log(`clubs         ${clubIndex.size} in the bag list${unmapped.size ? `, UNMAPPED types: ${[...unmapped].join(", ")}` : ""}`);
  console.log(
    `shot stats    approach ${stats.approach.length}, chip ${stats.chip.length}, drive ${stats.drive.length}` +
      ` (per-shot detail only; Garmin's model aggregates are not ingested)`,
  );
  const flagged = rounds.filter((r) => r.flags.length > 0);
  if (flagged.length > 0) {
    const byFlag = {};
    for (const r of flagged) for (const f of r.flags) byFlag[f] = (byFlag[f] || 0) + 1;
    console.log(`flags         ${Object.entries(byFlag).map(([k, v]) => `${k}×${v}`).join(", ")}`);
  }
  console.log(`wrote data/garmin-rounds.json`);

  if (rounds.length === 0 || dated < rounds.length * 0.9) {
    console.error("Too many rounds without dates — parser drift, not committing-grade output.");
    return 1;
  }
  if (withShots.length === 0) {
    console.error("No round carries a single shot — parser drift, not committing-grade output.");
    return 1;
  }
  return 0;
}

// Importable for tests (mergeGarminBundles, the parse helpers); runs only as a CLI.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
