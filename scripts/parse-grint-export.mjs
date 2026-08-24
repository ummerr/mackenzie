#!/usr/bin/env node
/**
 * Parse the Grint export bundle into per-round records:
 *
 *   data/rounds.json   one record per round — date, course, tee, per-hole
 *                      strokes/putts/fairway codes — plus the handicap
 *                      differential series in chart order
 *
 * Run: npm run rounds
 *
 * This is the second Grint source adapter (SPEC.md § Adapter contract). The
 * first, parse-grint.mjs, turns the ranking paste into the two spine files;
 * this one turns the extension's capture (data/raw/grint-export-*.json,
 * validated by inventory-grint-export.mjs) into the per-round file the
 * contract reserved. It emits rounds.json ONLY — layouts.json and
 * facilities.json stay the paste adapter's output, so nothing downstream
 * changes shape because a second source arrived.
 *
 * ---------------------------------------------------------------------------
 * POLICY
 * ---------------------------------------------------------------------------
 * VERBATIM. Course names are the strings Grint served ("Cherry Downs Golf &
 * Count" stays truncated). Fairway cells are Grint's own numeric codes, not
 * words: the edit form's hidden inputs declare lval=1 rval=2 hval=3 mval=4
 * (left / right / hit / missed), and codes outside that map (7, 8) are
 * carried as-is and left for a downstream reader to classify or ignore.
 * Nothing here corrects, joins or interprets; flags[] marks what looks odd.
 *
 * The differentials come from the /trend Highcharts config in chart order.
 * They are NOT joined to rounds — the chart has its own row count (combined
 * scores appear once, short rounds not at all) and a guessed join would be
 * invented data. Two arrays, two provenances, one file.
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../data");
const RAW = resolve(DATA, "raw");
const OUT = resolve(DATA, "rounds.json");

// ---------------------------------------------------------------------------
// pure parsing helpers (string in, data out — no I/O)
// ---------------------------------------------------------------------------

/** The full <input|select> tag whose name= (or id=) matches, else null. */
function findTag(html, name) {
  const re = new RegExp(`<(?:input|select)[^>]*(?:name|id)="${name}"[^>]*>`, "i");
  const m = html.match(re);
  return m ? m[0] : null;
}

/** value="..." out of a tag string. Empty string stays empty; missing → null. */
function tagValue(tag) {
  if (!tag) return null;
  const m = tag.match(/value="([^"]*)"/i);
  return m ? m[1] : null;
}

/** The selected option's value inside <select name="...">…</select>. */
function selectedValue(html, name) {
  const sel = html.match(
    new RegExp(`<select[^>]*name="${name}"[\\s\\S]{0,10000}?<\\/select>`, "i"),
  );
  if (!sel) return null;
  // Attribute order varies (value="2026" selected="") — match the tag, then
  // read its value.
  const tag = sel[0].match(/<option[^>]*\bselected\b[^>]*>/i);
  return tag ? tagValue(tag[0]) : null;
}

/** Per-hole family (scH, ptH, pH, fH) → 18 raw string values ("" when blank). */
function holeFamily(html, fam) {
  const out = [];
  for (let i = 1; i <= 18; i++) {
    out.push(tagValue(findTag(html, `${fam}${i}`)));
  }
  return out;
}

const sum = (vals) => {
  const nums = vals.filter((v) => v !== null && v !== "").map(Number);
  if (nums.length === 0 || nums.some(Number.isNaN)) return null;
  return nums.reduce((a, b) => a + b, 0);
};

/**
 * Attribute values arrive HTML-encoded ("Waikoloa Beach &amp; Kings’").
 * Decoding is de-serialization, not correction — the verbatim string is what
 * Grint says, not how its templating escaped it.
 */
const decodeEntities = (s) =>
  s === null
    ? null
    : s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'");

