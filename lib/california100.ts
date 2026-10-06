/* The California Public 100 — a to-play list, admitted under contract
 * (DECISIONS.md 2026-10-06). `data/california-100.json` is one compilation of
 * published public-access rankings, transcribed and then checked row by row;
 * every entry carries a provenance block with one check per claim group, and
 * the file says which published list each ranking column is supposed to come
 * from. `scripts/validate.mjs` enforces the contract; this module reads the
 * file and joins it to the record.
 *
 * The join is explicit, never fuzzy: an entry names the spine facility (and
 * layout) it is, or it names nothing. Three honest states come out — the
 * course was played, the facility was played but not this course (Pelican
 * Hill's Ocean South when the record holds Ocean North), or neither. Nothing
 * here decides what "played" means; the pipeline's artifact says so and this
 * carries it across.
 */

import type { SourceFacility } from "./course-history";

export type Confidence = "high" | "medium" | "low";
export type CourseStatus = "open" | "closed";
export type RecordState = "played" | "facility-played" | "unplayed";
export type ListLens = "rank" | "value" | "difficulty" | "price";
export type CheckGroup = "rankings" | "tee" | "fee" | "architect";

export interface Check {
  verified: boolean;
  /** A URL, or a key in the file's `_sources`. Required when verified. */
  source: string | null;
  note: string | null;
}

export interface Tee {
  yards: number | null;
  slope: number | null;
  rating: number | null;
  name: string | null;
}

export interface Fee {
  low: number | null;
  high: number | null;
  /** The condition the number comes with — "non-resident", "peak", "approximate". */
  note: string | null;
}

export interface Rankings {
  golfweekCA: number | null;
  golfweekUS: number | null;
  golfDigestScore: number | null;
  golfDigestCA: number | null;
  golfDigestPublic: number | null;
  golfYCP: number | null;
}

export interface CaliforniaEntry {
  rank: number;
  slug: string;
  name: string;
  locality: string;
  area: string;
  architect: string | null;
  tee: Tee;
  fee: Fee;
  access: string[];
  status: CourseStatus;
  rankings: Rankings;
  /** Letter grade A++ … D-; null only while the course is closed. */
  value: string | null;
  valueNote: string | null;
  tags: string[];
  facilitySlug: string | null;
  layoutSlug: string | null;
  joinNote: string | null;
  provenance: {
    confidence: Confidence;
    checked: string;
    verified: boolean;
    checks: Record<CheckGroup, Check>;
  };
}

export interface SourceDef {
  title: string;
  url: string | null;
  note?: string;
  fields: string[];
  checked: string | null;
  verified: boolean;
}

export interface California100File {
  list: { title: string; compiledAt: string; compiledBy: string; from: string };
  sources: Record<string, SourceDef>;
  access: Record<string, string>;
  areas: Record<string, string>;
  tags: Record<string, string>;
  entries: CaliforniaEntry[];
}

export const CHECK_GROUPS: readonly CheckGroup[] = ["rankings", "tee", "fee", "architect"];
export const VALUE_GRADE = /^[A-D](\+\+|\+|-)?$/;

const CONFIDENCE: ReadonlySet<string> = new Set(["high", "medium", "low"]);
const RANKING_KEYS: readonly (keyof Rankings)[] = [
  "golfweekCA",
  "golfweekUS",
  "golfDigestScore",
  "golfDigestCA",
  "golfDigestPublic",
  "golfYCP",
];

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const numOrNull = (x: unknown) => x === null || (typeof x === "number" && Number.isFinite(x));
const strOrNull = (x: unknown) => x === null || typeof x === "string";
const strArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

function isCheck(x: unknown): x is Check {
  return isObj(x) && typeof x.verified === "boolean" && strOrNull(x.source) && strOrNull(x.note);
}

