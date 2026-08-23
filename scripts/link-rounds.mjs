#!/usr/bin/env node
/**
 * Propose Garmin↔Grint round links for a human to confirm:
 *
 *   data/round-links.json   one entry per Garmin scorecard — the Grint
 *                           roundId it appears to be, the evidence, and a
 *                           status a human moves from "proposed" to
 *                           "confirmed" (or "rejected") by editing the file
 *
 * Run: pnpm data:links
 *
 * A guessed cross-source join is invented data (SPEC.md), so this script
 * never links anything itself — it proposes. Candidates are Grint rounds at
 * the same facility on the same date (±1 day only when the Garmin date is
 * flagged date_from_utc — a UTC-formatted evening round can sit on the next
 * calendar day). Strokes equality is a corroborator recorded in `basis`,
 * never the key: two sources can disagree about strokes and still describe
 * one afternoon. Zero candidates is a finding, not a failure — the R50
 * simulator rounds are Garmin-only by nature.
 *
 * Reruns are deterministic and diff-stable: entries a human has moved to
 * "confirmed" or "rejected" are preserved verbatim, "proposed" entries are
 * regenerated, and ordering follows (date, scorecardId).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { slugify, FACILITY_ALIASES, splitCourseName } from "./rounds-to-spine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const OUT = resolve(DATA, "round-links.json");

/**
 * Garmin facility spellings that differ from Grint's for the same physical
 * place, keyed by the slug of the Garmin name's facility half. Explicit and
 * attested, never fuzzy — the FACILITY_ALIASES discipline. The first entry
 * is attested by 2026-08-20: Garmin "Harding Park Golf Course ~ Harding",
 * Grint "TPC Harding Park Golf Course", same day, same 91 strokes.
 */
export const GARMIN_FACILITY_ALIASES = {
  "harding-park-golf-course": "tpc-harding-park-golf-course",
};

/** "TPC Toronto at Osprey Valley ~ North" → facility slug. Garmin writes
 *  "Facility ~ Layout"; Grint writes "Layout | Facility" (splitCourseName). */
export function garminFacilitySlug(courseName) {
  const facility = courseName.split("~")[0].trim();
  const slug = slugify(facility);
  return GARMIN_FACILITY_ALIASES[slug] ?? FACILITY_ALIASES[slug] ?? slug;
}

export function grintFacilitySlug(courseName) {
  const { facility } = splitCourseName(courseName);
  const slug = slugify(facility);
  return FACILITY_ALIASES[slug] ?? slug;
}

/** date ± n days, pure UTC arithmetic on the YYYY-MM-DD string. */
export function shiftDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** The proposal for one Garmin round against the Grint record. */
export function proposeLink(garminRound, grintRounds) {
  const slug = garminRound.courseName ? garminFacilitySlug(garminRound.courseName) : null;
  const dates = new Set([garminRound.date]);
  if (garminRound.flags.includes("date_from_utc") && garminRound.date) {
    dates.add(shiftDate(garminRound.date, -1));
    dates.add(shiftDate(garminRound.date, 1));
  }
  const candidates = grintRounds
    .filter(
      (r) =>
        r.date !== null &&
        dates.has(r.date) &&
        r.courseName !== null &&
        slug !== null &&
        grintFacilitySlug(r.courseName) === slug,
    )
    .map((r) => ({
      roundId: r.roundId,
      date: r.date,
      courseName: r.courseName,
      strokes: r.totals.strokes,
    }));

  const entry = {
    scorecardId: garminRound.scorecardId,
    garminDate: garminRound.date,
    garminCourseName: garminRound.courseName,
    roundId: null,
    status: "proposed",
    basis: null,
    candidates,
    note: null,
  };
  if (candidates.length === 1) {
    const c = candidates[0];
    entry.roundId = c.roundId;
    if (c.strokes === garminRound.totals.strokes) {
      entry.basis = "same facility, same date, same strokes";
    } else {
      entry.basis = "same facility, same date";
      entry.note = `strokes differ: Garmin ${garminRound.totals.strokes}, Grint ${c.strokes}`;
    }
  } else if (candidates.length > 1) {
    entry.note = `${candidates.length} Grint rounds match — pick the roundId by hand`;
  } else {
    entry.note = garminRound.flags.includes("simulation")
      ? "no Grint round matches — a simulator round is Garmin-only by nature"
      : "no Grint round matches — a Garmin-only round is legitimate";
  }
  return entry;
}

function main() {
  const garmin = JSON.parse(readFileSync(resolve(DATA, "garmin-rounds.json"), "utf8"));
  const grint = JSON.parse(readFileSync(resolve(DATA, "rounds.json"), "utf8"));
  const existing = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf8"))
    : { links: [] };
  const settled = new Map(
    existing.links
      .filter((l) => l.status === "confirmed" || l.status === "rejected")
      .map((l) => [l.scorecardId, l]),
  );

  const links = garmin.rounds
    .map((r) => settled.get(r.scorecardId) ?? proposeLink(r, grint.rounds))
    .sort(
      (a, b) =>
        (a.garminDate ?? "").localeCompare(b.garminDate ?? "") ||
        a.scorecardId.localeCompare(b.scorecardId),
    );

  const out = {
    source: "link-rounds.mjs over data/garmin-rounds.json + data/rounds.json",
    policy:
      "proposed by machine, confirmed by hand — edit status to confirmed or rejected; reruns preserve those verbatim",
    links,
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  const by = (s) => links.filter((l) => l.status === s).length;
  const linked = links.filter((l) => l.roundId !== null).length;
  console.log(`links         ${links.length}  (${by("confirmed")} confirmed, ${by("proposed")} proposed, ${by("rejected")} rejected)`);
  console.log(`with a match  ${linked}  ·  Garmin-only ${links.filter((l) => l.candidates.length === 0).length}`);
  console.log(`wrote data/round-links.json`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