/** One full edit_score page → a round record. */
export function parseFullScorecard(html, meta, url) {
  const flags = [];
  const year = selectedValue(html, "year");
  const month = selectedValue(html, "month");
  const day = selectedValue(html, "date");
  const date = year && month && day ? `${year}-${month}-${day.padStart(2, "0")}` : null;
  if (!date) flags.push("no_date_parsed");

  const strokes = holeFamily(html, "scH");
  const putts = holeFamily(html, "ptH");
  const fairways = holeFamily(html, "fH");
  const shotCodes = holeFamily(html, "pH");
  // A nine-hole round is stored as 18 slots with "0" on the unplayed nine, so
  // a played hole is a non-empty, non-zero score cell.
  const holesRecorded = strokes.filter((v) => v !== null && v !== "" && v !== "0").length;
  if (holesRecorded === 0) flags.push("no_hole_scores");
  else if (holesRecorded === 9) flags.push("nine_hole_round");
  else if (holesRecorded !== 18) flags.push("odd_hole_count");

  const courseName = decodeEntities(tagValue(findTag(html, "ucourse")));
  if (!courseName) flags.push("no_course_name");

  const totalPutts = sum(putts);
  if (totalPutts === null) flags.push("no_putts");

  return {
    roundId: meta.roundId,
    entry: "full",
    url,
    date,
    courseGrintId: meta.courseId ?? null,
    courseName,
    teeName: meta.teeName ?? null,
    courseHandicap: tagValue(findTag(html, "handicap_ghap")) || null,
    holesRecorded,
    totals: { strokes: sum(strokes), putts: totalPutts },
    perHole: { strokes, putts, fairways, shotCodes },
    flags,
  };
}

/** One edit_short_score page (total-only entry) → a round record. */
export function parseTotalOnlyScorecard(html, meta, url) {
  const flags = ["total_only_entry"];
  const date = tagValue(findTag(html, "date"));
  if (!date) flags.push("no_date_parsed");
  const strokes = tagValue(findTag(html, "scround"));
  const courseName = decodeEntities(tagValue(findTag(html, "ucourse")));
  if (!courseName) flags.push("no_course_name");
  return {
    roundId: meta.roundId,
    entry: "total-only",
    url,
    date: date || null,
    courseGrintId: meta.courseId ?? null,
    courseName,
    teeName: meta.teeName ?? null,
    courseHandicap: null,
    holesRecorded: 0,
    totals: { strokes: strokes ? Number(strokes) : null, putts: null },
    perHole: null,
    flags,
  };
}

/**
 * The /trend handicap chart's three series, in chart (chronological) order.
 * Points look like {y:23.9,name:'Wedgwood Country Club'} with optional extra
 * properties after the name — color: '#A7CF3F' on the handicap chart,
 * countHoles: 0 on the putt-distribution chart — and names may contain \'
 * escapes. Anything brace-free after the name is tolerated, never read.
 */
const POINT_RE = /\{y:([\d.]+),name:'((?:[^'\\]|\\.)*)'(?:,[^{}]*)?\}/g;