function isEntry(x: unknown): x is CaliforniaEntry {
  if (!isObj(x)) return false;
  const e = x;
  if (!(Number.isInteger(e.rank) && (e.rank as number) >= 1 && (e.rank as number) <= 100)) return false;
  if (typeof e.slug !== "string" || typeof e.name !== "string") return false;
  if (typeof e.locality !== "string" || typeof e.area !== "string") return false;
  if (!strOrNull(e.architect)) return false;
  const tee = e.tee;
  if (!isObj(tee) || !numOrNull(tee.yards) || !numOrNull(tee.slope) || !numOrNull(tee.rating) || !strOrNull(tee.name)) {
    return false;
  }
  const fee = e.fee;
  if (!isObj(fee) || !numOrNull(fee.low) || !numOrNull(fee.high) || !strOrNull(fee.note)) return false;
  if (!strArr(e.access) || e.access.length === 0) return false;
  if (e.status !== "open" && e.status !== "closed") return false;
  const r = e.rankings;
  if (!isObj(r) || !RANKING_KEYS.every((k) => numOrNull(r[k]))) return false;
  if (!(e.value === null || (typeof e.value === "string" && VALUE_GRADE.test(e.value)))) return false;
  if (!strOrNull(e.valueNote) || !strArr(e.tags)) return false;
  if (!strOrNull(e.facilitySlug) || !strOrNull(e.layoutSlug) || !strOrNull(e.joinNote)) return false;
  const p = e.provenance;
  if (!isObj(p) || !CONFIDENCE.has(p.confidence as string)) return false;
  if (typeof p.checked !== "string" || typeof p.verified !== "boolean") return false;
  const c = p.checks;
  if (!isObj(c) || !CHECK_GROUPS.every((g) => isCheck(c[g]))) return false;
  return true;
}

function isSourceDef(x: unknown): x is SourceDef {
  return (
    isObj(x) &&
    typeof x.title === "string" &&
    strOrNull(x.url) &&
    strArr(x.fields) &&
    strOrNull(x.checked) &&
    typeof x.verified === "boolean"
  );
}

const strMap = (x: unknown): Record<string, string> =>
  isObj(x)
    ? Object.fromEntries(Object.entries(x).filter((kv): kv is [string, string] => typeof kv[1] === "string"))
    : {};

/** Read the file's shape. Throws only when the file is not an object at all;
 *  an entry that breaks the contract is dropped (validate reports it as an
 *  error — the page just does not get to print it). */
export function parseCalifornia100(raw: unknown): California100File {
  if (!isObj(raw)) throw new Error("california-100.json is not an object");
  const list = isObj(raw.list) ? raw.list : {};
  const sources: Record<string, SourceDef> = {};
  if (isObj(raw._sources)) {
    for (const [k, v] of Object.entries(raw._sources)) if (isSourceDef(v)) sources[k] = v;
  }
  return {
    list: {
      title: typeof list.title === "string" ? list.title : "California Public 100",
      compiledAt: typeof list.compiledAt === "string" ? list.compiledAt : "",
      compiledBy: typeof list.compiledBy === "string" ? list.compiledBy : "",
      from: typeof list.from === "string" ? list.from : "",
    },
    sources,
    access: strMap(raw._access),
    areas: strMap(raw._areas),
    tags: strMap(raw._tags),
    entries: (Array.isArray(raw.entries) ? raw.entries : []).filter(isEntry),
  };
}

/* ── the join ─────────────────────────────────────────────────────────────── */

export interface ListRow {
  entry: CaliforniaEntry;
  state: RecordState;
  /** The spine's name for the facility, when the entry names one it knows. */
  facilityName: string | null;
  /** The layout the record holds, for the "played X, not this course" line. */
  layoutName: string | null;
  timesPlayed: number;
  avgScore: number | null;
  shortRounds: boolean;
  personalRank: number | null;
  ratings: { overall: number | null; fun: number | null; condition: number | null } | null;
}

