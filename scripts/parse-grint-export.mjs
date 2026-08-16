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
 * Points look like {y:23.9,name:'Wedgwood Country Club'} with optional
 * , color: '#A7CF3F' — names may contain \' escapes.
 */
export function parseDifferentials(scripts) {
  const blob = scripts.join("\n");
  const point = /\{y:([\d.]+),name:'((?:[^'\\]|\\.)*)'(?:,\s*color:\s*'[^']*')?\}/g;

  function seriesData(name) {
    // The data: [...] array that follows the LAST `name: '<name>'` before it.
    const re = new RegExp(
      `name:\\s*'${name}'[\\s\\S]{0,200}?data:\\s*\\[([\\s\\S]*?)\\]`,
      "",
    );
    const m = blob.match(re);
    if (!m) return null;
    const pts = [];
    for (const p of m[1].matchAll(point)) {
      pts.push({ y: Number(p[1]), name: decodeEntities(p[2].replace(/\\'/g, "'")) });
    }
    return pts;
  }

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
// main
// ---------------------------------------------------------------------------

function main() {
  const candidates = readdirSync(RAW)
    .filter((f) => /^grint-export-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (candidates.length === 0) {
    console.error(`No grint-export-*.json in ${RAW}. Run the extension first.`);
    return 1;
  }
  const rawFile = candidates[candidates.length - 1];
  const bundle = JSON.parse(readFileSync(resolve(RAW, rawFile), "utf8"));
  if (bundle.format !== "grint-export/1") {
    console.error(`Unexpected bundle format ${bundle.format}`);
    return 1;
  }

  const rounds = [];
  for (const r of bundle.resources) {
    if (r.kind !== "scorecard") continue;
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

  const trend = bundle.resources.find(
    (r) => r.kind === "trend" && r.meta.view === "handicap_index",
  );
  const { handicapIndex, points } = parseDifferentials(trend?.payload.scripts ?? []);

  const out = {
    source: "thegrint",
    adapter: "parse-grint-export.mjs",
    capturedAt: bundle.capturedAt,
    rawFile: `raw/${rawFile}`,
    userId: bundle.userId,
    handicapIndex,
    rounds,
    differentials: points,
  };
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);

  // ---- report -------------------------------------------------------------
  const dated = rounds.filter((r) => r.date).length;
  const withPutts = rounds.filter((r) => r.totals.putts !== null).length;
  const eighteen = rounds.filter((r) => r.holesRecorded === 18).length;
  const nine = rounds.filter((r) => r.holesRecorded === 9).length;
  const flagged = rounds.filter((r) => r.flags.length > 0);
  console.log(`parsed ${rawFile} (captured ${bundle.capturedAt})`);
  console.log(`rounds        ${rounds.length}  (${eighteen}×18 holes, ${nine}×9, ${rounds.length - eighteen - nine} other)`);
  console.log(`with a date   ${dated}`);
  console.log(`with putts    ${withPutts}`);
  console.log(`differentials ${points.length}  handicap index ${handicapIndex ?? "?"}`);
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

process.exit(main());