/** The named series' data points out of a view's inline chart scripts. */
export function parseSeries(scripts, name) {
  const blob = scripts.join("\n");
  // Series names are literals, not patterns — "4 +Putts" carries a regex
  // metacharacter and must not quantify anything.
  const literal = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The data: [...] array that follows the `name: '<name>'` declaring it.
  const re = new RegExp(`name:\\s*'${literal}'[\\s\\S]{0,200}?data:\\s*\\[([\\s\\S]*?)\\]`, "");
  const m = blob.match(re);
  if (!m) return null;
  const pts = [];
  for (const p of m[1].matchAll(POINT_RE)) {
    pts.push({ y: Number(p[1]), name: decodeEntities(p[2].replace(/\\'/g, "'")) });
  }
  return pts;
}

/**
 * The putt view's five per-round count series — how many holes took 0, 1, 2,
 * 3, or 4+ putts, one point per charted round — zipped positionally. Five
 * lines of ONE chart sharing one x-axis, so the index join is the chart's
 * own, not an invented one. Returns [] when any line is missing or the
 * lengths disagree: a refusal, not a guess.
 */
export function parsePuttDist(scripts) {
  const names = ["0 Putts", "1 Putts", "2 Putts", "3 Putts", "4 +Putts"];
  const lines = names.map((n) => parseSeries(scripts, n));
  if (lines.some((l) => l === null)) return [];
  const len = lines[0].length;
  if (lines.some((l) => l.length !== len)) return [];
  return lines[0].map((p, i) => ({
    courseName: p.name || null,
    putts0: lines[0][i].y,
    putts1: lines[1][i].y,
    putts2: lines[2][i].y,
    putts3: lines[3][i].y,
    putts4Plus: lines[4][i].y,
  }));
}

export function parseDifferentials(scripts) {
  const blob = scripts.join("\n");
  const seriesData = (name) => parseSeries(scripts, name);

  const differential = seriesData("Hdcp Differential");
  const counts = seriesData("Counts towards Hdcp");
  const trending = seriesData("Trending Hdcp");
  if (!differential) return { handicapIndex: null, points: [] };

  const idx = blob.match(/Handicap Index®?:\s*([\d.]+)/);
  return {
    handicapIndex: idx ? Number(idx[1]) : null,
    points: differential.map((p, i) => ({
      seq: i + 1,
      courseName: p.name,
      differential: p.y,
      countsTowardHdcp: counts?.[i] ? counts[i].y > 0 : null,
      trendingHdcp: trending?.[i]?.y ?? null,
    })),
  };
}

// ---------------------------------------------------------------------------
// bundle merging
// ---------------------------------------------------------------------------

/**
 * Merge a full bundle with the incremental bundles captured after it.
 *
 * The extension's incremental mode (bundle.baseline set) captures only the
 * rounds missing from a previous bundle, plus fresh trend/handicap
 * aggregates. The record is therefore: the newest FULL bundle — the only
 * capture that can reflect a round deleted on Grint — plus every incremental
 * captured after it, the newest scorecard winning per roundId.
 *
 * Takes [{file, bundle}] in any order; returns null when no full bundle
 * exists. Chain order follows capturedAt, not filenames.
 */
export function mergeBundles(bundles) {
  const sorted = [...bundles].sort((a, b) =>
    (a.bundle.capturedAt ?? "").localeCompare(b.bundle.capturedAt ?? ""),
  );
  const lastFull = sorted.findLastIndex((b) => !b.bundle.baseline);
  if (lastFull === -1) return null;
  const chain = sorted.slice(lastFull);

  const cardById = new Map();
  for (const { bundle } of chain) {
    for (const r of bundle.resources) {
      if (r.kind === "scorecard") cardById.set(r.meta.roundId, r);
    }
  }
  // Aggregates come from the newest bundle that has them — incrementals
  // always refetch trend and handicap, so in practice the newest capture.
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
    scorecards: [...cardById.values()],
    newestResource,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const candidates = readdirSync(RAW)
    .filter((f) => /^grint-export-\d{4}-\d{2}-\d{2}(-\d{4})?\.json$/.test(f))
    .sort();
  if (candidates.length === 0) {
    console.error(`No grint-export-*.json in ${RAW}. Run the extension first.`);
    return 1;
  }
  const bundles = [];
  for (const file of candidates) {
    const bundle = JSON.parse(readFileSync(resolve(RAW, file), "utf8"));
    if (bundle.format !== "grint-export/1") {
      console.error(`Unexpected bundle format ${bundle.format} in ${file}`);
      return 1;
    }
    bundles.push({ file, bundle });
  }
  const merged = mergeBundles(bundles);
  if (!merged) {
    console.error(
      "Only incremental bundles found — the merge needs a full scrape as its base.",
    );
    return 1;
  }

  const rounds = [];
  for (const r of merged.scorecards) {
    const html = r.payload.html || "";
    const round = r.url.includes("edit_short_score")
      ? parseTotalOnlyScorecard(html, r.meta, r.url)
      : parseFullScorecard(html, r.meta, r.url);
    rounds.push(round);
  }
  // Chronological, ties broken by Grint's own id order (ids ascend with time).
  rounds.sort(
    (a, b) =>
      (a.date ?? "").localeCompare(b.date ?? "") || a.roundId.localeCompare(b.roundId),
  );

  const trend = merged.newestResource(
    (r) => r.kind === "trend" && r.meta.view === "handicap_index",
  );
  const { handicapIndex, points } = parseDifferentials(trend?.payload.scripts ?? []);

  // Two per-round series the scorecards don't carry (GIR needs par, saves need
  // green-missed context) but Grint's own charts do — kept in chart order,
  // same provenance rule as the differentials: never joined to rounds.
  const viewScripts = (view) =>
    merged.newestResource((r) => r.kind === "trend" && r.meta.view === view)?.payload.scripts ??
    [];
  const toSeries = (pts) =>
    (pts ?? []).map((p) => ({ courseName: p.name || null, value: p.y }));
  const series = {
    girPerRound: toSeries(parseSeries(viewScripts("gir"), "GIR per round")),
    parSavesPct: toSeries(parseSeries(viewScripts("scrambling_par_saves"), "Par Saves %")),
    // The tee game as the scorecards chart it: % of fairways hit per round,
    // and % of par-3 greens hit per round — the card side's only look at the
    // approach game by hole length.
    fairwayHitPct: toSeries(parseSeries(viewScripts("fwy_round"), "% Fairways Hit")),
    par3HitPct: toSeries(parseSeries(viewScripts("tee_round"), "% Par 3 Hit")),
    puttDist: parsePuttDist(viewScripts("putt")),
  };

  const out = {
    source: "thegrint",
    adapter: "parse-grint-export.mjs",
    capturedAt: merged.capturedAt,
    rawFile: merged.files.map((f) => `raw/${f}`).join(" + "),
    userId: merged.userId,
    handicapIndex,
    rounds,
    differentials: points,
    series,
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  // ---- report -------------------------------------------------------------
  const dated = rounds.filter((r) => r.date).length;
  const withPutts = rounds.filter((r) => r.totals.putts !== null).length;
  const eighteen = rounds.filter((r) => r.holesRecorded === 18).length;
  const nine = rounds.filter((r) => r.holesRecorded === 9).length;
  const flagged = rounds.filter((r) => r.flags.length > 0);
  console.log(`parsed ${merged.files.join(" + ")} (captured ${merged.capturedAt})`);
  console.log(`rounds        ${rounds.length}  (${eighteen}×18 holes, ${nine}×9, ${rounds.length - eighteen - nine} other)`);
  console.log(`with a date   ${dated}`);
  console.log(`with putts    ${withPutts}`);
  console.log(`differentials ${points.length}  handicap index ${handicapIndex ?? "?"}`);
  console.log(
    `series        gir ${series.girPerRound.length}, par saves ${series.parSavesPct.length}, ` +
      `fairway% ${series.fairwayHitPct.length}, par-3% ${series.par3HitPct.length}, ` +
      `putt dist ${series.puttDist.length}`,
  );
  if (flagged.length > 0) {
    const byFlag = {};
    for (const r of flagged) for (const f of r.flags) byFlag[f] = (byFlag[f] || 0) + 1;
    console.log(`flags         ${Object.entries(byFlag).map(([k, v]) => `${k}×${v}`).join(", ")}`);
  }
  console.log(`wrote data/rounds.json`);

  if (rounds.length === 0 || dated < rounds.length * 0.9) {
    console.error("Too many rounds without dates — parser drift, not committing-grade output.");
    return 1;
  }
  return 0;
}

// Importable for tests (mergeBundles, the parse helpers); runs only as a CLI.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