export interface AreaCount {
  area: string;
  total: number;
  played: number;
}

export interface California100 {
  title: string;
  compiledAt: string;
  /** The capture date of the record it was joined to. */
  capturedAt: string;
  verified: number;
  linked: number;
  /** In rank order. */
  rows: ListRow[];
  /** Indices into `rows`, one ordering per lens — prepared here so the client
   *  reorders and never recomputes. */
  order: Record<ListLens, number[]>;
  played: number;
  top25Played: number;
  top50Played: number;
  roundsOnList: number;
  cheapestUnplayed: ListRow | null;
  nextUp: ListRow | null;
  hardest: ListRow[];
  byArea: AreaCount[];
}

export const LENSES: { key: ListLens; word: string; gloss: string }[] = [
  { key: "rank", word: "rank", gloss: "as compiled" },
  { key: "value", word: "value", gloss: "grade, then rank" },
  { key: "difficulty", word: "difficulty", gloss: "slope, then yards" },
  { key: "price", word: "price", gloss: "lowest fee first" },
];

/** A++ is 15, A+ 14, A 13, A- 12, B+ 10 … D- 0. Unknown is -1 so it sorts
 *  last under every lens that asks. */
export function valueOrdinal(grade: string | null): number {
  if (grade === null || !VALUE_GRADE.test(grade)) return -1;
  const base = { A: 3, B: 2, C: 1, D: 0 }[grade[0] as "A" | "B" | "C" | "D"];
  const mod = grade.endsWith("++") ? 3 : grade.endsWith("+") ? 2 : grade.endsWith("-") ? 0 : 1;
  return base * 4 + mod;
}

const SHORT_ROUND_FLAGS = ["nine_hole_suspected", "mixed_round_lengths_suspected"];

type SourceLayout = SourceFacility["layouts"][number];

function fromLayout(entry: CaliforniaEntry, f: SourceFacility, l: SourceLayout): ListRow {
  return {
    entry,
    state: l.played ? "played" : "unplayed",
    facilityName: f.name,
    layoutName: l.grintLayoutName,
    timesPlayed: l.timesPlayed,
    avgScore: l.avgScore,
    shortRounds: l.flags.some((flag) => SHORT_ROUND_FLAGS.includes(flag)),
    personalRank: l.personalRank,
    ratings: l.ratings,
  };
}

function unplayed(entry: CaliforniaEntry, f: SourceFacility | null, state: RecordState): ListRow {
  const held = f?.layouts.filter((l) => l.played) ?? [];
  return {
    entry,
    state,
    facilityName: f?.name ?? null,
    layoutName: held.length === 1 ? held[0].grintLayoutName : null,
    timesPlayed: 0,
    avgScore: null,
    shortRounds: false,
    personalRank: null,
    ratings: null,
  };
}

function rowFor(entry: CaliforniaEntry, facilities: Map<string, SourceFacility>): ListRow {
  const f = entry.facilitySlug ? (facilities.get(entry.facilitySlug) ?? null) : null;
  if (!f) return unplayed(entry, null, "unplayed");
  if (entry.layoutSlug !== null) {
    const l = f.layouts.find((x) => x.slug === entry.layoutSlug);
    if (l) return fromLayout(entry, f, l);
    // The spine has the facility but not this course: played there, not here.
    return unplayed(entry, f, f.played ? "facility-played" : "unplayed");
  }
  if (f.layouts.length === 1) return fromLayout(entry, f, f.layouts[0]);
  // Several layouts and no say which — validate has already refused this; be
  // defensive and claim only what the facility can vouch for.
  return unplayed(entry, f, f.played ? "facility-played" : "unplayed");
}

/** Sort indices by a key, nulls last, ties by list rank. */
function orderBy(rows: ListRow[], key: (r: ListRow) => number | null, dir: 1 | -1): number[] {
  return rows
    .map((r, i) => ({ i, k: key(r), rank: r.entry.rank }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.rank - b.rank;
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      return (a.k - b.k) * dir || a.rank - b.rank;
    })
    .map((x) => x.i);
}

