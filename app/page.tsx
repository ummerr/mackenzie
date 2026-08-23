import { join } from "node:path";
import Link from "next/link";
import { readBag, readWedgeBlocks } from "@/lib/bag-file";
import { buildWedgeMatrix } from "@/lib/wedge-matrix";
import type { Leak } from "@/lib/leaks";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import { loadGarmin, loadHistory, loadJson, loadRounds } from "@/lib/load";
import {
  buildProfile,
  type Finding,
  type Lens,
  type SpecGroup,
  type Unknown,
} from "@/lib/profile";
import { applyHeuristics, buildBag, detectGaps } from "@/lib/stats";
import { buildTasks } from "@/lib/tasks";

export const metadata = {
  title: "Profile — Mackenzie",
  description:
    "What every record this repo keeps — range, watch, scorecards, map — says about the golfer.",
};

const LENS_WORD = { range: "range", course: "courses", both: "both" } as const;

/* The digest shows the top of the object; PROFILE.md holds all of it. */
const TOP_FINDINGS = 5;
const TOP_LEAKS = 3;

/* Where each spec group's full record lives. Route knowledge stays on the
 * page — lib/ speaks in facts, not URLs. */
const GROUP_HOME: Record<SpecGroup["id"], { href: string; label: string }> = {
  range: { href: "/bag", label: "the bag" },
  watch: { href: "/diary", label: "the diary" },
  scorecards: { href: "/scratch", label: "the road to scratch" },
  map: { href: "/courses", label: "the courses" },
};

/* Each finding's canonical evidence has exactly one home page; the finding
 * here is the claim, and the link is its receipts. Ids born later fall back
 * to their lens. */
const BAG = GROUP_HOME.range;
const DIARY = GROUP_HOME.watch;
const SCRATCH = GROUP_HOME.scorecards;
const COURSES = GROUP_HOME.map;
const FINDING_HOME: Record<string, { href: string; label: string }> = {
  "no-tee-game": BAG,
  "unmeasured-bag": BAG,
  "same-loft-twice": BAG,
  "two-way-miss": BAG,
  "one-way-miss": BAG,
  "wider-than-the-fairway": BAG,
  gapping: BAG,
  "day-to-day-drift": BAG,
  "smash-inversion": BAG,
  "discard-rate": BAG,
  "course-vs-range": BAG,
  scoring: COURSES,
  collector: COURSES,
  taste: COURSES,
  "favourites-punish": COURSES,
  trajectory: SCRATCH,
  "recent-form": SCRATCH,
  "putt-share": SCRATCH,
  "tee-two-way": SCRATCH,
  "short-game-share": DIARY,
  "lie-mix": DIARY,
  "measured-half": DIARY,
  "open-questions": { href: "/practice", label: "the practice list" },
};
const LENS_HOME: Record<Lens, { href: string; label: string } | null> = {
  range: BAG,
  course: COURSES,
  both: null,
};
const findingHome = (f: Finding) => FINDING_HOME[f.id] ?? LENS_HOME[f.lens];

