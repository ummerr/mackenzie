import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readBag, readWedgeBlocks } from "@/lib/bag-file";
import { buildWedgeMatrix } from "@/lib/wedge-matrix";
import {
  buildCourseHistory,
  type CourseHistory,
  type SourceCourses,
} from "@/lib/course-history";
import {
  buildGarminShots,
  GARMIN_THRESHOLDS,
  type GarminShots,
  type SourceGarminRounds,
} from "@/lib/garmin-shots";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import {
  buildProfile,
  PROFILE_THRESHOLDS,
  type Finding,
  type OnCourse,
  type Unknown,
} from "@/lib/profile";
import {
  buildRoundHistory,
  type RecentForm,
  type RoundHistory,
  type SourceRounds,
  type StatPair,
} from "@/lib/round-history";
import { applyHeuristics, buildBag, detectGaps } from "@/lib/stats";
import { buildTasks } from "@/lib/tasks";

export const metadata = {
  title: "Profile — Mackenzie",
  description:
    "What the shot ledger and the course history, read together, say about the golfer.",
};

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as T;
}

/* The course half is the map pipeline's artifact, and a checkout that has not
 * run the pipeline may not have it — so its absence is a state, not a crash.
 * The page renders the range half and says which half is missing. */
function loadHistory(): CourseHistory | null {
  try {
    const raw = readFileSync(
      join(process.cwd(), "public", "data", "courses.json"),
      "utf8",
    );
    return buildCourseHistory(JSON.parse(raw) as SourceCourses);
  } catch {
    return null;
  }
}

function loadRounds(): RoundHistory | null {
  try {
    return buildRoundHistory(load<SourceRounds>("rounds.json"));
  } catch {
    return null;
  }
}

function loadGarmin(): GarminShots | null {
  try {
    return buildGarminShots(load<SourceGarminRounds>("garmin-rounds.json"));
  } catch {
    return null;
  }
}

const LENS_WORD = { range: "range", course: "courses", both: "both" } as const;