/** The join, pure. `facilities` is the pipeline artifact's facilities by slug,
 *  unplayed ones included — `buildCourseHistory` drops those, which is exactly
 *  the wrong thing for a to-play list. */
export function joinCalifornia100(
  file: California100File,
  facilities: Map<string, SourceFacility>,
  capturedAt: string,
): California100 {
  const rows = [...file.entries]
    .sort((a, b) => a.rank - b.rank)
    .map((e) => rowFor(e, facilities));

  const playedRows = rows.filter((r) => r.state === "played");
  const open = rows.filter((r) => r.state !== "played" && r.entry.status === "open");
  const byValueThenRank = (a: ListRow, b: ListRow) =>
    valueOrdinal(b.entry.value) - valueOrdinal(a.entry.value) || a.entry.rank - b.entry.rank;

  const areas = new Map<string, AreaCount>();
  for (const r of rows) {
    const a = areas.get(r.entry.area) ?? { area: r.entry.area, total: 0, played: 0 };
    a.total++;
    if (r.state === "played") a.played++;
    areas.set(r.entry.area, a);
  }

  const order: Record<ListLens, number[]> = {
    rank: rows.map((_, i) => i),
    value: orderBy(rows, (r) => (r.entry.value === null ? null : valueOrdinal(r.entry.value)), -1),
    difficulty: rows
      .map((r, i) => ({ i, s: r.entry.tee.slope, y: r.entry.tee.yards, rank: r.entry.rank }))
      .sort((a, b) => {
        if (a.s === null && b.s === null) return a.rank - b.rank;
        if (a.s === null) return 1;
        if (b.s === null) return -1;
        return b.s - a.s || (b.y ?? 0) - (a.y ?? 0) || a.rank - b.rank;
      })
      .map((x) => x.i),
    price: orderBy(rows, (r) => r.entry.fee.low, 1),
  };

  const cheapest = open
    .filter((r) => r.entry.fee.low !== null)
    .sort((a, b) => (a.entry.fee.low as number) - (b.entry.fee.low as number) || a.entry.rank - b.entry.rank);
  const shortlist = open.filter((r) => r.entry.tags.includes("sf-shortlist")).sort(byValueThenRank);

  return {
    title: file.list.title,
    compiledAt: file.list.compiledAt,
    capturedAt,
    verified: file.entries.filter((e) => e.provenance.verified).length,
    linked: file.entries.filter((e) => e.facilitySlug !== null).length,
    rows,
    order,
    played: playedRows.length,
    top25Played: playedRows.filter((r) => r.entry.rank <= 25).length,
    top50Played: playedRows.filter((r) => r.entry.rank <= 50).length,
    roundsOnList: playedRows.reduce((n, r) => n + r.timesPlayed, 0),
    cheapestUnplayed: cheapest[0] ?? null,
    nextUp: shortlist[0] ?? null,
    hardest: order.difficulty
      .map((i) => rows[i])
      .filter((r) => r.entry.tee.slope !== null)
      .slice(0, 10),
    byArea: [...areas.values()].sort((a, b) => b.total - a.total || a.area.localeCompare(b.area)),
  };
}

/** "6,802 / 144" — the one tee line, dashes where the page has not said. */
export function teeLine(t: Tee): string {
  const y = t.yards === null ? "—" : t.yards.toLocaleString("en-US");
  const s = t.slope === null ? "—" : String(t.slope);
  return `${y} / ${s}`;
}

/** "$65–90", "$695", "—". The note travels separately. */
export function feeLine(f: Fee): string {
  if (f.low === null && f.high === null) return "—";
  if (f.low !== null && f.high !== null && f.high !== f.low) return `$${f.low}–${f.high}`;
  return `$${f.low ?? f.high}`;
}