export default function Profile() {
  const blocks = readWedgeBlocks(join(process.cwd(), "data"))?.blocks ?? [];
  const shots = applyHeuristics(loadJson<LedgerShot[]>("shots.json"), undefined, blocks);
  const sessions = loadJson<LedgerSession[]>("sessions.json");
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

  const topFindings = profile.findings.slice(0, TOP_FINDINGS);
  const topLeaks = profile.leaks.slice(0, TOP_LEAKS);
  const roasts = topFindings.filter((f) => f.roast !== null);
  const allRoasts = profile.findings.filter((f) => f.roast !== null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
      <h1 className="font-serif text-[42px] leading-[0.9] tracking-[-0.01em] sm:text-[56px] lg:text-[72px]">
        THE PLAYER
      </h1>
      <p className="stamp mt-3 text-ink-3">
        {profile.findings.length} findings · {allRoasts.length} of them unkind ·
        {" "}
        {profile.unknowns.length} things the record cannot say
      </p>

      <p className="mt-5 max-w-2xl border-t pt-5 text-[15px] leading-6 text-ink-1 rule">
        Derived from every record this repo keeps — a launch-monitor ledger, a
        watch that hears the course, five seasons of scorecards, and a map of
        everywhere they happened — and rewritten every time any of them changes.
        Nothing below is a personality: every line carries the numbers that put
        it there and the condition that takes it off, so hitting the shots
        retires the sentence.
      </p>

      {/* ── the spec sheet, one corner per source ─────────────────────────── */}
      <div className="mt-8 space-y-6">
        {profile.spec.map((g) => (
          <SpecGroupBlock key={g.id} group={g} />
        ))}
      </div>

      {/* ── the leaks ─────────────────────────────────────────────────────── */}
      {topLeaks.length > 0 && (
        <section className="mt-10">
          <h2 className="stamp text-ink-2">The leaks</h2>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            Where the strokes go, ranked by what each leak costs — priced in
            strokes where the record can price it, named as unknown where it
            cannot. The top {topLeaks.length} of {profile.leaks.length}; the{" "}
            <Link href="/scratch#leaks" className="text-ink-1 underline decoration-1 underline-offset-2">
              full accounting
            </Link>{" "}
            runs on the road to scratch.
          </p>
          <ol className="mt-5 space-y-px">
            {topLeaks.map((l, i) => (
              <LeakRow key={l.id} leak={l} rank={i + 1} first={i === 0} />
            ))}
          </ol>
        </section>
      )}

      {/* ── the read, abridged ────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="stamp text-ink-2">The read</h2>
        <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
          Ranked by how much of the record is behind each line, never by how bad
          it sounds. Nothing here is compared to a golfer who is not you — no tour
          averages, no handicap model, because a benchmark without a source is
          exactly the kind of claim this repo refuses to print. The top{" "}
          {topFindings.length}; each line links to the page that holds its
          evidence.
        </p>
        <ol className="mt-5 space-y-px">
          {topFindings.map((f, i) => (
            <FindingRow key={f.id} finding={f} rank={i + 1} first={i === 0} />
          ))}
        </ol>
        <p className="mt-3 max-w-2xl font-mono text-[10px] leading-4 text-ink-3">
          All {profile.findings.length} findings, ranked and roasted in full, are
          committed as <code className="text-ink-2">PROFILE.md</code> — this page
          shows the top of the same object.
        </p>
      </section>

      {/* ── the roast ─────────────────────────────────────────────────────── */}
      {roasts.length > 0 && (
        <section className="mt-10">
          <h2 className="stamp text-ink-2">The roast</h2>
          <p className="mt-2 max-w-2xl font-mono text-[11px] leading-5 text-ink-3">
            The same top findings, unsoftened. Every one of them restates its own
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

/* One source's corner of the spec sheet: a header that links to the page
 * holding the full record, then three tiles. An absent source keeps its
 * corner — tiles dashed, command named — because absence is a state every
 * source can be in, not a demotion. */
function SpecGroupBlock({ group }: { group: SpecGroup }) {
  const home = GROUP_HOME[group.id];
  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-3 border-t pt-2 rule">
        <h2 className="stamp text-ink-1">
          <Link href={home.href} className="underline decoration-1 underline-offset-2">
            {group.label}
          </Link>
        </h2>
        <span className="stamp text-ink-3">{group.device}</span>
        <Link
          href={home.href}
          className="stamp ml-auto shrink-0 text-ink-3 underline decoration-1 underline-offset-2"
        >
          {home.label} →
        </Link>
      </div>
      <dl className="mt-2 grid grid-cols-1 border-t sm:grid-cols-3 rule">
        {group.lines.map((s) => (
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
      {group.missing && (
        <p className="mt-1.5 font-mono text-[10px] leading-4 text-ink-3">
          No artifact on this checkout — run{" "}
          <code className="text-ink-2">{group.missing}</code>.
        </p>
      )}
    </section>
  );
}

function LeakRow({ leak, rank, first }: { leak: Leak; rank: number; first: boolean }) {
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
          {leak.title}
        </h3>
        <span className="stamp ml-auto shrink-0 text-ink-3">{leak.source}</span>
      </div>
      <dl className="mt-2 space-y-1.5 font-mono text-[11px] leading-5 sm:pl-8">
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-ink-3">cost</dt>
          <dd className="text-ink-2">{leak.cost}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-14 shrink-0 text-ink-3">move</dt>
          <dd className="text-ink-1">
            {leak.move}
            {" — "}
            <Link href="/practice" className="underline decoration-1 underline-offset-2">
              the drill
            </Link>
          </dd>
        </div>
      </dl>
    </li>
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
  const home = findingHome(finding);
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
        {home && (
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-ink-3">where</dt>
            <dd>
              <Link
                href={home.href}
                className="text-ink-1 underline decoration-1 underline-offset-2"
              >
                {home.label} →
              </Link>
            </dd>
          </div>
        )}
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
