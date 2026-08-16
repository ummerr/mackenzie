import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readBag } from "@/lib/bag-file";
import type { CourseHistory } from "@/lib/course-history";
import type { LedgerSession, LedgerShot } from "@/lib/ledger";
import { buildProfile, type Finding, type Unknown } from "@/lib/profile";
import type { RoundHistory } from "@/lib/round-history";
import { applyHeuristics, buildBag, detectGaps } from "@/lib/stats";
import { buildTasks } from "@/lib/tasks";

export const metadata = {
  title: "Profile — Yardages",
  description:
    "What the shot ledger and the course history, read together, say about the golfer.",
};

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "data", name), "utf8")) as T;
}

/* The course half is a committed snapshot, and a clean checkout of this app
 * alone will not have it — so its absence is a state, not a crash. The page
 * renders the range half and says which half is missing. */
function loadHistory(): CourseHistory | null {
  try {
    return load<CourseHistory>("course-history.json");
  } catch {
    return null;
  }
}

function loadRounds(): RoundHistory | null {
  try {
    return load<RoundHistory>("round-history.json");
  } catch {
    return null;
  }
}

const LENS_WORD = { range: "range", course: "courses", both: "both" } as const;

export default function Profile() {
  const shots = applyHeuristics(load<LedgerShot[]>("shots.json"));
  const sessions = load<LedgerSession[]>("sessions.json");
  const profiles = buildBag(shots);
  const bag = readBag(join(process.cwd(), "data"));
  const gaps = detectGaps(profiles, undefined, bag);
  const roundHistory = loadRounds();
  const tasks = buildTasks({ profiles, gaps, shots, sessions, bag, roundHistory });
  const profile = buildProfile({
    shots,
    sessions,
    profiles,
    gaps,
    tasks,
    history: loadHistory(),
    roundHistory,
    bag,
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
          The course history has not been snapshotted, so this is the range half
          only. Run <code className="text-ink-0">pnpm ingest:courses</code> inside
          the mackenzie repo.
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