export default function Profile() {
  const blocks = readWedgeBlocks(join(process.cwd(), "data"))?.blocks ?? [];
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"), undefined, blocks);
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const bag = readBag(join(process.cwd(), "data"));
  const gaps = detectGaps(profiles, undefined, bag);
  const roundHistory = loadRounds();
  const garminShots = loadGarmin();
  const wedgeMatrix = buildWedgeMatrix(shots, blocks, profiles);
  const tasks = buildTasks({
    profiles,
    gaps,
    shots,
    sessions,
    bag,
    roundHistory,
    garminShots,
    wedgeMatrix,
  });
  const profile = buildProfile({
    shots,
    sessions,
    profiles,
    gaps,
    tasks,
    history: loadHistory(),
    roundHistory,
    garminShots,
    bag,
    wedgeMatrix,
  });

  const roasts = profile.findings.filter((f) => f.roast !== null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        THE PLAYER
      </h1>
      <p className="stamp mt-3 text-ink-3">
        {profile.findings.length} findings · {roasts.length} of them unkind ·
        {" "}
        {profile.unknowns.length} things the record cannot say
      </p>

      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        Derived from both halves of this repo — the shot ledger here, the course
        history from the map — and rewritten every time either one changes.
        Nothing below is a personality: every line carries the numbers that put
        it there and the condition that takes it off, so hitting the shots
        retires the sentence.
      </p>

      {profile.rangeOnly && (
        <p className="mt-4 max-w-2xl border-l-2 pl-4 font-mono text-[11px] leading-5 text-ink-2"
           style={{ borderColor: "var(--verdict-overlap)" }}>
          The map pipeline has not produced{" "}
          <code className="text-ink-0">public/data/courses.json</code>, so this
          is the range half only. Run{" "}
          <code className="text-ink-0">pnpm data:build</code> first.
        </p>
      )}

      {/* ── the spec sheet ────────────────────────────────────────────────── */}
      <dl className="mt-8 grid grid-cols-2 border-t sm:grid-cols-3 lg:grid-cols-4 rule">
        {profile.spec.map((s) => (
          <div key={s.label} className="border-r border-b bg-paper-1 px-4 py-3 rule">
            <dt className="stamp text-ink-3">{s.label}</dt>
            <dd className="mt-1.5 font-sans text-[24px] font-medium leading-none text-ink-0">
              {s.value}
            </dd>
            {s.note && (
              <p className="mt-1.5 font-mono text-[10px] leading-4 text-ink-3">{s.note}</p>
            )}
          </div>
        ))}
      </dl>

      {/* ── the read ──────────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="stamp text-ink-2">The read</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          Ranked by how much of the record is behind each line, never by how bad
          it sounds. Nothing here is compared to a golfer who is not you — no tour
          averages, no handicap model, because a benchmark without a source is
          exactly the kind of claim this repo refuses to print.
        </p>
        <ol className="mt-5 space-y-px">
          {profile.findings.map((f, i) => (
            <FindingRow key={f.id} finding={f} rank={i + 1} first={i === 0} />
          ))}
        </ol>
      </section>

      {/* ── recent form ───────────────────────────────────────────────────── */}
      {profile.recentForm && <RecentFormSection form={profile.recentForm} />}

      {/* ── on the course ─────────────────────────────────────────────────── */}
      {profile.onCourse && <OnCourseSection oc={profile.onCourse} />}

      {/* ── the roast ─────────────────────────────────────────────────────── */}
      {roasts.length > 0 && (
        <section className="mt-10">
          <h2 className="stamp text-ink-2">The roast</h2>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            The same findings, unsoftened. Every one of them restates its own
            evidence and nothing more — a roast that needs a fact you do not have
            is just an insult.
          </p>
          <ul className="mt-5 space-y-4">
            {roasts.map((f) => (
              <li key={f.id} className="border-l-2 pl-4" style={{ borderColor: "var(--accent-ink)" }}>
                <p className="text-[15px] leading-6 text-ink-0">{f.roast}</p>
                <p className="mt-1.5 font-mono text-[11px] leading-5 text-ink-3">
                  {f.evidence}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── the unknowns ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="stamp text-ink-2">What the record cannot say</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          The half most profiles leave out. These are not gaps in the analysis,
          they are gaps in the data — listed so that silence is never mistaken for
          a finding.
        </p>
        <ul className="mt-5 space-y-px">
          {profile.unknowns.map((u) => (
            <UnknownRow key={u.id} unknown={u} />
          ))}
        </ul>
      </section>

      {/* ── provenance ────────────────────────────────────────────────────── */}
      <section className="mt-10 border-t pt-4 rule">
        <h2 className="stamp text-ink-2">Read from</h2>
        <dl className="mt-3 space-y-1 font-mono text-[11px] leading-5">
          {profile.sources.map((s) => (
            <div key={s.label} className="flex flex-wrap gap-x-3">
              <dt className="w-20 shrink-0 text-ink-1">{s.label}</dt>
              <dd className="text-ink-3">{s.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 max-w-2xl font-mono text-[10px] leading-4 text-ink-3">
          The same profile is written to{" "}
          <code className="text-ink-2">PROFILE.md</code> by{" "}
          <code className="text-ink-2">pnpm profile</code>, so every change to the
          golfer is a commit rather than a page that quietly reads differently
          than it did last month.
        </p>
      </section>
    </div>
  );
}

/* Both numbers, always: the recent figure answers "what does the golf do now",
 * the career figure answers "what has it ever done", and printing only one
 * would hide that recency moved it — the same publishing rule the yardage
 * profiles follow. */
function RecentFormSection({ form }: { form: RecentForm }) {
  const lastN = form.recentRounds.slice(-PROFILE_THRESHOLDS.recentRoundCount);
  const num = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
  const pctOf = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
  const rows: { label: string; pair: StatPair; fmt: (v: number | null) => string; unit: string }[] = [
    { label: "Scoring", pair: form.scoring, fmt: (v) => num(v), unit: "rounds" },
    { label: "Putts / round", pair: form.putts, fmt: (v) => num(v), unit: "rounds" },
    { label: "Three-putt share", pair: form.threePutt, fmt: pctOf, unit: "holes" },
    { label: "Fairways hit", pair: form.fairwayHit, fmt: pctOf, unit: "holes" },
  ];
  return (
    <section className="mt-10">
      <h2 className="stamp text-ink-2">Recent form</h2>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        The last {form.months} months (since {form.cutoff}), measured from the
        newest card ({form.asOf}) — never from today, so the profile reads the
        same until the record changes. Quick-entry echoes of a card already on
        file are not counted twice.
      </p>

      <ul className="mt-5 space-y-px">
        {lastN.map((r) => (
          <li
            key={r.roundId}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-1 px-3 py-2.5 sm:px-4"
            style={{ borderColor: "var(--line)" }}
          >
            <span className="font-mono text-[11px] tabular-nums text-ink-3">{r.date}</span>
            <span className="text-[15px] leading-snug text-ink-0">{r.courseName ?? "—"}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-1">
              {r.strokes ?? "—"} strokes
              {r.putts !== null ? ` · ${r.putts} putts` : ""}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1 font-mono text-[11px] leading-5">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-3">
            <dt className="w-32 shrink-0 text-ink-1">{row.label}</dt>
            <dd className="text-ink-2">
              {row.fmt(row.pair.recent)} recent ({row.pair.recentN} {row.unit}) ·{" "}
              {row.fmt(row.pair.career)} career ({row.pair.careerN} {row.unit})
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* The on-course record, gate-independent: the findings above wait for
 * minShotRounds because a finding is a claim; the record itself is published
 * as soon as it exists, with every sample size printed. What grounds the
 * range-built profile is not a verdict — it is these numbers sitting next to
 * the ledger's. */
function OnCourseSection({ oc }: { oc: OnCourse }) {
  const s = oc.split;
  const pctOf = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
  const catRows: [string, number][] = [
    ["Tee", s.tee],
    ["Approach", s.approach],
    ["Short game", s.shortGame],
    ["Putts", s.putts],
    ["Unclassified", s.other],
  ];
  return (
    <section className="mt-10">
      <h2 className="stamp text-ink-2">On the course</h2>
      <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
        What AutoShot heard over {oc.rounds} round{oc.rounds === 1 ? "" : "s"} (as
        of {oc.asOf}; the record&rsquo;s other {oc.simRounds} rounds are simulator
        rounds with nothing to hear). Findings from this data switch on at{" "}
        {GARMIN_THRESHOLDS.minShotRounds} shot-bearing rounds — until then this is
        the record, not a claim. The watch hears full swings: it caught{" "}
        {s.shots} of the {s.strokes} strokes the scorecards count (
        {pctOf(s.shots, s.strokes)}); putts and some chips never become shots, so
        every share below is a share of recorded shots.
      </p>

      <dl className="mt-5 space-y-1 font-mono text-[11px] leading-5">
        {catRows.map(([label, n]) => (
          <div key={label} className="flex flex-wrap gap-x-3">
            <dt className="w-32 shrink-0 text-ink-1">{label}</dt>
            <dd className="tabular-nums text-ink-2">
              {n} shots · {pctOf(n, s.shots)} of recorded
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="stamp mt-5 text-ink-3">Where the ball was played from</h3>
      <dl className="mt-2 space-y-1 font-mono text-[11px] leading-5">
        {oc.lies.map((l) => (
          <div key={l.lie} className="flex flex-wrap gap-x-3">
            <dt className="w-32 shrink-0 text-ink-1">{l.lie}</dt>
            <dd className="tabular-nums text-ink-2">
              {l.shots} non-tee shot{l.shots === 1 ? "" : "s"}
            </dd>
          </div>
        ))}
      </dl>

      {oc.clubs.length > 0 && (
        <>
          <h3 className="stamp mt-5 text-ink-3">Clubs the course has measured</h3>
          <p className="mt-1 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            Clear full swings only — no chips, no punch-outs — at{" "}
            {GARMIN_THRESHOLDS.minShotsPerClub}+ shots. Course yards are
            point-to-point, where the ball came to rest, so they sit nearer a
            range total than a carry.
          </p>
          <ul className="mt-2 space-y-px">
            {oc.clubs.map((c) => (
              <li
                key={c.club}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 bg-paper-1 px-3 py-2 sm:px-4"
                style={{ borderColor: "var(--line)" }}
              >
                <span className="text-[14px] leading-snug text-ink-0">{c.club}</span>
                <span className="font-mono text-[11px] tabular-nums text-ink-1">
                  {c.medianYd.toFixed(0)} yd on course ({c.shots} swings)
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-ink-2">
                  {c.rangeYd !== null
                    ? `${c.rangeYd.toFixed(0)} yd on the range`
                    : "unmeasured on the range — this is the club's first number"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function FindingRow({
  finding,
  rank,
  first,
}: {
  finding: Finding;
  rank: number;
  first: boolean;
}) {
  return (
    <li
      className="border-l-2 bg-paper-1 px-3 py-3.5 sm:px-4 sm:py-4"
      style={{ borderColor: first ? "var(--accent-ink)" : "var(--line)" }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`font-mono text-[11px] tabular-nums ${
            first ? "text-accent-ink" : "text-ink-3"
          }`}
        >
          {String(rank).padStart(2, "0")}
        </span>
        <h3 className={`text-[15px] leading-snug ${first ? "text-accent-ink" : "text-ink-0"}`}>
          {finding.claim}
        </h3>
        <span className="stamp ml-auto shrink-0 text-ink-3">
          {LENS_WORD[finding.lens]} · {finding.confidence}
        </span>
      </div>

      <dl className="mt-2 space-y-1.5 font-mono text-[11px] leading-5 sm:pl-8">
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-ink-3">why</dt>
          <dd className="text-ink-2">{finding.evidence}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-ink-3">gone when</dt>
          <dd className="text-ink-1">{finding.falsifiedBy}</dd>
        </div>
      </dl>
    </li>
  );
}

function UnknownRow({ unknown }: { unknown: Unknown }) {
  return (
    <li className="border-l-2 bg-paper-1 px-3 py-3.5 sm:px-4 sm:py-4 rule">
      <h3 className="text-[15px] leading-snug text-ink-0">{unknown.question}</h3>
      <dl className="mt-2 space-y-1.5 font-mono text-[11px] leading-5 sm:pl-4">
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-ink-3">why not</dt>
          <dd className="text-ink-2">{unknown.why}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-ink-3">needs</dt>
          <dd className="text-ink-1">{unknown.needs}</dd>
        </div>
      </dl>
    </li>
  );
}
